import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AccessRequestsService } from './access-requests.service';
import { UpdateAccessRequestStatusDto } from './dto/update-access-request-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Access Requests — Staff')
@ApiBearerAuth()
@Controller('api/access-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccessRequestsStaffController {
  constructor(private readonly accessRequestsService: AccessRequestsService) {}

  /**
   * List all access requests (paginated).
   * Protected: requires JWT + access_requests.manage permission.
   */
  @Get()
  @Permissions('access_requests.manage')
  @ApiOperation({ summary: 'List access requests (staff only)' })
  @ApiResponse({
    status: 200,
    description: 'List of access requests',
  })
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    return this.accessRequestsService.findAll(pageNum, limitNum, status);
  }

  /**
   * Update the status of an access request (approve/reject).
   * Protected: requires JWT + access_requests.manage permission.
   */
  @Patch(':id/status')
  @Permissions('access_requests.manage')
  @ApiOperation({ summary: 'Update access request status (staff only)' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAccessRequestStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.accessRequestsService.updateStatus(id, dto.status, user.sub);
  }
}
