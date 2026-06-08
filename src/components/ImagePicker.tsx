import { useRef, useState } from 'react'
import { filesToDataUrls } from '../utils/image'

interface Props {
  label?: string
  images: string[]
  onChange: (images: string[]) => void
}

/** 複数画像の追加・プレビュー・削除。保存時に縮小される。 */
export default function ImagePicker({ label = '画像', images, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setLoading(true)
    try {
      const urls = await filesToDataUrls(files)
      onChange([...images, ...urls])
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
      {loading && <div className="hint">読み込み中…</div>}
      {images.length > 0 && (
        <div className="thumb-strip">
          {images.map((src, i) => (
            <div className="thumb-wrap" key={i}>
              <img src={src} alt="" />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, idx) => idx !== i))}
                aria-label="削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
