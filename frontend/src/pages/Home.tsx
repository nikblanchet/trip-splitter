import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)

  const handleJoinTrip = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedCode = inviteCode.trim()

    if (!trimmedCode) {
      setInviteError('Please enter an invite code')
      return
    }

    if (trimmedCode.length < 4) {
      setInviteError('Invite code should be at least 4 characters')
      return
    }

    setInviteError(null)
    navigate(`/trip/${trimmedCode}`)
  }

  return (
    <div className="max-w-md mx-auto space-y-6 sm:space-y-8">
      <div className="text-center px-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Trip Splitter</h1>
        <p className="mt-2 text-gray-600 text-sm sm:text-base">
          Split expenses easily with your travel group
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Create a New Trip</h2>
        <button
          onClick={() => navigate('/trip/new')}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium min-h-[44px]"
        >
          Create Trip
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Join Existing Trip</h2>
        <form onSubmit={handleJoinTrip} className="space-y-4">
          <div>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase())
                if (inviteError) setInviteError(null)
              }}
              placeholder="Enter invite code"
              className={`w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] text-base ${
                inviteError ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
              }`}
              aria-describedby={inviteError ? 'invite-error' : undefined}
            />
            {inviteError && (
              <p id="invite-error" className="mt-2 text-sm text-red-600">
                {inviteError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full bg-gray-800 text-white py-3 px-4 rounded-lg hover:bg-gray-900 transition-colors font-medium min-h-[44px]"
          >
            Join Trip
          </button>
        </form>
      </div>
    </div>
  )
}
