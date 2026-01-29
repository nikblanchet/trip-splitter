import { useParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { getBalances, getSettlements } from '../lib/api'
import { supabase } from '../lib/supabase'
import RecordPaymentModal from '../components/RecordPaymentModal'
import Spinner from '../components/Spinner'

interface Participant {
  id: string
  primary_alias: string
}

interface Balance {
  participant_id: string
  amount: number
}

interface Settlement {
  from_id: string
  to_id: string
  amount: number
}

interface DirectPayment {
  id: string
  trip_id: string
  from_participant_id: string
  to_participant_id: string
  amount: number
  currency: string
  payment_date: string
  notes: string | null
  from_participant_name: string
  to_participant_name: string
}

interface Trip {
  id: string
  base_currency: string
}

// Currency formatting helper
function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    MXN: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    CAD: '$',
  }
  const symbol = symbols[currency] || currency + ' '
  const formatted = Math.abs(amount).toFixed(2)

  // Add currency code for MXN to distinguish from USD
  if (currency === 'MXN') {
    return `${symbol}${formatted} MXN`
  }
  return `${symbol}${formatted}`
}

export default function Settlements() {
  const { tripId } = useParams()
  const [balances, setBalances] = useState<Balance[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantMap, setParticipantMap] = useState<Record<string, string>>({})
  const [directPayments, setDirectPayments] = useState<DirectPayment[]>([])
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  const fetchParticipants = useCallback(async () => {
    if (!tripId) return

    try {
      // First get the trip UUID from the invite code
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('id')
        .eq('invite_code', tripId)
        .single()

      if (tripError || !tripData) {
        console.error('Error fetching trip:', tripError)
        return
      }

      // Fetch participants with their primary alias using trip UUID
      const { data, error: fetchError } = await supabase
        .from('participants_display')
        .select('id, primary_alias')
        .eq('trip_id', tripData.id)

      if (fetchError) {
        console.error('Error fetching participants:', fetchError)
        return
      }

      if (data) {
        setParticipants(data)
        const map: Record<string, string> = {}
        data.forEach((p) => {
          map[p.id] = p.primary_alias
        })
        setParticipantMap(map)
      }
    } catch {
      console.error('Error fetching participants')
    }
  }, [tripId])

  const fetchTrip = useCallback(async () => {
    if (!tripId) return

    try {
      // tripId from URL is the invite_code, not the UUID
      const { data, error: fetchError } = await supabase
        .from('trips')
        .select('id, base_currency')
        .eq('invite_code', tripId)
        .single()

      if (fetchError) {
        console.error('Error fetching trip:', fetchError)
        return
      }

      setTrip(data)
    } catch {
      console.error('Error fetching trip')
    }
  }, [tripId])

  const fetchDirectPayments = useCallback(async () => {
    if (!tripId || !trip) return

    try {
      // Use the trip UUID (trip.id), not the invite code (tripId)
      const { data, error: fetchError } = await supabase
        .from('active_direct_payments')
        .select(`
          id,
          trip_id,
          from_participant_id,
          to_participant_id,
          amount,
          currency,
          payment_date,
          notes,
          from_participant:participants!direct_payments_from_participant_id_fkey(
            id,
            participant_aliases(alias, is_primary)
          ),
          to_participant:participants!direct_payments_to_participant_id_fkey(
            id,
            participant_aliases(alias, is_primary)
          )
        `)
        .eq('trip_id', trip.id)
        .order('payment_date', { ascending: false })

      if (fetchError) {
        // Try a simpler query as fallback
        const { data: simpleData, error: simpleError } = await supabase
          .from('active_direct_payments')
          .select('*')
          .eq('trip_id', trip.id)
          .order('payment_date', { ascending: false })

        if (!simpleError && simpleData) {
          const payments = simpleData.map((p) => ({
            ...p,
            from_participant_name: participantMap[p.from_participant_id] || p.from_participant_id,
            to_participant_name: participantMap[p.to_participant_id] || p.to_participant_id,
          }))
          setDirectPayments(payments)
        }
        return
      }

      if (data) {
        const payments = data.map((p) => {
          // Extract primary alias from nested structure
          const fromAliases = (p.from_participant as { participant_aliases?: { alias: string; is_primary: boolean }[] })?.participant_aliases || []
          const toAliases = (p.to_participant as { participant_aliases?: { alias: string; is_primary: boolean }[] })?.participant_aliases || []

          const fromPrimary = fromAliases.find((a) => a.is_primary)?.alias || participantMap[p.from_participant_id] || p.from_participant_id
          const toPrimary = toAliases.find((a) => a.is_primary)?.alias || participantMap[p.to_participant_id] || p.to_participant_id

          return {
            id: p.id,
            trip_id: p.trip_id,
            from_participant_id: p.from_participant_id,
            to_participant_id: p.to_participant_id,
            amount: p.amount,
            currency: p.currency,
            payment_date: p.payment_date,
            notes: p.notes,
            from_participant_name: fromPrimary,
            to_participant_name: toPrimary,
          }
        })
        setDirectPayments(payments)
      }
    } catch {
      console.error('Error fetching direct payments')
    }
  }, [tripId, trip, participantMap])

  const fetchData = useCallback(async () => {
    if (!tripId) return
    setLoading(true)
    setError(null)

    try {
      await fetchParticipants()
      await fetchTrip()

      const [balancesData, settlementsData] = await Promise.all([
        getBalances(tripId),
        getSettlements(tripId),
      ])
      setBalances(balancesData)
      setSettlements(settlementsData)
    } catch {
      setError('Unable to load settlement data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [tripId, fetchParticipants, fetchTrip])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    // Fetch direct payments after participant map is populated and trip is loaded
    if (Object.keys(participantMap).length > 0 && trip) {
      fetchDirectPayments()
    }
  }, [participantMap, trip, fetchDirectPayments])

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) {
      return
    }

    setDeletingPaymentId(paymentId)

    try {
      // Soft delete by setting deleted_at
      const { error: deleteError } = await supabase
        .from('direct_payments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', paymentId)

      if (deleteError) {
        throw deleteError
      }

      // Refresh data
      await fetchDirectPayments()
      await fetchData()
    } catch {
      alert('Failed to delete payment. Please try again.')
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const handlePaymentRecorded = async () => {
    await fetchDirectPayments()
    await fetchData()
  }

  const getParticipantName = (participantId: string): string => {
    return participantMap[participantId] || participantId
  }

  const baseCurrency = trip?.base_currency || 'USD'

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settlements</h1>
        <div className="bg-white rounded-lg shadow p-8 flex flex-col items-center justify-center">
          <Spinner size="lg" />
          <p className="mt-3 text-gray-500">Loading settlements...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settlements</h1>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p>{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-red-800 underline hover:no-underline font-medium"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settlements</h1>

      {/* Balances Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Balances</h2>
        {balances.length === 0 ? (
          <p className="text-gray-500">No balances to display yet.</p>
        ) : (
          <div className="space-y-3">
            {balances.map((balance) => (
              <div
                key={balance.participant_id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b last:border-b-0 gap-1 sm:gap-4"
              >
                <span className="text-gray-700 font-medium">
                  {getParticipantName(balance.participant_id)}
                </span>
                <span
                  className={`font-medium ${
                    balance.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(balance.amount, baseCurrency)}
                  <span className="text-sm ml-1">
                    {balance.amount >= 0 ? 'owed to them' : 'owes'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Payments Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recommended Payments
        </h2>
        {settlements.length === 0 ? (
          <div className="text-center py-4">
            <svg className="w-12 h-12 mx-auto text-green-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500">Everyone is settled up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlements.map((settlement, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg gap-2 sm:gap-4"
              >
                <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                  <span className="font-medium text-gray-900">
                    {getParticipantName(settlement.from_id)}
                  </span>
                  <span className="text-gray-400">pays</span>
                  <span className="font-medium text-gray-900">
                    {getParticipantName(settlement.to_id)}
                  </span>
                </div>
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(settlement.amount, baseCurrency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Payments History Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Payment History
          </h2>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm min-h-[44px] w-full sm:w-auto"
          >
            Record Payment
          </button>
        </div>

        {directPayments.length === 0 ? (
          <p className="text-gray-500">No payments recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {directPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                    <span className="font-medium text-gray-900">
                      {payment.from_participant_name}
                    </span>
                    <span className="text-gray-400">paid</span>
                    <span className="font-medium text-gray-900">
                      {payment.to_participant_name}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {new Date(payment.payment_date).toLocaleDateString()}
                    {payment.notes && (
                      <span className="ml-2 truncate">- {payment.notes}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-4">
                  <span className="text-lg font-semibold text-green-600">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                  <button
                    onClick={() => handleDeletePayment(payment.id)}
                    disabled={deletingPaymentId === payment.id}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Delete payment"
                  >
                    {deletingPaymentId === payment.id ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        tripId={trip?.id || ''}
        participants={participants}
        baseCurrency={baseCurrency}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentRecorded={handlePaymentRecorded}
      />
    </div>
  )
}
