import type { RefuelRecord } from '../types'
import { yearMonth } from './format'

/** 1記録の走行距離（km）。 */
export function recordDistance(r: RefuelRecord): number {
  return Math.max(0, r.totalMileage - r.previousMileage)
}

/** 1記録の燃費（km/L）。給油量が0なら null。フォームプレビュー用。 */
export function recordFuelEconomy(r: RefuelRecord): number | null {
  if (r.refuelAmount <= 0) return null
  return recordDistance(r) / r.refuelAmount
}

/**
 * 満タン法による燃費（km/L）。
 * - isFullTank=false: 燃費計算しない → null
 * - isFullTank=true: 前回満タン給油の totalMileage を距離アンカーとし、
 *   そこから今回まで includeInFuelEconomy=true の給油量のみ積算して算出する。
 *   前回満タン給油がない場合は単記録フォールバック（自走行距離÷給油量）。
 *
 * allRecords は同一バイクの全給油記録を渡す。
 * ソートは totalMileage 昇順（日付より走行距離が物理的順序を正確に反映する）。
 * includeInFuelEconomy=false の満タン記録も距離アンカーとして使用する。
 */
export function recordFuelEconomyWithHistory(
  record: RefuelRecord,
  allRecords: RefuelRecord[],
): number | null {
  if (!record.isFullTank) return null

  // totalMileage 昇順でソート。日付より走行距離が物理的順序を正確に反映する。
  // 同値の場合は refuelDate をタイブレークに使用。
  const sorted = [...allRecords].sort(
    (a, b) => a.totalMileage - b.totalMileage || a.refuelDate.localeCompare(b.refuelDate),
  )

  const idx = sorted.findIndex((r) => r.id === record.id)
  if (idx < 0) return null

  // includeInFuelEconomy に関わらず直前の満タン記録を距離アンカーとして探す。
  // 計算対象外の満タン記録も「その時点でタンクが満タンだった」事実は変わらないため、
  // 次の満タン給油の距離基準点として使用する。
  let anchorMileage: number | null = null
  let anchorIdx = -1
  for (let i = idx - 1; i >= 0; i--) {
    if (sorted[i].isFullTank) {
      anchorMileage = sorted[i].totalMileage
      anchorIdx = i
      break
    }
  }

  if (anchorMileage === null) {
    // 前回満タンなし → 単記録フォールバック
    const d = recordDistance(record)
    return d > 0 && record.refuelAmount > 0 ? d / record.refuelAmount : null
  }

  // アンカーの直後から今回の記録（inclusive）まで、
  // includeInFuelEconomy=true の給油量のみ積算する。
  let accFuel = 0
  for (let i = anchorIdx + 1; i <= idx; i++) {
    if (sorted[i].includeInFuelEconomy) {
      accFuel += sorted[i].refuelAmount
    }
  }

  if (accFuel <= 0) return null
  const distance = record.totalMileage - anchorMileage
  if (distance <= 0) return null
  return distance / accFuel
}

/** 1Lあたりの単価（円/L）。 */
export function pricePerLiter(r: RefuelRecord): number | null {
  if (r.refuelAmount <= 0) return null
  return r.price / r.refuelAmount
}

/**
 * 平均燃費（km/L）を「総走行距離 ÷ 総給油量」で算出する。
 * includeInFuelEconomy が true の記録のみを対象とする。
 */
export function averageFuelEconomy(records: RefuelRecord[]): number | null {
  const target = records.filter((r) => r.includeInFuelEconomy)
  let distance = 0
  let fuel = 0
  for (const r of target) {
    distance += recordDistance(r)
    fuel += r.refuelAmount
  }
  if (fuel <= 0) return null
  return distance / fuel
}

/** 当月（YYYY-MM）の記録に絞る。 */
export function filterByMonth(records: RefuelRecord[], ym: string): RefuelRecord[] {
  return records.filter((r) => yearMonth(r.refuelDate) === ym)
}

/**
 * 給油記録を降順ソートする。
 * 日付が同じ場合は給油時刻の降順、それも同じ場合は走行距離の降順を第3キーとする。
 */
export function sortRefuelRecords(records: RefuelRecord[]): RefuelRecord[] {
  return [...records].sort((a, b) => {
    const dateDiff = b.refuelDate.localeCompare(a.refuelDate)
    if (dateDiff !== 0) return dateDiff
    const timeDiff = (b.refuelTime ?? '10:00').localeCompare(a.refuelTime ?? '10:00')
    if (timeDiff !== 0) return timeDiff
    return recordDistance(b) - recordDistance(a)
  })
}

/** 給油日時の昇順に並べた燃費グラフ用データ。満タン給油のみプロットする。 */
export function fuelEconomyChartData(records: RefuelRecord[]) {
  return [...records]
    .filter((r) => r.includeInFuelEconomy && r.isFullTank)
    .sort(
      (a, b) =>
        a.refuelDate.localeCompare(b.refuelDate) ||
        (a.refuelTime ?? '10:00').localeCompare(b.refuelTime ?? '10:00'),
    )
    .map((r) => ({
      date: r.refuelDate,
      economy: recordFuelEconomyWithHistory(r, records),
      pricePerLiter: pricePerLiter(r),
    }))
    .filter((d) => d.economy != null)
}