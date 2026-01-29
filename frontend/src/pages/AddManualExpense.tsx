import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ParticipantPicker from '../components/ParticipantPicker'
import Spinner from '../components/Spinner'

interface LineItem {
  description: string
  unit_price_cents: number
  quantity: number
  category: string | null
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

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'CHF']

export default function AddManualExpense() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tripUuid, setTripUuid] = useState<string | null>(null)

  // Form state
  const [vendorName, setVendorName] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [currency, setCurrency] = useState('USD')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', unit_price_cents: 0, quantity: 1, category: null },
  ])
  const [tipCents, setTipCents] = useState(0)
  const [payerId, setPayerId] = useState<string | null>(null)
  const [payerError, setPayerError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  // Load trip UUID on mount
  useEffect(() => {
    const loadTrip = async () => {
      if (!tripId) return
      try {
        const { data, error: tripError } = await supabase
          .from('trips')
          .select('id')
          .eq('invite_code', tripId)
          .single()
        if (tripError) {
          setError('Trip not found. Please check the invite code.')
          return
        }
        if (data) setTripUuid(data.id)
      } catch {
        setError('Unable to load trip information.')
      }
    }
    loadTrip()
  }, [tripId])

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100)
  }

  const calculateSubtotal = useCallback(() => {
    return lineItems.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0)
  }, [lineItems])

  const calculateTotal = useCallback(() => {
    return calculateSubtotal() + tipCents
  }, [calculateSubtotal, tipCents])

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', unit_price_cents: 0, quantity: 1, category: null }])
  }

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index))
    }
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | null) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!tripUuid) {
      setError('Trip not found. Please go back and try again.')
      return
    }

    // Validate payer
    if (!payerId) {
      setPayerError('Please select who paid for this expense')
      setError('Please select who paid for this expense')
      return
    }
    setPayerError(null)

    if (lineItems.length === 0 || !lineItems.some((item) => item.description)) {
      setError('Please add at least one item with a description')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const subtotalCents = calculateSubtotal()
      const totalCents = calculateTotal()

      // Insert receipt (expense)
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          trip_id: tripUuid,
          payer_participant_id: payerId,
          vendor_name: vendorName || null,
          receipt_date: receiptDate || null,
          currency,
          subtotal_cents: subtotalCents,
          total_cents: totalCents,
          tip_cents: tipCents || null,
          image_url: null, // Manual expense, no image
        })
        .select()
        .single()

      if (receiptError) {
        throw receiptError
      }

      // Insert line items
      const lineItemsToInsert = lineItems
        .filter((item) => item.description)
        .map((item) => ({
          receipt_id: receipt.id,
          description: item.description,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
          category: item.category,
        }))

      if (lineItemsToInsert.length > 0) {
        const { error: lineItemsError } = await supabase.from('line_items').insert(lineItemsToInsert)
        if (lineItemsError) {
          console.error('Line items error:', lineItemsError)
        }
      }

      navigate(`/trip/${tripId}/receipts/${receipt.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save expense'
      setError(message.includes('violates')
        ? 'There was a problem saving the expense. Please check your entries.'
        : 'Failed to save expense. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Add Expense</h1>

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

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor / Description
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g., Uber, Restaurant, Groceries"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paid By <span className="text-red-500">*</span>
            </label>
            {tripId && (
              <div>
                <ParticipantPicker
                  tripId={tripId}
                  selectedParticipantIds={payerId ? [payerId] : []}
                  onChange={(ids) => {
                    setPayerId(ids[0] || null)
                    if (ids[0]) setPayerError(null)
                  }}
                  placeholder="Select who paid..."
                />
                {payerError && (
                  <p className="mt-1 text-sm text-red-600">{payerError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">Items</label>
            <button
              type="button"
              onClick={addLineItem}
              className="text-sm text-blue-600 hover:text-blue-800 py-2 px-3 -mr-3 min-h-[44px]"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                <div className="space-y-3">
                  {/* Description - full width on mobile */}
                  <div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="w-full border border-gray-300 rounded px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Price, Qty, Category, Remove - grid on mobile */}
                  <div className="grid grid-cols-12 gap-2 sm:gap-3">
                    <div className="col-span-5 sm:col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price_cents > 0 ? (item.unit_price_cents / 100).toFixed(2) : ''}
                        onChange={(e) =>
                          updateLineItem(
                            index,
                            'unit_price_cents',
                            Math.round(parseFloat(e.target.value || '0') * 100)
                          )
                        }
                        placeholder="Amount"
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        placeholder="Qty"
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-6">
                      <select
                        value={item.category || ''}
                        onChange={(e) => updateLineItem(index, 'category', e.target.value || null)}
                        className="w-full border border-gray-300 rounded px-2 sm:px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        disabled={lineItems.length === 1}
                        className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tip (optional)</label>
          <input
            type="number"
            step="0.01"
            value={tipCents > 0 ? (tipCents / 100).toFixed(2) : ''}
            onChange={(e) => setTipCents(Math.round(parseFloat(e.target.value || '0') * 100))}
            placeholder="0.00"
            className="w-32 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional details..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </div>

        {/* Totals Summary */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">{formatCurrency(calculateSubtotal())}</span>
          </div>
          {tipCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tip</span>
              <span className="text-gray-900">{formatCurrency(tipCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{formatCurrency(calculateTotal())}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={saving}
            className="flex-1 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] order-2 sm:order-1 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 order-1 sm:order-2"
          >
            {saving && <Spinner size="sm" />}
            {saving ? 'Adding...' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
