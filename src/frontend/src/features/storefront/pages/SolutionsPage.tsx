import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import ServiceCard from '../components/ServiceCard'

const ICONS = {
  watch: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  intrusion: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z M12 8v5 M12 16v.5',
  access: 'M6 11V8a6 6 0 1 1 12 0v3 M5 11h14v10H5z',
  connect: 'M5 12a10 10 0 0 1 14 0 M8 15a6 6 0 0 1 8 0 M12 19h.01',
}

const searchUrl = (query: string) => `/catalogo/buscar?q=${encodeURIComponent(query)}`

export default function SolutionsPage() {
  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Soluciones' }]}
        title="Soluciones"
        description="Elige lo que necesitas lograr y te mostramos los equipos del catálogo que sirven para eso."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ServiceCard
            to={searchUrl('cámara')}
            iconPath={ICONS.watch}
            title="Vigilar un espacio"
            description="Cámaras y grabadores para ver y guardar lo que pasa en tu casa o negocio."
            actionLabel="Ver cámaras"
          />
          <ServiceCard
            to={searchUrl('alarma')}
            iconPath={ICONS.intrusion}
            title="Detectar intrusiones"
            description="Alarmas y sensores que avisan cuando alguien entra sin permiso."
            actionLabel="Ver alarmas"
          />
          <ServiceCard
            to={searchUrl('control de acceso')}
            iconPath={ICONS.access}
            title="Controlar entradas"
            description="Lectores, cerraduras y videoporteros para decidir quién entra y cuándo."
            actionLabel="Ver control de acceso"
          />
          <ServiceCard
            to={searchUrl('switch')}
            iconPath={ICONS.connect}
            title="Conectar tus equipos"
            description="Switches, cableado y redes para que todos tus equipos funcionen juntos."
            actionLabel="Ver conectividad"
          />
        </div>
        <p className="mt-8 max-w-[65ch] text-ink-600">
          ¿Un proyecto más grande? Cuéntanos qué necesitas en{' '}
          <Link
            to="/servicios/proyectos"
            className="font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
          >
            Proyectos
          </Link>
          .
        </p>
      </main>
    </StorefrontChrome>
  )
}
