import { useMemo, useState } from 'react'
import { useIosNumericInput } from '../hooks/useIosNumericInput'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useHeaderTitle } from '../components/Layout'
import Modal from '../components/Modal'
import ImagePicker from '../components/ImagePicker'
import {
  addMaintenancePart,
  addMaintenanceType,
  deleteMaintenancePart,
  deleteMaintenanceRecord,
  saveMaintenanceRecord,
  updateMaintenancePart,
} from '../db/repo'
import { formatDate, formatNum, formatYen, today } from '../utils/format'
import type { MaintenancePart, MaintenanceRecord } from '../types'

export default function MaintenancePage() {
  const { bikeId } = useParams()
  useHeaderTitle('メンテナンス')
  const bike = useLiveQuery(() => (bikeId ? db.bikes.get(bikeId) : undefined), [bikeId])
  const types = useLiveQuery(() => db.maintenanceTypes.orderBy('name').toArray(), [])
  const parts = useLiveQuery(() => db.maintenanceParts.toArray(), [])
  const records = useLiveQuery(
    () => (bikeId ? db.maintenanceRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )

  const [openPart, setOpenPart] = useState<MaintenancePart | null>(null)
  const [editPart, setEditPart] = useState<MaintenancePart | 'new' | null>(null)
  const [editTypeIdForNewPart, setEditTypeIdForNewPart] = useState<string | null>(null)

  const recordsByPart = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>()
    for (const r of records ?? []) {
      const arr = map.get(r.maintenancePartId) ?? []
      arr.push(r)
      map.set(r.maintenancePartId, arr)
    }
    return map
  }, [records])

  const lastDateByPart = (partId: string) => {
    const arr = recordsByPart.get(partId)
    if (!arr || arr.length === 0) return null
    return [...arr].sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate))[0].maintenanceDate
  }

  async function handleAddType() {
    const name = prompt('追加する大項目の名前（例: 足回り）')
    if (name && name.trim()) await addMaintenanceType(name)
  }

  if (!bikeId || !types || !parts) return null

  return (
    <>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        部品をタップすると整備履歴の確認・登録ができます。
      </p>

      {types.map((type) => {
        const typeParts = parts.filter((p) => p.maintenanceTypeId === type.id)
        return (
          <div className="card type-group" key={type.id}>
            <h3>{type.name}</h3>
            {typeParts.length === 0 && <div className="muted" style={{ fontSize: 13 }}>部品なし</div>}
            {typeParts.map((part) => {
              const last = lastDateByPart(part.id)
              const count = recordsByPart.get(part.id)?.length ?? 0
              return (
                <div className="tap-row" key={part.id} onClick={() => setOpenPart(part)}>
                  <div>
                    <div className="title">{part.name}</div>
                    <div className="sub muted">
                      {last ? `前回 ${formatDate(last)}・${count}件` : '記録なし'}
                    </div>
                  </div>
                  <span className="chevron">›</span>
                </div>
              )
            })}
            <button
              className="btn btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => {
                setEditTypeIdForNewPart(type.id)
                setEditPart('new')
              }}
            >
              ＋ 部品を追加
            </button>
          </div>
        )
      })}

      <button className="btn btn-block" onClick={handleAddType}>
        ＋ 大項目を追加
      </button>

      {openPart && (
        <PartRecordsModal
          bikeId={bikeId}
          bikeMileage={bike?.totalMileage ?? 0}
          part={openPart}
          records={recordsByPart.get(openPart.id) ?? []}
          onClose={() => setOpenPart(null)}
          onEditPart={() => {
            setEditPart(openPart)
            setOpenPart(null)
          }}
        />
      )}

      {editPart && (
        <PartSettingsModal
          part={editPart === 'new' ? null : editPart}
          typeId={editPart === 'new' ? editTypeIdForNewPart! : editPart.maintenanceTypeId}
          onClose={() => {
            setEditPart(null)
            setEditTypeIdForNewPart(null)
          }}
        />
      )}
    </>
  )
}

// ---------- 部品ごとの整備履歴 ----------
function PartRecordsModal({
  bikeId,
  bikeMileage,
  part,
  records,
  onClose,
  onEditPart,
}: {
  bikeId: string
  bikeMileage: number
  part: MaintenancePart
  records: MaintenanceRecord[]
  onClose: () => void
  onEditPart: () => void
}) {
  const [editing, setEditing] = useState<MaintenanceRecord | 'new' | null>(null)
  const sorted = [...records].sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate))

  return (
    <Modal title={part.name} onClose={onClose}>
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn btn-sm" onClick={onEditPart}>
          部品設定（間隔・通知）
        </button>
      </div>
      {(part.intervalDays != null || part.intervalDistance != null) && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          推奨交換間隔:
          {part.intervalDays != null ? ` ${part.intervalDays}日` : ''}
          {part.intervalDistance != null ? ` / ${formatNum(part.intervalDistance, 0)}km` : ''}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty">まだ記録がありません。</div>
      ) : (
        sorted.map((r) => (
          <div
            className="timeline-item"
            key={r.id}
            style={{ cursor: 'pointer' }}
            onClick={() => setEditing(r)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.title || formatDate(r.maintenanceDate)}</strong>
              <span className="muted">{formatYen(r.price)}</span>
            </div>
            <div className="sub muted">
              {formatDate(r.maintenanceDate)}
              {r.mileage != null ? ` ・ ${formatNum(r.mileage, 0)}km` : ''}
            </div>
            {r.memo && <div className="sub">{r.memo}</div>}
            {r.images.length > 0 && (
              <div className="thumb-strip">
                {r.images.map((src, i) => (
                  <img key={i} src={src} alt="" />
                ))}
              </div>
            )}
          </div>
        ))
      )}

      <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => setEditing('new')}>
        ＋ 整備を記録
      </button>

      {editing && (
        <MaintenanceRecordForm
          bikeId={bikeId}
          partId={part.id}
          defaultMileage={bikeMileage}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  )
}

