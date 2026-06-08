/**
 * 画像ファイルを読み込み、長辺 maxSize px に縮小した JPEG の data URL を返す。
 * IndexedDB / エクスポート JSON の肥大化を抑えるため保存時に縮小する。
 */
export async function fileToResizedDataUrl(file: File, maxSize = 1280, quality = 0.8): Promise<string> {
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  let { width, height } = img
  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 複数ファイルをまとめて縮小。 */
export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  const arr = Array.from(files)
  return Promise.all(arr.map((f) => fileToResizedDataUrl(f)))
}
