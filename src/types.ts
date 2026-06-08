// =============================================================
// データモデル定義
//
// 元の ER 図（直訳・崩れた複数形）から、意味の通る命名へ整理した。
// 主な対応:
//   MakersTable               -> Maker          (makers)
//   ShopsTable                -> Shop           (shops)
//   BikeInfosTable            -> Bike           (bikes)
//   MaintenanceTypesTable     -> MaintenanceType(maintenanceTypes)  大項目
//   MaintenancePartsTable     -> MaintenancePart(maintenanceParts)  部品
//   MaintenanceHistorysTable  -> MaintenanceRecord (maintenanceRecords)
//   InsurancesTable           -> InsuranceType  (insuranceTypes)   保険種別マスタ
//   InsurancesHistorysTable   -> InsuranceRecord (insuranceRecords) 契約レコード
//   RefuelHistorysTable       -> RefuelRecord   (refuelRecords)
//
// 日時は ISO8601 文字列で保持（IndexedDB/JSON での取り回しやすさ重視）。
// 画像は Blob を base64 (data URL) 文字列の配列で保持する。
// =============================================================

export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // ISO8601

export interface Timestamped {
  createdDate: ISODateTime
  updatedDate: ISODateTime
}

/** メーカー（Honda, Yamaha 等）。Name は一意。 */
export interface Maker extends Timestamped {
  id: string
  name: string
}

/** 購入店舗。 */
export interface Shop extends Timestamped {
  id: string
  name: string
  address: string
}

/** バイク本体。 */
export interface Bike extends Timestamped {
  id: string
  makerId: string
  /** 車名・車種名 (元: BikeName) */
  name: string
  /** 車体番号 (元: CarBodyNumber) */
  frameNumber: string
  nickname: string
  /** 排気量 cc (元: EngineSize) */
  displacement: number
  /** 購入店舗 (元: PurchaseShopID)。未設定可。 */
  purchaseShopId: string | null
  purchaseDate: ISODate | null
  /** 登録時の総走行距離 km (元: TotalMileageAtRegistration) */
  mileageAtRegistration: number
  /** 現在の総走行距離 km (元: TotalMileage) */
  totalMileage: number
  /** 画像 (data URL) */
  images: string[]
  /** 車検満了日 (元: AutomobileInspectionCertificate) */
  inspectionExpiryDate: ISODate | null
  memo: string
  archived: boolean
}

/** メンテナンス大項目（エンジン, タイヤ 等）。 */
export interface MaintenanceType extends Timestamped {
  id: string
  name: string
}

/** メンテナンス部品（エンジンオイル, フロントタイヤ 等）。 */
export interface MaintenancePart extends Timestamped {
  id: string
  maintenanceTypeId: string
  name: string
  /** 点検推奨間隔（日）(元: InspectionInterval)。未設定可。 */
  intervalDays: number | null
  /** 点検推奨間隔（km）(元: InspectionRangeInterval)。未設定可。 */
  intervalDistance: number | null
  /** 通知 ON/OFF (元: Notification) */
  notification: boolean
}

/** メンテナンス実施記録。 */
export interface MaintenanceRecord extends Timestamped {
  id: string
  bikeId: string
  maintenancePartId: string
  title: string
  maintenanceDate: ISODate
  /** 費用（円）*/
  price: number
  /** 実施時の走行距離 km（次回点検距離の算出に使用）*/
  mileage: number | null
  images: string[]
  memo: string
}

/** 保険種別マスタ（自賠責保険, 任意保険 等）。 */
export interface InsuranceType extends Timestamped {
  id: string
  name: string
  /** 通知 ON/OFF */
  notification: boolean
}

/** 保険契約レコード。 */
export interface InsuranceRecord extends Timestamped {
  id: string
  bikeId: string
  insuranceTypeId: string
  /** 契約名・保険会社名 (元: Name) */
  name: string
  /** 保険料（円）*/
  price: number
  startDate: ISODate
  /** 満了日 (元: FinishDate) */
  finishDate: ISODate
  url: string
  images: string[]
  memo: string
}

/** 給油記録。 */
export interface RefuelRecord extends Timestamped {
  id: string
  bikeId: string
  refuelDate: ISODate
  /** 前回給油時の走行距離 km (元: LastTimeMileage) */
  previousMileage: number
  /** 今回の総走行距離 km (元: TotalMileage) */
  totalMileage: number
  /** 給油金額の合計（円）*/
  price: number
  /** 給油量（L）(元: RefuelAmount) */
  refuelAmount: number
  memo: string
  /** 満タン給油か (元: FillRefuel) */
  isFullTank: boolean
  /** 燃費計算に含めるか (元: FuelConsumptionCalculating) */
  includeInFuelEconomy: boolean
}

/** エクスポート/インポート用のバックアップ構造。 */
export interface BackupData {
  app: 'web-maintenance-note'
  version: number
  exportedAt: ISODateTime
  makers: Maker[]
  shops: Shop[]
  bikes: Bike[]
  maintenanceTypes: MaintenanceType[]
  maintenanceParts: MaintenancePart[]
  maintenanceRecords: MaintenanceRecord[]
  insuranceTypes: InsuranceType[]
  insuranceRecords: InsuranceRecord[]
  refuelRecords: RefuelRecord[]
}
