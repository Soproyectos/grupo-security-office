import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AccessRequestsService, AccessRequestResponse } from './access-requests.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Access Requests')
@Controller('api/public/access-requests')
export class AccessRequestsController {
  constructor(private readonly accessRequestsService: AccessRequestsService) {}

  /**
   * Public endpoint to create an access request.
   * Rate limited: 5 requests per 10 minutes per IP.
   * Honeypot field suppresses logging.
   * Always responds with generic success to prevent enumeration.
   */
  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit access request (public, rate-limited)' })
  @ApiResponse({
    status: 201,
    description: 'Request received (generic response)',
    type: Object,
    schema: { example: { data: { received: true } } },
  })
  async createPublic(
    @Body() dto: CreateAccessRequestDto,
    @Request() req: any,
  ): Promise<AccessRequestResponse> {
    return this.accessRequestsService.createPublic(dto, req);
  }

  /**
   * List all access requests (paginated).
   * Protected: requires JWT + access_requests.manage permission.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @Permissions('access_requests.manage')
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @Permissions('access_requests.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update access request status (staff only)' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() { status }: { status: string },
    @CurrentUser() user: any,
  ) {
    return this.accessRequestsService.updateStatus(id, status, user.sub);
  }
}
