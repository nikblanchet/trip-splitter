import pytest


@pytest.fixture
def sample_participants():
    """Three test participants."""
    return [
        {"id": "p1", "trip_id": "trip1", "primary_alias": "Alice"},
        {"id": "p2", "trip_id": "trip1", "primary_alias": "Bob"},
        {"id": "p3", "trip_id": "trip1", "primary_alias": "Carol"},
    ]


@pytest.fixture
def sample_receipt():
    """Single receipt paid by Alice for $100."""
    return {
        "id": "r1",
        "trip_id": "trip1",
        "paid_by_participant_id": "p1",  # Alice paid
        "total_amount": 100.00,
        "currency": "USD",
    }


@pytest.fixture
def sample_line_items():
    """Three line items totaling $100."""
    return [
        {"id": "li1", "receipt_id": "r1", "amount": 40.00, "description": "Dinner"},
        {"id": "li2", "receipt_id": "r1", "amount": 30.00, "description": "Drinks"},
        {"id": "li3", "receipt_id": "r1", "amount": 30.00, "description": "Dessert"},
    ]


@pytest.fixture
def sample_assignments():
    """Assignments for items 1 and 2 (item 3 is unassigned)."""
    return [
        # Item 1: Alice and Bob split equally
        {"id": "a1", "line_item_id": "li1", "participant_id": "p1", "share": 1},
        {"id": "a2", "line_item_id": "li1", "participant_id": "p2", "share": 1},
        # Item 2: Bob gets 2/3, Carol gets 1/3
        {"id": "a3", "line_item_id": "li2", "participant_id": "p2", "share": 2},
        {"id": "a4", "line_item_id": "li2", "participant_id": "p3", "share": 1},
        # Item 3 (li3) is unassigned - will split equally among all
    ]


@pytest.fixture
def sample_direct_payment():
    """Bob pays Alice $10."""
    return {
        "id": "dp1",
        "trip_id": "trip1",
        "from_participant_id": "p2",  # Bob
        "to_participant_id": "p1",     # Alice
        "amount": 10.00,
    }


@pytest.fixture
def complex_trip_data(sample_participants, sample_receipt, sample_line_items, sample_assignments, sample_direct_payment):
    """Complete trip data matching fetch_trip_data() return format."""
    return {
        "participants": sample_participants,
        "receipts": [sample_receipt],
        "line_items": sample_line_items,
        "item_assignments": sample_assignments,
        "direct_payments": [sample_direct_payment],
    }
