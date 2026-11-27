import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryReviewService } from './library-review.service';
import { RecordEvidenceDto, RecordGapDto } from './library-review.dto';

type ReviewRequest = { user: { sub: string; name?: string; roles: string[] } };
const context = (req: ReviewRequest) => ({ userId: req.user.sub, name: req.user.name, roles: req.user.roles });

@Controller('api/library/products/:productId/review')
@UseGuards(JwtAuthGuard)
export class LibraryReviewController {
  constructor(private readonly reviewService: LibraryReviewService) {}

  @Get()
  review(@Param('productId') id: string, @Req() req: ReviewRequest) {
    return this.reviewService.review(id, context(req));
  }

  @Put('gaps')
  recordGap(@Param('productId') id: string, @Body() dto: RecordGapDto, @Req() req: ReviewRequest) {
    return this.reviewService.recordGap(id, dto, context(req));
  }

  @Post('gaps/:gapId/resolve')
  resolveGap(@Param('productId') id: string, @Param('gapId') gapId: string, @Req() req: ReviewRequest) {
    return this.reviewService.resolveGap(id, gapId, context(req));
  }

  @Put('evidence')
  recordEvidence(@Param('productId') id: string, @Body() dto: RecordEvidenceDto, @Req() req: ReviewRequest) {
    return this.reviewService.recordEvidence(id, dto, context(req));
  }
}
