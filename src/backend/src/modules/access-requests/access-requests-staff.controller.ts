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
import { AccessRequestQueryDto } from './dto/access-request-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

/** Shape of the JWT payload attached to `req.user` by JwtStrategy#validate. */
interface AuthenticatedUser {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
}

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
  async findAll(@Query() query: AccessRequestQueryDto) {
    return this.accessRequestsService.findAll(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessRequestsService.updateStatus(id, dto.status, user.sub);
  }
}
