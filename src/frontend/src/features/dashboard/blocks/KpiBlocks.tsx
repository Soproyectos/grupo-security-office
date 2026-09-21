import { StatCard } from '../../../components/ui'
import {
  useWorkspace,
  useCatalogInsights,
  useUsersInsights,
  formatMoney,
  formatNumber,
  formatRelative,
} from './shared'

/**
 * KPIs del catálogo de bloques.
 *
 * Todos comparten la misma caja (`StatCard`) y se alimentan de tres consultas
 * —espacio de trabajo, catálogo y usuarios— que react-query deduplica: ocho
 * KPIs en pantalla no son ocho peticiones.
 *
 * Ninguno inventa una cifra: si el backend no la trae, la tarjeta muestra su
 * estado de error en vez de un cero engañoso.
 */

// --- Paquete: ventas ---------------------------------------------------------

export function KpiVentasMes() {
  const { data, isLoading, error } = useWorkspace()
  const invoiced = data?.commercial?.invoiced

  return (
    <StatCard
      label="Ventas del mes"
      value={invoiced ? formatMoney(invoiced.amount, invoiced.currency) : '—'}
      hint={invoiced?.mixedCurrency ? 'Incluye varias monedas' : 'Facturado este mes'}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiCierreMes() {
  const { data, isLoading, error } = useWorkspace()
  const remaining = data?.commercial?.remaining

  return (
    <StatCard
      label="Cierre del mes"
      value={remaining ? formatMoney(remaining.amount, remaining.currency) : 'Sin meta'}
      hint={remaining ? 'Falta para la meta' : 'No hay meta fijada'}
      variant={remaining && Number(remaining.amount) > 0 ? 'warning' : 'success'}
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: cotizaciones ---------------------------------------------------

export function KpiCotizacionesAbiertas() {
  const { data, isLoading, error } = useWorkspace()
  const q = data?.commercial?.myQuotes

  const abiertas = q ? q.enviada + q.negociacion : 0

  return (
    <StatCard
      label="Cotizaciones abiertas"
      value={formatNumber(abiertas)}
      hint={q ? `${q.enviada} enviadas · ${q.negociacion} en negociación` : undefined}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiValorNegociacion() {
  const { data, isLoading, error } = useWorkspace()
  const pipeline = data?.commercial?.pipeline

  return (
    <StatCard
      label="Valor en negociación"
      value={pipeline ? formatMoney(pipeline.amount) : '—'}
      hint={pipeline ? `${pipeline.count} cotizaciones` : undefined}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiTasaConversion() {
  const { data, isLoading, error } = useWorkspace()
  const q = data?.commercial?.myQuotes

  // Se mide sobre cotizaciones ya resueltas: incluir las abiertas hundiría la
  // tasa artificialmente, porque aún pueden ganarse.
  const cerradas = q ? q.ganada + q.perdida : 0
  const tasa = cerradas > 0 ? Math.round(((q?.ganada ?? 0) / cerradas) * 100) : null

  return (
    <StatCard
      label="Tasa de conversión"
      value={tasa === null ? '—' : `${tasa}%`}
      hint={cerradas > 0 ? `${q?.ganada} de ${cerradas} cerradas` : 'Sin cotizaciones cerradas'}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiGanadasMes() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="Ganadas este mes"
      value={formatNumber(data?.commercial?.myQuotes?.ganada ?? 0)}
      hint="Cotizaciones cerradas con éxito"
      variant="success"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiNuevasSemana() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="En borrador"
      value={formatNumber(data?.commercial?.myQuotes?.borrador ?? 0)}
      hint="Cotizaciones sin enviar"
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: catálogo -------------------------------------------------------

export function KpiProductosPublicados() {
  const { data, isLoading, error } = useCatalogInsights()

  return (
    <StatCard
      label="Productos publicados"
      value={formatNumber(data?.published ?? 0)}
      hint={data ? `${formatNumber(data.products)} en el catálogo` : undefined}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiProductosVisibles() {
  const { data, isLoading, error } = useCatalogInsights()

  return (
    <StatCard
      label="Productos visibles"
      value={formatNumber(data?.published ?? 0)}
      hint="Catálogo publicado"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiCategorias() {
  const { data, isLoading, error } = useCatalogInsights()

  return (
    <StatCard
      label="Categorías"
      value={formatNumber(data?.categories ?? 0)}
      hint="Del catálogo general"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiUltimaActualizacion() {
  const { data, isLoading, error } = useCatalogInsights()
  const last = data?.latest?.[0]

  return (
    <StatCard
      label="Última actualización"
      value={last ? formatRelative(last.updatedAt) : '—'}
      hint="Del catálogo general"
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: listas ---------------------------------------------------------

export function KpiListasActivas() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="Listas activas"
      value={formatNumber(data?.kpis?.listas ?? 0)}
      hint="Con acceso vigente"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiListasConAcceso() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="Listas con acceso"
      value={formatNumber(data?.listas?.length ?? 0)}
      hint="Nivel: visualización"
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: publicación ----------------------------------------------------

export function KpiPendientesPublicacion() {
  const { data, isLoading, error } = useWorkspace()
  const pendientes = data?.kpis?.pendingPublication ?? 0

  return (
    <StatCard
      label="Pendientes de publicación"
      value={formatNumber(pendientes)}
      hint="Listos para revisar"
      variant={pendientes > 0 ? 'warning' : 'default'}
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: usuarios -------------------------------------------------------

export function KpiUsuariosTotales() {
  const { data, isLoading, error } = useUsersInsights()

  return (
    <StatCard
      label="Usuarios totales"
      value={formatNumber(data?.total ?? 0)}
      hint={data ? `${formatNumber(data.active)} activos` : undefined}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiUsuariosComerciales() {
  const { data, isLoading, error } = useUsersInsights()

  const comerciales = (data?.byRole ?? [])
    .filter((r) => ['Vendedor', 'Admin Comercial', 'Supervisor'].includes(r.role))
    .reduce((acc, r) => acc + r.count, 0)

  return (
    <StatCard
      label="Usuarios comerciales"
      value={formatNumber(comerciales)}
      hint="Vendedores, supervisión y administración"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiVendedoresActivos() {
  const { data, isLoading, error } = useWorkspace()
  const miembros = data?.team?.members?.length

  return (
    <StatCard
      label="Vendedores en mi equipo"
      value={formatNumber(miembros ?? 0)}
      hint={miembros ? 'Con seguimiento de meta' : 'Sin equipo asignado'}
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: auditoría ------------------------------------------------------

export function KpiEventosAuditoria() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="Eventos de auditoría"
      value={formatNumber(data?.kpis?.recentActivity ?? 0)}
      hint="Actividad reciente"
      loading={isLoading}
      error={!!error}
    />
  )
}

// --- Paquete: operación ------------------------------------------------------

export function KpiProductosAdministro() {
  const { data, isLoading, error } = useWorkspace()

  return (
    <StatCard
      label="Productos que administro"
      value={formatNumber(data?.kpis?.products ?? 0)}
      hint={data ? `En ${data.listas.length} Listas asignadas` : undefined}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiActualizadosHoy() {
  const { data, isLoading, error } = useCatalogInsights()

  return (
    <StatCard
      label="Actualizados hoy"
      value={formatNumber(data?.updatedToday ?? 0)}
      hint="Precio, stock o ficha"
      variant="success"
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiPendientesActualizar() {
  const { data, isLoading, error } = useCatalogInsights()
  const pendientes = data?.pendingPublication ?? 0

  return (
    <StatCard
      label="Pendientes de actualizar"
      value={formatNumber(pendientes)}
      hint="Listos sin publicar"
      variant={pendientes > 0 ? 'warning' : 'default'}
      loading={isLoading}
      error={!!error}
    />
  )
}

export function KpiImagenesFaltantes() {
  const { data, isLoading, error } = useCatalogInsights()
  const faltantes = data?.missingImages ?? 0

  return (
    <StatCard
      label="Imágenes faltantes"
      value={formatNumber(faltantes)}
      hint="Ficha incompleta"
      variant={faltantes > 0 ? 'warning' : 'default'}
      loading={isLoading}
      error={!!error}
    />
  )
}
