import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculatePerPersonBreakdown } from '../lib/calculations'
import LineItemCard from '../components/LineItemCard'
import MultiPayerPicker, { type PayerPayment } from '../components/MultiPayerPicker'
import Spinner from '../components/Spinner'

interface ParticipantAlias {
  alias: string
  is_primary: boolean
}

interface Participant {
  id: string
  participant_aliases: ParticipantAlias[]
}

interface ReceiptPayment {
  id: string
  participant_id: string
  amount: number
  participant: Participant
}

interface Assignment {
  id: string
  participant_id: string
  shares: number
  participant: {
    id: string
    participant_aliases: ParticipantAlias[]
  }
}

interface LineItem {
  id: string
  description: string
  unit_price_cents: number
  quantity: number
  category: string | null
  assignments: Assignment[]
}

interface TaxLine {
  id: string
  tax_type: string
  amount_cents: number
}

interface Receipt {
  id: string
  vendor_name: string | null
  receipt_date: string | null
  currency: string
  subtotal_cents: number | null
  total_cents: number | null
  tip_cents: number | null
  image_url: string | null
  payer: Participant | null // Legacy single payer (fallback)
  payments: ReceiptPayment[] // New multi-payer data
  line_items: LineItem[]
  tax_lines: TaxLine[]
}

// PerPersonBreakdown type is imported from '../lib/calculations'

