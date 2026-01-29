import { useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'

export default function Layout() {
  const { tripId } = useParams()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Trip Splitter
            </Link>
            {tripId && (
              <>
                {/* Desktop Navigation */}
                <nav className="hidden sm:flex gap-4 text-sm">
                  <Link
                    to={`/trip/${tripId}`}
                    className="text-gray-600 hover:text-gray-900 py-2"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to={`/trip/${tripId}/receipts`}
                    className="text-gray-600 hover:text-gray-900 py-2"
                  >
                    Receipts
                  </Link>
                  <Link
                    to={`/trip/${tripId}/settlements`}
                    className="text-gray-600 hover:text-gray-900 py-2"
                  >
                    Settlements
                  </Link>
                </nav>

                {/* Mobile Menu Button */}
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="sm:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Toggle navigation menu"
                >
                  {isMobileMenuOpen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Mobile Navigation */}
          {tripId && isMobileMenuOpen && (
            <nav className="sm:hidden mt-4 pt-4 border-t border-gray-100 flex flex-col gap-1">
              <Link
                to={`/trip/${tripId}`}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-3 px-2 rounded-lg -mx-2"
              >
                Dashboard
              </Link>
              <Link
                to={`/trip/${tripId}/receipts`}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-3 px-2 rounded-lg -mx-2"
              >
                Receipts
              </Link>
              <Link
                to={`/trip/${tripId}/settlements`}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-3 px-2 rounded-lg -mx-2"
              >
                Settlements
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
