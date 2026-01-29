import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { parseReceipt } from '../lib/api'
import { supabase } from '../lib/supabase'
import ParticipantPicker from '../components/ParticipantPicker'
import Spinner from '../components/Spinner'

interface ParsedLineItem {
  description: string
  unit_price_cents: number
  quantity: number
  category: string | null
}

interface ParsedTaxLine {
  tax_type: string
  amount_cents: number
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

export default function AddReceipt() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'edit'>('upload')
  const [tripUuid, setTripUuid] = useState<string | null>(null)

  // Parsed receipt data
  const [vendorName, setVendorName] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [lineItems, setLineItems] = useState<ParsedLineItem[]>([])
  const [taxLines, setTaxLines] = useState<ParsedTaxLine[]>([])
  const [subtotalCents, setSubtotalCents] = useState(0)
  const [totalCents, setTotalCents] = useState(0)
  const [tipCents, setTipCents] = useState(0)
  const [payerId, setPayerId] = useState<string | null>(null)
  const [payerError, setPayerError] = useState<string | null>(null)

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const result = await parseReceipt(file)

      // Map OCR response to our state
      setVendorName(result.vendor_name || '')
      setReceiptDate(result.receipt_date || new Date().toISOString().split('T')[0])
      setCurrency(result.currency || 'USD')
      setSubtotalCents(result.subtotal_cents || 0)
      setTotalCents(result.total_cents || 0)
      setTipCents(result.tip_cents || 0)

      // Map line items
      const items: ParsedLineItem[] = (result.line_items || []).map((item: { description?: string; unit_price_cents?: number; quantity?: number; category?: string }) => ({
        description: item.description || '',
        unit_price_cents: item.unit_price_cents || 0,
        quantity: item.quantity || 1,
        category: item.category || null,
      }))
      setLineItems(items.length > 0 ? items : [{ description: '', unit_price_cents: 0, quantity: 1, category: null }])

      // Map tax lines
      const taxes: ParsedTaxLine[] = (result.tax_lines || []).map((tax: { tax_type?: string; amount_cents?: number }) => ({
        tax_type: tax.tax_type || 'Tax',
        amount_cents: tax.amount_cents || 0,
      }))
      setTaxLines(taxes)

