import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

const errorsOf = async (plain: Record<string, unknown>) => (await validate(plainToInstance(CreateProductDto, plain))).map((e) => e.property);

describe('CreateProductDto (manual draft)', () => {
  it('accepts a reference alone: the name is optional', async () => {
    expect(await errorsOf({ sku: 'AB-1' })).toEqual([]);
  });

  it('treats a blank name as missing', async () => {
    expect(await errorsOf({ sku: 'AB-1', name: '   ' })).toEqual([]);
  });

  it('still validates a name that was typed', async () => {
    expect(await errorsOf({ sku: 'AB-1', name: 'x' })).toEqual(['name']);
    expect(await errorsOf({ sku: 'AB-1', name: 'Camara IP' })).toEqual([]);
  });

  it('keeps the reference required', async () => {
    expect(await errorsOf({ name: 'Camara IP' })).toContain('sku');
  });
});
