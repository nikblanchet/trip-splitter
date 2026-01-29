import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'EUR', name: 'Euro' },
]

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export default function CreateTrip() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError('Please enter a trip name')
      return
    }
    if (trimmedName.length < 2) {
      setNameError('Trip name must be at least 2 characters')
      return
    }
    setNameError(null)

    setIsSubmitting(true)
    setError(null)

    const inviteCode = generateInviteCode()

    try {
      const { data, error: insertError } = await supabase
        .from('trips')
        .insert({
          name: trimmedName,
          base_currency: baseCurrency,
          invite_code: inviteCode,
        })
        .select()
        .single()

      if (insertError) {
        if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
          setError('That invite code is already taken. Please try again.')
        } else {
          setError('Unable to create trip. Please try again.')
        }
        setIsSubmitting(false)
        return
      }

      navigate(`/trip/${data.invite_code}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create New Trip</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Trip Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError(null)
            }}
            placeholder="e.g., Mexico City 2024"
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
            Base Currency
          </label>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base min-h-[44px]"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500">
            This is the currency used for calculating settlements.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
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
            {isSubmitting ? 'Creating...' : 'Create Trip'}
          </button>
        </div>
      </form>
    </div>
  )
}
