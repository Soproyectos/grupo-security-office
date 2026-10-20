/**
 * COM-04 regla 3 / decisión G3 — `currency` explícita en el upsert de metas.
 *
 * RED observado: mientras `currency` siga opcional con `default: 'COP'`,
 * «moneda ausente» devuelve 0 errores (payload aceptado con default sorpresivo).
 */
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { UpsertSalesTargetDto } from './upsert-sales-target.dto';

function collect(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collect(error.children ?? []),
  ]);
}

async function messagesOf(payload: unknown): Promise<string[]> {
  const dto = plainToInstance(UpsertSalesTargetDto, payload as object);
  return collect(await validate(dto, { whitelist: false }));
}

const validPayload = () => ({
  userId: 'u-destino',
  period: '2026-10',
  amount: '150000000',
  currency: 'COP',
});

describe('UpsertSalesTargetDto (COM-04 regla 3, G3)', () => {
  it('acepta un payload completo con moneda explícita', async () => {
    expect(await messagesOf(validPayload())).toEqual([]);
  });

  it('rechaza currency ausente: moneda explícita, sin default silencioso', async () => {
    const { currency: _omitida, ...sinMoneda } = validPayload();
    const messages = await messagesOf(sinMoneda);
    expect(messages.join('\n')).toMatch(/currency/i);
  });

  it.each(['COPP', 'CO1', 'EURO'])(
    'rechaza currency mal formada (%s): ISO 3 alfabético',
    async (currency) => {
      expect((await messagesOf({ ...validPayload(), currency })).length).toBeGreaterThan(0);
    },
  );

  it('rechaza periodo fuera de YYYY-MM', async () => {
    const messages = await messagesOf({ ...validPayload(), period: '2026-13' });
    expect(messages.join('\n')).toMatch(/YYYY-MM/);
  });

  it('rechaza amount que no sea número decimal en string', async () => {
    const messages = await messagesOf({ ...validPayload(), amount: '150.000.000' });
    expect(messages.length).toBeGreaterThan(0);
  });
});
