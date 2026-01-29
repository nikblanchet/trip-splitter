from fastapi import APIRouter, HTTPException

from ..models import Balance, Settlement
from ..services.settlement import get_trip_balances, get_trip_settlements

router = APIRouter(prefix="/trips", tags=["Settlements"])


@router.get("/{trip_id}/balances", response_model=list[Balance])
async def get_balances(trip_id: str) -> list[Balance]:
    """
    Get the balance for each participant in a trip.

    Positive balance = participant is owed money (paid more than their share)
    Negative balance = participant owes money (consumed more than they paid)
    """
    try:
        balances = await get_trip_balances(trip_id)
        return balances
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate balances: {str(e)}")


@router.get("/{trip_id}/settlements", response_model=list[Settlement])
async def get_settlements(trip_id: str) -> list[Settlement]:
    """
    Get the optimal list of payments to settle all balances in a trip.

    Uses a greedy algorithm that repeatedly matches the largest creditor
    with the largest debtor to minimize the number of transactions.
    """
    try:
        settlements = await get_trip_settlements(trip_id)
        return settlements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate settlements: {str(e)}")
