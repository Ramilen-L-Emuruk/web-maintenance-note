import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useHeaderTitle } from '../components/Layout'
import ReminderList from '../components/ReminderList'
import { buildReminders } from '../utils/reminders'
import { formatNum } from '../utils/format'

export default function BikeListPage() {
  useHeaderTitle('メンテナンスノート')
  const navigate = useNavigate()
  const [showArchived, setShowArchived] = useState(false)

  const bikes = useLiveQuery(() => db.bikes.toArray(), [])
  const makers = useLiveQuery(() => db.makers.toArray(), [])
  const reminderData = useLiveQuery(async () => {
    const [insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords] = await Promise.all([
      db.insuranceTypes.toArray(),
      db.insuranceRecords.toArray(),
      db.maintenanceParts.toArray(),
      db.maintenanceRecords.toArray(),
    ])
    return { insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords }
  }, [])

  const reminders = useMemo(() => {
    if (!bikes || !reminderData) return []
    return buildReminders({ bikes, ...reminderData })
  }, [bikes, reminderData])

  const makerName = (id: string) => makers?.find((m) => m.id === id)?.name ?? ''

  if (!bikes) return null
  const visible = bikes.filter((b) => showArchived || !b.archived)

  return (
    <>
      <div className="card">
        <div className="card-title">
          リマインド
          {reminders.length > 0 && (
            <span className="badge badge-overdue">{reminders.length}</span>
          )}
        </div>
        <ReminderList reminders={reminders} />
      </div>

      <div className="section-title">
        所有バイク
        {bikes.some((b) => b.archived) && (
          <label style={{ float: 'right', fontSize: 13, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            アーカイブも表示
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card empty">まだバイクが登録されていません。下のボタンから登録してね。</div>
      ) : (
        visible.map((bike) => (
          <Link to={`/bikes/${bike.id}`} key={bike.id} className="card bike-card">
            {bike.images[0] ? (
              <img className="bike-thumb" src={bike.images[0]} alt="" />
            ) : (
              <div className="bike-thumb placeholder">🏍️</div>
            )}
            <div className="main" style={{ flex: 1 }}>
              <div className="title">
                {bike.nickname || bike.name}{' '}
                {bike.archived && <span className="badge badge-cat">アーカイブ</span>}
              </div>
              <div className="sub">
                {makerName(bike.makerId)} {bike.name}
                {bike.displacement ? ` ・ ${bike.displacement}cc` : ''}
              </div>
              <div className="sub">走行 {formatNum(bike.totalMileage, 0)} km</div>
            </div>
            <span className="chevron">›</span>
          </Link>
        ))
      )}

      <button className="btn btn-primary btn-block fab" onClick={() => navigate('/bikes/new')}>
        ＋ バイクを新規登録
      </button>
    </>
  )
}
