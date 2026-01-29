import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'

interface Participant {
  id: string
  primary_alias: string
}

interface ParticipantAlias {
  id: string
  alias: string
  is_primary: boolean
  participant: Participant
}

interface ParticipantPickerProps {
  tripId: string
  selectedParticipantIds: string[]
  onChange: (participantIds: string[]) => void
  placeholder?: string
}

export default function ParticipantPicker({
  tripId,
  selectedParticipantIds,
  onChange,
  placeholder = 'Search participants...',
}: ParticipantPickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<ParticipantAlias[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedParticipants, setSelectedParticipants] = useState<Map<string, Participant>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load selected participants data on mount or when selection changes externally
  useEffect(() => {
    const loadSelectedParticipants = async () => {
      if (selectedParticipantIds.length === 0) {
        setSelectedParticipants(new Map())
        return
      }

      try {
        const { data: tripData } = await supabase
          .from('trips')
          .select('id')
          .eq('invite_code', tripId)
          .single()

        if (!tripData) return

        // Use participants_display view which has the primary_alias column
        const { data } = await supabase
          .from('participants_display')
          .select('id, primary_alias')
          .eq('trip_id', tripData.id)
          .in('id', selectedParticipantIds)
          .is('deleted_at', null)

        if (data) {
          const map = new Map<string, Participant>()
          data.forEach((p) => map.set(p.id, p))
          setSelectedParticipants(map)
        }
      } catch {
        console.error('Error loading selected participants')
      }
    }

    loadSelectedParticipants()
  }, [tripId, selectedParticipantIds])

  // Search for participants when search term changes
  useEffect(() => {
    const search = async () => {
      if (!searchTerm.trim()) {
        setResults([])
        return
      }

      setIsLoading(true)

      try {
        // First get the trip UUID
        const { data: tripData } = await supabase
          .from('trips')
          .select('id')
          .eq('invite_code', tripId)
          .single()

        if (!tripData) {
          setIsLoading(false)
          return
        }

        // Search aliases with participant data
        // Join with participants_display view to get primary_alias
        const { data, error } = await supabase
          .from('participant_aliases')
          .select(`
            id,
            alias,
            is_primary,
            participant:participants_display!inner(id, primary_alias, trip_id, deleted_at)
          `)
          .ilike('alias', `%${searchTerm}%`)
          .eq('participants_display.trip_id', tripData.id)
          .is('participants_display.deleted_at', null)
          .limit(10)

        if (error) {
          console.error('Search error:', error)
          setResults([])
        } else {
          // Filter out already selected participants and dedupe by participant id
          const seen = new Set<string>()
          const filtered = (data || [])
            .filter((alias) => {
              const participant = alias.participant as unknown as Participant
              if (!participant || selectedParticipantIds.includes(participant.id) || seen.has(participant.id)) {
                return false
              }
              seen.add(participant.id)
              return true
            })
            .map((alias) => ({
              ...alias,
              participant: alias.participant as unknown as Participant,
            }))
          setResults(filtered)
        }
      } catch {
        setResults([])
      }

      setIsLoading(false)
    }

    const debounce = setTimeout(search, 200)
    return () => clearTimeout(debounce)
  }, [searchTerm, tripId, selectedParticipantIds])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectParticipant = (participant: Participant) => {
    const newMap = new Map(selectedParticipants)
    newMap.set(participant.id, participant)
    setSelectedParticipants(newMap)
    onChange([...selectedParticipantIds, participant.id])
    setSearchTerm('')
    setResults([])
    inputRef.current?.focus()
  }

  const removeParticipant = (participantId: string) => {
    const newMap = new Map(selectedParticipants)
    newMap.delete(participantId)
    setSelectedParticipants(newMap)
    onChange(selectedParticipantIds.filter((id) => id !== participantId))
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-2 p-3 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white min-h-[48px]">
        {Array.from(selectedParticipants.values()).map((participant) => (
          <span
            key={participant.id}
            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-md text-sm"
          >
            {participant.primary_alias}
            <button
              type="button"
              onClick={() => removeParticipant(participant.id)}
              className="text-blue-600 hover:text-blue-800 p-0.5 min-w-[24px] min-h-[24px] flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedParticipants.size === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none text-base"
        />
      </div>

      {isOpen && (searchTerm || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-4 flex items-center gap-2 text-gray-500 text-sm">
              <Spinner size="sm" />
              <span>Searching...</span>
            </div>
          )}

          {!isLoading && searchTerm && results.length === 0 && (
            <div className="px-4 py-4 text-gray-500 text-sm">No participants found</div>
          )}

          {!isLoading && results.map((alias) => (
            <button
              key={alias.id}
              type="button"
              onClick={() => selectParticipant(alias.participant)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0 min-h-[48px]"
            >
              <div className="font-medium text-gray-900">{alias.participant.primary_alias}</div>
              {!alias.is_primary && (
                <div className="text-sm text-gray-500">
                  Matched: {alias.alias}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
