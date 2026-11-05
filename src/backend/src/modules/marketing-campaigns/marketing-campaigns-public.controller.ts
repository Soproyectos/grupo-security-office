import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MarketingCampaignsService } from './marketing-campaigns.service';

const publicId = () => new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Imagen no encontrada') });

/** True when `If-None-Match` lists the given entity tag (weak prefix ignored). */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((part) => part.trim().replace(/^W\//, '') === etag);
}

/**
 * Public campaigns of the storefront. No session: it only ever reads the
 * PUBLISHED copy of a campaign that is inside its validity window. Drafts and
 * images of withdrawn or expired campaigns are never exposed.
 */
@ApiTags('Storefront campaigns')
@Public()
@Controller('api/storefront/campaigns')
export class MarketingCampaignsPublicController {
  constructor(private readonly service: MarketingCampaignsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Banners of the title and pop-up that are published and in force now' })
  list(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return this.service.listPublic();
  }

  @Get(':id/image/:slot')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Binary of the published image of a campaign slot (desktop | mobile | image)' })
  async image(
    @Param('id', publicId()) id: string,
    @Param('slot') slot: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const image = await this.service.publicImage(id, slot);
    res.setHeader('Content-Type', image.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('ETag', image.etag);
    if (matchesEtag(req.headers['if-none-match'], image.etag)) {
      res.status(304).end();
      return;
    }
    res.status(200).end(image.buffer);
  }
}
