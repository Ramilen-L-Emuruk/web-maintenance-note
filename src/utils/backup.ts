import { db } from '../db/db'
import type { BackupData } from '../types'
import { now } from './format'

const BACKUP_VERSION = 1

/** 全データを BackupData として取得する。 */
export async function buildBackup(): Promise<BackupData> {
  const [
    makers,
    shops,
    bikes,
    maintenanceTypes,
    maintenanceParts,
    maintenanceRecords,
    insuranceTypes,
    insuranceRecords,
    refuelRecords,
  ] = await Promise.all([
    db.makers.toArray(),
    db.shops.toArray(),
    db.bikes.toArray(),
    db.maintenanceTypes.toArray(),
    db.maintenanceParts.toArray(),
    db.maintenanceRecords.toArray(),
    db.insuranceTypes.toArray(),
    db.insuranceRecords.toArray(),
    db.refuelRecords.toArray(),
  ])

  return {
    app: 'web-maintenance-note',
    version: BACKUP_VERSION,
    exportedAt: now(),
    makers,
    shops,
    bikes,
    maintenanceTypes,
    maintenanceParts,
    maintenanceRecords,
    insuranceTypes,
    insuranceRecords,
    refuelRecords,
  }
}

/** バックアップ JSON をダウンロードさせる。 */
export async function exportToFile(): Promise<void> {
  const data = await buildBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `maintenance-note-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function isBackup(x: unknown): x is BackupData {
  return !!x && typeof x === 'object' && (x as BackupData).app === 'web-maintenance-note'
}

/**
 * JSON 文字列からデータをインポートする。
 * mode='replace' は全削除して置換、mode='merge' は id 衝突を上書きしつつ追加。
 */
export async function importFromJson(json: string, mode: 'replace' | 'merge'): Promise<void> {
  const parsed: unknown = JSON.parse(json)
  if (!isBackup(parsed)) {
    throw new Error('このファイルはメンテナンスノートのバックアップではないようです。')
  }
  const data = parsed

  await db.transaction(
    'rw',
    [
      db.makers,
      db.shops,
      db.bikes,
      db.maintenanceTypes,
      db.maintenanceParts,
      db.maintenanceRecords,
      db.insuranceTypes,
      db.insuranceRecords,
      db.refuelRecords,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.makers.clear(),
          db.shops.clear(),
          db.bikes.clear(),
          db.maintenanceTypes.clear(),
          db.maintenanceParts.clear(),
          db.maintenanceRecords.clear(),
          db.insuranceTypes.clear(),
          db.insuranceRecords.clear(),
          db.refuelRecords.clear(),
        ])
      }
      await db.makers.bulkPut(data.makers ?? [])
      await db.shops.bulkPut(data.shops ?? [])
      await db.bikes.bulkPut(data.bikes ?? [])
      await db.maintenanceTypes.bulkPut(data.maintenanceTypes ?? [])
      await db.maintenanceParts.bulkPut(data.maintenanceParts ?? [])
      await db.maintenanceRecords.bulkPut(data.maintenanceRecords ?? [])
      await db.insuranceTypes.bulkPut(data.insuranceTypes ?? [])
      await db.insuranceRecords.bulkPut(data.insuranceRecords ?? [])
      const refuelRecords = (data.refuelRecords ?? []).map((r) => ({
        ...r,
        refuelTime: r.refuelTime ?? '10:00',
      }))
      await db.refuelRecords.bulkPut(refuelRecords)
    },
  )
}
