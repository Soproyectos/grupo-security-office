import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateListaDto } from './create-lista.dto';
import { UpdateListaDto } from './update-lista.dto';

describe('CreateListaDto / UpdateListaDto (regresión decoradores huérfanos)', () => {
  it('acepta un name de texto normal (regresión: name must be a UUID)', async () => {
    const dto = plainToInstance(CreateListaDto, {
      code: 'LISTA-HIKV-VID',
      name: 'Lista Hikvision Video',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza un name demasiado corto', async () => {
    const dto = plainToInstance(CreateListaDto, {
      code: 'LISTA-HIKV-VID',
      name: 'L',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('UpdateListaDto acepta validFrom en ISO 8601', async () => {
    const dto = plainToInstance(UpdateListaDto, {
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2026-12-31T23:59:59Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('UpdateListaDto rechaza validFrom que no sea ISO 8601', async () => {
    const dto = plainToInstance(UpdateListaDto, { validFrom: 'no-es-una-fecha' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'validFrom')).toBe(true);
  });
});
