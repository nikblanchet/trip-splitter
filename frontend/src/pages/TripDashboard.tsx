import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AddParticipantModal from '../components/AddParticipantModal'
import EditParticipantModal from '../components/EditParticipantModal'
import RecordPaymentModal from '../components/RecordPaymentModal'
import Spinner from '../components/Spinner'

interface ParticipantDisplay {
  id: string
  trip_id: string
  primary_alias: string
  venmo_handle: string | null
  avatar_url: string | null
  all_aliases: string[]
  deleted_at: string | null
}

export default function TripDashboard() {
  const { tripId } = useParams()
  const [participants, setParticipants] = useState<ParticipantDisplay[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState<ParticipantDisplay | null>(null)
  const [tripName, setTripName] = useState<string>('')
  const [tripUuid, setTripUuid] = useState<string>('')
  const [baseCurrency, setBaseCurrency] = useState<string>('USD')

  const fetchParticipants = useCallback(async () => {
    if (!tripId) return

    setIsLoading(true)
    setError(null)

    try {
      // First get the trip UUID and name from the invite code
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('id, name, base_currency')
        .eq('invite_code', tripId)
        .single()

      if (tripError || !tripData) {
        setError('Trip not found. Please check the invite code and try again.')
        setIsLoading(false)
        return
      }

      setTripName(tripData.name)
      setTripUuid(tripData.id)
      setBaseCurrency(tripData.base_currency || 'USD')

      // Fetch participants from the display view
      const { data, error: fetchError } = await supabase
        .from('participants_display')
        .select('*')
        .eq('trip_id', tripData.id)
        .is('deleted_at', null)

      if (fetchError) {
        setError('Unable to load participants. Please try again.')
      } else {
        setParticipants(data || [])
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setIsLoading(false)
  }, [tripId])

  useEffect(() => {
    fetchParticipants()
  }, [fetchParticipants])

  const handleParticipantAdded = () => {
    fetchParticipants()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {tripName || 'Trip Dashboard'}
          </h1>
          <p className="text-sm text-gray-500">Invite code: <span className="font-mono font-medium">{tripId}</span></p>
        </div>
      </div>

      {/* Action Cards - Stack on mobile */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
        <Link
          to={`/trip/${tripId}/receipts/new`}
          className="block bg-white rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow active:bg-gray-50 min-h-[80px]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Add Receipt</h2>
          <p className="mt-1 text-sm text-gray-600">Scan a receipt with OCR</p>
        </Link>

        <Link
          to={`/trip/${tripId}/expenses/new`}
          className="block bg-white rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow active:bg-gray-50 min-h-[80px]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Add Expense</h2>
          <p className="mt-1 text-sm text-gray-600">Enter expense manually</p>
        </Link>

        <Link
          to={`/trip/${tripId}/receipts`}
          className="block bg-white rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow active:bg-gray-50 min-h-[80px]"
        >
          <h2 className="text-lg font-semibold text-gray-900">View Receipts</h2>
          <p className="mt-1 text-sm text-gray-600">See all receipts and expenses</p>
        </Link>

        <Link
          to={`/trip/${tripId}/settlements`}
          className="block bg-white rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow active:bg-gray-50 min-h-[80px]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Settlements</h2>
          <p className="mt-1 text-sm text-gray-600">See who owes what</p>
        </Link>

        <button
          onClick={() => setIsPaymentModalOpen(true)}
          className="block w-full text-left bg-white rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow active:bg-gray-50 min-h-[80px]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <p className="mt-1 text-sm text-gray-600">Log a payment between people</p>
        </button>
      </div>

      {/* Participants Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Participants</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm sm:text-base py-2 px-3 -mr-3 min-h-[44px] flex items-center"
          >
            + Add Participant
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p>{error}</p>
                <button
                  onClick={fetchParticipants}
                  className="mt-2 text-red-800 underline hover:no-underline font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !error && participants.length === 0 && (
          <div className="text-center py-6">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 mb-4">No participants yet. Add some to get started.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Add your first participant
            </button>
          </div>
        )}

        {!isLoading && !error && participants.length > 0 && (
          <div className="divide-y divide-gray-100">
            {participants.map((participant) => (
              <button
                key={participant.id}
                onClick={() => setEditingParticipant(participant)}
                className="w-full py-3 first:pt-0 last:pb-0 text-left hover:bg-gray-50 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {participant.avatar_url ? (
                    <img
                      src={participant.avatar_url}
                      alt={participant.primary_alias}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-500 font-medium text-sm">
                        {participant.primary_alias?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">
                      {participant.primary_alias}
                    </div>
                    {participant.all_aliases && participant.all_aliases.length > 1 && (
                      <div className="text-sm text-gray-500 truncate">
                        Also known as:{' '}
                        {participant.all_aliases
                          .filter((alias) => alias !== participant.primary_alias)
                          .join(', ')}
                      </div>
                    )}
                    {participant.venmo_handle && (
                      <div className="text-sm text-blue-600">
                        @{participant.venmo_handle}
                      </div>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {tripId && (
        <AddParticipantModal
          tripId={tripId}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onParticipantAdded={handleParticipantAdded}
        />
      )}

      {tripUuid && (
        <RecordPaymentModal
          tripId={tripUuid}
          participants={participants.map(p => ({ id: p.id, primary_alias: p.primary_alias }))}
          baseCurrency={baseCurrency}
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onPaymentRecorded={() => {
            setIsPaymentModalOpen(false)
          }}
        />
      )}

      {editingParticipant && (
        <EditParticipantModal
          participant={editingParticipant}
          isOpen={!!editingParticipant}
          onClose={() => setEditingParticipant(null)}
          onParticipantUpdated={() => {
            fetchParticipants()
            setEditingParticipant(null)
          }}
        />
      )}
    </div>
  )
}
