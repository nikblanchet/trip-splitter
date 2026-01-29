import { useState, useRef, useEffect } from 'react'

interface Participant {
  id: string
  primary_alias: string
}

interface Assignment {
  participant_id: string
  shares: number
  participant: Participant
}

interface AssignmentChipsProps {
  assignments: Assignment[]
  onRemove: (participantId: string) => void
  onSharesChange: (participantId: string, shares: number) => void
  onAddClick: () => void
  disabled?: boolean
}

export default function AssignmentChips({
  assignments,
  onRemove,
  onSharesChange,
  onAddClick,
  disabled = false,
}: AssignmentChipsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingShares, setEditingShares] = useState<number>(1)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingId(null)
      }
    }

    if (editingId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [editingId])

  const handleChipClick = (assignment: Assignment) => {
    if (disabled) return
    setEditingId(assignment.participant_id)
    setEditingShares(assignment.shares)
  }

  const handleSharesUpdate = () => {
    if (editingId) {
      onSharesChange(editingId, editingShares)
      setEditingId(null)
    }
  }

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

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {assignments.map((assignment) => (
        <div key={assignment.participant_id} className="relative">
          <button
            type="button"
            onClick={() => handleChipClick(assignment)}
            disabled={disabled}
            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assignment.participant.primary_alias}
            {assignment.shares > 1 && (
              <span className="text-blue-600">({assignment.shares})</span>
            )}
            {!disabled && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(assignment.participant_id)
                }}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            )}
          </button>

          {editingId === assignment.participant_id && (
            <div
              ref={popoverRef}
              className="absolute z-20 mt-1 left-0 bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[160px]"
            >
              <div className="text-sm font-medium text-gray-700 mb-2">
                Shares for {assignment.participant.primary_alias}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingShares(Math.max(1, editingShares - 1))}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={editingShares}
                  onChange={(e) => setEditingShares(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 text-center border border-gray-300 rounded px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => setEditingShares(editingShares + 1)}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                >
                  +
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleSharesUpdate}
                  className="flex-1 bg-blue-600 text-white text-sm py-1 px-2 rounded hover:bg-blue-700"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(assignment.participant_id)
                    setEditingId(null)
                  }}
                  className="flex-1 bg-red-100 text-red-700 text-sm py-1 px-2 rounded hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 text-sm"
        >
          +
        </button>
      )}
    </div>
  )
}
