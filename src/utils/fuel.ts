import type { RefuelRecord } from '../types'
import { yearMonth } from './format'

/** 1記録の走行距離（km）。 */
export function recordDistance(r: RefuelRecord): number {
  return Math.max(0, r.totalMileage - r.previousMileage)
}

/** 1記録の燃費（km/L）。給油量が0なら null。 */
export function recordFuelEconomy(r: RefuelRecord): number | null {
  if (r.refuelAmount <= 0) return null
  return recordDistance(r) / r.refuelAmount
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

/** 給油日の昇順に並べた燃費グラフ用データ。 */
export function fuelEconomyChartData(records: RefuelRecord[]) {
  return [...records]
    .filter((r) => r.includeInFuelEconomy)
    .sort((a, b) => a.refuelDate.localeCompare(b.refuelDate))
    .map((r) => ({
      date: r.refuelDate,
      economy: recordFuelEconomy(r),
      pricePerLiter: pricePerLiter(r),
    }))
    .filter((d) => d.economy != null)
}
