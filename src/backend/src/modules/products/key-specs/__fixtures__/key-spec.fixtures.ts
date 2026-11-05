/**
 * Synthetic fixtures for the key-data domain: three subcategories (DVR
 * recorders, switches, connectors and jacks), their dictionary, templates and
 * stored values for three invented products. No real references are used.
 * Labels are the Spanish copy the storefront would show; identifiers are English.
 */
import type {
  ProductKeySpecValue,
  SpecDefinition,
  SpecOption,
  SubcategorySpec,
} from '../key-spec.types'

export const SUBCATEGORY = {
  dvr: 'sub-dvr-recorders',
  switch: 'sub-switches',
  connectors: 'sub-connectors-jacks',
} as const

export const PRODUCT = {
  dvr: { id: 'prod-syn-dvr-0401', sku: 'SYN-DVR-0401', subcategoryId: SUBCATEGORY.dvr },
  switch: { id: 'prod-syn-sw-1008p', sku: 'SYN-SW-1008P', subcategoryId: SUBCATEGORY.switch },
  accessory: { id: 'prod-syn-jack-c6-red', sku: 'SYN-JACK-C6-RED', subcategoryId: SUBCATEGORY.connectors },
} as const

const options = (...rows: [key: string, label: string, isActive?: boolean][]): SpecOption[] =>
  rows.map(([key, label, isActive = true], i) => ({ key, label, sortOrder: (i + 1) * 10, isActive }))

const def = (
  key: string,
  label: string,
  dataType: SpecDefinition['dataType'],
  extra: Partial<Pick<SpecDefinition, 'unit' | 'options'>> = {},
): SpecDefinition => ({ id: `def-${key}`, key, label, dataType, unit: null, options: [], isActive: true, ...extra })

export const DEFINITIONS: SpecDefinition[] = [
  // DVR recorders
  def('device_type', 'Tipo de equipo', 'OPTION', { options: options(['DVR', 'DVR Turbo HD'], ['NVR', 'NVR']) }),
  def('analog_channels', 'Canales analógicos', 'NUMBER'),
  def('ip_channels', 'Canales IP', 'NUMBER'),
  def('max_recording_resolution', 'Resolución máxima de grabación', 'OPTION', {
    options: options(['1080P', '1080p'], ['5MP_LITE', '5 MP Lite'], ['4K', '4K']),
  }),
  def('storage', 'Almacenamiento', 'TEXT'),
  def('analytics', 'Analítica', 'MULTI_OPTION', {
    options: options(['ACUSENSE', 'AcuSense'], ['MOTION', 'Detección de movimiento'], ['LEGACY_VCA', 'VCA anterior', false]),
  }),
  // Switches
  def('total_ports', 'Puertos totales', 'NUMBER'),
  def('poe_ports', 'Puertos PoE', 'NUMBER'),
  def('port_speed', 'Velocidad de puertos', 'OPTION', { options: options(['FAST', 'Fast Ethernet'], ['GIGABIT', 'Gigabit']) }),
  def('poe_budget', 'Potencia PoE total', 'NUMBER', { unit: 'W' }),
  def('management', 'Administración', 'OPTION', {
    options: options(['UNMANAGED', 'No administrable'], ['SMART', 'Administrable (smart)'], ['MANAGED', 'Administrable']),
  }),
  def('mounting', 'Montaje', 'OPTION', { options: options(['RACK', 'Rack'], ['DESKTOP', 'Escritorio']) }),
  // Connectors and jacks
  def('connector_type', 'Tipo de conector', 'OPTION', { options: options(['RJ45', 'RJ45'], ['RJ11', 'RJ11']) }),
  def('cable_category', 'Categoría del cable', 'OPTION', { options: options(['CAT5E', 'Cat 5e'], ['CAT6', 'Cat 6']) }),
  def('color', 'Color', 'OPTION', { options: options(['WHITE', 'Blanco'], ['RED', 'Rojo'], ['BLUE', 'Azul']) }),
  def('shielding', 'Blindaje', 'OPTION', { options: options(['UTP', 'UTP'], ['FTP', 'FTP']) }),
]

const definitionId = (key: string): string => `def-${key}`

const APPROVED_AT = new Date('2026-10-29T12:00:00.000Z')

interface RowFlags {
  isRequired?: boolean
  isFilterable?: boolean
}

const approvedRow = (subcategoryId: string, key: string, sortOrder: number, flags: RowFlags = {}): SubcategorySpec => ({
  subcategoryId,
  specDefinitionId: definitionId(key),
  status: 'APPROVED',
  isRequired: flags.isRequired ?? false,
  isFilterable: flags.isFilterable ?? false,
  requiredReason: flags.isRequired ? `Synthetic justification: "${key}" is essential to choose the product.` : null,
  sortOrder,
  approvedById: 'user-syn-approver',
  approvedAt: APPROVED_AT,
})