export default function ReceiptDetail() {
  const { tripId, receiptId } = useParams()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showImage, setShowImage] = useState(false)
  const [editingPayers, setEditingPayers] = useState(false)
  const [editPayments, setEditPayments] = useState<PayerPayment[]>([])
  const [payerError, setPayerError] = useState<string | null>(null)

  const fetchReceipt = useCallback(async () => {
    if (!tripId || !receiptId) return

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('active_receipts')
        .select(`
          *,
          payer:participants!receipts_payer_participant_id_fkey(id, participant_aliases(alias, is_primary)),
          line_items:active_line_items(
            *,
            assignments:active_item_assignments(
              *,
              participant:participants(id, participant_aliases(alias, is_primary))
            )
          ),
          tax_lines:active_tax_lines(*)
        `)
        .eq('id', receiptId)
        .single()

      if (fetchError) {
        setError('Unable to load receipt. Please try again.')
      } else if (data) {
        // Fetch receipt payments separately (multi-payer support)
        const { data: paymentsData } = await supabase
          .from('receipt_payments')
          .select(`
            id,
            participant_id,
            amount,
            participant:participants(id, participant_aliases(alias, is_primary))
          `)
          .eq('receipt_id', receiptId)
          .is('deleted_at', null)

        // Transform database columns to UI format
        const transformed: Receipt = {
          id: data.id,
          vendor_name: data.vendor_name,
          receipt_date: data.receipt_date,
          currency: data.receipt_currency || 'USD',
          subtotal_cents: data.subtotal ? Math.round(data.subtotal * 100) : null,
          total_cents: data.total ? Math.round(data.total * 100) : null,
          tip_cents: data.tip_amount ? Math.round(data.tip_amount * 100) : null,
          image_url: data.image_url,
          payer: data.payer, // Legacy fallback
          payments: (paymentsData || []).map((p: { id: string; participant_id: string; amount: number; participant: Participant | Participant[] }) => ({
            id: p.id,
            participant_id: p.participant_id,
            amount: p.amount,
            participant: Array.isArray(p.participant) ? p.participant[0] : p.participant,
          })),
          line_items: (data.line_items || []).map((item: { id: string; description: string; amount: number; category: string | null; assignments: Assignment[] }) => ({
            id: item.id,
            description: item.description,
            unit_price_cents: Math.round((item.amount || 0) * 100),
            quantity: 1,
            category: item.category,
            assignments: item.assignments || [],
          })),
          tax_lines: (data.tax_lines || []).map((tax: { id: string; description: string; amount: number }) => ({
            id: tax.id,
            tax_type: tax.description || 'Tax',
            amount_cents: Math.round((tax.amount || 0) * 100),
          })),
        }
        setReceipt(transformed)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setIsLoading(false)
  }, [tripId, receiptId])

  useEffect(() => {
    fetchReceipt()
  }, [fetchReceipt])

  const getParticipantName = (participant: Participant | null) => {
    if (!participant) return 'Unknown'
    const primaryAlias = participant.participant_aliases?.find((a) => a.is_primary)
    return primaryAlias?.alias || participant.participant_aliases?.[0]?.alias || 'Unknown'
  }

  const formatCurrency = (cents: number | null) => {
    if (cents === null) return '-'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: receipt?.currency || 'USD',
    }).format(cents / 100)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date'
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Calculate per-person breakdown using the extracted utility function
  const perPersonBreakdown = useMemo(() => {
    if (!receipt) return []

    // Transform receipt data to the format expected by calculatePerPersonBreakdown
    const receiptData = {
      line_items: receipt.line_items.map((item) => ({
        unit_price_cents: item.unit_price_cents,
        quantity: item.quantity,
        assignments: item.assignments.map((a) => ({
          participant_id: a.participant_id,
          participant_name: getParticipantName(a.participant as unknown as Participant),
          shares: a.shares,
        })),
      })),
      tax_lines: receipt.tax_lines.map((t) => ({ amount_cents: t.amount_cents })),
      tip_cents: receipt.tip_cents,
    }

    return calculatePerPersonBreakdown(receiptData)
  }, [receipt])

  const handleAssignmentChange = async (
    lineItemId: string,
    newAssignments: { participant_id: string; shares: number }[]
  ) => {
    if (!receipt) return

    setIsSaving(true)

    try {
      // Delete existing assignments for this line item
      await supabase.from('item_assignments').delete().eq('line_item_id', lineItemId)

      // Insert new assignments
      if (newAssignments.length > 0) {
        const assignmentsToInsert = newAssignments.map((a) => ({
          line_item_id: lineItemId,
          participant_id: a.participant_id,
          shares: a.shares,
        }))

        const { error: insertError } = await supabase
          .from('item_assignments')
          .insert(assignmentsToInsert)

        if (insertError) {
          console.error('Failed to save assignments:', insertError)
          setError('Failed to save assignments. Please try again.')
        }
      }

      // Refresh data
      await fetchReceipt()
    } catch {
      setError('Failed to update assignments. Please try again.')
    }

    setIsSaving(false)
  }

  const handlePayersUpdate = async () => {
    if (!receipt) return

    // Validate
    const effectiveTotal = receipt.total_cents || 0
    if (editPayments.length === 0) {
      setPayerError('Please select at least one payer')
      return
    }

    const payersSum = editPayments.reduce((sum, p) => sum + p.amount, 0)
    if (Math.abs(payersSum - effectiveTotal) > 1) {
      setPayerError(`Payment amounts (${(payersSum / 100).toFixed(2)}) must equal the total (${(effectiveTotal / 100).toFixed(2)})`)
      return
    }

    setIsSaving(true)
    setPayerError(null)

    try {
      // Delete existing payments for this receipt
      await supabase
        .from('receipt_payments')
        .delete()
        .eq('receipt_id', receipt.id)

      // Insert new payments
      const paymentsToInsert = editPayments.map((p) => ({
        receipt_id: receipt.id,
        participant_id: p.participantId,
        amount: p.amount / 100,
      }))

      const { error: insertError } = await supabase
        .from('receipt_payments')
        .insert(paymentsToInsert)

      if (insertError) {
        console.error('Failed to update payers:', insertError)
        setError('Failed to update payers. Please try again.')
      } else {
        await fetchReceipt()
        setEditingPayers(false)
        setEditPayments([])
      }
    } catch {
      setError('Failed to update payers. Please try again.')
    }

    setIsSaving(false)
  }

  const startEditingPayers = () => {
    if (!receipt) return

    // Initialize edit state from current payments or legacy payer
    if (receipt.payments.length > 0) {
      setEditPayments(
        receipt.payments.map((p) => ({
          participantId: p.participant_id,
          participantName: getParticipantName(p.participant),
          amount: Math.round(p.amount * 100),
        }))
      )
    } else if (receipt.payer) {
      // Fallback to legacy single payer
      setEditPayments([
        {
          participantId: receipt.payer.id,
          participantName: getParticipantName(receipt.payer),
          amount: receipt.total_cents || 0,
        },
      ])
    } else {
      setEditPayments([])
    }
    setEditingPayers(true)
  }

  const getPayersDisplay = () => {
    if (!receipt) return 'Unknown'

    if (receipt.payments.length > 0) {
      return receipt.payments
        .map((p) => `${getParticipantName(p.participant)} (${formatCurrency(Math.round(p.amount * 100))})`)
        .join(', ')
    }

    // Fallback to legacy payer
    return getParticipantName(receipt.payer)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Receipt Details</h1>
          <Link to={`/trip/${tripId}/receipts`} className="text-blue-600 hover:text-blue-800 text-sm sm:text-base">
            Back to Receipts
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow p-8 flex flex-col items-center justify-center">
          <Spinner size="lg" />
          <p className="mt-3 text-gray-500">Loading receipt...</p>
        </div>
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Receipt Details</h1>
          <Link to={`/trip/${tripId}/receipts`} className="text-blue-600 hover:text-blue-800 text-sm sm:text-base">
            Back to Receipts
          </Link>
        </div>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p>{error || 'Receipt not found'}</p>
              <button
                onClick={fetchReceipt}
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

  const hasUnassignedItems = receipt.line_items.some((item) => item.assignments.length === 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {receipt.vendor_name || 'Receipt'}
          </h1>
          <p className="text-sm text-gray-500">{formatDate(receipt.receipt_date)}</p>
        </div>
        <Link to={`/trip/${tripId}/receipts`} className="text-blue-600 hover:text-blue-800 text-sm sm:text-base self-start sm:self-auto">
          Back to Receipts
        </Link>
      </div>

      {/* Warning for unassigned items */}
      {hasUnassignedItems && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg text-sm">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Some items are not assigned to anyone. Assign them to split the cost.</span>
          </div>
        </div>
      )}

      {/* Receipt Info Card */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
            <p className="font-semibold text-gray-900">{receipt.currency}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Subtotal</label>
            <p className="font-semibold text-gray-900">{formatCurrency(receipt.subtotal_cents)}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Total</label>
            <p className="font-semibold text-gray-900 text-lg">{formatCurrency(receipt.total_cents)}</p>
          </div>
        </div>

        {/* Paid By Section - Multi-payer */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 uppercase">Paid By</label>
            {!editingPayers && (
              <button
                type="button"
                onClick={startEditingPayers}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>

          {editingPayers ? (
            <div className="space-y-3">
              <MultiPayerPicker
                tripId={tripId!}
                payments={editPayments}
                totalCents={receipt.total_cents || 0}
                currency={receipt.currency}
                onChange={setEditPayments}
                error={payerError}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePayersUpdate}
                  disabled={isSaving}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPayers(false)
                    setEditPayments([])
                    setPayerError(null)
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {receipt.payments.length > 1 ? (
                <div className="space-y-1">
                  {receipt.payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between text-sm">
                      <span className="font-medium text-gray-900">{getParticipantName(payment.participant)}</span>
                      <span className="text-gray-600">{formatCurrency(Math.round(payment.amount * 100))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-semibold text-gray-900">{getPayersDisplay()}</p>
              )}
            </div>
          )}
        </div>

        {/* Receipt Image */}
        {receipt.image_url && (
          <div className="mt-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowImage(!showImage)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 py-2 min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {showImage ? 'Hide Receipt Image' : 'View Receipt Image'}
            </button>
            {showImage && (
              <div className="mt-3">
                <img
                  src={receipt.image_url}
                  alt="Receipt"
                  className="max-h-96 rounded-lg border mx-auto"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-sm text-blue-600 hover:text-blue-800 py-2 px-3 -mr-3 min-h-[44px]"
          >
            {isEditing ? 'Done Editing' : 'Edit Items'}
          </button>
        </div>

        {isSaving && (
          <div className="mb-4 flex items-center gap-2 text-sm text-blue-600">
            <Spinner size="sm" />
            <span>Saving changes...</span>
          </div>
        )}

        <div className="space-y-3">
          {receipt.line_items.map((item) => (
            <LineItemCard
              key={item.id}
              tripId={tripId!}
              item={{
                id: item.id,
                description: item.description,
                unit_price_cents: item.unit_price_cents,
                quantity: item.quantity,
                category: item.category,
                assignments: item.assignments.map((a) => ({
                  id: a.id,
                  participant_id: a.participant_id,
                  shares: a.shares,
                  participant: {
                    id: a.participant.id,
                    primary_alias: getParticipantName(a.participant as unknown as Participant),
                  },
                })),
              }}
              currency={receipt.currency}
              isEditing={isEditing}
              onUpdate={(updatedItem) => {
                console.log('Update item:', updatedItem)
              }}
              onDelete={() => {
                console.log('Delete item:', item.id)
              }}
              onAssignmentChange={(assignments) => {
                handleAssignmentChange(item.id, assignments)
              }}
            />
          ))}
        </div>
      </div>

      {/* Tax Breakdown */}
      {receipt.tax_lines.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Taxes</h2>
          <div className="space-y-2">
            {receipt.tax_lines.map((tax) => (
              <div key={tax.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{tax.tax_type}</span>
                <span className="font-medium text-gray-900">{formatCurrency(tax.amount_cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tip */}
      {receipt.tip_cents && receipt.tip_cents > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Tip</h2>
            <span className="text-lg font-semibold text-gray-900">
              {formatCurrency(receipt.tip_cents)}
            </span>
          </div>
        </div>
      )}

      {/* Per Person Breakdown */}
      {perPersonBreakdown.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Per Person Breakdown</h2>
          <div className="space-y-4">
            {perPersonBreakdown.map((person) => (
              <div key={person.participantId} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{person.participantName}</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {formatCurrency(Math.round(person.total))}
                  </span>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Items</span>
                    <span>{formatCurrency(Math.round(person.itemsTotal))}</span>
                  </div>
                  {person.taxShare > 0 && (
                    <div className="flex justify-between">
                      <span>Tax (prorated)</span>
                      <span>{formatCurrency(Math.round(person.taxShare))}</span>
                    </div>
                  )}
                  {person.tipShare > 0 && (
                    <div className="flex justify-between">
                      <span>Tip (prorated)</span>
                      <span>{formatCurrency(Math.round(person.tipShare))}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Unassigned amount warning */}
          {hasUnassignedItems && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded">
                Note: Some items are not assigned and are not included in this breakdown.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Total Summary */}
      <div className="bg-gray-900 text-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <div className="text-sm text-gray-400">Receipt Total</div>
            <div className="text-2xl sm:text-3xl font-bold">{formatCurrency(receipt.total_cents)}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-gray-400">Paid by</div>
            {receipt.payments.length > 1 ? (
              <div className="space-y-1">
                {receipt.payments.map((payment) => (
                  <div key={payment.id} className="text-sm sm:text-base">
                    {getParticipantName(payment.participant)} ({formatCurrency(Math.round(payment.amount * 100))})
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-lg sm:text-xl font-semibold">{getPayersDisplay()}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
