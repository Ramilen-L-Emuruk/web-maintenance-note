import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useHeaderTitle } from '../components/Layout'
import ReminderList from '../components/ReminderList'
import { buildReminders } from '../utils/reminders'
import { averageFuelEconomy, filterByMonth, recordFuelEconomyWithHistory, pricePerLiter } from '../utils/fuel'
import { formatDate, formatNum, formatYen, yearMonth } from '../utils/format'

export default function BikeDetailPage() {
  const { bikeId } = useParams()
  const navigate = useNavigate()

  const [openBasic, setOpenBasic] = useState(false)
  const [openRefuel, setOpenRefuel] = useState(false)
  const [openInsurance, setOpenInsurance] = useState(false)
  const [openMaintenance, setOpenMaintenance] = useState(false)
  const [openMaintenanceTypes, setOpenMaintenanceTypes] = useState<Set<string>>(new Set())

  const bike = useLiveQuery(() => (bikeId ? db.bikes.get(bikeId) : undefined), [bikeId])
  const maker = useLiveQuery(
    () => (bike?.makerId ? db.makers.get(bike.makerId) : undefined),
    [bike?.makerId],
  )
  const shop = useLiveQuery(
    () => (bike?.purchaseShopId ? db.shops.get(bike.purchaseShopId) : undefined),
    [bike?.purchaseShopId],
  )
  const refuels = useLiveQuery(
    () => (bikeId ? db.refuelRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )
  const insuranceTypes = useLiveQuery(() => db.insuranceTypes.toArray(), [])
  const insuranceRecords = useLiveQuery(
    () => (bikeId ? db.insuranceRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )
  const maintenanceTypes = useLiveQuery(() => db.maintenanceTypes.orderBy('name').toArray(), [])
  const maintenanceParts = useLiveQuery(() => db.maintenanceParts.toArray(), [])
  const maintenanceRecords = useLiveQuery(
    () => (bikeId ? db.maintenanceRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )

  useHeaderTitle(bike ? bike.nickname || bike.name : '読み込み中')

  const lastRefuel = useMemo(() => {
    if (!refuels || refuels.length === 0) return undefined
    return [...refuels].sort((a, b) => b.refuelDate.localeCompare(a.refuelDate))[0]
  }, [refuels])

  const monthAvg = useMemo(() => {
    if (!refuels) return null
    return averageFuelEconomy(filterByMonth(refuels, yearMonth(new Date().toISOString())))
  }, [refuels])
  const overallAvg = useMemo(() => (refuels ? averageFuelEconomy(refuels) : null), [refuels])

  const reminders = useMemo(() => {
    if (!bike || !insuranceTypes || !insuranceRecords || !maintenanceParts || !maintenanceRecords)
      return []
    return buildReminders({
      bikes: [bike],
      insuranceTypes,
      insuranceRecords,
      maintenanceParts,
      maintenanceRecords,
    })
  }, [bike, insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords])

  if (bike === undefined) return null
  if (bike === null) return <div className="empty">バイクが見つかりません。</div>

  const latestInsuranceByType = new Map<string, string>() // typeId -> finishDate
  for (const r of insuranceRecords ?? []) {
    const cur = latestInsuranceByType.get(r.insuranceTypeId)
    if (!cur || r.finishDate > cur) latestInsuranceByType.set(r.insuranceTypeId, r.finishDate)
  }

  return (
    <>
      {/* 基本情報 */}
      <div className="card">
        <div
          className="card-title"
          onClick={() => setOpenBasic((v) => !v)}
          style={{ cursor: 'pointer' }}
        >
          基本情報
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <Link
              to={`/bikes/${bike.id}/edit`}
              className="btn btn-sm"
              onClick={(e) => e.stopPropagation()}
            >
              編集
            </Link>
            <span style={{ fontSize: 11, color: 'var(--color-muted, #999)' }}>
              {openBasic ? '▲' : '▼'}
            </span>
          </div>
        </div>
        {openBasic && (
          <>
            {bike.images[0] && (
              <img
                src={bike.images[0]}
                alt=""
                style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }}
              />
            )}
            <InfoRow label="メーカー / 車名" value={`${maker?.name ?? ''} ${bike.name}`} />
            {bike.nickname && <InfoRow label="ニックネーム" value={bike.nickname} />}
            {bike.displacement > 0 && <InfoRow label="排気量" value={`${bike.displacement} cc`} />}
            {bike.frameNumber && <InfoRow label="車体番号" value={bike.frameNumber} />}
            <InfoRow label="現在の走行距離" value={`${formatNum(bike.totalMileage, 0)} km`} />
            {shop && <InfoRow label="購入店舗" value={shop.name} />}
            {bike.purchaseDate && <InfoRow label="購入日" value={formatDate(bike.purchaseDate)} />}
            <InfoRow
              label="車検満了日"
              value={bike.inspectionExpiryDate ? formatDate(bike.inspectionExpiryDate) : '未設定'}
            />
            {bike.memo && <InfoRow label="メモ" value={bike.memo} />}
          </>
        )}
      </div>

      {/* リマインド */}
      {reminders.length > 0 && (
        <div className="card">
          <div className="card-title">このバイクのリマインド</div>
          <ReminderList reminders={reminders} />
        </div>
      )}

      {/* 給油情報 */}
      <div className="card">
        <div
          className="card-title"
          onClick={() => setOpenRefuel((v) => !v)}
          style={{ cursor: 'pointer' }}
        >
          給油情報
          <span style={{ fontSize: 11, color: 'var(--color-muted, #999)', marginLeft: 'auto' }}>
            {openRefuel ? '▲' : '▼'}
          </span>
        </div>
        {openRefuel && (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="label">当月の平均燃費</div>
                <div className="value">
                  {formatNum(monthAvg)}
                  <span className="unit">km/L</span>
                </div>
              </div>
              <div className="stat">
                <div className="label">全体の平均燃費</div>
                <div className="value">
                  {formatNum(overallAvg)}
                  <span className="unit">km/L</span>
                </div>
              </div>
            </div>
            {lastRefuel ? (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  最後の給油（{formatDate(lastRefuel.refuelDate)}）
                </div>
                <div className="list-item">
                  <div className="main">
                    <div className="title">
                      {formatNum(lastRefuel.refuelAmount, 2)} L / {formatYen(lastRefuel.price)}
                    </div>
                    <div className="sub">
                      単価 {formatYen(pricePerLiter(lastRefuel))}/L ・ 燃費{' '}
                      {formatNum(recordFuelEconomyWithHistory(lastRefuel, refuels ?? []))} km/L
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty">給油記録がありません。</div>
            )}
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => navigate(`/bikes/${bike.id}/refuel`)}
            >
              ⛽ 給油情報を登録・管理
            </button>
          </>
        )}
      </div>

      {/* メンテナンス情報 */}
      <div className="card">
        <div
          className="card-title"
          onClick={() => setOpenMaintenance((v) => !v)}
          style={{ cursor: 'pointer' }}
        >
          メンテナンス情報
          <span style={{ fontSize: 11, color: 'var(--color-muted, #999)', marginLeft: 'auto' }}>
            {openMaintenance ? '▲' : '▼'}
          </span>
        </div>
        {openMaintenance && (
          <>
            <button
              className="btn btn-primary btn-block"
              style={{ marginBottom: 12 }}
              onClick={() => navigate(`/bikes/${bike.id}/maintenance`)}
            >
              🔧 メンテナンスを管理
            </button>
            {maintenanceTypes && maintenanceTypes.length > 0 ? (
              maintenanceTypes.map((type) => {
                const typeParts = (maintenanceParts ?? []).filter(
                  (p) =>
                    p.maintenanceTypeId === type.id &&
                    (maintenanceRecords ?? []).some((r) => r.maintenancePartId === p.id),
                )
                if (typeParts.length === 0) return null
                const isOpen = openMaintenanceTypes.has(type.id)
                return (
                  <div key={type.id} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 4px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--color-border, #eee)',
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                      onClick={() =>
                        setOpenMaintenanceTypes((prev) => {
                          const next = new Set(prev)
                          if (next.has(type.id)) next.delete(type.id)
                          else next.add(type.id)
                          return next
                        })
                      }
                    >
                      <span>{type.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted, #999)' }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </div>
                    {isOpen && (
                      <div style={{ paddingLeft: 4 }}>
                        {typeParts.map((part) => {
                          const partRecords = (maintenanceRecords ?? []).filter(
                            (r) => r.maintenancePartId === part.id,
                          )
                          const lastDate =
                            partRecords.length > 0
                              ? [...partRecords].sort((a, b) =>
                                  b.maintenanceDate.localeCompare(a.maintenanceDate),
                                )[0].maintenanceDate
                              : null
                          return (
                            <div className="list-item" key={part.id}>
                              <div className="main">
                                <div className="title">{part.name}</div>
                                <div className="sub muted">
                                  {lastDate
                                    ? `前回 ${formatDate(lastDate)}・${partRecords.length}件`
                                    : '記録なし'}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                部品が登録されていません。
              </div>
            )}
          </>
        )}
      </div>

      {/* 保険情報 */}
      <div className="card">
        <div
          className="card-title"
          onClick={() => setOpenInsurance((v) => !v)}
          style={{ cursor: 'pointer' }}
        >
          保険情報
          <span style={{ fontSize: 11, color: 'var(--color-muted, #999)', marginLeft: 'auto' }}>
            {openInsurance ? '▲' : '▼'}
          </span>
        </div>
        {openInsurance && (
          <>
            {insuranceTypes && insuranceTypes.length > 0 ? (
              insuranceTypes.map((t) => {
                const finish = latestInsuranceByType.get(t.id)
                return (
                  <div className="list-item" key={t.id}>
                    <div className="main">
                      <div className="title">{t.name}</div>
                      <div className="sub">{finish ? `満了 ${formatDate(finish)}` : '未登録'}</div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="empty">保険種別がありません。</div>
            )}
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => navigate(`/bikes/${bike.id}/insurance`)}
            >
              🛡 保険を管理
            </button>
          </>
        )}
      </div>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-item">
      <div className="main">
        <div className="sub">{label}</div>
        <div className="title" style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>
          {value}
        </div>
      </div>
    </div>
  )
}
