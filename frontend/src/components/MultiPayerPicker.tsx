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

export interface PayerPayment {
  participantId: string
  participantName: string
  amount: number // in cents
}

interface MultiPayerPickerProps {
  tripId: string
  payments: PayerPayment[]
  totalCents: number
  currency: string
  onChange: (payments: PayerPayment[]) => void
  error?: string | null
}

export default function MultiPayerPicker({
  tripId,
  payments,
  totalCents,
  currency,
  onChange,
  error,
}: MultiPayerPickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ParticipantAlias[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Calculate running totals
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = totalCents - paidTotal
  const isBalanced = Math.abs(remaining) <= 1 // 1 cent tolerance

  // Search for participants
  useEffect(() => {
    const search = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([])
        return
      }

      setIsLoading(true)

      try {
        const { data: tripData } = await supabase
          .from('trips')
          .select('id')
          .eq('invite_code', tripId)
          .single()

        if (!tripData) {
          setIsLoading(false)
          return
        }

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
          setSearchResults([])
        } else {
          // Filter out already selected participants and dedupe
          const selectedIds = new Set(payments.map((p) => p.participantId))
          const seen = new Set<string>()
          const filtered = (data || [])
            .filter((alias) => {
              const participant = alias.participant as unknown as Participant
              if (!participant || selectedIds.has(participant.id) || seen.has(participant.id)) {
                return false
              }
              seen.add(participant.id)
              return true
            })
            .map((alias) => ({
              ...alias,
              participant: alias.participant as unknown as Participant,
            }))
          setSearchResults(filtered)
        }
      } catch {
        setSearchResults([])
      }

      setIsLoading(false)
    }

    const debounce = setTimeout(search, 200)
    return () => clearTimeout(debounce)
  }, [searchTerm, tripId, payments])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addPayer = (participant: Participant) => {
    // Default amount: remaining balance or 0
    const defaultAmount = remaining > 0 ? remaining : 0
    const newPayment: PayerPayment = {
      participantId: participant.id,
      participantName: participant.primary_alias,
      amount: defaultAmount,
    }
    onChange([...payments, newPayment])
    setSearchTerm('')
    setSearchResults([])
    setIsDropdownOpen(false)
  }

  const removePayer = (index: number) => {
    const newPayments = payments.filter((_, i) => i !== index)
    onChange(newPayments)
    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  const updatePayerAmount = (index: number, amountCents: number) => {
    const newPayments = payments.map((p, i) =>
      i === index ? { ...p, amount: amountCents } : p
    )
    onChange(newPayments)
  }

  const splitEvenly = () => {
    if (payments.length === 0) return

    const perPerson = Math.floor(totalCents / payments.length)
    const remainder = totalCents - perPerson * payments.length

    const newPayments = payments.map((p, i) => ({
      ...p,
      // Give the remainder cents to the first person
      amount: perPerson + (i === 0 ? remainder : 0),
    }))
    onChange(newPayments)
  }

  const formatCurrency = (cents: number) => {
    const amount = cents / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount)
  }

  const parseCurrencyInput = (value: string): number => {
    // Remove currency symbols and commas, parse as float, convert to cents
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parsed = parseFloat(cleaned) || 0
    return Math.round(parsed * 100)
  }

  return (
    <div className="space-y-3">
      {/* Existing payers */}
      {payments.map((payment, index) => (
        <div
          key={payment.participantId}
          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
        >
          <div className="flex-1">
            <span className="font-medium text-gray-900">{payment.participantName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">{currency}</span>
            <input
              type="text"
              inputMode="decimal"
              value={(payment.amount / 100).toFixed(2)}
              onChange={(e) => updatePayerAmount(index, parseCurrencyInput(e.target.value))}
              onFocus={() => setEditingIndex(index)}
              onBlur={() => setEditingIndex(null)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => removePayer(index)}
              className="p-2 text-gray-400 hover:text-red-600 min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Add payer search */}
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={payments.length === 0 ? 'Search for payer...' : 'Add another payer...'}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
        />

        {isDropdownOpen && (searchTerm || searchResults.length > 0) && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-4 flex items-center gap-2 text-gray-500 text-sm">
                <Spinner size="sm" />
                <span>Searching...</span>
              </div>
            )}

            {!isLoading && searchTerm && searchResults.length === 0 && (
              <div className="px-4 py-4 text-gray-500 text-sm">No participants found</div>
            )}

            {!isLoading && searchResults.map((alias) => (
              <button
                key={alias.id}
                type="button"
                onClick={() => addPayer(alias.participant)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0 min-h-[48px]"
              >
                <div className="font-medium text-gray-900">{alias.participant.primary_alias}</div>
                {!alias.is_primary && (
                  <div className="text-sm text-gray-500">Matched: {alias.alias}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary and helpers */}
      {payments.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
          <div className="text-sm">
            <span className="text-gray-600">Paid: </span>
            <span className={`font-medium ${isBalanced ? 'text-green-600' : 'text-gray-900'}`}>
              {formatCurrency(paidTotal)}
            </span>
            <span className="text-gray-600"> of </span>
            <span className="font-medium text-gray-900">{formatCurrency(totalCents)}</span>
            {!isBalanced && (
              <span className={`ml-2 ${remaining > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                ({remaining > 0 ? `${formatCurrency(remaining)} remaining` : `${formatCurrency(Math.abs(remaining))} over`})
              </span>
            )}
          </div>

          {payments.length > 1 && (
            <button
              type="button"
              onClick={splitEvenly}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Split evenly
            </button>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
    </div>
  )
}
