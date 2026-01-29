import { useState, useEffect } from 'react'

interface Participant {
  id: string
  primary_alias: string
}

interface Assignment {
  id?: string
  participant_id: string
  shares: number
  participant: Participant
}

interface SplitEditorProps {
  assignments: Assignment[]
  itemAmountCents: number
  currency: string
  onRemove: (participantId: string) => void
  onSharesChange: (participantId: string, shares: number) => void
  onAddClick: () => void
  disabled?: boolean
}

// Calculate GCD of two numbers
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b > 0) {
    const t = b
    b = a % b
    a = t
  }
  return a || 1
}

// Calculate GCD of an array of numbers
function gcdArray(arr: number[]): number {
  if (arr.length === 0) return 1
  return arr.reduce((acc, val) => gcd(acc, val), arr[0])
}

export default function SplitEditor({
  assignments,
  itemAmountCents,
  currency,
  onRemove,
  onSharesChange,
  onAddClick,
  disabled = false,
}: SplitEditorProps) {
  // Track which field is being edited to prevent circular updates
  const [editingAmounts, setEditingAmounts] = useState<Record<string, string>>({})

  const totalShares = assignments.reduce((sum, a) => sum + a.shares, 0)

  // Calculate amount for a given shares value
  const getAmountCents = (shares: number): number => {
    if (totalShares === 0) return 0
    return Math.round((itemAmountCents * shares) / totalShares)
  }

  // Handle ratio input change
  const handleRatioChange = (participantId: string, value: string) => {
    const newShares = Math.max(1, parseInt(value) || 1)
    onSharesChange(participantId, newShares)
    // Clear any amount being edited for this participant
    setEditingAmounts((prev) => {
      const next = { ...prev }
      delete next[participantId]
      return next
    })
  }

  // Handle amount input change (while typing)
  const handleAmountInput = (participantId: string, value: string) => {
    setEditingAmounts((prev) => ({ ...prev, [participantId]: value }))
  }

  // Handle amount input blur (commit the change)
  const handleAmountBlur = (participantId: string) => {
    const inputValue = editingAmounts[participantId]
    if (inputValue === undefined) return

    const newAmountCents = Math.round(parseFloat(inputValue) * 100) || 0
    if (newAmountCents <= 0) {
      // Invalid amount, reset
      setEditingAmounts((prev) => {
        const next = { ...prev }
        delete next[participantId]
        return next
      })
      return
    }

    // Calculate new ratios based on the amounts
    // The idea: if someone sets their amount, we calculate what ratio that implies
    // and adjust all ratios proportionally

    const currentAssignment = assignments.find((a) => a.participant_id === participantId)
    if (!currentAssignment) return

    // Calculate what the new shares should be to achieve this amount
    // amount = (itemAmount * shares) / totalShares
    // We need to find integer shares that give the right proportions

    // First, calculate the target amounts for everyone
    const targetAmounts = assignments.map((a) => {
      if (a.participant_id === participantId) {
        return newAmountCents
      }
      // Keep other amounts proportional to their current shares
      return getAmountCents(a.shares)
    })

    // Find GCD of all amounts to get the smallest integer ratios
    const amountGcd = gcdArray(targetAmounts.filter((a) => a > 0))

    // Convert amounts to ratios
    const newRatios = targetAmounts.map((amount) => Math.max(1, Math.round(amount / amountGcd)))

    // Apply the new ratios
    assignments.forEach((a, i) => {
      if (a.shares !== newRatios[i]) {
        onSharesChange(a.participant_id, newRatios[i])
      }
    })

    // Clear the editing state
    setEditingAmounts((prev) => {
      const next = { ...prev }
      delete next[participantId]
      return next
    })
  }

  // Clear editing amounts when assignments change externally
  useEffect(() => {
    setEditingAmounts({})
  }, [assignments.length])

  if (assignments.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddClick}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Assign
      </button>
    )
  }

  // Fixed column widths (in pixels)
  const RATIO_WIDTH = 48 // fits "999"
  const AMOUNT_WIDTH = 80 // fits "9999.99"
  const BUTTON_WIDTH = 32

  return (
    <div className="max-w-full overflow-hidden space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <div className="flex-1 min-w-0">Person</div>
        <div style={{ width: RATIO_WIDTH }} className="text-center flex-shrink-0">Ratio</div>
        <div style={{ width: AMOUNT_WIDTH }} className="text-right flex-shrink-0">{currency}</div>
        <div style={{ width: BUTTON_WIDTH }} className="flex-shrink-0"></div>
      </div>

      {/* Data rows */}
      {assignments.map((assignment) => {
        const amountCents = getAmountCents(assignment.shares)
        const displayAmount = editingAmounts[assignment.participant_id] ?? (amountCents / 100).toFixed(2)

        return (
          <div
            key={assignment.participant_id}
            className="flex items-center gap-2"
          >
            {/* Person name - flexible width, text wraps */}
            <div className="flex-1 min-w-0 text-sm text-gray-900 break-words">
              {assignment.participant.primary_alias}
            </div>

            {/* Ratio input - fixed width */}
            <input
              type="number"
              min="1"
              value={assignment.shares}
              onChange={(e) => handleRatioChange(assignment.participant_id, e.target.value)}
              disabled={disabled}
              style={{ width: RATIO_WIDTH }}
              className="flex-shrink-0 text-center border border-gray-300 rounded px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />

            {/* Amount input - fixed width */}
            <input
              type="number"
              step="0.01"
              value={displayAmount}
              onChange={(e) => handleAmountInput(assignment.participant_id, e.target.value)}
              onBlur={() => handleAmountBlur(assignment.participant_id)}
              disabled={disabled}
              style={{ width: AMOUNT_WIDTH }}
              className="flex-shrink-0 text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />

            {/* Remove button - fixed width */}
            {!disabled ? (
              <button
                type="button"
                onClick={() => onRemove(assignment.participant_id)}
                style={{ width: BUTTON_WIDTH }}
                className="flex-shrink-0 h-8 text-red-400 hover:text-red-600 flex items-center justify-center"
                title="Remove"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <div style={{ width: BUTTON_WIDTH }} className="flex-shrink-0"></div>
            )}
          </div>
        )
      })}

      {/* Add button */}
      {!disabled && (
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 py-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add person
        </button>
      )}
    </div>
  )
}