// ---------- 整備記録フォーム ----------
function MaintenanceRecordForm({
  bikeId,
  partId,
  defaultMileage,
  record,
  onClose,
}: {
  bikeId: string
  partId: string
  defaultMileage: number
  record: MaintenanceRecord | null
  onClose: () => void
}) {
  const [title, setTitle] = useState(record?.title ?? '')
  const mileageInput = useIosNumericInput('integer')
  const priceInput = useIosNumericInput('integer')
  const [maintenanceDate, setMaintenanceDate] = useState(record?.maintenanceDate ?? today())
  const [price, setPrice] = useState(record ? String(record.price) : '')
  const [mileage, setMileage] = useState(
    record?.mileage != null ? String(record.mileage) : String(defaultMileage),
  )
  const [memo, setMemo] = useState(record?.memo ?? '')
  const [images, setImages] = useState<string[]>(record?.images ?? [])

  async function handleSave() {
    await saveMaintenanceRecord({
      id: record?.id,
      bikeId,
      maintenancePartId: partId,
      title: title.trim(),
      maintenanceDate,
      price: Number(price) || 0,
      mileage: mileage === '' ? null : Number(mileage),
      memo: memo.trim(),
      images,
    })
    onClose()
  }

  async function handleDelete() {
    if (!record) return
    if (!confirm('この整備記録を削除しますか？')) return
    await deleteMaintenanceRecord(record.id)
    onClose()
  }

  return (
    <Modal title={record ? '整備記録を編集' : '整備を記録'} onClose={onClose}>
      <div className="field">
        <label>タイトル</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: オイル交換（10W-40）"
        />
      </div>
      <div className="row-2">
        <div className="field">
          <label>実施日</label>
          <input type="date" value={maintenanceDate} onChange={(e) => setMaintenanceDate(e.target.value)} />
        </div>
        <div className="field">
          <label>走行距離 (km)</label>
          <input
            type="number"
            inputMode={mileageInput.inputMode}
            onFocus={mileageInput.onFocus}
            onBlur={mileageInput.onBlur}
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>費用 (円)</label>
        <input type="number" inputMode={priceInput.inputMode} onFocus={priceInput.onFocus} onBlur={priceInput.onBlur} value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <ImagePicker images={images} onChange={setImages} />
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

// ---------- 部品設定 ----------
function PartSettingsModal({
  part,
  typeId,
  onClose,
}: {
  part: MaintenancePart | null
  typeId: string
  onClose: () => void
}) {
  const intervalDaysInput = useIosNumericInput('integer')
  const intervalDistanceInput = useIosNumericInput('integer')
  const [name, setName] = useState(part?.name ?? '')
  const [intervalDays, setIntervalDays] = useState(part?.intervalDays != null ? String(part.intervalDays) : '')
  const [intervalDistance, setIntervalDistance] = useState(
    part?.intervalDistance != null ? String(part.intervalDistance) : '',
  )
  const [notification, setNotification] = useState(part?.notification ?? true)

  async function handleSave() {
    if (!name.trim()) {
      alert('部品名を入力してください。')
      return
    }
    const payload = {
      name: name.trim(),
      intervalDays: intervalDays === '' ? null : Number(intervalDays),
      intervalDistance: intervalDistance === '' ? null : Number(intervalDistance),
      notification,
    }
    if (part) {
      await updateMaintenancePart(part.id, payload)
    } else {
      await addMaintenancePart({ maintenanceTypeId: typeId, ...payload })
    }
    onClose()
  }

  async function handleDelete() {
    if (!part) return
    if (!confirm('この部品と、その整備記録をすべて削除しますか？')) return
    await deleteMaintenancePart(part.id)
    onClose()
  }

  return (
    <Modal title={part ? '部品設定' : '部品を追加'} onClose={onClose}>
      <div className="field">
        <label>部品名 *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: エンジンオイル" />
      </div>
      <div className="row-2">
        <div className="field">
          <label>推奨交換間隔 (日)</label>
          <input
            type="number"
            inputMode={intervalDaysInput.inputMode}
            onFocus={intervalDaysInput.onFocus}
            onBlur={intervalDaysInput.onBlur}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            placeholder="未設定可"
          />
        </div>
        <div className="field">
          <label>推奨交換間隔 (km)</label>
          <input
            type="number"
            inputMode={intervalDistanceInput.inputMode}
            onFocus={intervalDistanceInput.onFocus}
            onBlur={intervalDistanceInput.onBlur}
            value={intervalDistance}
            onChange={(e) => setIntervalDistance(e.target.value)}
            placeholder="未設定可"
          />
        </div>
      </div>
      <div className="checkbox-row">
        <input
          id="notif"
          type="checkbox"
          checked={notification}
          onChange={(e) => setNotification(e.target.checked)}
        />
        <label htmlFor="notif" style={{ margin: 0 }}>
          交換時期が近づいたら通知する
        </label>
      </div>
      <button className="btn btn-primary btn-block" onClick={handleSave}>
        保存する
      </button>
      {part && (
        <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={handleDelete}>
          部品を削除
        </button>
      )}
    </Modal>
  )
}
