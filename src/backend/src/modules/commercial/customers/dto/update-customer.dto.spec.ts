import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomerDto } from './update-customer.dto';
import { ReassignCustomerDto } from './reassign-customer.dto';

/**
 * COM-02 §5.1/§6 — capa de validación (misma que el ValidationPipe global de
 * main.ts: whitelist + forbidNonWhitelisted + transform): la edición general
 * rechaza ownerId/status/isActive con el código del contrato, y la
 * reasignación vive en su DTO dedicado.
 */
describe('UpdateCustomerDto (edición general, COM-02 §5.1)', () => {
  it('acepta un payload de contacto/notas puro sin errores', async () => {
    const dto = plainToInstance(UpdateCustomerDto, {
      name: 'Acme',
      email: 'contacto@acme.test',
      phone: '+57 300 123 4567',
      notes: 'visita el viernes',
      lastContactAt: '2026-10-01T10:00:00.000Z',
    });

    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    ['ownerId', 'ownerId', { name: 'Acme', ownerId: '357dee33-510d-4765-80d9-17959d209d2a' }, 'owner-not-allowed-in-general-edit'],
    ['status', 'status', { name: 'Acme', status: 'INACTIVO' }, 'status-not-allowed-in-general-edit'],
    ['isActive', 'isActive', { name: 'Acme', isActive: false }, 'isActive-not-allowed-in-general-edit'],
    ['ownerId null', 'ownerId', { name: 'Acme', ownerId: null }, 'owner-not-allowed-in-general-edit'],
  ])('rechaza %s con el código del contrato', async (_label, field, payload, code) => {
    const errors = await validate(plainToInstance(UpdateCustomerDto, payload));

    expect(errors.map((e) => e.property)).toContain(field);
    const error = errors.find((e) => e.property === field);
    const messages = Object.values(error?.constraints ?? {});
    expect(messages.some((m) => m.includes(code))).toBe(true);
  });
});

describe('ReassignCustomerDto (reasignación dedicada, COM-02 §3)', () => {
  it('sin ownerId (F6: «sin responsable» no se admite) → error', async () => {
    const errors = await validate(plainToInstance(ReassignCustomerDto, {}));
    expect(errors.map((e) => e.property)).toContain('ownerId');
  });

  it('acepta ownerId UUID con y sin motivo', async () => {
    const ownerId = '357dee33-510d-4765-80d9-17959d209d2a';
    expect(await validate(plainToInstance(ReassignCustomerDto, { ownerId }))).toEqual([]);
    expect(
      await validate(plainToInstance(ReassignCustomerDto, { ownerId, motivo: 'cambio de cartera' })),
    ).toEqual([]);
  });
});
