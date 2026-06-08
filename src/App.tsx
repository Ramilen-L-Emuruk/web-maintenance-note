import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { buildReminders } from './utils/reminders'
import { notifyReminders, registerPeriodicSync } from './utils/notify'
import Layout from './components/Layout'
import BikeListPage from './pages/BikeListPage'
import BikeFormPage from './pages/BikeFormPage'
import BikeDetailPage from './pages/BikeDetailPage'
import RefuelPage from './pages/RefuelPage'
import MaintenancePage from './pages/MaintenancePage'
import InsurancePage from './pages/InsurancePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  // 起動時にリマインドを集計して通知（許可済みなら）
  const data = useLiveQuery(async () => {
    const [bikes, insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords] =
      await Promise.all([
        db.bikes.toArray(),
        db.insuranceTypes.toArray(),
        db.insuranceRecords.toArray(),
        db.maintenanceParts.toArray(),
        db.maintenanceRecords.toArray(),
      ])
    return { bikes, insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords }
  }, [])

  useEffect(() => {
    if (!data) return
    const reminders = buildReminders(data)
    notifyReminders(reminders)
    registerPeriodicSync()
  }, [data])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<BikeListPage />} />
        <Route path="/bikes/new" element={<BikeFormPage />} />
        <Route path="/bikes/:bikeId" element={<BikeDetailPage />} />
        <Route path="/bikes/:bikeId/edit" element={<BikeFormPage />} />
        <Route path="/bikes/:bikeId/refuel" element={<RefuelPage />} />
        <Route path="/bikes/:bikeId/maintenance" element={<MaintenancePage />} />
        <Route path="/bikes/:bikeId/insurance" element={<InsurancePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
