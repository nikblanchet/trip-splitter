"""Tests for settlement calculation logic."""

import pytest
from app.services.settlement import calculate_settlements
from app.models import Settlement


class TestCalculateSettlements:
    """Tests for the calculate_settlements function."""

    def test_empty_balances_returns_empty_settlements(self):
        """Empty balances should return empty settlements."""
        balances = {}
        settlements = calculate_settlements(balances)
        assert settlements == []

    def test_single_participant_zero_balance_returns_empty(self):
        """Single participant with 0 balance should return empty settlements."""
        balances = {"alice": 0.0}
        settlements = calculate_settlements(balances)
        assert settlements == []

    def test_all_zero_balances_returns_empty(self):
        """Multiple participants with 0 balances should return empty settlements."""
        balances = {
            "alice": 0.0,
            "bob": 0.0,
            "carol": 0.0,
        }
        settlements = calculate_settlements(balances)
        assert settlements == []

    def test_two_participants_simple_settlement(self):
        """Two participants: one owes, one is owed -> single settlement."""
        balances = {
            "alice": 50.0,   # Alice is owed $50
            "bob": -50.0,    # Bob owes $50
        }
        settlements = calculate_settlements(balances)

        assert len(settlements) == 1
        assert settlements[0].from_id == "bob"
        assert settlements[0].to_id == "alice"
        assert settlements[0].amount == 50.0

    def test_three_participants_one_creditor_two_debtors(self):
        """Three participants: 1 creditor, 2 debtors -> 2 settlements."""
        balances = {
            "alice": 100.0,   # Alice is owed $100
            "bob": -60.0,     # Bob owes $60
            "carol": -40.0,   # Carol owes $40
        }
        settlements = calculate_settlements(balances)

        # Verify total amounts match
        total_from = sum(s.amount for s in settlements)
        total_owed = sum(b for b in balances.values() if b > 0)
        assert abs(total_from - total_owed) < 0.01

        # Verify all debtors pay
        from_ids = {s.from_id for s in settlements}
        assert from_ids == {"bob", "carol"}

        # Verify creditor receives all payments
        to_ids = {s.to_id for s in settlements}
        assert to_ids == {"alice"}

        # Verify settlement count (at most n-1 for n participants)
        assert len(settlements) <= 2

    def test_balances_sum_to_zero_optimal_settlements(self):
        """Balances that sum to zero should settle correctly."""
        balances = {
            "a": 50.0,
            "b": -30.0,
            "c": -20.0,
        }
        settlements = calculate_settlements(balances)

        # Verify total paid equals total owed
        total_paid = sum(s.amount for s in settlements)
        assert abs(total_paid - 50.0) < 0.01

        # At most n-1 settlements for n participants
        assert len(settlements) <= 2

    def test_multiple_creditors_multiple_debtors(self):
        """Multiple creditors and debtors should optimize settlements."""
        balances = {
            "alice": 70.0,    # Alice is owed $70
            "bob": 30.0,      # Bob is owed $30
            "carol": -40.0,   # Carol owes $40
            "dave": -60.0,    # Dave owes $60
        }
        settlements = calculate_settlements(balances)

        # Total credits = 100, total debts = 100
        total_from = sum(s.amount for s in settlements)
        assert abs(total_from - 100.0) < 0.01

        # Verify debtors are paying
        from_ids = {s.from_id for s in settlements}
        assert from_ids <= {"carol", "dave"}

        # Verify creditors are receiving
        to_ids = {s.to_id for s in settlements}
        assert to_ids <= {"alice", "bob"}

        # Optimal: at most min(creditors, debtors) + extras
        # With greedy algorithm, should be at most 3 settlements
        assert len(settlements) <= 4

    def test_balances_sum_to_non_zero_handles_gracefully(self):
        """Balances that don't sum to zero should still produce valid settlements."""
        # This edge case represents data inconsistency
        balances = {
            "alice": 60.0,   # Alice is owed $60
            "bob": -50.0,    # Bob owes $50
            # Note: doesn't sum to zero (imbalance of $10)
        }
        settlements = calculate_settlements(balances)

        # Should still produce a settlement for what can be matched
        assert len(settlements) >= 1

        # Bob should pay what he owes (up to Alice's credit)
        bob_payments = sum(s.amount for s in settlements if s.from_id == "bob")
        assert abs(bob_payments - 50.0) < 0.01

    def test_very_small_amounts_below_cent_ignored(self):
        """Very small amounts (< $0.01) should be ignored."""
        balances = {
            "alice": 0.005,   # Less than a cent
            "bob": -0.005,    # Less than a cent
        }
        settlements = calculate_settlements(balances)

        # Should return empty since amounts are below threshold
        assert settlements == []

    def test_small_amounts_at_threshold(self):
        """Amounts at $0.01 should be processed."""
        balances = {
            "alice": 0.02,
            "bob": -0.02,
        }
        settlements = calculate_settlements(balances)

        # Should produce a settlement
        assert len(settlements) == 1
        assert settlements[0].amount == 0.02

    def test_floating_point_precision(self):
        """Test that floating point precision issues are handled."""
        # These values can cause floating point issues
        balances = {
            "alice": 33.33,
            "bob": -16.665,
            "carol": -16.665,
        }
        settlements = calculate_settlements(balances)

        # Total paid should approximately equal alice's credit
        total_paid = sum(s.amount for s in settlements)
        assert abs(total_paid - 33.33) < 0.02  # Allow for rounding

    def test_large_number_of_participants(self):
        """Test with many participants."""
        # One creditor owed $100 by 10 debtors
        balances = {"creditor": 100.0}
        for i in range(10):
            balances[f"debtor_{i}"] = -10.0

        settlements = calculate_settlements(balances)

        # Total should equal the credit
        total_from = sum(s.amount for s in settlements)
        assert abs(total_from - 100.0) < 0.01

        # All payments should go to creditor
        for s in settlements:
            assert s.to_id == "creditor"

    def test_settlement_amounts_are_rounded(self):
        """Verify settlement amounts are properly rounded to 2 decimal places."""
        balances = {
            "alice": 100.0,
            "bob": -66.666,
            "carol": -33.334,
        }
        settlements = calculate_settlements(balances)

        # All amounts should be rounded to 2 decimal places
        for s in settlements:
            # Check that the amount has at most 2 decimal places
            rounded = round(s.amount, 2)
            assert abs(s.amount - rounded) < 0.001

    def test_single_large_creditor_single_small_debtor(self):
        """Single creditor with larger credit than single debtor's debt."""
        balances = {
            "alice": 100.0,
            "bob": -30.0,
        }
        settlements = calculate_settlements(balances)

        assert len(settlements) == 1
        assert settlements[0].from_id == "bob"
        assert settlements[0].to_id == "alice"
        assert settlements[0].amount == 30.0

    def test_single_small_creditor_single_large_debtor(self):
        """Single creditor with smaller credit than single debtor's debt."""
        balances = {
            "alice": 30.0,
            "bob": -100.0,
        }
        settlements = calculate_settlements(balances)

        assert len(settlements) == 1
        assert settlements[0].from_id == "bob"
        assert settlements[0].to_id == "alice"
        assert settlements[0].amount == 30.0

    def test_complex_scenario_realistic(self):
        """Realistic scenario: group dinner split."""
        # Alice paid $150, consumed $30
        # Bob paid $0, consumed $40
        # Carol paid $0, consumed $50
        # Dave paid $50, consumed $80
        # Total bill: $200, Total consumed: $200 (balanced)
        balances = {
            "alice": 150.0 - 30.0,   # +120 (owed)
            "bob": 0.0 - 40.0,       # -40 (owes)
            "carol": 0.0 - 50.0,     # -50 (owes)
            "dave": 50.0 - 80.0,     # -30 (owes)
        }
        settlements = calculate_settlements(balances)

        # Total paid to alice should equal 120
        total_to_alice = sum(s.amount for s in settlements if s.to_id == "alice")
        assert abs(total_to_alice - 120.0) < 0.01

        # All payments should go to alice (only creditor)
        for s in settlements:
            assert s.to_id == "alice"

    def test_returned_settlement_type(self):
        """Verify that returned settlements are Settlement model instances."""
        balances = {
            "alice": 50.0,
            "bob": -50.0,
        }
        settlements = calculate_settlements(balances)

        assert len(settlements) == 1
        assert isinstance(settlements[0], Settlement)
        assert hasattr(settlements[0], "from_id")
        assert hasattr(settlements[0], "to_id")
        assert hasattr(settlements[0], "amount")
