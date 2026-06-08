import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addBike, addMaker, addShop, deleteBike, updateBike } from '../db/repo'
import { useHeaderTitle } from '../components/Layout'
import ComboBox from '../components/ComboBox'
import ImagePicker from '../components/ImagePicker'

export default function BikeFormPage() {
  const { bikeId } = useParams()
  const isEdit = !!bikeId
  useHeaderTitle(isEdit ? 'バイクを編集' : 'バイクを新規登録')
  const navigate = useNavigate()

  const makers = useLiveQuery(() => db.makers.orderBy('name').toArray(), [])
  const shops = useLiveQuery(() => db.shops.orderBy('name').toArray(), [])
  const existing = useLiveQuery(() => (bikeId ? db.bikes.get(bikeId) : undefined), [bikeId])

  const [makerName, setMakerName] = useState('')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [frameNumber, setFrameNumber] = useState('')
  const [displacement, setDisplacement] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [mileageAtRegistration, setMileageAtRegistration] = useState('')
  const [totalMileage, setTotalMileage] = useState('')
  const [inspectionExpiryDate, setInspectionExpiryDate] = useState('')
  const [memo, setMemo] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [archived, setArchived] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 編集時に既存値をロード
  useEffect(() => {
    if (existing && !loaded) {
      const m = makers?.find((x) => x.id === existing.makerId)
      const s = shops?.find((x) => x.id === existing.purchaseShopId)
      setMakerName(m?.name ?? '')
      setName(existing.name)
      setNickname(existing.nickname)
      setFrameNumber(existing.frameNumber)
      setDisplacement(existing.displacement ? String(existing.displacement) : '')
      setShopName(s?.name ?? '')
      setShopAddress(s?.address ?? '')
      setPurchaseDate(existing.purchaseDate ?? '')
      setMileageAtRegistration(String(existing.mileageAtRegistration))
      setTotalMileage(String(existing.totalMileage))
      setInspectionExpiryDate(existing.inspectionExpiryDate ?? '')
      setMemo(existing.memo)
      setImages(existing.images)
      setArchived(existing.archived)
      setLoaded(true)
    }
  }, [existing, makers, shops, loaded])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!makerName.trim()) {
      alert('メーカーを入力してください。')
      return
    }
    if (!name.trim()) {
      alert('車名を入力してください。')
      return
    }
    const makerId = await addMaker(makerName)
    let purchaseShopId: string | null = null
    if (shopName.trim()) {
      purchaseShopId = await addShop({ name: shopName, address: shopAddress.trim() })
    }

    const payload = {
      makerId,
      name: name.trim(),
      nickname: nickname.trim(),
      frameNumber: frameNumber.trim(),
      displacement: Number(displacement) || 0,
      purchaseShopId,
      purchaseDate: purchaseDate || null,
      mileageAtRegistration: Number(mileageAtRegistration) || 0,
      totalMileage: Number(totalMileage) || Number(mileageAtRegistration) || 0,
      images,
      inspectionExpiryDate: inspectionExpiryDate || null,
      memo: memo.trim(),
      archived,
    }

    if (isEdit && bikeId) {
      await updateBike(bikeId, payload)
      navigate(`/bikes/${bikeId}`)
    } else {
      const id = await addBike(payload)
      navigate(`/bikes/${id}`)
    }
  }

  async function handleDelete() {
    if (!bikeId) return
    if (!confirm('このバイクと関連する給油・メンテ・保険の記録をすべて削除します。よろしいですか？')) return
    await deleteBike(bikeId)
    navigate('/')
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <ComboBox
          label="メーカー *"
          value={makerName}
          options={(makers ?? []).map((m) => m.name)}
          onChange={setMakerName}
          placeholder="例: Honda（未登録なら自動登録）"
          hint="一覧から選ぶか、新しいメーカー名を入力すると登録されます。"
        />
        <div className="field">
          <label>車名 *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: CB400SF" />
        </div>
        <div className="field">
          <label>ニックネーム</label>
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例: 相棒" />
        </div>
        <div className="row-2">
          <div className="field">
            <label>排気量 (cc)</label>
            <input
              type="number"
              inputMode="numeric"
              value={displacement}
              onChange={(e) => setDisplacement(e.target.value)}
              placeholder="400"
            />
          </div>
          <div className="field">
            <label>車体番号</label>
            <input type="text" value={frameNumber} onChange={(e) => setFrameNumber(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">購入情報</div>
        <ComboBox
          label="購入店舗"
          value={shopName}
          options={(shops ?? []).map((s) => s.name)}
          onChange={(v) => {
            setShopName(v)
            const s = shops?.find((x) => x.name === v)
            if (s) setShopAddress(s.address)
          }}
          placeholder="登録済みから選択 / 新規入力"
        />
        <div className="field">
          <label>店舗住所</label>
          <input
            type="text"
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="新規店舗の場合に入力"
          />
        </div>
        <div className="field">
          <label>購入日</label>
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-title">走行距離・車検</div>
        <div className="row-2">
          <div className="field">
            <label>登録時の走行距離 (km)</label>
            <input
              type="number"
              inputMode="numeric"
              value={mileageAtRegistration}
              onChange={(e) => setMileageAtRegistration(e.target.value)}
            />
          </div>
          <div className="field">
            <label>現在の走行距離 (km)</label>
            <input
              type="number"
              inputMode="numeric"
              value={totalMileage}
              onChange={(e) => setTotalMileage(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>車検満了日</label>
          <input
            type="date"
            value={inspectionExpiryDate}
            onChange={(e) => setInspectionExpiryDate(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <ImagePicker images={images} onChange={setImages} />
        <div className="field">
          <label>メモ</label>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        {isEdit && (
          <div className="checkbox-row">
            <input
              id="archived"
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            <label htmlFor="archived" style={{ margin: 0 }}>
              アーカイブする（手放したバイク等）
            </label>
          </div>
        )}
      </div>

      <button type="submit" className="btn btn-primary btn-block">
        {isEdit ? '保存する' : '登録する'}
      </button>
      {isEdit && (
        <button type="button" className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={handleDelete}>
          このバイクを削除
        </button>
      )}
    </form>
  )
}
