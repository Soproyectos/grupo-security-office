import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface NotificationListParams {
  userId: string;
  unreadOnly?: boolean;
  take?: number;
  skip?: number;
  type?: NotificationType;
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data ?? Prisma.JsonNull,
      },
    });
  }

  async createMany(inputs: CreateNotificationInput[]) {
    return this.prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        message: i.message,
        data: i.data ?? Prisma.JsonNull,
      })),
    });
  }

  async findAll(params: NotificationListParams) {
    const { userId, unreadOnly, take = 20, skip = 0, type } = params;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly && { readAt: null }),
      ...(type && { type }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      data: notifications,
      meta: { total, skip, take, unreadCount },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async delete(notificationId: string, userId: string) {
    return this.prisma.notification.delete({
      where: { id: notificationId, userId },
    });
  }

  // Helper methods for common notification types

  async notifyLeadAssigned(
    userId: string,
    leadName: string,
    leadId: string,
  ) {
    return this.create({
      userId,
      type: 'LEAD_ASSIGNED',
      title: 'Nuevo lead asignado',
      message: `Se te ha asignado el lead "${leadName}"`,
      data: { leadId, leadName },
    });
  }

  async notifyQuoteStatusChanged(
    userId: string,
    quoteCode: string,
    quoteId: string,
    oldStatus: string,
    newStatus: string,
  ) {
    const statusLabels: Record<string, string> = {
      borrador: 'Borrador',
      enviada: 'Enviada',
      negociacion: 'En negociación',
      ganada: 'Ganada',
      perdida: 'Perdida',
    };

    return this.create({
      userId,
      type: 'QUOTE_STATUS_CHANGED',
      title: 'Cotización actualizada',
      message: `La cotización ${quoteCode} cambió a "${statusLabels[newStatus] || newStatus}"`,
      data: { quoteId, quoteCode, oldStatus, newStatus },
    });
  }

  async notifyOrderInvoiced(
    userId: string,
    orderCode: string,
    orderId: string,
    amount: number,
    currency: string,
  ) {
    return this.create({
      userId,
      type: 'ORDER_INVOICED',
      title: 'Pedido facturado',
      message: `El pedido ${orderCode} fue facturado por ${amount.toLocaleString()} ${currency}`,
      data: { orderId, orderCode, amount, currency },
    });
  }

  async notifyCustomerConverted(
    userId: string,
    customerName: string,
    customerId: string,
  ) {
    return this.create({
      userId,
      type: 'CUSTOMER_CONVERTED',
      title: 'Lead convertido a cliente',
      message: `El lead "${customerName}" ahora es un cliente`,
      data: { customerId, customerName },
    });
  }

  async notifyTargetAlert(
    userId: string,
    percentage: number,
    period: string,
  ) {
    return this.create({
      userId,
      type: 'TARGET_ALERT',
      title: 'Alerta de meta comercial',
      message: `Llevas ${percentage}% de tu meta de ${period}. ${percentage >= 100 ? '¡Meta alcanzada!' : 'Queda poco para cumplirla.'}`,
      data: { percentage, period },
    });
  }

  async notifyProductPendingPublication(
    userId: string,
    productName: string,
    productId: string,
  ) {
    return this.create({
      userId,
      type: 'PRODUCT_PENDING_PUBLICATION',
      title: 'Producto pendiente de publicación',
      message: `El producto "${productName}" está listo para publicar`,
      data: { productId, productName },
    });
  }

  async notifyPriceChanged(
    userId: string,
    productName: string,
    productId: string,
    oldPrice: number,
    newPrice: number,
    currency: string,
  ) {
    return this.create({
      userId,
      type: 'PRICE_CHANGED',
      title: 'Precio actualizado',
      message: `El precio de "${productName}" cambió de ${oldPrice} a ${newPrice} ${currency}`,
      data: { productId, productName, oldPrice, newPrice, currency },
    });
  }

  async notifyStockAlert(
    userId: string,
    productName: string,
    productId: string,
    currentStock: number,
    threshold: number,
  ) {
    return this.create({
      userId,
      type: 'STOCK_ALERT',
      title: 'Alerta de stock bajo',
      message: `El producto "${productName}" tiene solo ${currentStock} unidades (umbral: ${threshold})`,
      data: { productId, productName, currentStock, threshold },
    });
  }

  async notifySubordinateQuoteWon(
    supervisorId: string,
    subordinateName: string,
    quoteCode: string,
    amount: number,
    currency: string,
  ) {
    return this.create({
      userId: supervisorId,
      type: 'SUBORDINATE_QUOTE_WON',
      title: 'Tu equipo ganó una cotización',
      message: `${subordinateName} ganó la cotización ${quoteCode} por ${amount.toLocaleString()} ${currency}`,
      data: { subordinateName, quoteCode, amount, currency },
    });
  }

  async notifySubordinateQuoteLost(
    supervisorId: string,
    subordinateName: string,
    quoteCode: string,
  ) {
    return this.create({
      userId: supervisorId,
      type: 'SUBORDINATE_QUOTE_LOST',
      title: 'Tu equipo perdió una cotización',
      message: `${subordinateName} perdió la cotización ${quoteCode}`,
      data: { subordinateName, quoteCode },
    });
  }

  async notifyImportCompleted(
    userId: string,
    fileName: string,
    imported: number,
    errors: number,
  ) {
    return this.create({
      userId,
      type: errors > 0 ? 'IMPORT_FAILED' : 'IMPORT_COMPLETED',
      title: errors > 0 ? 'Importación completada con errores' : 'Importación completada',
      message: `${fileName}: ${imported} registros importados${errors > 0 ? `, ${errors} errores` : ''}`,
      data: { fileName, imported, errors },
    });
  }

  async notifyAccountChanged(
    userId: string,
    changeType: 'password' | 'role' | 'email' | 'supervisor',
  ) {
    const messages: Record<string, string> = {
      password: 'Tu contraseña fue cambiada',
      role: 'Tus roles fueron actualizados',
      email: 'Tu email fue cambiado',
      supervisor: 'Tu supervisor fue actualizado',
    };

    return this.create({
      userId,
      type: 'ACCOUNT_CHANGED',
      title: 'Cambio en tu cuenta',
      message: messages[changeType],
      data: { changeType },
    });
  }

  async notifyAssignmentGranted(
    userId: string,
    resourceType: string,
    resourceName: string,
    level: string,
  ) {
    return this.create({
      userId,
      type: 'ASSIGNMENT_GRANTED',
      title: 'Nuevo acceso concedido',
      message: `Se te otorgó acceso ${level} a ${resourceType} "${resourceName}"`,
      data: { resourceType, resourceName, level },
    });
  }
}