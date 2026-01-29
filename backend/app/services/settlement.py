from typing import Optional
from decimal import Decimal, ROUND_HALF_UP
import httpx

from ..config import get_settings
from ..models import Balance, Settlement


async def get_supabase_headers() -> dict[str, str]:
    """Get headers for Supabase REST API calls."""
    settings = get_settings()
    return {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "application/json",
    }


async def fetch_trip_data(trip_id: str) -> dict:
    """
    Fetch all relevant data for a trip from Supabase.

    Returns dict with:
        - participants: list of participant records
        - receipts: list of receipt records
        - line_items: list of line item records
        - item_assignments: list of assignment records
        - direct_payments: list of direct payment records
        - receipt_payments: list of receipt payment records (multi-payer support)
    """
    settings = get_settings()
    headers = await get_supabase_headers()
    base_url = settings.supabase_url

    async with httpx.AsyncClient() as client:
        # Fetch participants
        participants_resp = await client.get(
            f"{base_url}/rest/v1/participants",
            headers=headers,
            params={"trip_id": f"eq.{trip_id}", "select": "*"},
        )
        participants = participants_resp.json() if participants_resp.status_code == 200 else []

        # Fetch receipts for this trip
        receipts_resp = await client.get(
            f"{base_url}/rest/v1/receipts",
            headers=headers,
            params={"trip_id": f"eq.{trip_id}", "select": "*"},
        )
        receipts = receipts_resp.json() if receipts_resp.status_code == 200 else []
        receipt_ids = [r["id"] for r in receipts]

        line_items = []
        item_assignments = []
        receipt_payments = []

        if receipt_ids:
            # Fetch line items for these receipts
            receipt_filter = ",".join(receipt_ids)
            line_items_resp = await client.get(
                f"{base_url}/rest/v1/line_items",
                headers=headers,
                params={"receipt_id": f"in.({receipt_filter})", "select": "*"},
            )
            line_items = line_items_resp.json() if line_items_resp.status_code == 200 else []

            line_item_ids = [li["id"] for li in line_items]

            if line_item_ids:
                # Fetch item assignments
                item_filter = ",".join(line_item_ids)
                assignments_resp = await client.get(
                    f"{base_url}/rest/v1/item_assignments",
                    headers=headers,
                    params={"line_item_id": f"in.({item_filter})", "select": "*"},
                )
                item_assignments = assignments_resp.json() if assignments_resp.status_code == 200 else []

            # Fetch receipt payments (multi-payer support)
            receipt_payments_resp = await client.get(
                f"{base_url}/rest/v1/receipt_payments",
                headers=headers,
                params={
                    "receipt_id": f"in.({receipt_filter})",
                    "deleted_at": "is.null",
                    "select": "*",
                },
            )
            receipt_payments = receipt_payments_resp.json() if receipt_payments_resp.status_code == 200 else []

        # Fetch direct payments for this trip
        payments_resp = await client.get(
            f"{base_url}/rest/v1/direct_payments",
            headers=headers,
            params={"trip_id": f"eq.{trip_id}", "select": "*"},
        )
        direct_payments = payments_resp.json() if payments_resp.status_code == 200 else []

        return {
            "participants": participants,
            "receipts": receipts,
            "line_items": line_items,
            "item_assignments": item_assignments,
            "direct_payments": direct_payments,
            "receipt_payments": receipt_payments,
        }