/** Proposed rows are never approved automatically, so they carry no approver (F6). */
const proposedRow = (subcategoryId: string, key: string, sortOrder: number, flags: RowFlags = {}): SubcategorySpec => ({
  ...approvedRow(subcategoryId, key, sortOrder, flags),
  status: 'PROPOSED',
  approvedById: null,
  approvedAt: null,
})

export const TEMPLATES: SubcategorySpec[] = [
  // DVR: "storage" is required but NOT filterable; "ip_channels" and "analytics" are filterable but NOT required.
  approvedRow(SUBCATEGORY.dvr, 'device_type', 10, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.dvr, 'analog_channels', 20, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.dvr, 'ip_channels', 30, { isFilterable: true }),
  approvedRow(SUBCATEGORY.dvr, 'max_recording_resolution', 40, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.dvr, 'storage', 50, { isRequired: true }),
  approvedRow(SUBCATEGORY.dvr, 'analytics', 60, { isFilterable: true }),
  // Switch: "mounting" is proposed and required but has no value: it must never block.
  approvedRow(SUBCATEGORY.switch, 'total_ports', 10, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.switch, 'poe_ports', 20, { isFilterable: true }),
  approvedRow(SUBCATEGORY.switch, 'port_speed', 30, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.switch, 'poe_budget', 40, { isFilterable: true }),
  approvedRow(SUBCATEGORY.switch, 'management', 50),
  proposedRow(SUBCATEGORY.switch, 'mounting', 60, { isRequired: true }),
  // Connectors and jacks: "shielding" is proposed and required but has no value.
  approvedRow(SUBCATEGORY.connectors, 'connector_type', 10, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.connectors, 'cable_category', 20, { isRequired: true, isFilterable: true }),
  approvedRow(SUBCATEGORY.connectors, 'color', 30, { isFilterable: true }),
  proposedRow(SUBCATEGORY.connectors, 'shielding', 40, { isRequired: true }),
]

const valueRow = (
  productId: string,
  key: string,
  stage: ProductKeySpecValue['stage'],
  fill: Partial<Pick<ProductKeySpecValue, 'valueText' | 'valueNumber' | 'valueBoolean' | 'optionKeys'>>,
): ProductKeySpecValue => ({
  productId,
  specDefinitionId: definitionId(key),
  stage,
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  optionKeys: [],
  ...fill,
})

const dvr = PRODUCT.dvr.id
const sw = PRODUCT.switch.id
const jack = PRODUCT.accessory.id

export const VALUES: ProductKeySpecValue[] = [
  // DVR, PUBLISHED
  valueRow(dvr, 'device_type', 'PUBLISHED', { optionKeys: ['DVR'] }),
  valueRow(dvr, 'analog_channels', 'PUBLISHED', { valueNumber: 4 }),
  valueRow(dvr, 'ip_channels', 'PUBLISHED', { valueNumber: 1 }),
  valueRow(dvr, 'max_recording_resolution', 'PUBLISHED', { optionKeys: ['5MP_LITE'] }),
  valueRow(dvr, 'storage', 'PUBLISHED', { valueText: 'eSSD 1 TB' }),
  valueRow(dvr, 'analytics', 'PUBLISHED', { optionKeys: ['ACUSENSE'] }),
  // DVR, WORKING: an unapproved edit that must not leak to the sheet or the filters
  valueRow(dvr, 'analog_channels', 'WORKING', { valueNumber: 8 }),
  valueRow(dvr, 'storage', 'WORKING', { valueText: 'eSSD 2 TB' }),
  // Switch, PUBLISHED
  valueRow(sw, 'total_ports', 'PUBLISHED', { valueNumber: 10 }),
  valueRow(sw, 'poe_ports', 'PUBLISHED', { valueNumber: 8 }),
  valueRow(sw, 'port_speed', 'PUBLISHED', { optionKeys: ['GIGABIT'] }),
  valueRow(sw, 'poe_budget', 'PUBLISHED', { valueNumber: 60 }),
  valueRow(sw, 'management', 'PUBLISHED', { optionKeys: ['SMART'] }),
  // Switch, WORKING
  valueRow(sw, 'poe_budget', 'WORKING', { valueNumber: 120 }),
  // Accessory, PUBLISHED
  valueRow(jack, 'connector_type', 'PUBLISHED', { optionKeys: ['RJ45'] }),
  valueRow(jack, 'cable_category', 'PUBLISHED', { optionKeys: ['CAT6'] }),
  valueRow(jack, 'color', 'PUBLISHED', { optionKeys: ['RED'] }),
  // Accessory, WORKING
  valueRow(jack, 'color', 'WORKING', { optionKeys: ['BLUE'] }),
]
