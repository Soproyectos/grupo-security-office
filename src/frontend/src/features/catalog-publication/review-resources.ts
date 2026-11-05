import { resolveAssetUrl } from '../../services/api'
import type { ProductSheetApi } from '../products/sheet/sheet-form'
import type { ProductDocument, ProductFirmware } from '../products/types'

/** Adapt commercial resources to the existing download UI, preserving licenses. */
export function reviewResources(sheet?: ProductSheetApi): { documents: ProductDocument[]; firmware: ProductFirmware | null } {
  const documents: ProductDocument[] = []
  const files: ProductFirmware['files'] = []
  const documentTypes = { DATASHEET: 'datasheet', MANUAL: 'manual', QUICK_GUIDE: 'quick-guide', CERTIFICATE: 'certificate', OTHER_DOCUMENT: 'other' } as const
  for (const [index, resource] of (sheet?.resources ?? []).entries()) {
    const id = `${sheet?.productId}-${index}`
    if (resource.kind === 'FIRMWARE' || resource.kind === 'RELEASE_NOTES') {
      files.push({ id, kind: resource.kind === 'FIRMWARE' ? 'firmware' : 'release-notes', title: resource.title, url: resolveAssetUrl(resource.url), version: resource.version ?? undefined, region: resource.region ?? undefined, requiresLicense: resource.requiresLicense })
    } else {
      documents.push({ id, type: documentTypes[resource.kind], title: resource.title, language: resource.language, url: resolveAssetUrl(resource.url), fileName: resource.fileName ?? undefined })
    }
  }
  return { documents, firmware: files.length ? { files, appliesTo: sheet?.availableModels ?? [], note: sheet?.firmwareNote ?? undefined } : null }
}
