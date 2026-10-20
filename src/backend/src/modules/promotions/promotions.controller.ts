import { FileInterceptor } from '@nestjs/platform-express';
import { BadRequestException, Delete, UploadedFile, UseInterceptors, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLE } from '../../common/rbac/roles.constants';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './promotion.dto';

@Controller('api/promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private service: PromotionsService) {}
  private ctx(user: any) { return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] }; }

  @Get('current')
  @Roles(ROLE.VENDEDOR, ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  current(@CurrentUser() user: any) { return this.service.current(this.ctx(user)); }

  @Get('manage')
  @Roles(ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  manage(@CurrentUser() user: any) { return this.service.manage(this.ctx(user)); }

  @Post()
  @Roles(ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  publish(@CurrentUser() user: any, @Body() dto: CreatePromotionDto) {
    return this.service.publish(dto, this.ctx(user));
  }


  @Patch(':id')
  @Roles(ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  edit(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreatePromotionDto) {
    return this.service.edit(id, dto, this.ctx(user));
  }

  @Post(':id/flyer')
  @Roles(ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: any, @Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('Selecciona un flyer');
    return this.service.setFlyer(id, file, this.ctx(user));
  }

  @Delete(':id/flyer')
  @Roles(ROLE.SUPERVISOR, ROLE.SUPER_ADMIN)
  removeFlyer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.setFlyer(id, undefined, this.ctx(user));
  }

  @Patch(':id/publish')
  publishDraft(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publishExisting(id, this.ctx(user));
  }

  @Patch(':id/withdraw')
  withdraw(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.withdraw(id, this.ctx(user));
  }
}
