import { Module } from '@nestjs/common';
import { AccessRequestsService } from './access-requests.service';
import { PublicAccessRequestsController } from './public-access-requests.controller';
import { AccessRequestsStaffController } from './access-requests-staff.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AccessRequestsService],
  controllers: [PublicAccessRequestsController, AccessRequestsStaffController],
})
export class AccessRequestsModule {}
