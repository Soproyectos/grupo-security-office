import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryReviewService } from './library-review.service';
import { RecordEvidenceDto, RecordGapDto } from './library-review.dto';

type ReviewRequest = { user: { sub: string; name?: string; roles: string[] } };
const context = (req: ReviewRequest) => ({ userId: req.user.sub, name: req.user.name, roles: req.user.roles });

@Controller('api/library/products/:productId/review')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryReviewController {
  constructor(private readonly reviewService: LibraryReviewService) {}

  @Get() @Roles(...ALL_ROLES)
  review(@Param('productId') id: string, @Req() req: ReviewRequest) {
    return this.reviewService.review(id, context(req));
  }

  @Put('gaps') @Roles('Super Admin', 'Admin Comercial')
  recordGap(@Param('productId') id: string, @Body() dto: RecordGapDto, @Req() req: ReviewRequest) {
    return this.reviewService.recordGap(id, dto, context(req));
  }

  @Post('gaps/:gapId/resolve') @Roles('Super Admin', 'Admin Comercial')
  resolveGap(@Param('productId') id: string, @Param('gapId') gapId: string, @Req() req: ReviewRequest) {
    return this.reviewService.resolveGap(id, gapId, context(req));
  }

  @Put('evidence') @Roles('Super Admin', 'Admin Comercial')
  recordEvidence(@Param('productId') id: string, @Body() dto: RecordEvidenceDto, @Req() req: ReviewRequest) {
    return this.reviewService.recordEvidence(id, dto, context(req));
  }
}
