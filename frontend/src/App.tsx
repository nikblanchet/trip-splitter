import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import CreateTrip from './pages/CreateTrip'
import TripDashboard from './pages/TripDashboard'
import ReceiptList from './pages/ReceiptList'
import AddReceipt from './pages/AddReceipt'
import AddManualExpense from './pages/AddManualExpense'
import ReceiptDetail from './pages/ReceiptDetail'
import Settlements from './pages/Settlements'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="trip/new" element={<CreateTrip />} />
          <Route path="trip/:tripId" element={<TripDashboard />} />
          <Route path="trip/:tripId/receipts" element={<ReceiptList />} />
          <Route path="trip/:tripId/receipts/new" element={<AddReceipt />} />
          <Route path="trip/:tripId/expenses/new" element={<AddManualExpense />} />
          <Route path="trip/:tripId/receipts/:receiptId" element={<ReceiptDetail />} />
          <Route path="trip/:tripId/settlements" element={<Settlements />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
