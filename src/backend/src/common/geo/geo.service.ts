import { Injectable } from '@nestjs/common';
import { findMunicipality, isValidCity, listMunicipalities, type Municipality } from './municipalities';

/** Injectable facade over the municipality catalog (so consumers can be unit-tested with a stub). */
@Injectable()
export class GeoService {
  isValidCity(code: unknown): code is string { return isValidCity(code); }
  find(code: string | null | undefined): Municipality | null { return findMunicipality(code); }
  list(): readonly Municipality[] { return listMunicipalities(); }
  /** Codes that are not in the catalog (empty array = all valid). */
  invalidCodes(codes: readonly string[]): string[] { return codes.filter((code) => !isValidCity(code)); }
}
