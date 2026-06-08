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
 * - isFullTank=true: 前回満タン給油の totalMileage を基準に、
 *   そこから今回まで（途中の非満タン分の燃料も含む）で算出する。
 *   前回の満タン給油がない場合は null。
 *
 * allRecords は同一バイクの全給油記録を渡す。
 * includeInFuelEconomy=false の記録は集計から除外する。
 */
export function recordFuelEconomyWithHistory(
  record: RefuelRecord,
  allRecords: RefuelRecord[],
): number | null {
  if (!record.isFullTank) return null

  const sorted = [...allRecords]
    .filter((r) => r.includeInFuelEconomy)
    .sort((a, b) => a.refuelDate.localeCompare(b.refuelDate))

  const idx = sorted.findIndex((r) => r.id === record.id)
  if (idx < 0) return null

  // 前回満タン給油の totalMileage と、そこ以降（今回を含む）の累積燃料を求める
  let prevFullTankMileage: number | null = null
  let accFuel = 0

  for (let i = 0; i <= idx; i++) {
    const r = sorted[i]
    if (r.isFullTank && i < idx) {
      // 対象より前の満タン給油 → 基準をリセット
      prevFullTankMileage = r.totalMileage
      accFuel = 0
    } else {
      accFuel += r.refuelAmount
    }
  }

  // 前回満タン給油がない場合はこの記録単体で計算する
  if (prevFullTankMileage === null) {
    const d = recordDistance(record)
    return d > 0 && accFuel > 0 ? d / accFuel : null
  }
  if (accFuel <= 0) return null
  const distance = record.totalMileage - prevFullTankMileage
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
 * 日付が同じ場合は走行距離の降順を第2キーとする。
 */
export function sortRefuelRecords(records: RefuelRecord[]): RefuelRecord[] {
  return [...records].sort((a, b) => {
    const dateDiff = b.refuelDate.localeCompare(a.refuelDate)
    if (dateDiff !== 0) return dateDiff
    return recordDistance(b) - recordDistance(a)
  })
}

/** 給油日の昇順に並べた燃費グラフ用データ。満タン給油のみプロットする。 */
export function fuelEconomyChartData(records: RefuelRecord[]) {
  return [...records]
    .filter((r) => r.includeInFuelEconomy && r.isFullTank)
    .sort((a, b) => a.refuelDate.localeCompare(b.refuelDate))
    .map((r) => ({
      date: r.refuelDate,
      economy: recordFuelEconomyWithHistory(r, records),
      pricePerLiter: pricePerLiter(r),
    }))
    .filter((d) => d.economy != null)
}