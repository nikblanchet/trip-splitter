"""Tests for balance calculation logic."""

import pytest
from unittest.mock import patch, AsyncMock
from app.services.settlement import calculate_balances


class TestCalculateBalances:
    """Tests for the calculate_balances function."""

    # Basic scenarios

    @pytest.mark.asyncio
    async def test_empty_trip_returns_zero_balances(self):
        """Trip with participants but no receipts should return zero balances."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        assert balances == {"p1": 0.0, "p2": 0.0}

    @pytest.mark.asyncio
    async def test_single_receipt_payer_gets_full_credit(self):
        """Payer of a receipt should get full credit for the total amount."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, no items to consume, so she's owed $100
        assert balances["p1"] == 100.0

    @pytest.mark.asyncio
    async def test_all_participants_zero_when_no_receipts(self):
        """All participants should have zero balance when there are no receipts."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
                {"id": "p3", "trip_id": "trip1", "primary_alias": "Carol"},
            ],
            "receipts": [],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        assert balances == {"p1": 0.0, "p2": 0.0, "p3": 0.0}

    # Share splitting

    @pytest.mark.asyncio
    async def test_equal_share_split_between_two_participants(self):
        """Two participants with equal shares should split item cost evenly."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 100.00, "description": "Dinner"},
            ],
            "item_assignments": [
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
                {"id": "a2", "line_item_id": "li1", "participant_id": "p2", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, consumed $50 -> +$50 (is owed)
        # Bob paid $0, consumed $50 -> -$50 (owes)
        assert balances["p1"] == 50.0
        assert balances["p2"] == -50.0

    @pytest.mark.asyncio
    async def test_unequal_share_split_calculates_proportionally(self):
        """Unequal shares should split proportionally."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 90.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 90.00, "description": "Drinks"},
            ],
            "item_assignments": [
                # Bob gets 2/3, Alice gets 1/3
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
                {"id": "a2", "line_item_id": "li1", "participant_id": "p2", "share": 2},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $90, consumed $30 (1/3 of $90) -> +$60 (is owed)
        # Bob paid $0, consumed $60 (2/3 of $90) -> -$60 (owes)
        assert balances["p1"] == 60.0
        assert balances["p2"] == -60.0

    @pytest.mark.asyncio
    async def test_participant_with_multiple_item_assignments(self):
        """Participant assigned to multiple items should sum all their shares."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 40.00, "description": "Appetizer"},
                {"id": "li2", "receipt_id": "r1", "amount": 60.00, "description": "Main"},
            ],
            "item_assignments": [
                # Appetizer: Alice only
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
                # Main: Both split equally
                {"id": "a2", "line_item_id": "li2", "participant_id": "p1", "share": 1},
                {"id": "a3", "line_item_id": "li2", "participant_id": "p2", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, consumed $40 + $30 = $70 -> +$30 (is owed)
        # Bob paid $0, consumed $30 -> -$30 (owes)
        assert balances["p1"] == 30.0
        assert balances["p2"] == -30.0

    # Unassigned items

    @pytest.mark.asyncio
    async def test_unassigned_items_split_equally_among_all(self):
        """Unassigned items should be split equally among all participants."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
                {"id": "p3", "trip_id": "trip1", "primary_alias": "Carol"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 90.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 90.00, "description": "Shared meal"},
            ],
            "item_assignments": [],  # No assignments - split equally
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $90, consumed $30 -> +$60 (is owed)
        # Bob paid $0, consumed $30 -> -$30 (owes)
        # Carol paid $0, consumed $30 -> -$30 (owes)
        assert balances["p1"] == 60.0
        assert balances["p2"] == -30.0
        assert balances["p3"] == -30.0

    @pytest.mark.asyncio
    async def test_mixed_assigned_and_unassigned_items(self):
        """Trip with both assigned and unassigned items calculates correctly."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 80.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 40.00, "description": "Bob's steak"},
                {"id": "li2", "receipt_id": "r1", "amount": 40.00, "description": "Shared dessert"},
            ],
            "item_assignments": [
                # Only Bob's steak is assigned
                {"id": "a1", "line_item_id": "li1", "participant_id": "p2", "share": 1},
                # Dessert (li2) is unassigned - split equally
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $80, consumed $20 (half of dessert) -> +$60 (is owed)
        # Bob paid $0, consumed $40 (steak) + $20 (half dessert) = $60 -> -$60 (owes)
        assert balances["p1"] == 60.0
        assert balances["p2"] == -60.0

    # Direct payments

    @pytest.mark.asyncio
    async def test_direct_payment_adjusts_both_balances(self):
        """Direct payment should increase payer's balance and decrease recipient's."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [
                {
                    "id": "dp1",
                    "trip_id": "trip1",
                    "from_participant_id": "p2",  # Bob pays
                    "to_participant_id": "p1",    # Alice receives
                    "amount": 50.00,
                }
            ],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Bob paid $50 directly to Alice
        # Bob's balance: +$50 (he effectively "paid" into the trip)
        # Alice's balance: -$50 (she "received" from the trip)
        assert balances["p1"] == -50.0
        assert balances["p2"] == 50.0

    @pytest.mark.asyncio
    async def test_multiple_direct_payments_accumulate(self):
        """Multiple direct payments should accumulate correctly."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
                {"id": "p3", "trip_id": "trip1", "primary_alias": "Carol"},
            ],
            "receipts": [],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [
                {
                    "id": "dp1",
                    "trip_id": "trip1",
                    "from_participant_id": "p2",  # Bob pays Alice $30
                    "to_participant_id": "p1",
                    "amount": 30.00,
                },
                {
                    "id": "dp2",
                    "trip_id": "trip1",
                    "from_participant_id": "p3",  # Carol pays Alice $20
                    "to_participant_id": "p1",
                    "amount": 20.00,
                },
            ],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice received $30 + $20 = $50 -> -$50
        # Bob paid $30 -> +$30
        # Carol paid $20 -> +$20
        assert balances["p1"] == -50.0
        assert balances["p2"] == 30.0
        assert balances["p3"] == 20.0

    # Complex integration

    @pytest.mark.asyncio
    async def test_complex_trip_data_calculates_correctly(self, complex_trip_data):
        """Full trip with receipts, assignments, and payments calculates correctly."""
        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=complex_trip_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Let's calculate expected values manually:
        # Receipt: Alice paid $100
        # Line items:
        #   li1 ($40): Alice and Bob split equally (share 1 each) -> $20 each
        #   li2 ($30): Bob gets 2/3 ($20), Carol gets 1/3 ($10)
        #   li3 ($30): Unassigned, split among 3 -> $10 each
        # Direct payment: Bob pays Alice $10

        # Alice: +$100 (paid) - $20 (li1) - $10 (li3) - $10 (received from Bob) = +$60
        # Bob: +$0 (paid) - $20 (li1) - $20 (li2) - $10 (li3) + $10 (paid to Alice) = -$40
        # Carol: +$0 (paid) - $10 (li2) - $10 (li3) = -$20

        assert balances["p1"] == 60.0
        assert balances["p2"] == -40.0
        assert balances["p3"] == -20.0

    # Edge cases

    @pytest.mark.asyncio
    async def test_missing_participant_id_in_assignment_skipped(self):
        """Assignments with missing or invalid participant_id should be skipped."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 100.00, "description": "Item"},
            ],
            "item_assignments": [
                # Valid assignment
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
                # Invalid: participant doesn't exist
                {"id": "a2", "line_item_id": "li1", "participant_id": "nonexistent", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, has 1 share out of 2 total shares for the item
        # But only her share counts toward her balance (nonexistent is skipped)
        # Item cost for Alice: $100 * (1/2) = $50
        # Balance: $100 - $50 = $50
        assert balances["p1"] == 50.0

    @pytest.mark.asyncio
    async def test_decimal_precision_maintained(self):
        """Decimal precision should be maintained and rounded to 2 decimal places."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
                {"id": "p3", "trip_id": "trip1", "primary_alias": "Carol"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                # $100 split 3 ways = $33.333... each
                {"id": "li1", "receipt_id": "r1", "amount": 100.00, "description": "Dinner"},
            ],
            "item_assignments": [],  # Unassigned - split equally
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, consumed $33.33 (rounded) -> +$66.67
        # Bob paid $0, consumed $33.33 -> -$33.33
        # Carol paid $0, consumed $33.33 -> -$33.33
        # Note: due to rounding, these should add up close to 0

        # Verify 2 decimal place precision
        for balance in balances.values():
            rounded = round(balance, 2)
            assert abs(balance - rounded) < 0.001

        # Check approximate values (accounting for rounding)
        assert abs(balances["p1"] - 66.67) < 0.01
        assert abs(balances["p2"] - (-33.33)) < 0.01
        assert abs(balances["p3"] - (-33.33)) < 0.01

    @pytest.mark.asyncio
    async def test_receipt_with_no_payer_ignored(self):
        """Receipt with missing paid_by_participant_id should not add credit."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": None,  # No payer
                    "total_amount": 100.00,
                }
            ],
            "line_items": [],
            "item_assignments": [],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # No credit given since no payer
        assert balances["p1"] == 0.0

    @pytest.mark.asyncio
    async def test_line_item_with_missing_amount_treated_as_zero(self):
        """Line item with missing amount should be treated as zero."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 50.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "description": "No amount"},  # Missing amount
            ],
            "item_assignments": [
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $50, consumed $0 (no amount on item) -> +$50
        assert balances["p1"] == 50.0

    @pytest.mark.asyncio
    async def test_assignment_for_nonexistent_line_item_ignored(self):
        """Assignment referencing nonexistent line_item should be ignored."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 100.00, "description": "Item"},
            ],
            "item_assignments": [
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
                # Reference to nonexistent line item
                {"id": "a2", "line_item_id": "nonexistent", "participant_id": "p1", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice paid $100, consumed $100 -> $0
        assert balances["p1"] == 0.0

    @pytest.mark.asyncio
    async def test_multiple_receipts_with_different_payers(self):
        """Multiple receipts paid by different people should all contribute credit."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 60.00,
                },
                {
                    "id": "r2",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p2",
                    "total_amount": 40.00,
                },
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 60.00, "description": "Dinner"},
                {"id": "li2", "receipt_id": "r2", "amount": 40.00, "description": "Drinks"},
            ],
            "item_assignments": [],  # Split equally
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Alice: paid $60, consumed $50 (half of $100) -> +$10
        # Bob: paid $40, consumed $50 -> -$10
        assert balances["p1"] == 10.0
        assert balances["p2"] == -10.0

    @pytest.mark.asyncio
    async def test_zero_share_assignment_contributes_nothing(self):
        """Assignment with zero share should not contribute to participant's consumption."""
        mock_data = {
            "participants": [
                {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
                {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
            ],
            "receipts": [
                {
                    "id": "r1",
                    "trip_id": "trip1",
                    "paid_by_participant_id": "p1",
                    "total_amount": 100.00,
                }
            ],
            "line_items": [
                {"id": "li1", "receipt_id": "r1", "amount": 100.00, "description": "Item"},
            ],
            "item_assignments": [
                {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 0},
                {"id": "a2", "line_item_id": "li1", "participant_id": "p2", "share": 1},
            ],
            "direct_payments": [],
        }

        with patch(
            "app.services.settlement.fetch_trip_data",
            new_callable=AsyncMock,
            return_value=mock_data,
        ):
            balances = await calculate_balances("test-trip-id")

        # Total shares = 0 + 1 = 1
        # Alice: paid $100, consumed $0 (0/1 of $100) -> +$100
        # Bob: paid $0, consumed $100 (1/1 of $100) -> -$100
        assert balances["p1"] == 100.0
        assert balances["p2"] == -100.0
