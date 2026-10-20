import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService, NotificationListParams } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationType } from '@prisma/client';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario actual' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  async findAll(
    @CurrentUser() user: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('type') type?: NotificationType,
  ) {
    const params: NotificationListParams = {
      userId: user?.sub ?? user?.id,
      unreadOnly: unreadOnly === 'true',
      take: take ? parseInt(take) : 20,
      skip: skip ? parseInt(skip) : 0,
      type,
    };
    return this.notificationService.findAll(params);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Obtener conteo de notificaciones no leídas' })
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notificationService.getUnreadCount(
      user?.sub ?? user?.id,
    );
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.notificationService.markAsRead(id, user?.sub ?? user?.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationService.markAllAsRead(user?.sub ?? user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar notificación' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.notificationService.delete(id, user?.sub ?? user?.id);
  }
}