import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CatalogPricesQueryDto } from './catalog-prices-query.dto';

describe('CatalogPricesQueryDto', () => {
  const validate = (ids: string) => validateSync(plainToInstance(CatalogPricesQueryDto, { ids }));

  it('accepts a comma-separated list of up to 50 safe product IDs', () => {
    expect(validate('prod-1,SKU_2')).toHaveLength(0);
    expect(validate(Array.from({ length: 50 }, (_, index) => `prod-${index}`).join(','))).toHaveLength(0);
  });

  it('rejects empty IDs, unsupported characters, and more than 50 IDs', () => {
    expect(validate('prod-1,,prod-2').length).toBeGreaterThan(0);
    expect(validate('prod-1,../private').length).toBeGreaterThan(0);
    expect(validate(Array.from({ length: 51 }, (_, index) => `prod-${index}`).join(',')).length).toBeGreaterThan(0);
  });
});
