/** UUID 生成（crypto.randomUUID 優先、フォールバックあり）。 */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 現在時刻の ISO 文字列。 */
export function now(): string {
  return new Date().toISOString()
}

/** 今日の日付（YYYY-MM-DD）。 */
export function today(): string {
  return toDateInput(new Date())
}

/** Date -> 'YYYY-MM-DD'（input[type=date] 用、ローカル時刻）。 */
export function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' 等を 'YYYY年M月D日' に整形。空なら '-'。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 円表記。 */
export function formatYen(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '-'
  return `¥${Math.round(v).toLocaleString('ja-JP')}`
}

/** 数値を小数桁付きで整形。 */
export function formatNum(v: number | null | undefined, digits = 2): string {
  if (v == null || isNaN(v) || !isFinite(v)) return '-'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** 2つの日付の差（日数）。a - b。 */
export function diffDays(a: Date, b: Date): number {
  const ms = a.setHours(0, 0, 0, 0) - new Date(b).setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}

/** YYYY-MM（当月判定用）。 */
export function yearMonth(iso: string): string {
  return iso.slice(0, 7)
}
