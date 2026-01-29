-- Multi-Payer Support Migration
-- Adds support for multiple people paying for a single receipt

-- ============================================================================
-- NEW TABLE: receipt_payments
-- ============================================================================

-- Track individual payment contributions to a receipt
CREATE TABLE receipt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (receipt_id, participant_id)
);

-- Index for fast lookups by receipt (balance calculations)
CREATE INDEX idx_receipt_payments_receipt_id ON receipt_payments(receipt_id);

-- Index for fast lookups by participant (participant history)
CREATE INDEX idx_receipt_payments_participant_id ON receipt_payments(participant_id);

-- View for active receipt payments (filtering soft deletes)
CREATE VIEW active_receipt_payments AS
SELECT *
FROM receipt_payments
WHERE deleted_at IS NULL;

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Migrate existing single-payer data to receipt_payments table
-- Each existing receipt's payer becomes a single payment for the full total
INSERT INTO receipt_payments (receipt_id, participant_id, amount)
SELECT id, payer_participant_id, total
FROM receipts
WHERE payer_participant_id IS NOT NULL
  AND deleted_at IS NULL
  AND total IS NOT NULL;

-- ============================================================================
-- SCHEMA UPDATES
-- ============================================================================

-- Make payer_participant_id nullable for new receipts
-- (new receipts will use receipt_payments instead)
ALTER TABLE receipts ALTER COLUMN payer_participant_id DROP NOT NULL;

-- Add comment indicating deprecation
COMMENT ON COLUMN receipts.payer_participant_id IS
    'DEPRECATED: Use receipt_payments table for payer information. Retained for backward compatibility.';
