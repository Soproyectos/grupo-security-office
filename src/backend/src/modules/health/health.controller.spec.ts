import { HealthController } from './health.controller';

/** T06 health — con biblioteca dedicada se informa también su base; en legacy la respuesta no cambia. Dobles explícitos. */
const config = { get: () => 'test' } as never;
const ok = { $queryRaw: jest.fn(async () => [{ '?column?': 1 }]) };
const down = { $queryRaw: jest.fn(async () => { throw new Error('caída'); }) };

describe('HealthController', () => {
  it('legacy: sin campo library', async () => {
    const c = new HealthController(ok as never, config, { config: { mode: 'legacy' }, client: ok } as never);
    const r = await c.check();
    expect(r).toMatchObject({ status: 'ok', database: 'connected' });
    expect(r).not.toHaveProperty('library');
  });

  it('dedicado: ambas bases sanas', async () => {
    const c = new HealthController(ok as never, config, { config: { mode: 'dedicated' }, client: ok } as never);
    expect(await c.check()).toMatchObject({ status: 'ok', database: 'connected', library: 'connected' });
  });

  it('dedicado: biblioteca caída degrada sin tocar el estado de la base operativa', async () => {
    const c = new HealthController(ok as never, config, { config: { mode: 'dedicated' }, client: down } as never);
    expect(await c.check()).toMatchObject({ status: 'degraded', database: 'connected', library: 'error' });
  });

  it('dedicado: base operativa caída degrada aunque la biblioteca esté sana', async () => {
    const c = new HealthController(down as never, config, { config: { mode: 'dedicated' }, client: ok } as never);
    expect(await c.check()).toMatchObject({ status: 'degraded', database: 'error', library: 'connected' });
  });
});