async def calculate_balances(trip_id: str) -> dict[str, float]:
    """
    Calculate the balance for each participant in a trip.

    Positive balance = participant is owed money (paid more than their share)
    Negative balance = participant owes money (consumed more than they paid)

    Args:
        trip_id: The trip ID

    Returns:
        Dict mapping participant_id to their balance
    """
    data = await fetch_trip_data(trip_id)

    participants = data["participants"]
    receipts = data["receipts"]
    line_items = data["line_items"]
    item_assignments = data["item_assignments"]
    direct_payments = data["direct_payments"]
    receipt_payments = data["receipt_payments"]

    # Initialize balances for all participants
    balances: dict[str, Decimal] = {p["id"]: Decimal("0") for p in participants}

    # Create lookup maps
    receipt_map = {r["id"]: r for r in receipts}
    line_item_map = {li["id"]: li for li in line_items}

    # Build lookup: receipt_id -> list of payments (multi-payer support)
    payments_by_receipt: dict[str, list[dict]] = {}
    for payment in receipt_payments:
        rid = payment.get("receipt_id")
        if rid:
            payments_by_receipt.setdefault(rid, []).append(payment)

    # Process receipts: payers get credit for what they paid
    for receipt in receipts:
        receipt_id = receipt.get("id")
        payments = payments_by_receipt.get(receipt_id, [])

        if payments:
            # Multi-payer: credit each payer for their contribution
            for payment in payments:
                payer_id = payment.get("participant_id")
                amount = Decimal(str(payment.get("amount", 0)))
                if payer_id in balances:
                    balances[payer_id] += amount
        else:
            # Legacy fallback: single payer from receipts table
            payer_id = receipt.get("payer_participant_id")
            if payer_id and payer_id in balances:
                total = Decimal(str(receipt.get("total", 0)))
                balances[payer_id] += total

    # Process item assignments: assignees owe their share
    for assignment in item_assignments:
        participant_id = assignment.get("participant_id")
        line_item_id = assignment.get("line_item_id")
        share = Decimal(str(assignment.get("share", 1)))

        if participant_id not in balances:
            continue

        line_item = line_item_map.get(line_item_id)
        if not line_item:
            continue

        # Get total shares for this line item
        total_shares = sum(
            Decimal(str(a.get("share", 1)))
            for a in item_assignments
            if a.get("line_item_id") == line_item_id
        )

        if total_shares > 0:
            item_amount = Decimal(str(line_item.get("amount", 0)))
            participant_share = (item_amount * share) / total_shares
            balances[participant_id] -= participant_share

    # Handle line items with no assignments (split equally among all)
    assigned_item_ids = {a.get("line_item_id") for a in item_assignments}
    unassigned_items = [li for li in line_items if li["id"] not in assigned_item_ids]

    if unassigned_items and participants:
        participant_count = Decimal(str(len(participants)))
        for item in unassigned_items:
            item_amount = Decimal(str(item.get("amount", 0)))
            per_person = item_amount / participant_count
            for p in participants:
                balances[p["id"]] -= per_person

    # Process direct payments: from owes less, to is owed less
    for payment in direct_payments:
        from_id = payment.get("from_participant_id")
        to_id = payment.get("to_participant_id")
        amount = Decimal(str(payment.get("amount", 0)))

        if from_id in balances:
            balances[from_id] += amount  # Payer's balance increases
        if to_id in balances:
            balances[to_id] -= amount  # Recipient's balance decreases

    # Round to 2 decimal places and convert to float
    return {
        pid: float(balance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        for pid, balance in balances.items()
    }


def calculate_settlements(balances: dict[str, float]) -> list[Settlement]:
    """
    Calculate optimal settlements using a greedy algorithm.

    Repeatedly matches the largest creditor with the largest debtor
    until all balances are settled.

    Args:
        balances: Dict mapping participant_id to their balance

    Returns:
        List of Settlement objects representing payments to make
    """
    # Separate creditors (positive) and debtors (negative)
    creditors: list[tuple[str, Decimal]] = []
    debtors: list[tuple[str, Decimal]] = []

    for pid, balance in balances.items():
        bal = Decimal(str(balance)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if bal > Decimal("0.01"):
            creditors.append((pid, bal))
        elif bal < Decimal("-0.01"):
            debtors.append((pid, -bal))  # Store as positive amount owed

    settlements: list[Settlement] = []

    while creditors and debtors:
        # Sort to get largest first
        creditors.sort(key=lambda x: x[1], reverse=True)
        debtors.sort(key=lambda x: x[1], reverse=True)

        creditor_id, credit_amount = creditors[0]
        debtor_id, debt_amount = debtors[0]

        # Settle the smaller of the two amounts
        settle_amount = min(credit_amount, debt_amount)

        if settle_amount > Decimal("0.01"):
            settlements.append(Settlement(
                from_id=debtor_id,
                to_id=creditor_id,
                amount=float(settle_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            ))

        # Update balances
        new_credit = credit_amount - settle_amount
        new_debt = debt_amount - settle_amount

        # Remove or update creditor
        creditors.pop(0)
        if new_credit > Decimal("0.01"):
            creditors.append((creditor_id, new_credit))

        # Remove or update debtor
        debtors.pop(0)
        if new_debt > Decimal("0.01"):
            debtors.append((debtor_id, new_debt))

    return settlements


async def get_trip_balances(trip_id: str) -> list[Balance]:
    """
    Get balances for all participants in a trip.

    Args:
        trip_id: The trip ID

    Returns:
        List of Balance objects
    """
    balances = await calculate_balances(trip_id)
    return [
        Balance(participant_id=pid, amount=amount)
        for pid, amount in balances.items()
    ]


async def get_trip_settlements(trip_id: str) -> list[Settlement]:
    """
    Get optimal settlements for a trip.

    Args:
        trip_id: The trip ID

    Returns:
        List of Settlement objects
    """
    balances = await calculate_balances(trip_id)
    return calculate_settlements(balances)
