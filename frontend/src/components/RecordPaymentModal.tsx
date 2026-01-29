import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'

interface Participant {
  id: string
  primary_alias: string
}

interface RecordPaymentModalProps {
  tripId: string
  participants: Participant[]
  baseCurrency: string
  isOpen: boolean
  onClose: () => void
  onPaymentRecorded: () => void
}

export default function RecordPaymentModal({
  tripId,
  participants,
  baseCurrency,
  isOpen,
  onClose,
  onPaymentRecorded,
}: RecordPaymentModalProps) {
  const [fromParticipantId, setFromParticipantId] = useState('')
  const [toParticipantId, setToParticipantId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrency(baseCurrency)
  }, [baseCurrency])

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFromParticipantId('')
      setToParticipantId('')
      setAmount('')
      setCurrency(baseCurrency)
      setPaymentDate(new Date().toISOString().split('T')[0])
      setNotes('')
      setError(null)
    }
  }, [isOpen, baseCurrency])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!fromParticipantId) {
      setError('Please select who made the payment')
      return
    }

    if (!toParticipantId) {
      setError('Please select who received the payment')
      return
    }

    if (fromParticipantId === toParticipantId) {
      setError('The sender and receiver must be different people')
      return
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than zero')
      return
    }

    setSubmitting(true)

    try {
      const { error: insertError } = await supabase
        .from('direct_payments')
        .insert({
          trip_id: tripId,
          from_participant_id: fromParticipantId,
          to_participant_id: toParticipantId,
          amount: parsedAmount,
          currency,
          payment_date: paymentDate,
          notes: notes || null,
        })

      if (insertError) {
        throw insertError
      }

      onPaymentRecorded()
      onClose()
    } catch {
      setError('Unable to record payment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Record Payment</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg text-sm">
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
                From (who paid) <span className="text-red-500">*</span>
              </label>
              <select
                value={fromParticipantId}
                onChange={(e) => setFromParticipantId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                required
              >
                <option value="">Select participant</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.primary_alias}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To (who received) <span className="text-red-500">*</span>
              </label>
              <select
                value={toParticipantId}
                onChange={(e) => setToParticipantId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                required
              >
                <option value="">Select participant</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.primary_alias}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                >
                  <option value="USD">USD ($)</option>
                  <option value="MXN">MXN ($)</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD ($)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g., Venmo payment for dinner"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] order-2 sm:order-1"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 order-1 sm:order-2"
                disabled={submitting}
              >
                {submitting && <Spinner size="sm" />}
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
