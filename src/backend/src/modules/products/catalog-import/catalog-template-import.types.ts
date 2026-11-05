/**
 * Types and constants of the template-based catalog import (preview -> mapping -> apply -> history).
 *
 * Persistence reuses `ImportSession` (no schema change). Three namespaces live in that table:
 *  - PREVIEW_NAMESPACE: the parsed file + mapping decisions of one preview (expires in 30 minutes, logically).
 *  - BATCH_NAMESPACE:   one row per executed batch = the DURABLE history entry (nothing deletes it).
 *  - RESULT_NAMESPACE:  per-product results of a batch, stored in small chunks (`<batchId>:r:<n>`).
 */
import { IsArray, IsIn, IsOptional, IsString, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import type { ParsedCatalog, PlanChange, TemplateIssue } from './template';

export const PREVIEW_NAMESPACE = 'catalog-template-preview';
export const BATCH_NAMESPACE = 'catalog-template-batch';
export const RESULT_NAMESPACE = 'catalog-template-batch-results';
export const PREVIEW_TTL_MS = 30 * 60 * 1000;
/** Same figures as the price/product batch executor (products/import/pipeline/batch-executor.service.ts). */
export const APPLY_BATCH_SIZE = 15;
export const APPLY_MAX_RETRIES = 2;
/** Default icon the product editor gives a new feature row (frontend `newFeature()` and SHEET_FEATURE_ICONS[0]). */
export const DEFAULT_FEATURE_ICON = 'shield' as const;
/** Language the product editor gives a new resource row. */
export const DEFAULT_RESOURCE_LANGUAGE = 'es';

export type MappingKind = 'brand' | 'category' | 'subcategory';
export interface MappingResolution { kind: MappingKind; sourceText: string; targetId: string | null }

export type ResultStatus = 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'PROPOSED' | 'INVALID' | 'STALE' | 'NEEDS_CONFIRMATION' | 'FAILED';
export type BatchStateName = 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';

export interface ResultIssue { severity: 'error' | 'warning'; code: string; message: string; sheet?: string; row?: number }
export interface AppliedItem { field: string; key?: string }

export interface BatchResultRow {
  row: number;
  reference: string;
  sku: string;
  name: string;
  status: ResultStatus;
  code: string;
  productId?: string;
  applied: AppliedItem[];
  proposals: PlanChange[];
  pending: string[];
  issues: ResultIssue[];
  error?: string;
  attempts?: number;
}

export interface PreviewState {
  namespace: typeof PREVIEW_NAMESPACE;
  userId: string;
  expiresAt: string;
  fileName: string;
  templateVersion: string;
  parsed: ParsedCatalog;
  mappings: MappingResolution[];
  planHash: string;
  /** Per-product digest of the plan at preview time (stale detection per row). */
  rowDigests: Record<string, string>;
  batchId?: string;
}

export interface BatchCounts { CREATED: number; UPDATED: number; UNCHANGED: number; PROPOSED: number; INVALID: number; STALE: number; NEEDS_CONFIRMATION: number; FAILED: number }
export const emptyCounts = (): BatchCounts => ({ CREATED: 0, UPDATED: 0, UNCHANGED: 0, PROPOSED: 0, INVALID: 0, STALE: 0, NEEDS_CONFIRMATION: 0, FAILED: 0 });

export interface BatchRecord {
  namespace: typeof BATCH_NAMESPACE;
  batchId: string;
  userId: string;
  userName: string | null;
  fileName: string;
  templateVersion: string;
  previewId: string;
  planHash: string;
  createdAt: string;
  finishedAt: string | null;
  state: BatchStateName;
  total: number;
  processed: number;
  counts: BatchCounts;
  chunks: number;
  confirmUnresolved: string[];
  unassignedIssues: ResultIssue[];
  error?: string;
}

export interface ResultChunk { namespace: typeof RESULT_NAMESPACE; batchId: string; index: number; rows: BatchResultRow[] }

export interface MappingIncident {
  kind: MappingKind;
  code: string;
  sourceText: string;
  skus: string[];
}

export type { TemplateIssue };

export class MappingItemDto {
  @IsIn(['brand', 'category', 'subcategory'], { message: 'El tipo debe ser marca, categoría o subcategoría.' })
  kind: MappingKind;
  @IsString()
  sourceText: string;
  /** Id of an EXISTING master, or null to remove the decision. */
  @IsOptional()
  @IsString()
  targetId: string | null;
}

export class MappingBodyDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MappingItemDto)
  resolutions: MappingItemDto[];
}

export class ExecuteBodyDto {
  /** SKUs of NEW products the person accepts to create although a brand/category text has no master. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  confirmUnresolved?: string[];
}
