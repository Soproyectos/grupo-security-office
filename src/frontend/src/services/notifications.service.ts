import api from './api'

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  data: Record<string, any> | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListResponse {
  data: Notification[]
  meta: {
    total: number
    skip: number
    take: number
    unreadCount: number
  }
}

export interface UnreadCountResponse {
  count: number
}

export const fetchNotifications = async (params?: {
  unreadOnly?: boolean
  take?: number
  skip?: number
  type?: string
}): Promise<NotificationListResponse> => {
  const searchParams = new URLSearchParams()
  if (params?.unreadOnly) searchParams.set('unreadOnly', 'true')
  if (params?.take) searchParams.set('take', String(params.take))
  if (params?.skip) searchParams.set('skip', String(params.skip))
  if (params?.type) searchParams.set('type', params.type)

  const res = await api.get(`/notifications?${searchParams}`)
  return res.data
}

export const fetchUnreadCount = async (): Promise<number> => {
  const res = await api.get('/notifications/unread-count')
  return res.data.count
}

export const markNotificationAsRead = async (id: string): Promise<Notification> => {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data
}

export const markAllNotificationsAsRead = async (): Promise<{ count: number }> => {
  const res = await api.patch('/notifications/read-all')
  return res.data
}

export const deleteNotification = async (id: string): Promise<void> => {
  await api.delete(`/notifications/${id}`)
}

// Helper para formatear tipo de notificación a label legible
export const getNotificationTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    LEAD_ASSIGNED: 'Lead asignado',
    QUOTE_STATUS_CHANGED: 'Cotización actualizada',
    ORDER_INVOICED: 'Pedido facturado',
    CUSTOMER_CONVERTED: 'Lead convertido',
    TARGET_ALERT: 'Alerta de meta',
    TARGET_REACHED: 'Meta alcanzada',
    PRODUCT_PENDING_PUBLICATION: 'Producto pendiente publicación',
    PRODUCT_PUBLISHED: 'Producto publicado',
    PRODUCT_UNPUBLISHED: 'Producto despublicado',
    PRICE_CHANGED: 'Precio cambiado',
    STOCK_ALERT: 'Alerta de stock',
    SUBORDINATE_QUOTE_WON: 'Equipo ganó cotización',
    SUBORDINATE_QUOTE_LOST: 'Equipo perdió cotización',
    SUBORDINATE_TARGET_ALERT: 'Alerta meta equipo',
    NEW_TEAM_MEMBER: 'Nuevo integrante',
    IMPORT_COMPLETED: 'Importación completada',
    IMPORT_FAILED: 'Importación fallida',
    ERP_SYNC_STATUS: 'Sync ERP',
    ACCOUNT_CHANGED: 'Cambio en cuenta',
    SECURITY_ALERT: 'Alerta de seguridad',
    ASSIGNMENT_GRANTED: 'Acceso concedido',
    PERMISSION_CHANGED: 'Permisos cambiados',
  }
  return labels[type] || type
}

// Helper para icono según tipo
export const getNotificationIcon = (type: string): string => {
  const icons: Record<string, string> = {
    LEAD_ASSIGNED: 'user-plus',
    QUOTE_STATUS_CHANGED: 'file-text',
    ORDER_INVOICED: 'dollar-sign',
    CUSTOMER_CONVERTED: 'user-check',
    TARGET_ALERT: 'target',
    TARGET_REACHED: 'award',
    PRODUCT_PENDING_PUBLICATION: 'clock',
    PRODUCT_PUBLISHED: 'globe',
    PRODUCT_UNPUBLISHED: 'eye-off',
    PRICE_CHANGED: 'tag',
    STOCK_ALERT: 'alert-triangle',
    SUBORDINATE_QUOTE_WON: 'trending-up',
    SUBORDINATE_QUOTE_LOST: 'trending-down',
    SUBORDINATE_TARGET_ALERT: 'alert-circle',
    NEW_TEAM_MEMBER: 'users',
    IMPORT_COMPLETED: 'download',
    IMPORT_FAILED: 'x-circle',
    ERP_SYNC_STATUS: 'refresh-cw',
    ACCOUNT_CHANGED: 'user-cog',
    SECURITY_ALERT: 'shield-alert',
    ASSIGNMENT_GRANTED: 'key',
    PERMISSION_CHANGED: 'lock',
  }
  return icons[type] || 'bell'
}

// Helper para color según tipo
export const getNotificationColor = (type: string): string => {
  const colors: Record<string, string> = {
    LEAD_ASSIGNED: 'text-blue-600 bg-blue-50',
    QUOTE_STATUS_CHANGED: 'text-indigo-600 bg-indigo-50',
    ORDER_INVOICED: 'text-emerald-600 bg-emerald-50',
    CUSTOMER_CONVERTED: 'text-purple-600 bg-purple-50',
    TARGET_ALERT: 'text-amber-600 bg-amber-50',
    TARGET_REACHED: 'text-yellow-600 bg-yellow-50',
    PRODUCT_PENDING_PUBLICATION: 'text-orange-600 bg-orange-50',
    PRODUCT_PUBLISHED: 'text-teal-600 bg-teal-50',
    PRODUCT_UNPUBLISHED: 'text-gray-600 bg-gray-50',
    PRICE_CHANGED: 'text-cyan-600 bg-cyan-50',
    STOCK_ALERT: 'text-red-600 bg-red-50',
    SUBORDINATE_QUOTE_WON: 'text-emerald-600 bg-emerald-50',
    SUBORDINATE_QUOTE_LOST: 'text-red-600 bg-red-50',
    SUBORDINATE_TARGET_ALERT: 'text-amber-600 bg-amber-50',
    NEW_TEAM_MEMBER: 'text-blue-600 bg-blue-50',
    IMPORT_COMPLETED: 'text-green-600 bg-green-50',
    IMPORT_FAILED: 'text-red-600 bg-red-50',
    ERP_SYNC_STATUS: 'text-blue-600 bg-blue-50',
    ACCOUNT_CHANGED: 'text-gray-600 bg-gray-50',
    SECURITY_ALERT: 'text-red-600 bg-red-50',
    ASSIGNMENT_GRANTED: 'text-indigo-600 bg-indigo-50',
    PERMISSION_CHANGED: 'text-purple-600 bg-purple-50',
  }
  return colors[type] || 'text-gray-600 bg-gray-50'
}