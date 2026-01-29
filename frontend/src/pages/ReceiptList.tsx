import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

interface Receipt {
  id: string
  vendor_name: string | null
  receipt_date: string | null
  currency: string
  subtotal_cents: number | null
  total_cents: number | null
  tip_cents: number | null
  payer: {
    id: string
    participant_aliases: { alias: string; is_primary: boolean }[]
  }[] | null
}

export default function ReceiptList() {
  const { tripId } = useParams()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReceipts = useCallback(async () => {
    if (!tripId) return

    setIsLoading(true)
    setError(null)

    try {
      // First get the trip UUID from the invite code
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('id')
        .eq('invite_code', tripId)
        .single()

      if (tripError || !tripData) {
        setError('Trip not found. Please check the invite code.')
        setIsLoading(false)
        return
      }

      // Fetch receipts with payer info
      const { data, error: fetchError } = await supabase
        .from('active_receipts')
        .select(`
          id,
          vendor_name,
          receipt_date,
          currency,
          subtotal_cents,
          total_cents,
          tip_cents,
          payer:participants!receipts_payer_participant_id_fkey(
            id,
            participant_aliases(alias, is_primary)
          )
        `)
        .eq('trip_id', tripData.id)
        .order('receipt_date', { ascending: false, nullsFirst: false })

      if (fetchError) {
        setError('Unable to load receipts. Please try again.')
      } else {
        setReceipts(data || [])
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setIsLoading(false)
  }, [tripId])

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  const formatCurrency = (cents: number | null, currency: string) => {
    if (cents === null) return '-'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getPayerName = (payer: Receipt['payer']) => {
    if (!payer || payer.length === 0) return 'Unknown'
    const payerObj = payer[0]
    const primaryAlias = payerObj.participant_aliases?.find((a) => a.is_primary)
    return primaryAlias?.alias || payerObj.participant_aliases?.[0]?.alias || 'Unknown'
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Stack on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Receipts</h1>
        <div className="flex gap-2">
          <Link
            to={`/trip/${tripId}/receipts/new`}
            className="flex-1 sm:flex-none bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors text-center text-sm sm:text-base min-h-[44px] flex items-center justify-center"
          >
            Scan Receipt
          </Link>
          <Link
            to={`/trip/${tripId}/expenses/new`}
            className="flex-1 sm:flex-none bg-gray-800 text-white py-2.5 px-4 rounded-lg hover:bg-gray-900 transition-colors text-center text-sm sm:text-base min-h-[44px] flex items-center justify-center"
          >
            Add Expense
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-lg shadow p-8 flex flex-col items-center justify-center">
          <Spinner size="lg" />
          <p className="mt-3 text-gray-500">Loading receipts...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p>{error}</p>
              <button
                onClick={fetchReceipts}
                className="mt-2 text-red-800 underline hover:no-underline font-medium"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoading && !error && receipts.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">No receipts yet. Add your first receipt to get started.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to={`/trip/${tripId}/receipts/new`}
              className="bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Scan Receipt
            </Link>
            <Link
              to={`/trip/${tripId}/expenses/new`}
              className="bg-gray-800 text-white py-2.5 px-4 rounded-lg hover:bg-gray-900 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Add Expense
            </Link>
          </div>
        </div>
      )}

      {!isLoading && !error && receipts.length > 0 && (
        <div className="bg-white rounded-lg shadow divide-y">
          {receipts.map((receipt) => (
            <Link
              key={receipt.id}
              to={`/trip/${tripId}/receipts/${receipt.id}`}
              className="block p-4 hover:bg-gray-50 transition-colors active:bg-gray-100 min-h-[72px]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {receipt.vendor_name || 'Unnamed Receipt'}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1 text-sm text-gray-500">
                    <span>{formatDate(receipt.receipt_date)}</span>
                    <span className="hidden sm:inline text-gray-300">|</span>
                    <span className="truncate">Paid by {getPayerName(receipt.payer)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(receipt.total_cents, receipt.currency)}
                  </div>
                  <div className="text-xs text-gray-500 uppercase">{receipt.currency}</div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400 flex-shrink-0 hidden sm:block"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
