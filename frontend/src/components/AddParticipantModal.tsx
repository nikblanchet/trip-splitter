import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'

interface AddParticipantModalProps {
  tripId: string
  isOpen: boolean
  onClose: () => void
  onParticipantAdded: () => void
}

export default function AddParticipantModal({
  tripId,
  isOpen,
  onClose,
  onParticipantAdded,
}: AddParticipantModalProps) {
  const [primaryName, setPrimaryName] = useState('')
  const [aliases, setAliases] = useState<string[]>([])
  const [newAlias, setNewAlias] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPrimaryName('')
      setAliases([])
      setNewAlias('')
      setVenmoHandle('')
      setError(null)
      setNameError(null)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  const addAlias = () => {
    const trimmed = newAlias.trim()
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed])
      setNewAlias('')
    }
  }

  const removeAlias = (index: number) => {
    setAliases(aliases.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const trimmedName = primaryName.trim()
    if (!trimmedName) {
      setNameError('Please enter a name')
      return
    }
    if (trimmedName.length < 2) {
      setNameError('Name must be at least 2 characters')
      return
    }
    setNameError(null)

    setIsSubmitting(true)
    setError(null)

    try {
      // First, get the trip UUID from the invite code
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('id')
        .eq('invite_code', tripId)
        .single()

      if (tripError || !tripData) {
        setError('Could not find trip. Please try again.')
        setIsSubmitting(false)
        return
      }

      // Insert participant
      const { data: participant, error: participantError } = await supabase
        .from('participants')
        .insert({
          trip_id: tripData.id,
          primary_alias: trimmedName,
          venmo_handle: venmoHandle.trim() || null,
        })
        .select()
        .single()

      if (participantError) {
        if (participantError.message.includes('duplicate') || participantError.message.includes('unique')) {
          setError('A participant with this name already exists.')
        } else {
          setError('Unable to add participant. Please try again.')
        }
        setIsSubmitting(false)
        return
      }

      // Insert primary alias
      const aliasesToInsert = [
        { participant_id: participant.id, alias: trimmedName, is_primary: true },
        ...aliases.map((alias) => ({
          participant_id: participant.id,
          alias,
          is_primary: false,
        })),
      ]

      const { error: aliasError } = await supabase
        .from('participant_aliases')
        .insert(aliasesToInsert)

      if (aliasError) {
        setError('Participant added but some aliases could not be saved.')
        setIsSubmitting(false)
        return
      }

      setIsSubmitting(false)
      onParticipantAdded()
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Add Participant</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={primaryName}
                onChange={(e) => {
                  setPrimaryName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                placeholder="e.g., John Smith"
                className={`w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 text-base min-h-[44px] ${
                  nameError ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                }`}
                aria-describedby={nameError ? 'name-error' : undefined}
              />
              {nameError && (
                <p id="name-error" className="mt-1 text-sm text-red-600">{nameError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Aliases
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addAlias()
                    }
                  }}
                  placeholder="e.g., Johnny, J"
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={addAlias}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors min-h-[44px]"
                >
                  Add
                </button>
              </div>
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {aliases.map((alias, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-sm"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => removeAlias(index)}
                        className="text-gray-400 hover:text-gray-600 p-1 min-w-[24px] min-h-[24px] flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Venmo Handle
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input
                  type="text"
                  value={venmoHandle}
                  onChange={(e) => setVenmoHandle(e.target.value)}
                  placeholder="venmo-username"
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] order-2 sm:order-1 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 order-1 sm:order-2"
              >
                {isSubmitting && <Spinner size="sm" />}
                {isSubmitting ? 'Adding...' : 'Add Participant'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
