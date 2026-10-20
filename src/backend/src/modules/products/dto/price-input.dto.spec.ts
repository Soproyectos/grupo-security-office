import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PriceInputDto } from './price-input.dto';

/**
 * IMP-03 — la entrada inline de la ficha aplica la misma política COP que la
 * plantilla y la API de precios (redondeo HALF_UP en el borde + límite único).
 */
function toDto(payload: Record<string, unknown>) {
  return plainToInstance(PriceInputDto, payload, { enableImplicitConversion: false });
}

async function validateDto(payload: Record<string, unknown>) {
  const dto = toDto(payload);
  return { dto, errors: await validate(dto) };
}

describe('PriceInputDto (IMP-03 COP unificado)', () => {
  it('redondea el precio COP a pesos enteros HALF_UP', async () => {
    const { dto, errors } = await validateDto({ priceListId: 'pl-1', value: 1500000.49, currency: 'COP' });
    expect(errors).toHaveLength(0);
    expect(dto.value).toBe(1500000);
  });

  it('acepta 0.50 y rechaza 0.49, negativos y desbordamiento', async () => {
    expect((await validateDto({ priceListId: 'pl-1', value: 0.5, currency: 'COP' })).errors).toHaveLength(0);
    expect((await validateDto({ priceListId: 'pl-1', value: 0.49, currency: 'COP' })).errors).toHaveLength(1);
    expect((await validateDto({ priceListId: 'pl-1', value: -100 })).errors).toHaveLength(1);
    expect((await validateDto({ priceListId: 'pl-1', value: 9999999999.5, currency: 'COP' })).errors).toHaveLength(1);
  });

  it('exige un valor de precio (no vacío)', async () => {
    const { errors } = await validateDto({ priceListId: 'pl-1' });
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('no redondea precios en otra moneda', async () => {
    const { dto, errors } = await validateDto({ priceListId: 'pl-1', value: 99999.75, currency: 'USD' });
    expect(errors).toHaveLength(0);
    expect(dto.value).toBe(99999.75);
  });
});
