import { useMemo, useState } from 'react'
import { useIosNumericInput } from '../hooks/useIosNumericInput'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useHeaderTitle } from '../components/Layout'
import Modal from '../components/Modal'
import ImagePicker from '../components/ImagePicker'
import {
  addInsuranceType,
  deleteInsuranceRecord,
  deleteInsuranceType,
  saveInsuranceRecord,
  updateInsuranceType,
} from '../db/repo'
import { diffDays, formatDate, formatYen, today } from '../utils/format'
import type { InsuranceRecord, InsuranceType } from '../types'

export default function InsurancePage() {
  const { bikeId } = useParams()
  useHeaderTitle('保険')
  const types = useLiveQuery(() => db.insuranceTypes.orderBy('name').toArray(), [])
  const records = useLiveQuery(
    () => (bikeId ? db.insuranceRecords.where('bikeId').equals(bikeId).toArray() : []),
    [bikeId],
  )

  const [openType, setOpenType] = useState<InsuranceType | null>(null)

  const recordsByType = useMemo(() => {
    const map = new Map<string, InsuranceRecord[]>()
    for (const r of records ?? []) {
      const arr = map.get(r.insuranceTypeId) ?? []
      arr.push(r)
      map.set(r.insuranceTypeId, arr)
    }
    return map
  }, [records])

  function latestFinish(typeId: string): string | null {
    const arr = recordsByType.get(typeId)
    if (!arr || arr.length === 0) return null
    return [...arr].sort((a, b) => b.finishDate.localeCompare(a.finishDate))[0].finishDate
  }

  async function handleAddType() {
    const name = prompt('追加する保険の名前（例: 車両保険）')
    if (name && name.trim()) await addInsuranceType(name)
  }

  if (!bikeId || !types) return null

  return (
    <>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        保険をタップすると契約内容の確認・登録ができます。
      </p>

      <div className="card">
        {types.length === 0 && <div className="empty">保険種別がありません。</div>}
        {types.map((t) => {
          const finish = latestFinish(t.id)
          const d = finish ? diffDays(new Date(finish), new Date()) : null
          let badge = null
          if (d != null) {
            if (d < 0) badge = <span className="badge badge-overdue">期限切れ</span>
            else if (d <= 30) badge = <span className="badge badge-soon">あと{d}日</span>
            else badge = <span className="badge badge-ok">有効</span>
          }
          return (
            <div className="tap-row" key={t.id} onClick={() => setOpenType(t)}>
              <div>
                <div className="title">
                  {t.name} {badge}
                </div>
                <div className="sub muted">{finish ? `満了 ${formatDate(finish)}` : '未登録'}</div>
              </div>
              <span className="chevron">›</span>
            </div>
          )
        })}
      </div>

      <button className="btn btn-block" onClick={handleAddType}>
        ＋ 保険を追加
      </button>

      {openType && (
        <InsuranceRecordsModal
          bikeId={bikeId}
          type={openType}
          records={recordsByType.get(openType.id) ?? []}
          onClose={() => setOpenType(null)}
        />
      )}
    </>
  )
}

function InsuranceRecordsModal({
  bikeId,
  type,
  records,
  onClose,
}: {
  bikeId: string
  type: InsuranceType
  records: InsuranceRecord[]
  onClose: () => void
}) {
  const [editing, setEditing] = useState<InsuranceRecord | 'new' | null>(null)
  const [notification, setNotification] = useState(type.notification)
  const sorted = [...records].sort((a, b) => b.finishDate.localeCompare(a.finishDate))

  async function toggleNotif(v: boolean) {
    setNotification(v)
    await updateInsuranceType(type.id, { notification: v })
  }

  async function handleDeleteType() {
    if (!confirm(`「${type.name}」と、その契約記録をすべて削除しますか？`)) return
    await deleteInsuranceType(type.id)
    onClose()
  }

  return (
    <Modal title={type.name} onClose={onClose}>
      <div className="checkbox-row">
        <input
          id="ins-notif"
          type="checkbox"
          checked={notification}
          onChange={(e) => toggleNotif(e.target.checked)}
        />
        <label htmlFor="ins-notif" style={{ margin: 0 }}>
          満了が近づいたら通知する
        </label>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">まだ契約記録がありません。</div>
      ) : (
        sorted.map((r) => (
          <div
            className="timeline-item"
            key={r.id}
            style={{ cursor: 'pointer' }}
            onClick={() => setEditing(r)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.name || type.name}</strong>
              <span className="muted">{formatYen(r.price)}</span>
            </div>
            <div className="sub muted">
              {formatDate(r.startDate)} 〜 {formatDate(r.finishDate)}
            </div>
            {r.url && (
              <div className="sub">
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                  契約ページを開く
                </a>
              </div>
            )}
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
        ＋ 契約を登録
      </button>
      <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={handleDeleteType}>
        この保険種別を削除
      </button>

      {editing && (
        <InsuranceRecordForm
          bikeId={bikeId}
          typeId={type.id}
          typeName={type.name}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  )
}

function InsuranceRecordForm({
  bikeId,
  typeId,
  typeName,
  record,
  onClose,
}: {
  bikeId: string
  typeId: string
  typeName: string
  record: InsuranceRecord | null
  onClose: () => void
}) {
  const [name, setName] = useState(record?.name ?? '')
  const priceInput = useIosNumericInput('integer')
  const [price, setPrice] = useState(record ? String(record.price) : '')
  const [startDate, setStartDate] = useState(record?.startDate ?? today())
  const [finishDate, setFinishDate] = useState(record?.finishDate ?? today())
  const [url, setUrl] = useState(record?.url ?? '')
  const [memo, setMemo] = useState(record?.memo ?? '')
  const [images, setImages] = useState<string[]>(record?.images ?? [])

  async function handleSave() {
    await saveInsuranceRecord({
      id: record?.id,
      bikeId,
      insuranceTypeId: typeId,
      name: name.trim(),
      price: Number(price) || 0,
      startDate,
      finishDate,
      url: url.trim(),
      memo: memo.trim(),
      images,
    })
    onClose()
  }

  async function handleDelete() {
    if (!record) return
    if (!confirm('この契約記録を削除しますか？')) return
    await deleteInsuranceRecord(record.id)
    onClose()
  }

  return (
    <Modal title={record ? `${typeName} を編集` : `${typeName} を登録`} onClose={onClose}>
      <div className="field">
        <label>契約名・保険会社名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: ○○損保 任意保険"
        />
      </div>
      <div className="row-2">
        <div className="field">
          <label>開始日</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>満了日</label>
          <input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>保険料 (円)</label>
        <input type="number" inputMode={priceInput.inputMode} onFocus={priceInput.onFocus} onBlur={priceInput.onBlur} value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="field">
        <label>契約URL</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
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
