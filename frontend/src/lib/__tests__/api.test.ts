import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { parseReceipt, getBalances, getSettlements, getExchangeRate } from '../api'

const API_URL = 'http://localhost:8000'

// Set up MSW server
const server = setupServer()

beforeAll(() => {
  // Mock import.meta.env for consistent API_URL
  vi.stubEnv('VITE_API_URL', API_URL)
  server.listen()
})
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  vi.unstubAllEnvs()
})

describe('API client', () => {
  describe('parseReceipt', () => {
    it('sends POST request to /ocr/parse endpoint', async () => {
      let requestReceived = false
      let requestMethod = ''
      let requestUrl = ''

      server.use(
        http.post(`${API_URL}/ocr/parse`, ({ request }) => {
          requestReceived = true
          requestMethod = request.method
          requestUrl = request.url
          return HttpResponse.json({ items: [], total: 0 })
        })
      )

      const file = new File(['test content'], 'receipt.jpg', { type: 'image/jpeg' })
      await parseReceipt(file)

      expect(requestReceived).toBe(true)
      expect(requestMethod).toBe('POST')
      expect(requestUrl).toBe(`${API_URL}/ocr/parse`)
    })

    it('returns parsed OCR result on success', async () => {
      const mockOcrResult = {
        vendor: 'Test Restaurant',
        items: [
          { description: 'Burger', amount: 12.99, category: 'food' },
          { description: 'Beer', amount: 8.50, category: 'alcohol' }
        ],
        subtotal: 21.49,
        tax: 1.72,
        total: 23.21,
        currency: 'USD'
      }

      server.use(
        http.post(`${API_URL}/ocr/parse`, () => {
          return HttpResponse.json(mockOcrResult)
        })
      )

      const file = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' })
      const result = await parseReceipt(file)

      expect(result).toEqual(mockOcrResult)
      expect(result.vendor).toBe('Test Restaurant')
      expect(result.items).toHaveLength(2)
    })

    it('throws error on non-ok response', async () => {
      server.use(
        http.post(`${API_URL}/ocr/parse`, () => {
          return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
        })
      )

      const file = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' })

      await expect(parseReceipt(file)).rejects.toThrow('OCR failed: Internal Server Error')
    })
  })

  describe('getBalances', () => {
    it('fetches from /trips/{tripId}/balances', async () => {
      let capturedUrl = ''

      server.use(
        http.get(`${API_URL}/trips/:tripId/balances`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )

      await getBalances('trip-123')

      expect(capturedUrl).toBe(`${API_URL}/trips/trip-123/balances`)
    })

    it('returns balance array', async () => {
      const mockBalances = [
        { participant_id: 'user-1', name: 'Alice', balance: 50.00 },
        { participant_id: 'user-2', name: 'Bob', balance: -30.00 },
        { participant_id: 'user-3', name: 'Charlie', balance: -20.00 }
      ]

      server.use(
        http.get(`${API_URL}/trips/:tripId/balances`, () => {
          return HttpResponse.json(mockBalances)
        })
      )

      const result = await getBalances('trip-456')

      expect(result).toEqual(mockBalances)
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Alice')
      expect(result[0].balance).toBe(50.00)
    })

    it('throws on error response', async () => {
      server.use(
        http.get(`${API_URL}/trips/:tripId/balances`, () => {
          return new HttpResponse(null, { status: 404, statusText: 'Not Found' })
        })
      )

      await expect(getBalances('nonexistent')).rejects.toThrow('Failed to fetch balances: Not Found')
    })
  })

  describe('getSettlements', () => {
    it('fetches from /trips/{tripId}/settlements', async () => {
      let capturedUrl = ''

      server.use(
        http.get(`${API_URL}/trips/:tripId/settlements`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )

      await getSettlements('trip-789')

      expect(capturedUrl).toBe(`${API_URL}/trips/trip-789/settlements`)
    })

    it('returns settlement array', async () => {
      const mockSettlements = [
        { from_id: 'user-2', from_name: 'Bob', to_id: 'user-1', to_name: 'Alice', amount: 30.00 },
        { from_id: 'user-3', from_name: 'Charlie', to_id: 'user-1', to_name: 'Alice', amount: 20.00 }
      ]

      server.use(
        http.get(`${API_URL}/trips/:tripId/settlements`, () => {
          return HttpResponse.json(mockSettlements)
        })
      )

      const result = await getSettlements('trip-789')

      expect(result).toEqual(mockSettlements)
      expect(result).toHaveLength(2)
      expect(result[0].from_name).toBe('Bob')
      expect(result[0].to_name).toBe('Alice')
      expect(result[0].amount).toBe(30.00)
    })

    it('throws on error response', async () => {
      server.use(
        http.get(`${API_URL}/trips/:tripId/settlements`, () => {
          return new HttpResponse(null, { status: 500, statusText: 'Server Error' })
        })
      )

      await expect(getSettlements('trip-error')).rejects.toThrow('Failed to fetch settlements: Server Error')
    })
  })

  describe('getExchangeRate', () => {
    it('fetches rate with from and to currencies', async () => {
      let capturedUrl = ''

      server.use(
        http.get(`${API_URL}/exchange-rate`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json({ rate: 0.058 })
        })
      )

      await getExchangeRate('MXN', 'USD')

      const url = new URL(capturedUrl)
      expect(url.searchParams.get('from')).toBe('MXN')
      expect(url.searchParams.get('to')).toBe('USD')
    })

    it('includes date param when provided', async () => {
      let capturedUrl = ''

      server.use(
        http.get(`${API_URL}/exchange-rate`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json({ rate: 0.055, date: '2024-01-15' })
        })
      )

      await getExchangeRate('MXN', 'USD', '2024-01-15')

      const url = new URL(capturedUrl)
      expect(url.searchParams.get('from')).toBe('MXN')
      expect(url.searchParams.get('to')).toBe('USD')
      expect(url.searchParams.get('date')).toBe('2024-01-15')
    })

    it('omits date param when not provided', async () => {
      let capturedUrl = ''

      server.use(
        http.get(`${API_URL}/exchange-rate`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json({ rate: 0.058 })
        })
      )

      await getExchangeRate('EUR', 'USD')

      const url = new URL(capturedUrl)
      expect(url.searchParams.get('from')).toBe('EUR')
      expect(url.searchParams.get('to')).toBe('USD')
      expect(url.searchParams.has('date')).toBe(false)
    })

    it('returns exchange rate data', async () => {
      const mockRate = { rate: 0.058, from: 'MXN', to: 'USD', date: '2024-01-20' }

      server.use(
        http.get(`${API_URL}/exchange-rate`, () => {
          return HttpResponse.json(mockRate)
        })
      )

      const result = await getExchangeRate('MXN', 'USD')

      expect(result).toEqual(mockRate)
      expect(result.rate).toBe(0.058)
    })

    it('throws on error response', async () => {
      server.use(
        http.get(`${API_URL}/exchange-rate`, () => {
          return new HttpResponse(null, { status: 400, statusText: 'Bad Request' })
        })
      )

      await expect(getExchangeRate('INVALID', 'USD')).rejects.toThrow('Failed to fetch exchange rate: Bad Request')
    })
  })
})
