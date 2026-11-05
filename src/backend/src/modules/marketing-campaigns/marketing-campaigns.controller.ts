import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequireGrant } from '../../common/security/require-grant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCampaignDto, PublishCampaignDto, UpdateCampaignDto } from './marketing-campaigns.dto';
import { MAX_IMAGE_BYTES } from './marketing-campaigns.rules';
import { MarketingCampaignsService } from './marketing-campaigns.service';

const campaignId = () =>
  new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador de campaña no válido') });

/**
 * Administration of the storefront campaigns (panel «Marketing y mercadeo → Campañas»).
 * Authorized only by panel grants `marketing:*`; drafts and published copies are
 * separate, so editing never changes what the storefront shows until publishing.
 */
@ApiTags('Marketing campaigns')
@ApiBearerAuth()
@Controller('api/marketing/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingCampaignsController {
  constructor(private readonly service: MarketingCampaignsService) {}

  private ctx(user: any) {
    return { userId: (user?.sub ?? user?.id) as string | undefined, roles: (user?.roles ?? []) as string[], userName: user?.name ?? undefined };
  }

  @Get()
  @RequireGrant('marketing:read')
  @ApiOperation({ summary: 'List campaigns with draft metadata, published state and validity (no images)' })
  list() {
    return this.service.list();
  }

  @Get(':id')
  @RequireGrant('marketing:read')
  @ApiOperation({ summary: 'One campaign with its full draft (images included)' })
  get(@Param('id', campaignId()) id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequireGrant('marketing:create')
  @ApiOperation({ summary: 'Create a draft campaign' })
  create(@CurrentUser() user: any, @Body() dto: CreateCampaignDto) {
    return this.service.create(dto, this.ctx(user));
  }

  @Patch(':id')
  @RequireGrant('marketing:edit')
  @ApiOperation({ summary: 'Edit the draft; 409 when `revision` is outdated' })
  update(@CurrentUser() user: any, @Param('id', campaignId()) id: string, @Body() dto: UpdateCampaignDto) {
    return this.service.update(id, dto, this.ctx(user));
  }

  /** Needs `marketing:read` here and `marketing:create` OR `marketing:edit` (checked by the service). */
  @Put(':id/image/:slot')
  @RequireGrant('marketing:read')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } }))
  @ApiOperation({ summary: 'Upload the image of a slot (desktop | mobile | image) into the draft' })
  uploadImage(
    @CurrentUser() user: any,
    @Param('id', campaignId()) id: string,
    @Param('slot') slot: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.service.setImage(id, slot, file, this.ctx(user));
  }

  /** Needs `marketing:read` here and `marketing:create` OR `marketing:edit` (checked by the service). */
  @Delete(':id/image/:slot')
  @RequireGrant('marketing:read')
  @ApiOperation({ summary: 'Remove the image of a slot from the draft' })
  removeImage(@CurrentUser() user: any, @Param('id', campaignId()) id: string, @Param('slot') slot: string) {
    return this.service.removeImage(id, slot, this.ctx(user));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequireGrant('marketing:publish')
  @ApiOperation({ summary: 'Publish the current draft (needs the required image and the alt text)' })
  publish(@CurrentUser() user: any, @Param('id', campaignId()) id: string, @Body() dto: PublishCampaignDto) {
    return this.service.publish(id, dto, this.ctx(user));
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @RequireGrant('marketing:publish')
  @ApiOperation({ summary: 'Withdraw the published copy; the draft is kept' })
  unpublish(@CurrentUser() user: any, @Param('id', campaignId()) id: string) {
    return this.service.unpublish(id, this.ctx(user));
  }

  @Delete(':id')
  @RequireGrant('marketing:delete')
  @ApiOperation({ summary: 'Delete a campaign (409 while it is published)' })
  remove(@CurrentUser() user: any, @Param('id', campaignId()) id: string) {
    return this.service.remove(id, this.ctx(user));
  }
}
