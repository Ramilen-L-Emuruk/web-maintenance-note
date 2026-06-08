import { db } from './db'
import { now, uid } from '../utils/format'
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

type NewInput<T> = Omit<T, 'id' | 'createdDate' | 'updatedDate'>

// ---------------- Maker ----------------
export async function addMaker(name: string): Promise<string> {
  const trimmed = name.trim()
  const existing = await db.makers.where('name').equals(trimmed).first()
  if (existing) return existing.id
  const t = now()
  const maker: Maker = { id: uid(), name: trimmed, createdDate: t, updatedDate: t }
  await db.makers.add(maker)
  return maker.id
}

// ---------------- Shop ----------------
export async function addShop(input: NewInput<Shop>): Promise<string> {
  const name = input.name.trim()
  const existing = await db.shops.where('name').equals(name).first()
  if (existing) return existing.id
  const t = now()
  const shop: Shop = { id: uid(), ...input, name, createdDate: t, updatedDate: t }
  await db.shops.add(shop)
  return shop.id
}

// ---------------- Bike ----------------
export async function addBike(input: NewInput<Bike>): Promise<string> {
  const t = now()
  const bike: Bike = { id: uid(), ...input, createdDate: t, updatedDate: t }
  await db.bikes.add(bike)
  return bike.id
}

export async function updateBike(id: string, patch: Partial<Bike>): Promise<void> {
  await db.bikes.update(id, { ...patch, updatedDate: now() })
}

export async function deleteBike(id: string): Promise<void> {
  await db.transaction('rw', [db.bikes, db.refuelRecords, db.maintenanceRecords, db.insuranceRecords], async () => {
    await db.refuelRecords.where('bikeId').equals(id).delete()
    await db.maintenanceRecords.where('bikeId').equals(id).delete()
    await db.insuranceRecords.where('bikeId').equals(id).delete()
    await db.bikes.delete(id)
  })
}

// ---------------- MaintenanceType / Part ----------------
export async function addMaintenanceType(name: string): Promise<string> {
  const trimmed = name.trim()
  const existing = await db.maintenanceTypes.where('name').equals(trimmed).first()
  if (existing) return existing.id
  const t = now()
  await db.maintenanceTypes.add({ id: uid(), name: trimmed, createdDate: t, updatedDate: t })
  return (await db.maintenanceTypes.where('name').equals(trimmed).first())!.id
}

export async function addMaintenancePart(input: NewInput<MaintenancePart>): Promise<string> {
  const t = now()
  const part: MaintenancePart = { id: uid(), ...input, createdDate: t, updatedDate: t }
  await db.maintenanceParts.add(part)
  return part.id
}

export async function updateMaintenancePart(id: string, patch: Partial<MaintenancePart>): Promise<void> {
  await db.maintenanceParts.update(id, { ...patch, updatedDate: now() })
}

export async function deleteMaintenancePart(id: string): Promise<void> {
  await db.transaction('rw', [db.maintenanceParts, db.maintenanceRecords], async () => {
    await db.maintenanceRecords.where('maintenancePartId').equals(id).delete()
    await db.maintenanceParts.delete(id)
  })
}

export async function deleteMaintenanceType(id: string): Promise<void> {
  await db.transaction('rw', [db.maintenanceTypes, db.maintenanceParts, db.maintenanceRecords], async () => {
    const parts = await db.maintenanceParts.where('maintenanceTypeId').equals(id).toArray()
    for (const p of parts) {
      await db.maintenanceRecords.where('maintenancePartId').equals(p.id).delete()
    }
    await db.maintenanceParts.where('maintenanceTypeId').equals(id).delete()
    await db.maintenanceTypes.delete(id)
  })
}

// ---------------- MaintenanceRecord ----------------
export async function saveMaintenanceRecord(input: NewInput<MaintenanceRecord> & { id?: string }): Promise<void> {
  const t = now()
  if (input.id) {
    const { id, ...rest } = input
    await db.maintenanceRecords.update(id, { ...rest, updatedDate: t })
  } else {
    await db.maintenanceRecords.add({ ...input, id: uid(), createdDate: t, updatedDate: t })
  }
}

export async function deleteMaintenanceRecord(id: string): Promise<void> {
  await db.maintenanceRecords.delete(id)
}

// ---------------- InsuranceType ----------------
export async function addInsuranceType(name: string): Promise<string> {
  const trimmed = name.trim()
  const existing = await db.insuranceTypes.where('name').equals(trimmed).first()
  if (existing) return existing.id
  const t = now()
  const type: InsuranceType = { id: uid(), name: trimmed, notification: true, createdDate: t, updatedDate: t }
  await db.insuranceTypes.add(type)
  return type.id
}

export async function updateInsuranceType(id: string, patch: Partial<InsuranceType>): Promise<void> {
  await db.insuranceTypes.update(id, { ...patch, updatedDate: now() })
}

export async function deleteInsuranceType(id: string): Promise<void> {
  await db.transaction('rw', [db.insuranceTypes, db.insuranceRecords], async () => {
    await db.insuranceRecords.where('insuranceTypeId').equals(id).delete()
    await db.insuranceTypes.delete(id)
  })
}

// ---------------- InsuranceRecord ----------------
export async function saveInsuranceRecord(input: NewInput<InsuranceRecord> & { id?: string }): Promise<void> {
  const t = now()
  if (input.id) {
    const { id, ...rest } = input
    await db.insuranceRecords.update(id, { ...rest, updatedDate: t })
  } else {
    await db.insuranceRecords.add({ ...input, id: uid(), createdDate: t, updatedDate: t })
  }
}

export async function deleteInsuranceRecord(id: string): Promise<void> {
  await db.insuranceRecords.delete(id)
}

// ---------------- RefuelRecord ----------------
export async function saveRefuelRecord(input: NewInput<RefuelRecord> & { id?: string }): Promise<void> {
  const t = now()
  if (input.id) {
    const { id, ...rest } = input
    await db.refuelRecords.update(id, { ...rest, updatedDate: t })
  } else {
    await db.refuelRecords.add({ ...input, id: uid(), createdDate: t, updatedDate: t })
  }
  // 給油記録の総走行距離でバイクの現在走行距離を更新（より大きければ）
  const bike = await db.bikes.get(input.bikeId)
  if (bike && input.totalMileage > bike.totalMileage) {
    await db.bikes.update(bike.id, { totalMileage: input.totalMileage, updatedDate: t })
  }
}

export async function deleteRefuelRecord(id: string): Promise<void> {
  await db.refuelRecords.delete(id)
}

export type { Maker, Shop, Bike, MaintenanceType, MaintenancePart, MaintenanceRecord, InsuranceType, InsuranceRecord, RefuelRecord }