      setStep('edit')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan receipt'
      setError(message.includes('network')
        ? 'Unable to connect to server. Please check your internet connection.'
        : 'Failed to scan receipt. Please try again or enter details manually.')
    } finally {
      setLoading(false)
    }
  }

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
    const subtotal = calculateSubtotal()
    const taxTotal = taxLines.reduce((sum, tax) => sum + tax.amount_cents, 0)
    return subtotal + taxTotal + tipCents
  }, [calculateSubtotal, taxLines, tipCents])

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', unit_price_cents: 0, quantity: 1, category: null }])
  }

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index))
    }
  }

  const updateLineItem = (index: number, field: keyof ParsedLineItem, value: string | number | null) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const addTaxLine = () => {
    setTaxLines([...taxLines, { tax_type: 'Tax', amount_cents: 0 }])
  }

  const removeTaxLine = (index: number) => {
    setTaxLines(taxLines.filter((_, i) => i !== index))
  }

  const updateTaxLine = (index: number, field: keyof ParsedTaxLine, value: string | number) => {
    const updated = [...taxLines]
    updated[index] = { ...updated[index], [field]: value }
    setTaxLines(updated)
  }

  const handleSave = async () => {
    if (!tripUuid) {
      setError('Trip not found. Please go back and try again.')
      return
    }

    setPayerError(null)

    if (lineItems.length === 0 || !lineItems.some((item) => item.description)) {
      setError('Please add at least one line item with a description')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Upload image to Supabase Storage if we have a file
      let imageUrl: string | null = null
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${tripUuid}/${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload error:', uploadError)
          // Continue without image if upload fails
        } else {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
          imageUrl = urlData.publicUrl
        }
      }

      // Insert receipt
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          trip_id: tripUuid,
          payer_participant_id: payerId || null,
          vendor_name: vendorName || null,
          receipt_date: receiptDate || null,
          receipt_currency: currency,
          subtotal: (subtotalCents || calculateSubtotal()) / 100,
          total: (totalCents || calculateTotal()) / 100,
          tip_amount: tipCents ? tipCents / 100 : null,
          image_url: imageUrl,
        })
        .select()
        .single()

      if (receiptError) {
        throw receiptError
      }

      // Insert line items (database only allows: food, alcohol, other)
      const validCategories = ['food', 'alcohol', 'other']
      const lineItemsToInsert = lineItems
        .filter((item) => item.description)
        .map((item, index) => ({
          receipt_id: receipt.id,
          description: item.description,
          amount: (item.unit_price_cents * item.quantity) / 100,
          category: item.category && validCategories.includes(item.category) ? item.category : 'other',
          sort_order: index,
        }))

      if (lineItemsToInsert.length > 0) {
        const { error: lineItemsError } = await supabase.from('line_items').insert(lineItemsToInsert)
        if (lineItemsError) {
          console.error('Line items error:', lineItemsError)
        }
      }

      // Insert tax lines
      if (taxLines.length > 0) {
        const taxLinesToInsert = taxLines.map((tax) => ({
          receipt_id: receipt.id,
          description: tax.tax_type,
          amount: tax.amount_cents / 100,
        }))

        const { error: taxError } = await supabase.from('tax_lines').insert(taxLinesToInsert)
        if (taxError) {
          console.error('Tax lines error:', taxError)
        }
      }

      navigate(`/trip/${tripId}/receipts/${receipt.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save receipt'
      setError(message.includes('violates')
        ? 'There was a problem saving the receipt. Please check your entries.'
        : 'Failed to save receipt. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Scan Receipt</h1>

        <form onSubmit={handleScan} className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Receipt Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {file && (
            <div className="border rounded-lg p-4">
              <img
                src={URL.createObjectURL(file)}
                alt="Receipt preview"
                className="max-h-64 mx-auto"
              />
            </div>
          )}

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

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 order-1 sm:order-2"
            >
              {loading && <Spinner size="sm" />}
              {loading ? 'Processing...' : 'Scan Receipt'}
            </button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-500">
          Or{' '}
          <button
            type="button"
            onClick={() => {
              setLineItems([{ description: '', unit_price_cents: 0, quantity: 1, category: null }])
              setReceiptDate(new Date().toISOString().split('T')[0])
              setStep('edit')
            }}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            enter receipt details manually
          </button>
        </div>
      </div>
    )
  }

  // Edit step
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Review Receipt</h1>
        <button
          type="button"
          onClick={() => {
            setStep('upload')
            setFile(null)
          }}
          className="text-gray-600 hover:text-gray-800 text-sm self-start sm:self-auto"
        >
          Start Over
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

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-6">
        {/* Receipt Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Restaurant, store, etc."
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
              Paid By
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
            <label className="block text-sm font-medium text-gray-700">Line Items</label>
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
                        value={(item.unit_price_cents / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLineItem(
                            index,
                            'unit_price_cents',
                            Math.round(parseFloat(e.target.value || '0') * 100)
                          )
                        }
                        placeholder="Price"
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

        {/* Tax Lines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">Taxes</label>
            <button
              type="button"
              onClick={addTaxLine}
              className="text-sm text-blue-600 hover:text-blue-800 py-2 px-3 -mr-3 min-h-[44px]"
            >
              + Add Tax
            </button>
          </div>

          {taxLines.length === 0 ? (
            <p className="text-sm text-gray-500">No taxes added</p>
          ) : (
            <div className="space-y-2">
              {taxLines.map((tax, index) => (
                <div key={index} className="flex items-center gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={tax.tax_type}
                    onChange={(e) => updateTaxLine(index, 'tax_type', e.target.value)}
                    placeholder="Tax type"
                    className="flex-1 border border-gray-300 rounded px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={(tax.amount_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      updateTaxLine(index, 'amount_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                    }
                    placeholder="Amount"
                    className="w-24 sm:w-28 border border-gray-300 rounded px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeTaxLine(index)}
                    className="text-red-500 hover:text-red-700 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Subtotal</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={(subtotalCents / 100).toFixed(2)}
                onChange={(e) => setSubtotalCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                className="w-28 border border-gray-300 rounded px-3 py-2 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setSubtotalCents(calculateSubtotal())}
                className="text-xs text-blue-600 hover:text-blue-800 py-2 px-2 min-h-[44px]"
                title="Calculate from line items"
              >
                Calc
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Tip</label>
            <input
              type="number"
              step="0.01"
              value={(tipCents / 100).toFixed(2)}
              onChange={(e) => setTipCents(Math.round(parseFloat(e.target.value || '0') * 100))}
              className="w-28 border border-gray-300 rounded px-3 py-2 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-900">Total</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={(totalCents / 100).toFixed(2)}
                onChange={(e) => setTotalCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                className="w-28 border border-gray-300 rounded px-3 py-2 text-base text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setTotalCents(calculateTotal())}
                className="text-xs text-blue-600 hover:text-blue-800 py-2 px-2 min-h-[44px]"
                title="Calculate total"
              >
                Calc
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-500 text-right">
            Calculated: {formatCurrency(calculateTotal())}
          </div>
        </div>
      </div>

      {/* Preview image if available */}
      {file && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Receipt Image</h3>
          <img
            src={URL.createObjectURL(file)}
            alt="Receipt"
            className="max-h-48 mx-auto rounded border"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={saving}
          className="flex-1 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] order-2 sm:order-1 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 order-1 sm:order-2"
        >
          {saving && <Spinner size="sm" />}
          {saving ? 'Saving...' : 'Save Receipt'}
        </button>
      </div>
    </div>
  )
}
