import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../db/db'
import { useHeaderTitle } from '../components/Layout'
import Modal from '../components/Modal'
import { deleteRefuelRecord, saveRefuelRecord } from '../db/repo'
import {
  averageFuelEconomy,
  filterByMonth,
  fuelEconomyChartData,
  pricePerLiter,
  recordDistance,
  recordFuelEconomy,
} from '../utils/fuel'
import { formatDate, formatNum, formatYen, today, yearMonth } from '../utils/format'
import type { RefuelRecord } from '../types'

export default function RefuelPage() {
  const { bikeId } = useParams()
  useHeaderTitle('給油情報')
  const bike = useLiveQuery(() => (bikeId ? db.bikes.get(bikeId) : undefined), [bikeId])
  const refuels = useLiveQuery(
    () => (bikeId ? db.refuelRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )
  const [editing, setEditing] = useState<RefuelRecord | 'new' | null>(null)

  const sorted = useMemo(
    () => [...(refuels ?? [])].sort((a, b) => b.refuelDate.localeCompare(a.refuelDate)),
    [refuels],
  )
  const monthAvg = useMemo(
    () => (refuels ? averageFuelEconomy(filterByMonth(refuels, yearMonth(new Date().toISOString()))) : null),
    [refuels],
  )
  const overallAvg = useMemo(() => (refuels ? averageFuelEconomy(refuels) : null), [refuels])
  const chartData = useMemo(() => fuelEconomyChartData(refuels ?? []), [refuels])

  if (!bikeId) return null

  return (
    <>
      <div className="card">
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
      </div>

      <div className="card">
        <div className="card-title">燃費グラフ (km/L)</div>
        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                fontSize={11}
                stroke="#66707a"
              />
              <YAxis fontSize={11} stroke="#66707a" />
              <Tooltip
                formatter={(v: number) => [`${formatNum(v)} km/L`, '燃費']}
                labelFormatter={(l) => formatDate(l as string)}
              />
              <Line
                type="monotone"
                dataKey="economy"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">燃費を計算できる給油記録が2件以上あるとグラフが表示されます。</div>
        )}
      </div>

      <div className="section-title">給油タイムライン</div>
      <div className="card">
        {sorted.length === 0 ? (
          <div className="empty">給油記録がありません。</div>
        ) : (
          sorted.map((r) => (
            <div
              className="timeline-item"
              key={r.id}
              onClick={() => setEditing(r)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{formatDate(r.refuelDate)}</strong>
                <span className="muted">{formatNum(recordFuelEconomy(r))} km/L</span>
              </div>
              <div className="sub muted">
                {formatNum(r.refuelAmount, 2)} L / {formatYen(r.price)}（単価{' '}
                {formatYen(pricePerLiter(r))}/L）
              </div>
              <div className="sub muted">
                走行 {formatNum(recordDistance(r), 0)} km（{formatNum(r.previousMileage, 0)}→
                {formatNum(r.totalMileage, 0)}km）
                {r.isFullTank ? ' ・満タン' : ''}
                {!r.includeInFuelEconomy ? ' ・燃費計算対象外' : ''}
              </div>
              {r.memo && <div className="sub">{r.memo}</div>}
            </div>
          ))
        )}
      </div>

      <button className="btn btn-primary btn-block" onClick={() => setEditing('new')}>
        ＋ 給油情報を新規登録
      </button>

      {editing && (
        <RefuelForm
          bikeId={bikeId}
          lastTotalMileage={bike?.totalMileage ?? 0}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function RefuelForm({
  bikeId,
  record,
  lastTotalMileage,
  onClose,
}: {
  bikeId: string
  record: RefuelRecord | null
  lastTotalMileage: number
  onClose: () => void
}) {
  const [refuelDate, setRefuelDate] = useState(record?.refuelDate ?? today())
  const [previousMileage, setPreviousMileage] = useState(
    String(record?.previousMileage ?? lastTotalMileage),
  )
  const [totalMileage, setTotalMileage] = useState(record ? String(record.totalMileage) : '')
  const [price, setPrice] = useState(record ? String(record.price) : '')
  const [refuelAmount, setRefuelAmount] = useState(record ? String(record.refuelAmount) : '')
  const [memo, setMemo] = useState(record?.memo ?? '')
  const [isFullTank, setIsFullTank] = useState(record?.isFullTank ?? true)
  const [includeInFuelEconomy, setIncludeInFuelEconomy] = useState(
    record?.includeInFuelEconomy ?? true,
  )

  const amt = Number(refuelAmount)
  const ppl = amt > 0 ? Number(price) / amt : null
  const dist = Number(totalMileage) - Number(previousMileage)
  const eco = amt > 0 && dist > 0 ? dist / amt : null

  async function handleSave() {
    if (!totalMileage || !refuelAmount) {
      alert('総走行距離と給油量は必須です。')
      return
    }
    await saveRefuelRecord({
      id: record?.id,
      bikeId,
      refuelDate,
      previousMileage: Number(previousMileage) || 0,
      totalMileage: Number(totalMileage) || 0,
      price: Number(price) || 0,
      refuelAmount: Number(refuelAmount) || 0,
      memo: memo.trim(),
      isFullTank,
      includeInFuelEconomy,
    })
    onClose()
  }

  async function handleDelete() {
    if (!record) return
    if (!confirm('この給油記録を削除しますか？')) return
    await deleteRefuelRecord(record.id)
    onClose()
  }

  return (
    <Modal title={record ? '給油情報を編集' : '給油情報を登録'} onClose={onClose}>
      <div className="field">
        <label>給油日</label>
        <input type="date" value={refuelDate} onChange={(e) => setRefuelDate(e.target.value)} />
      </div>
      <div className="row-2">
        <div className="field">
          <label>前回の走行距離 (km)</label>
          <input
            type="number"
            inputMode="numeric"
            value={previousMileage}
            onChange={(e) => setPreviousMileage(e.target.value)}
          />
        </div>
        <div className="field">
          <label>今回の走行距離 (km) *</label>
          <input
            type="number"
            inputMode="numeric"
            value={totalMileage}
            onChange={(e) => setTotalMileage(e.target.value)}
          />
        </div>
      </div>
      <div className="row-2">
        <div className="field">
          <label>給油量 (L) *</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={refuelAmount}
            onChange={(e) => setRefuelAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label>金額 (円)</label>
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">1Lあたりの値段</div>
          <div className="value" style={{ fontSize: 18 }}>
            {ppl != null ? formatYen(ppl) : '-'}
            <span className="unit">/L</span>
          </div>
        </div>
        <div className="stat">
          <div className="label">この給油の燃費</div>
          <div className="value" style={{ fontSize: 18 }}>
            {formatNum(eco)}
            <span className="unit">km/L</span>
          </div>
        </div>
      </div>

      <div className="checkbox-row">
        <input
          id="fulltank"
          type="checkbox"
          checked={isFullTank}
          onChange={(e) => setIsFullTank(e.target.checked)}
        />
        <label htmlFor="fulltank" style={{ margin: 0 }}>
          満タン給油
        </label>
      </div>
      <div className="checkbox-row">
        <input
          id="include"
          type="checkbox"
          checked={includeInFuelEconomy}
          onChange={(e) => setIncludeInFuelEconomy(e.target.checked)}
        />
        <label htmlFor="include" style={{ margin: 0 }}>
          平均燃費の計算に含める
        </label>
      </div>

      <div className="field">
        <label>メモ</label>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>

      <button className="btn btn-primary btn-block" onClick={handleSave}>
        保存する
      </button>
      {record && (
        <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={handleDelete}>
          削除
        </button>
      )}
    </Modal>
  )
}
