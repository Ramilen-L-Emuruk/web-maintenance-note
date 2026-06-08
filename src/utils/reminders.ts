import type {
  Bike,
  InsuranceRecord,
  InsuranceType,
  MaintenancePart,
  MaintenanceRecord,
} from '../types'
import { diffDays } from './format'

export type ReminderCategory = 'inspection' | 'insurance' | 'maintenance'
export type ReminderSeverity = 'overdue' | 'soon'

export interface Reminder {
  id: string
  bikeId: string
  bikeName: string
  category: ReminderCategory
  severity: ReminderSeverity
  title: string
  detail: string
  /** 期限日（ある場合）。 */
  dueDate?: string
}

const DAY_THRESHOLD = 30 // 期限のn日前から「soon」
const INSPECTION_THRESHOLD = 60 // 車検は早めに
const DISTANCE_THRESHOLD_RATIO = 0.9 // 距離間隔の90%到達で「soon」

interface BuildArgs {
  bikes: Bike[]
  insuranceTypes: InsuranceType[]
  insuranceRecords: InsuranceRecord[]
  maintenanceParts: MaintenancePart[]
  maintenanceRecords: MaintenanceRecord[]
}

/** 期限・点検時期が近い/超過しているリマインドを算出する。 */
export function buildReminders(args: BuildArgs, ref: Date = new Date()): Reminder[] {
  const { bikes, insuranceTypes, insuranceRecords, maintenanceParts, maintenanceRecords } = args
  const result: Reminder[] = []
  const activeBikes = bikes.filter((b) => !b.archived)
  const bikeName = (b: Bike) => b.nickname || b.name

  // ---- 車検 ----
  for (const bike of activeBikes) {
    if (!bike.inspectionExpiryDate) continue
    const d = diffDays(new Date(bike.inspectionExpiryDate), ref)
    if (d <= INSPECTION_THRESHOLD) {
      result.push({
        id: `inspection-${bike.id}`,
        bikeId: bike.id,
        bikeName: bikeName(bike),
        category: 'inspection',
        severity: d < 0 ? 'overdue' : 'soon',
        title: '車検',
        detail: d < 0 ? `${-d}日超過` : `あと${d}日`,
        dueDate: bike.inspectionExpiryDate,
      })
    }
  }

  // ---- 保険 ----
  const notifTypeIds = new Set(insuranceTypes.filter((t) => t.notification).map((t) => t.id))
  // バイク×種別ごとに、最も新しい満了日のレコードを採用
  const latestByKey = new Map<string, InsuranceRecord>()
  for (const r of insuranceRecords) {
    const key = `${r.bikeId}:${r.insuranceTypeId}`
    const cur = latestByKey.get(key)
    if (!cur || r.finishDate > cur.finishDate) latestByKey.set(key, r)
  }
  for (const r of latestByKey.values()) {
    if (!notifTypeIds.has(r.insuranceTypeId)) continue
    const bike = activeBikes.find((b) => b.id === r.bikeId)
    if (!bike) continue
    const d = diffDays(new Date(r.finishDate), ref)
    if (d <= DAY_THRESHOLD) {
      const typeName = insuranceTypes.find((t) => t.id === r.insuranceTypeId)?.name ?? '保険'
      result.push({
        id: `insurance-${r.id}`,
        bikeId: bike.id,
        bikeName: bikeName(bike),
        category: 'insurance',
        severity: d < 0 ? 'overdue' : 'soon',
        title: typeName,
        detail: d < 0 ? `${-d}日超過` : `あと${d}日で満了`,
        dueDate: r.finishDate,
      })
    }
  }

  // ---- メンテナンス（部品ごとの推奨間隔）----
  const notifParts = maintenanceParts.filter((p) => p.notification)
  for (const bike of activeBikes) {
    for (const part of notifParts) {
      if (part.intervalDays == null && part.intervalDistance == null) continue
      // この部品の最新の実施記録
      const records = maintenanceRecords
        .filter((m) => m.bikeId === bike.id && m.maintenancePartId === part.id)
        .sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate))
      const last = records[0]
      if (!last) continue // 一度も実施していない部品は対象外

      let severity: ReminderSeverity | null = null
      const details: string[] = []

      if (part.intervalDays != null) {
        const due = new Date(last.maintenanceDate)
        due.setDate(due.getDate() + part.intervalDays)
        const d = diffDays(due, ref)
        if (d < 0) {
          severity = 'overdue'
          details.push(`前回から${part.intervalDays}日超過`)
        } else if (d <= DAY_THRESHOLD) {
          severity = severity ?? 'soon'
          details.push(`あと${d}日`)
        }
      }

      if (part.intervalDistance != null && last.mileage != null) {
        const dueMileage = last.mileage + part.intervalDistance
        const remain = dueMileage - bike.totalMileage
        if (remain <= 0) {
          severity = 'overdue'
          details.push(`走行${-remain}km超過`)
        } else if (remain <= part.intervalDistance * (1 - DISTANCE_THRESHOLD_RATIO)) {
          severity = severity ?? 'soon'
          details.push(`あと${remain}km`)
        }
      }

      if (severity) {
        result.push({
          id: `maint-${bike.id}-${part.id}`,
          bikeId: bike.id,
          bikeName: bikeName(bike),
          category: 'maintenance',
          severity,
          title: part.name,
          detail: details.join(' / '),
          dueDate: undefined,
        })
      }
    }
  }

  // overdue を先に、その後 dueDate 昇順
  const order = { overdue: 0, soon: 1 }
  return result.sort((a, b) => {
    if (a.severity !== b.severity) return order[a.severity] - order[b.severity]
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  })
}

export const categoryLabel: Record<ReminderCategory, string> = {
  inspection: '車検',
  insurance: '保険',
  maintenance: 'メンテ',
}
