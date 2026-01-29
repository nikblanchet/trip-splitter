import { describe, it, expect } from 'vitest'
import {
  calculatePerPersonBreakdown,
  roundToDecimals,
  type ReceiptData,
} from '../calculations'

describe('calculatePerPersonBreakdown', () => {
  it('returns empty array for receipt with no assignments', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [],
        },
      ],
      tax_lines: [{ amount_cents: 100 }],
      tip_cents: 200,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toEqual([])
  })

  it('calculates single participant single item correctly', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000, // $10.00
          quantity: 1,
          assignments: [
            {
              participant_id: 'p1',
              participant_name: 'Alice',
              shares: 1,
            },
          ],
        },
      ],
      tax_lines: [{ amount_cents: 100 }], // $1.00
      tip_cents: 200, // $2.00
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      participantId: 'p1',
      participantName: 'Alice',
      itemsTotal: 1000,
      taxShare: 100,
      tipShare: 200,
      total: 1300,
    })
  })

  it('handles equal split between two participants', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000, // $10.00
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
            { participant_id: 'p2', participant_name: 'Bob', shares: 1 },
          ],
        },
      ],
      tax_lines: [{ amount_cents: 100 }], // $1.00
      tip_cents: 200, // $2.00
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(2)
    // Both should have equal shares
    expect(result[0].itemsTotal).toBe(500)
    expect(result[0].taxShare).toBe(50)
    expect(result[0].tipShare).toBe(100)
    expect(result[0].total).toBe(650)

    expect(result[1].itemsTotal).toBe(500)
    expect(result[1].taxShare).toBe(50)
    expect(result[1].tipShare).toBe(100)
    expect(result[1].total).toBe(650)
  })

  it('handles unequal shares (2:1 split)', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 3000, // $30.00
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 2 },
            { participant_id: 'p2', participant_name: 'Bob', shares: 1 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(2)
    // Alice should have 2/3 of $30 = $20
    const alice = result.find((r) => r.participantId === 'p1')!
    expect(alice.itemsTotal).toBe(2000)
    expect(alice.total).toBe(2000)

    // Bob should have 1/3 of $30 = $10
    const bob = result.find((r) => r.participantId === 'p2')!
    expect(bob.itemsTotal).toBe(1000)
    expect(bob.total).toBe(1000)
  })

  it('prorates tax based on item share proportions', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 2000, // $20.00 - Alice only
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
        {
          unit_price_cents: 1000, // $10.00 - Bob only
          quantity: 1,
          assignments: [
            { participant_id: 'p2', participant_name: 'Bob', shares: 1 },
          ],
        },
      ],
      tax_lines: [{ amount_cents: 300 }], // $3.00 total tax
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    // Alice has 2/3 of items total, should get 2/3 of tax = $2.00
    const alice = result.find((r) => r.participantId === 'p1')!
    expect(alice.itemsTotal).toBe(2000)
    expect(alice.taxShare).toBe(200)

    // Bob has 1/3 of items total, should get 1/3 of tax = $1.00
    const bob = result.find((r) => r.participantId === 'p2')!
    expect(bob.itemsTotal).toBe(1000)
    expect(bob.taxShare).toBe(100)
  })

  it('prorates tip based on item share proportions', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 3000, // $30.00 - Alice only
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
        {
          unit_price_cents: 1000, // $10.00 - Bob only
          quantity: 1,
          assignments: [
            { participant_id: 'p2', participant_name: 'Bob', shares: 1 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: 400, // $4.00 total tip
    }

    const result = calculatePerPersonBreakdown(receipt)

    // Alice has 3/4 of items total, should get 3/4 of tip = $3.00
    const alice = result.find((r) => r.participantId === 'p1')!
    expect(alice.itemsTotal).toBe(3000)
    expect(alice.tipShare).toBe(300)

    // Bob has 1/4 of items total, should get 1/4 of tip = $1.00
    const bob = result.find((r) => r.participantId === 'p2')!
    expect(bob.itemsTotal).toBe(1000)
    expect(bob.tipShare).toBe(100)
  })

  it('handles receipt with no tax', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: 200,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0].taxShare).toBe(0)
    expect(result[0].tipShare).toBe(200)
    expect(result[0].total).toBe(1200) // items + tip, no tax
  })

  it('handles receipt with no tip', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
      ],
      tax_lines: [{ amount_cents: 100 }],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0].taxShare).toBe(100)
    expect(result[0].tipShare).toBe(0)
    expect(result[0].total).toBe(1100) // items + tax, no tip
  })

  it('rounds to 2 decimal places', () => {
    // Test roundToDecimals helper
    expect(roundToDecimals(10.555)).toBe(10.56)
    expect(roundToDecimals(10.554)).toBe(10.55)
    expect(roundToDecimals(10.5)).toBe(10.5)
    expect(roundToDecimals(10)).toBe(10)
  })

  it('sorts results by total descending', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000, // $10.00 - small spender
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
        {
          unit_price_cents: 3000, // $30.00 - big spender
          quantity: 1,
          assignments: [
            { participant_id: 'p2', participant_name: 'Bob', shares: 1 },
          ],
        },
        {
          unit_price_cents: 2000, // $20.00 - medium spender
          quantity: 1,
          assignments: [
            { participant_id: 'p3', participant_name: 'Charlie', shares: 1 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(3)
    expect(result[0].participantName).toBe('Bob')
    expect(result[0].total).toBe(3000)
    expect(result[1].participantName).toBe('Charlie')
    expect(result[1].total).toBe(2000)
    expect(result[2].participantName).toBe('Alice')
    expect(result[2].total).toBe(1000)
  })

  it('handles multiple tax lines', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
      ],
      tax_lines: [
        { amount_cents: 50 }, // sales tax
        { amount_cents: 30 }, // alcohol tax
      ],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0].taxShare).toBe(80) // 50 + 30
  })

  it('handles line item with quantity > 1', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 500, // $5.00 each
          quantity: 3, // 3 items = $15.00 total
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0].itemsTotal).toBe(1500) // 500 * 3
  })

  it('handles participant assigned to multiple items', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
        {
          unit_price_cents: 2000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
      ],
      tax_lines: [{ amount_cents: 300 }],
      tip_cents: 600,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    expect(result[0].participantId).toBe('p1')
    expect(result[0].itemsTotal).toBe(3000) // 1000 + 2000
    expect(result[0].taxShare).toBe(300) // all tax goes to Alice
    expect(result[0].tipShare).toBe(600) // all tip goes to Alice
    expect(result[0].total).toBe(3900)
  })

  it('handles mixed assigned and unassigned items correctly', () => {
    // Unassigned items should not appear in breakdown
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000, // assigned
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 1 },
          ],
        },
        {
          unit_price_cents: 5000, // unassigned - should be ignored
          quantity: 1,
          assignments: [],
        },
      ],
      tax_lines: [{ amount_cents: 600 }],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toHaveLength(1)
    // Alice only pays for her $10 item, gets all tax (since she's only one assigned)
    expect(result[0].itemsTotal).toBe(1000)
    expect(result[0].taxShare).toBe(600) // all tax prorated to Alice
  })

  it('handles receipt with empty line items', () => {
    const receipt: ReceiptData = {
      line_items: [],
      tax_lines: [{ amount_cents: 100 }],
      tip_cents: 200,
    }

    const result = calculatePerPersonBreakdown(receipt)

    expect(result).toEqual([])
  })

  it('handles zero shares correctly', () => {
    const receipt: ReceiptData = {
      line_items: [
        {
          unit_price_cents: 1000,
          quantity: 1,
          assignments: [
            { participant_id: 'p1', participant_name: 'Alice', shares: 0 },
          ],
        },
      ],
      tax_lines: [],
      tip_cents: null,
    }

    const result = calculatePerPersonBreakdown(receipt)

    // Zero total shares means item isn't really assigned
    expect(result).toEqual([])
  })
})

describe('roundToDecimals', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(roundToDecimals(1.234)).toBe(1.23)
    expect(roundToDecimals(1.235)).toBe(1.24)
    expect(roundToDecimals(1.2)).toBe(1.2)
  })

  it('rounds to specified decimal places', () => {
    expect(roundToDecimals(1.2345, 3)).toBe(1.235)
    expect(roundToDecimals(1.2345, 1)).toBe(1.2)
    expect(roundToDecimals(1.2345, 0)).toBe(1)
  })

  it('handles negative numbers', () => {
    expect(roundToDecimals(-1.234)).toBe(-1.23)
    expect(roundToDecimals(-1.235)).toBe(-1.24)
  })

  it('handles zero', () => {
    expect(roundToDecimals(0)).toBe(0)
    expect(roundToDecimals(0.001)).toBe(0)
  })
})
