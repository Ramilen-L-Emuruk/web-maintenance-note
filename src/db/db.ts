import Dexie, { type Table } from 'dexie'
import type {
  Bike,
  InsuranceRecord,
  InsuranceType,
  Maker,
  MaintenancePart,
  MaintenanceRecord,
  MaintenanceType,
  RefuelRecord,
  Shop,
} from '../types'

export class MaintenanceNoteDB extends Dexie {
  makers!: Table<Maker, string>
  shops!: Table<Shop, string>
  bikes!: Table<Bike, string>
  maintenanceTypes!: Table<MaintenanceType, string>
  maintenanceParts!: Table<MaintenancePart, string>
  maintenanceRecords!: Table<MaintenanceRecord, string>
  insuranceTypes!: Table<InsuranceType, string>
  insuranceRecords!: Table<InsuranceRecord, string>
  refuelRecords!: Table<RefuelRecord, string>

  constructor() {
    super('maintenance-note')
    this.version(1).stores({
      // & は一意インデックス
      makers: 'id, &name',
      shops: 'id, &name',
      bikes: 'id, makerId, purchaseShopId, archived',
      maintenanceTypes: 'id, &name',
      maintenanceParts: 'id, maintenanceTypeId, name',
      maintenanceRecords: 'id, bikeId, maintenancePartId, maintenanceDate',
      insuranceTypes: 'id, &name',
      insuranceRecords: 'id, bikeId, insuranceTypeId, finishDate',
      refuelRecords: 'id, bikeId, refuelDate',
    })
  }
}

export const db = new MaintenanceNoteDB()
