export const LIBRARY_SECTIONS = ['ficha', 'specs', 'recursos', 'medios', 'precios', 'notas'] as const;
export type LibrarySection = typeof LIBRARY_SECTIONS[number];
export const DEFAULT_LIBRARY_SECTIONS: LibrarySection[] = ['ficha', 'specs', 'recursos', 'medios'];

export interface ManifestEntry { ruta: string; bytes: number; sha256: string; seccion: LibrarySection }
export interface ManifestProduct {
  id: string;
  sku: string;
  slug: string | null;
  listaId: string | null;
  sheetVersion: number;
  entradas: ManifestEntry[];
  permisosRequeridos: string[];
}
export interface LibraryManifest {
  paquete: 'biblioteca-v1';
  schemaVersion: 1;
  generadoEn: string;
  actorId: string;
  /** Administrative editable content; exporting never changes the public revision. */
  origen: 'biblioteca-editable';
  secciones: LibrarySection[];
  productos: ManifestProduct[];
  faltantes: { producto: string; ruta: string; motivo: string }[];
  restringidos: { ruta: string; motivo: string }[];
}

export interface ExportSummary {
  bundleId: string;
  entries: number;
  bytesTotal: number;
  missingCount: number;
  exported: number;
  omittedIds: string[];
}
