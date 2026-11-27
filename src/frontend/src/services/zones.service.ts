import api from './api'

export interface Municipality { code: string; name: string; departmentCode: string; department: string }
export interface ZoneCity { code: string; name: string; department: string }
export interface Zone { id: string; name: string; isActive: boolean; usersCount: number; cities: ZoneCity[] }

function asList<T>(value: unknown): T[] {
  const inner = value && typeof value === 'object' && 'data' in value ? (value as { data: unknown }).data : value
  return Array.isArray(inner) ? (inner as T[]) : []
}

/** Zonas de asesores (solo Super Admin). */
export async function fetchZones() { return asList<Zone>((await api.get('/zones')).data) }
export async function createZone(input: { name: string; cityCodes: string[] }) { return (await api.post('/zones', input)).data }
export async function updateZone(id: string, input: { name?: string; isActive?: boolean; cityCodes?: string[] }) { return (await api.patch(`/zones/${id}`, input)).data }
export async function deleteZone(id: string) { return (await api.delete(`/zones/${id}`)).data }
/** Lista fija de municipios (pública, se puede guardar un día). */
export async function fetchMunicipalities() { return asList<Municipality>((await api.get('/public/municipalities')).data) }

export const municipalityLabel = (m: { name: string; department: string }) => `${m.name} · ${m.department}`
