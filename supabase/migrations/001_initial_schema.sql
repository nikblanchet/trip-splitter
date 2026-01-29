-- Trip Expense Splitter - Initial Schema Migration
-- This migration creates all tables, indexes, and views for the trip expense splitter application.

-- ============================================================================
-- TABLES
-- ============================================================================

-- trips: Core table for organizing expenses by trip
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_currency TEXT DEFAULT 'USD',
    invite_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- participants: People who are part of a trip
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id),
    venmo_handle TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- participant_aliases: Names/aliases for participants (supports multiple names per person)
CREATE TABLE participant_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    alias TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on participant_id for fast lookups
CREATE INDEX idx_participant_aliases_participant_id ON participant_aliases(participant_id);

-- Index on LOWER(alias) for case-insensitive search
CREATE INDEX idx_participant_aliases_alias_lower ON participant_aliases(LOWER(alias));

-- receipts: Scanned or manually entered receipts
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id),
    payer_participant_id UUID NOT NULL REFERENCES participants(id),
    vendor_name TEXT,
    receipt_date DATE,
    receipt_currency TEXT DEFAULT 'USD',
    image_url TEXT, -- nullable for manual entries
    subtotal DECIMAL(10, 2),
    total DECIMAL(10, 2),
    tip_amount DECIMAL(10, 2),
    exchange_rate DECIMAL(10, 6),
    raw_ocr_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- line_items: Individual items on a receipt
CREATE TABLE line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id),
    description TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    category TEXT DEFAULT 'other' CHECK (category IN ('food', 'alcohol', 'other')),
    sort_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- item_assignments: Who owes what for each line item (supports splitting)
CREATE TABLE item_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_item_id UUID NOT NULL REFERENCES line_items(id),
    participant_id UUID NOT NULL REFERENCES participants(id),
    shares INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (line_item_id, participant_id)
);

-- tax_lines: Tax entries on receipts (can apply to specific categories)
CREATE TABLE tax_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id),
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    applies_to_category TEXT, -- nullable: if null, applies to all; otherwise 'food', 'alcohol', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- direct_payments: Payments between participants (e.g., settling up)
CREATE TABLE direct_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id),
    from_participant_id UUID NOT NULL REFERENCES participants(id),
    to_participant_id UUID NOT NULL REFERENCES participants(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate DECIMAL(10, 6),
    payment_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- exchange_rate_cache: Cached exchange rates to minimize API calls
CREATE TABLE exchange_rate_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date DATE NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(10, 6) NOT NULL,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (rate_date, from_currency, to_currency)
);

-- audit_log: Track changes for accountability
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id), -- nullable for system-level events
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying audit logs by trip and time
CREATE INDEX idx_audit_log_trip_created ON audit_log(trip_id, created_at DESC);

-- ============================================================================
-- VIEWS (Active records - filtering soft deletes)
-- ============================================================================

-- active_participants: Only non-deleted participants
CREATE VIEW active_participants AS
SELECT *
FROM participants
WHERE deleted_at IS NULL;

-- active_receipts: Only non-deleted receipts
CREATE VIEW active_receipts AS
SELECT *
FROM receipts
WHERE deleted_at IS NULL;

-- active_line_items: Only non-deleted line items
CREATE VIEW active_line_items AS
SELECT *
FROM line_items
WHERE deleted_at IS NULL;

-- active_item_assignments: Only non-deleted item assignments
CREATE VIEW active_item_assignments AS
SELECT *
FROM item_assignments
WHERE deleted_at IS NULL;

-- active_tax_lines: Only non-deleted tax lines
CREATE VIEW active_tax_lines AS
SELECT *
FROM tax_lines
WHERE deleted_at IS NULL;

-- active_direct_payments: Only non-deleted direct payments
CREATE VIEW active_direct_payments AS
SELECT *
FROM direct_payments
WHERE deleted_at IS NULL;

-- participants_display: Participants with their primary alias and all aliases aggregated
CREATE VIEW participants_display AS
SELECT
    p.id,
    p.trip_id,
    p.venmo_handle,
    p.created_at,
    p.deleted_at,
    pa_primary.alias AS primary_alias,
    COALESCE(
        (SELECT array_agg(pa.alias ORDER BY pa.is_primary DESC, pa.created_at)
         FROM participant_aliases pa
         WHERE pa.participant_id = p.id),
        ARRAY[]::TEXT[]
    ) AS all_aliases
FROM participants p
LEFT JOIN participant_aliases pa_primary
    ON pa_primary.participant_id = p.id
    AND pa_primary.is_primary = TRUE;
