const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function parseReceipt(imageFile: File) {
  const formData = new FormData()
  formData.append('file', imageFile)
  const res = await fetch(`${API_URL}/ocr/parse`, { method: 'POST', body: formData })
  if (!res.ok) {
    throw new Error(`OCR failed: ${res.statusText}`)
  }
  return res.json()
}

export async function getBalances(tripId: string) {
  const res = await fetch(`${API_URL}/trips/${tripId}/balances`)
  if (!res.ok) {
    throw new Error(`Failed to fetch balances: ${res.statusText}`)
  }
  return res.json()
}

export async function getSettlements(tripId: string) {
  const res = await fetch(`${API_URL}/trips/${tripId}/settlements`)
  if (!res.ok) {
    throw new Error(`Failed to fetch settlements: ${res.statusText}`)
  }
  return res.json()
}

export async function getExchangeRate(from: string, to: string, date?: string) {
  const params = new URLSearchParams({ from, to })
  if (date) params.append('date', date)
  const res = await fetch(`${API_URL}/exchange-rate?${params}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch exchange rate: ${res.statusText}`)
  }
  return res.json()
}
