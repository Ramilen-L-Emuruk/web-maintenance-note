import { describe, it, expect } from 'vitest'
import {
  recordDistance,
  recordFuelEconomy,
  recordFuelEconomyWithHistory,
  averageFuelEconomy,
} from './fuel'
import type { RefuelRecord } from '../types'

// ── テスト用ヘルパー ──────────────────────────────────────────────────────────

let seq = 0
function makeRecord(overrides: Partial<RefuelRecord> = {}): RefuelRecord {
  seq++
  return {
    id: `r${seq}`,
    bikeId: 'bike1',
    refuelDate: `2024-01-${String(seq).padStart(2, '0')}`,
    previousMileage: 0,
    totalMileage: 100,
    price: 0,
    refuelAmount: 10,
    memo: '',
    isFullTank: true,
    includeInFuelEconomy: true,
    createdDate: '2024-01-01T00:00:00.000Z',
    updatedDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ── recordDistance ────────────────────────────────────────────────────────────

describe('recordDistance', () => {
  it('総走行距離の差分を返す', () => {
    const r = makeRecord({ previousMileage: 1000, totalMileage: 1200 })
    expect(recordDistance(r)).toBe(200)
  })

  it('前回より小さい場合は 0 を返す', () => {
    const r = makeRecord({ previousMileage: 1200, totalMileage: 1000 })
    expect(recordDistance(r)).toBe(0)
  })
})

// ── recordFuelEconomy（単体・フォームプレビュー用） ────────────────────────────

describe('recordFuelEconomy', () => {
  it('走行距離 / 給油量 を返す', () => {
    const r = makeRecord({ previousMileage: 1000, totalMileage: 1300, refuelAmount: 10 })
    expect(recordFuelEconomy(r)).toBeCloseTo(30)
  })

  it('給油量が 0 なら null を返す', () => {
    const r = makeRecord({ refuelAmount: 0 })
    expect(recordFuelEconomy(r)).toBeNull()
  })
})

// ── recordFuelEconomyWithHistory（満タン法） ──────────────────────────────────

describe('recordFuelEconomyWithHistory', () => {
  it('非満タン給油は null を返す', () => {
    const r = makeRecord({ isFullTank: false })
    expect(recordFuelEconomyWithHistory(r, [r])).toBeNull()
  })

  it('前回の満タン給油がない場合はその記録単体で計算する', () => {
    // previousMileage=1000, totalMileage=1200, refuelAmount=10 → 200/10 = 20 km/L
    const r = makeRecord({ isFullTank: true, previousMileage: 1000, totalMileage: 1200, refuelAmount: 10 })
    expect(recordFuelEconomyWithHistory(r, [r])).toBeCloseTo(20)
  })

  it('前回満タン後に満タン → (今回距離 - 前回距離) / 今回燃料', () => {
    // A: 満タン基準（1000→1200km, 10L）
    // B: 満タン計測（1200→1500km, 8L）
    // 燃費 = (1500-1200) / 8 = 37.5 km/L
    const a = makeRecord({ isFullTank: true, previousMileage: 1000, totalMileage: 1200, refuelAmount: 10 })
    const b = makeRecord({ isFullTank: true, previousMileage: 1200, totalMileage: 1500, refuelAmount: 8 })
    expect(recordFuelEconomyWithHistory(b, [a, b])).toBeCloseTo(37.5)
  })

  it('間に非満タン給油が挟まる場合は燃料を累積する', () => {
    // A: 満タン基準（1000→1200km, 10L）
    // B: 非満タン（1200→1350km, 3L）
    // C: 満タン計測（1350→1500km, 8L）
    // 燃費 = (1500-1200) / (3+8) = 300/11 ≈ 27.27 km/L
    const a = makeRecord({ isFullTank: true,  previousMileage: 1000, totalMileage: 1200, refuelAmount: 10 })
    const b = makeRecord({ isFullTank: false, previousMileage: 1200, totalMileage: 1350, refuelAmount: 3 })
    const c = makeRecord({ isFullTank: true,  previousMileage: 1350, totalMileage: 1500, refuelAmount: 8 })
    expect(recordFuelEconomyWithHistory(c, [a, b, c])).toBeCloseTo(300 / 11)
  })

  it('非満タンが複数連続する場合もすべて累積する', () => {
    // A: 満タン基準（0→100km, 5L）
    // B: 非満タン（100→200km, 2L）
    // C: 非満タン（200→300km, 2L）
    // D: 満タン計測（300→400km, 3L）
    // 燃費 = (400-100) / (2+2+3) = 300/7 ≈ 42.86 km/L
    const a = makeRecord({ isFullTank: true,  previousMileage: 0,   totalMileage: 100, refuelAmount: 5 })
    const b = makeRecord({ isFullTank: false, previousMileage: 100, totalMileage: 200, refuelAmount: 2 })
    const c = makeRecord({ isFullTank: false, previousMileage: 200, totalMileage: 300, refuelAmount: 2 })
    const d = makeRecord({ isFullTank: true,  previousMileage: 300, totalMileage: 400, refuelAmount: 3 })
    expect(recordFuelEconomyWithHistory(d, [a, b, c, d])).toBeCloseTo(300 / 7)
  })

  it('満タン→満タン→満タン: 各区間でリセットされる', () => {
    // A: 満タン基準（0→200km, 10L）
    // B: 満タン計測1（200→500km, 12L）→ 300/12 = 25 km/L
    // C: 満タン計測2（500→700km, 8L） → 200/8  = 25 km/L
    const a = makeRecord({ isFullTank: true, previousMileage: 0,   totalMileage: 200, refuelAmount: 10 })
    const b = makeRecord({ isFullTank: true, previousMileage: 200, totalMileage: 500, refuelAmount: 12 })
    const c = makeRecord({ isFullTank: true, previousMileage: 500, totalMileage: 700, refuelAmount: 8 })
    expect(recordFuelEconomyWithHistory(b, [a, b, c])).toBeCloseTo(25)
    expect(recordFuelEconomyWithHistory(c, [a, b, c])).toBeCloseTo(25)
  })

  it('includeInFuelEconomy=false の記録は集計から除外する', () => {
    // A: 満タン基準
    // B: 非満タン（除外）→ 燃料が累積されない
    // C: 満タン計測
    // 燃費 = (350-100) / 8 = 250/8 = 31.25 km/L（B の 3L は除外）
    const a = makeRecord({ isFullTank: true,  previousMileage: 0,   totalMileage: 100, refuelAmount: 5  })
    const b = makeRecord({ isFullTank: false, previousMileage: 100, totalMileage: 200, refuelAmount: 3, includeInFuelEconomy: false })
    const c = makeRecord({ isFullTank: true,  previousMileage: 200, totalMileage: 350, refuelAmount: 8  })
    expect(recordFuelEconomyWithHistory(c, [a, b, c])).toBeCloseTo(250 / 8)
  })

  it('allRecords に対象レコードが含まれない場合は null を返す', () => {
    const a = makeRecord({ isFullTank: true })
    const b = makeRecord({ isFullTank: true })
    expect(recordFuelEconomyWithHistory(b, [a])).toBeNull()
  })
})

// ── averageFuelEconomy ────────────────────────────────────────────────────────

describe('averageFuelEconomy', () => {
  it('全記録の総走行距離 / 総給油量を返す', () => {
    const a = makeRecord({ previousMileage: 0,   totalMileage: 200, refuelAmount: 10 })
    const b = makeRecord({ previousMileage: 200, totalMileage: 500, refuelAmount: 12 })
    // (200 + 300) / (10 + 12) = 500/22 ≈ 22.73
    expect(averageFuelEconomy([a, b])).toBeCloseTo(500 / 22)
  })

  it('空配列なら null を返す', () => {
    expect(averageFuelEconomy([])).toBeNull()
  })

  it('includeInFuelEconomy=false の記録は除外する', () => {
    const a = makeRecord({ previousMileage: 0,   totalMileage: 200, refuelAmount: 10 })
    const b = makeRecord({ previousMileage: 200, totalMileage: 400, refuelAmount: 10, includeInFuelEconomy: false })
    // b が除外されるので 200/10 = 20 km/L
    expect(averageFuelEconomy([a, b])).toBeCloseTo(20)
  })
})
