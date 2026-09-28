import { PublicAccessRequestsController } from './public-access-requests.controller';
import { AccessRequestsService } from './access-requests.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';

describe('PublicAccessRequestsController', () => {
  let controller: PublicAccessRequestsController;
  let service: jest.Mocked<Pick<AccessRequestsService, 'createPublic'>>;

  beforeEach(() => {
    service = { createPublic: jest.fn() };
    controller = new PublicAccessRequestsController(
      service as unknown as AccessRequestsService,
    );
  });

  const dto: CreateAccessRequestDto = {
    companyName: 'Acme Corp',
    nit: '1234567890',
    contactName: 'John Doe',
    email: 'john@acme.com',
    phone: '+57 301 555 0123',
    customerType: CustomerTypeEnum.INSTALLER,
  };

  it('delegates to AccessRequestsService.createPublic with the dto and request', async () => {
    service.createPublic.mockResolvedValue({ received: true });
    const req: any = { ip: '203.0.113.1' };

    const result = await controller.create(dto, req);

    expect(service.createPublic).toHaveBeenCalledWith(dto, req);
    expect(result).toEqual({ received: true });
  });

  it('propagates a service failure (e.g. InternalServerErrorException) unchanged', async () => {
    const error = new Error('db down');
    service.createPublic.mockRejectedValue(error);

    await expect(controller.create(dto, { ip: '203.0.113.1' } as any)).rejects.toThrow(
      'db down',
    );
  });
});
