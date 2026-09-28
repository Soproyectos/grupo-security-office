import {
  Controller,
  Post,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccessRequestsService, AccessRequestResponse } from './access-requests.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Access Requests — Public')
@Controller('api/public/access-requests')
export class PublicAccessRequestsController {
  constructor(private readonly accessRequestsService: AccessRequestsService) {}

  /**
   * Public endpoint to create an access request.
   * Rate limited: 5 requests per 10 minutes per IP (via nginx reverse proxy).
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
  async create(
    @Body() dto: CreateAccessRequestDto,
    @Request() req: any,
  ): Promise<AccessRequestResponse> {
    return this.accessRequestsService.createPublic(dto, req);
  }
}
