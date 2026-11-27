import 'reflect-metadata';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { findMunicipality, isValidCity, listMunicipalities } from './municipalities';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('municipalities catalog', () => {
  it('validates only existing 5-digit DIVIPOLA codes', () => {
    expect(isValidCity('05001')).toBe(true);
    expect(isValidCity('11001')).toBe(true);
    for (const bad of ['99999', '5001', '', 'abcde', ' 05001', undefined, null, 5001, {}]) expect(isValidCity(bad)).toBe(false);
  });
  it('finds a municipality with its department, or null', () => {
    expect(findMunicipality('05001')).toMatchObject({ code: '05001', name: 'Medellín', department: 'Antioquia' });
    expect(findMunicipality('00000')).toBeNull();
    expect(findMunicipality(null)).toBeNull();
  });
  it('lists the whole catalog with unique codes', () => {
    const list = listMunicipalities();
    expect(list.length).toBeGreaterThan(1000);
    expect(new Set(list.map((m) => m.code)).size).toBe(list.length);
  });
});

describe('GeoService and endpoint', () => {
  const geo = new GeoService();
  it('reports the invalid codes of a selection', () => {
    expect(geo.invalidCodes(['05001', '99999', 'x'])).toEqual(['99999', 'x']);
    expect(geo.invalidCodes(['05001'])).toEqual([]);
  });
  it('GET /api/public/municipalities is public, cacheable for a day and returns the list', () => {
    const controller = new GeoController(geo);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, GeoController.prototype.list)).toBe(true);
    expect(Reflect.getMetadata('__headers__', GeoController.prototype.list)).toEqual(
      expect.arrayContaining([{ name: 'Cache-Control', value: 'public, max-age=86400' }]),
    );
    expect(Reflect.getMetadata('path', GeoController)).toBe('api/public/municipalities');
    expect(controller.list()).toBe(listMunicipalities());
  });
});
