import { REQUIRED_GRANTS_KEY } from '../../../common/security/require-grant';
import { ProductPreviewDetailController } from './product-preview-detail.controller';

describe('ProductPreviewDetailController', () => {
  it('needs the products:read grant', () => {
    const handler = ProductPreviewDetailController.prototype.preview as unknown as object;
    expect(Reflect.getMetadata(REQUIRED_GRANTS_KEY, handler)).toEqual(['products:read']);
  });

  it('delegates to the read-only preview', async () => {
    const service = { previewById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    await expect(new ProductPreviewDetailController(service as never).preview('p1')).resolves.toEqual({ id: 'p1' });
    expect(service.previewById).toHaveBeenCalledWith('p1');
  });
});
