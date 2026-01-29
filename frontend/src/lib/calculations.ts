/**
 * Receipt calculation utilities
 *
 * Pure functions for calculating per-person breakdowns of receipt costs,
 * including prorated tax and tip based on item share proportions.
 */

export interface Assignment {
  participant_id: string
  participant_name: string
  shares: number
}

export interface LineItem {
  unit_price_cents: number
  quantity: number
  assignments: Assignment[]
}

export interface TaxLine {
  amount_cents: number
}

export interface ReceiptData {
  line_items: LineItem[]
  tax_lines: TaxLine[]
  tip_cents: number | null
}

export interface PerPersonBreakdown {
  participantId: string
  participantName: string
  itemsTotal: number
  taxShare: number
  tipShare: number
  total: number
}

/**
 * Calculate per-person breakdown of receipt costs.
 *
 * Algorithm:
 * 1. For each line item, calculate each participant's share based on their
 *    shares ratio (e.g., if A has 2 shares and B has 1 share of a $30 item,
 *    A gets $20 and B gets $10)
 * 2. Sum up each participant's item totals
 * 3. Prorate tax and tip based on each participant's proportion of the total
 *    assigned amount
 * 4. Return results sorted by total descending
 *
 * @param receipt - Receipt data containing line items, tax lines, and tip
 * @returns Array of per-person breakdowns sorted by total descending
 */
export function calculatePerPersonBreakdown(
  receipt: ReceiptData
): PerPersonBreakdown[] {
  const breakdown = new Map<string, PerPersonBreakdown>()

  // Calculate total shares across all items to prorate tax and tip
  let totalAssignedAmount = 0
  const participantItemTotals = new Map<string, number>()

  receipt.line_items.forEach((item) => {
    const itemTotal = item.unit_price_cents * item.quantity
    const totalShares = item.assignments.reduce((sum, a) => sum + a.shares, 0)

    if (totalShares > 0) {
      item.assignments.forEach((assignment) => {
        const participantShare = (itemTotal * assignment.shares) / totalShares
        const current =
          participantItemTotals.get(assignment.participant_id) || 0
        participantItemTotals.set(
          assignment.participant_id,
          current + participantShare
        )
        totalAssignedAmount += participantShare

        // Initialize breakdown entry
        if (!breakdown.has(assignment.participant_id)) {
          breakdown.set(assignment.participant_id, {
            participantId: assignment.participant_id,
            participantName: assignment.participant_name,
            itemsTotal: 0,
            taxShare: 0,
            tipShare: 0,
            total: 0,
          })
        }

        const entry = breakdown.get(assignment.participant_id)!
        entry.itemsTotal += participantShare
      })
    }
  })

  // Calculate tax and tip total
  const taxTotal = receipt.tax_lines.reduce(
    (sum, tax) => sum + tax.amount_cents,
    0
  )
  const tipTotal = receipt.tip_cents || 0

  // Prorate tax and tip based on items share
  breakdown.forEach((entry, participantId) => {
    const itemsShare = participantItemTotals.get(participantId) || 0
    if (totalAssignedAmount > 0) {
      entry.taxShare = (taxTotal * itemsShare) / totalAssignedAmount
      entry.tipShare = (tipTotal * itemsShare) / totalAssignedAmount
    }
    entry.total = entry.itemsTotal + entry.taxShare + entry.tipShare
  })

  return Array.from(breakdown.values()).sort((a, b) => b.total - a.total)
}

/**
 * Round a number to the specified number of decimal places.
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 2)
 * @returns Rounded number
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}
