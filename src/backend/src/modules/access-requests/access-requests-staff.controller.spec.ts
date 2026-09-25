import { AccessRequestsStaffController } from './access-requests-staff.controller';
import { AccessRequestsService } from './access-requests.service';
import { AccessRequestStatus } from './dto/update-access-request-status.dto';
import { AccessRequestQueryDto } from './dto/access-request-query.dto';

describe('AccessRequestsStaffController', () => {
  let controller: AccessRequestsStaffController;
  let service: jest.Mocked<Pick<AccessRequestsService, 'findAll' | 'updateStatus'>>;

  beforeEach(() => {
    service = { findAll: jest.fn(), updateStatus: jest.fn() };
    controller = new AccessRequestsStaffController(
      service as unknown as AccessRequestsService,
    );
  });

  describe('findAll', () => {
    it('forwards page/limit/status from the validated query DTO to the service', async () => {
      const query: AccessRequestQueryDto = {
        page: 2,
        limit: 10,
        status: AccessRequestStatus.PENDING,
      };
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10 });

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(2, 10, AccessRequestStatus.PENDING);
    });

    it('defaults page and limit when the query omits them', async () => {
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(1, 20, undefined);
    });
  });

  describe('updateStatus', () => {
    it('passes id, dto.status and the authenticated user sub to the service', async () => {
      service.updateStatus.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });

      const result = await controller.updateStatus(
        'req-1',
        { status: AccessRequestStatus.APPROVED },
        { sub: 'user-1' },
      );

      expect(service.updateStatus).toHaveBeenCalledWith(
        'req-1',
        AccessRequestStatus.APPROVED,
        'user-1',
      );
      expect(result).toEqual({ id: 'req-1', status: 'APPROVED' });
    });

    it('propagates a NotFoundException from the service unchanged', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      service.updateStatus.mockRejectedValue(new NotFoundException('not found'));

      await expect(
        controller.updateStatus(
          'missing-id',
          { status: AccessRequestStatus.APPROVED },
          { sub: 'user-1' },
        ),
      ).rejects.toThrow('not found');
    });
  });
});
