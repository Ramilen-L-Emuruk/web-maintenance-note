import { db } from './db'
import { now, uid } from '../utils/format'
import type { MaintenancePart } from '../types'

/** 初回起動時にマスタデータを投入する。既にデータがあれば何もしない。 */
export async function seedIfEmpty(): Promise<void> {
  const makerCount = await db.makers.count()
  if (makerCount > 0) return

  const ts = () => {
    const t = now()
    return { createdDate: t, updatedDate: t }
  }

  // ---- メーカー（有名どころ）----
  const makers = [
    'Honda',
    'Yamaha',
    'Suzuki',
    'Kawasaki',
    'Harley-Davidson',
    'BMW Motorrad',
    'Ducati',
    'Triumph',
    'KTM',
    'Aprilia',
    'Moto Guzzi',
    'Vespa',
    'Royal Enfield',
    'Indian',
    'MV Agusta',
    'Husqvarna',
  ].map((name) => ({ id: uid(), name, ...ts() }))
  await db.makers.bulkAdd(makers)

  // ---- 保険種別 ----
  const insuranceTypes = [
    { name: '自賠責保険', notification: true },
    { name: '任意保険', notification: true },
    { name: '盗難保険', notification: false },
    { name: 'ロードサービス', notification: false },
  ].map((x) => ({ id: uid(), ...x, ...ts() }))
  await db.insuranceTypes.bulkAdd(insuranceTypes)

  // ---- メンテナンス大項目 & 部品 ----
  // [大項目, [部品名, 推奨間隔日, 推奨間隔km]]
  const typeDefs: Array<[string, Array<[string, number | null, number | null]>]> = [
    [
      'エンジン',
      [
        ['エンジンオイル', 180, 3000],
        ['オイルフィルター', 365, 6000],
        ['スパークプラグ', 730, 8000],
        ['エアクリーナー', 365, 10000],
        ['冷却水(クーラント)', 730, 20000],
      ],
    ],
    [
      'タイヤ',
      [
        ['フロントタイヤ', null, 15000],
        ['リアタイヤ', null, 12000],
        ['空気圧チェック', 30, null],
      ],
    ],
    [
      'ブレーキ',
      [
        ['ブレーキパッド(前)', null, 10000],
        ['ブレーキパッド(後)', null, 10000],
        ['ブレーキフルード', 730, null],
      ],
    ],
    [
      '駆動系',
      [
        ['チェーン給油', 30, 500],
        ['チェーン調整', 180, 3000],
        ['スプロケット', null, 20000],
      ],
    ],
    [
      '電装系',
      [
        ['バッテリー', 730, null],
        ['ヘッドライトバルブ', null, null],
      ],
    ],
    [
      '車体',
      [
        ['洗車', 30, null],
        ['各部給脂', 365, null],
      ],
    ],
  ]

  for (const [typeName, parts] of typeDefs) {
    const typeId = uid()
    await db.maintenanceTypes.add({ id: typeId, name: typeName, ...ts() })
    const partRows: MaintenancePart[] = parts.map(([name, intervalDays, intervalDistance]) => ({
      id: uid(),
      maintenanceTypeId: typeId,
      name,
      intervalDays,
      intervalDistance,
      notification: true,
      ...ts(),
    }))
    await db.maintenanceParts.bulkAdd(partRows)
  }
}
