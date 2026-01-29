import { useState } from 'react'
import SplitEditor from './SplitEditor'
import ParticipantPicker from './ParticipantPicker'

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

interface LineItem {
  id?: string
  description: string
  unit_price_cents: number
  quantity: number
  category: string | null
  assignments?: Assignment[]
}

interface LineItemCardProps {
  tripId: string
  item: LineItem
  currency: string
  isEditing: boolean
  onUpdate: (item: LineItem) => void
  onDelete: () => void
  onAssignmentChange: (assignments: Assignment[]) => void
}

const CATEGORIES = [
  { value: '', label: 'None' },
  { value: 'food', label: 'Food' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'activities', label: 'Activities' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'other', label: 'Other' },
]

export default function LineItemCard({
  tripId,
  item,
  currency,
  isEditing,
  onUpdate,
  onDelete,
  onAssignmentChange,
}: LineItemCardProps) {
  const [showAssignPicker, setShowAssignPicker] = useState(false)
  const assignments = item.assignments || []

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100)
  }

  const totalAmount = item.unit_price_cents * item.quantity

  const handleRemoveAssignment = (participantId: string) => {
    const newAssignments = assignments.filter((a) => a.participant_id !== participantId)
    onAssignmentChange(newAssignments)
  }

  const handleSharesChange = (participantId: string, shares: number) => {
    const newAssignments = assignments.map((a) =>
      a.participant_id === participantId ? { ...a, shares } : a
    )
    onAssignmentChange(newAssignments)
  }

  const handleAddAssignments = (participantIds: string[]) => {
    // This is called with all selected participant IDs
    // We need to add new ones that aren't already assigned
    const existingIds = new Set(assignments.map((a) => a.participant_id))
    const newParticipantIds = participantIds.filter((id) => !existingIds.has(id))

    if (newParticipantIds.length > 0) {
      // We don't have participant data here, so we'll create placeholder assignments
      // The parent component should update these with real data
      const newAssignments = [
        ...assignments,
        ...newParticipantIds.map((id) => ({
          participant_id: id,
          shares: 1,
          participant: { id, primary_alias: 'Loading...' },
        })),
      ]
      onAssignmentChange(newAssignments)
    }
    setShowAssignPicker(false)
  }

  if (isEditing) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={item.description}
                onChange={(e) => onUpdate({ ...item, description: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Item description"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={(item.unit_price_cents / 100).toFixed(2)}
                  onChange={(e) =>
                    onUpdate({
                      ...item,
                      unit_price_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                    })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    onUpdate({ ...item, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select
                  value={item.category || ''}
                  onChange={(e) => onUpdate({ ...item, category: e.target.value || null })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
              {showAssignPicker ? (
                <div className="space-y-2">
                  <ParticipantPicker
                    tripId={tripId}
                    selectedParticipantIds={assignments.map((a) => a.participant_id)}
                    onChange={handleAddAssignments}
                    placeholder="Search participants to assign..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowAssignPicker(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <SplitEditor
                  assignments={assignments}
                  itemAmountCents={totalAmount}
                  currency={currency}
                  onRemove={handleRemoveAssignment}
                  onSharesChange={handleSharesChange}
                  onAddClick={() => setShowAssignPicker(true)}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onDelete}
            className="text-red-500 hover:text-red-700 p-1"
            title="Remove item"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        <div className="text-right text-sm font-medium text-gray-700">
          Total: {formatCurrency(totalAmount)}
        </div>
      </div>
    )
  }

  // View mode
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{item.description}</span>
            {item.category && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {item.category}
              </span>
            )}
          </div>
          {item.quantity > 1 && (
            <div className="text-sm text-gray-500 mt-1">
              {item.quantity} x {formatCurrency(item.unit_price_cents)}
            </div>
          )}
          <div className="mt-2">
            {showAssignPicker ? (
              <div className="space-y-2">
                <ParticipantPicker
                  tripId={tripId}
                  selectedParticipantIds={assignments.map((a) => a.participant_id)}
                  onChange={handleAddAssignments}
                  placeholder="Search participants to assign..."
                />
                <button
                  type="button"
                  onClick={() => setShowAssignPicker(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <SplitEditor
                assignments={assignments}
                itemAmountCents={totalAmount}
                currency={currency}
                onRemove={handleRemoveAssignment}
                onSharesChange={handleSharesChange}
                onAddClick={() => setShowAssignPicker(true)}
              />
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</div>
        </div>
      </div>
    </div>
  )
}
