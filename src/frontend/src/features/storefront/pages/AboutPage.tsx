import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import ServiceCard from '../components/ServiceCard'
import { BRANCHES } from '../constants/branches'

const ICONS = {
  distribution: 'M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4',
  support: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z',
  projects: 'M4 4h16v16H4z M4 9h16 M9 9v11',
  training: 'M12 3 2 8l10 5 10-5-10-5z M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5',
}

export default function AboutPage() {
  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Nosotros' }]}
        title="Nosotros"
        description="Somos distribuidores mayoristas de tecnología de seguridad electrónica."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <section className="max-w-[65ch]">
          <h2 className="text-xl font-bold text-storefront-ink">Quiénes somos</h2>
          <p className="mt-2 text-ink-600">
            Grupo Security SAS es una empresa líder en tecnología de seguridad electrónica, con presencia en Pereira,
            Armenia, Manizales y Cali. Nos destacamos como distribuidores autorizados de las principales marcas del
            sector, siendo socios estratégicos de Hikvision, líder mundial en soluciones de videovigilancia.
          </p>
          <p className="mt-2 text-ink-600">
            Nuestra trayectoria, conocimiento técnico y compromiso con la excelencia nos permiten ofrecer productos
            confiables, asesoría especializada y un servicio cercano, consolidando relaciones duraderas con clientes y
            aliados que confían en nuestra experiencia y respaldo.
          </p>
          <p className="mt-2 text-ink-600">
            Además de ser partner de Hikvision (líder mundial en fabricación de dispositivos de seguridad electrónica),
            somos especialistas en el diseño de proyectos, realizamos asesorías y consultorías, y dictamos cursos,
            capacitaciones y certificaciones HCSA.
          </p>
        </section>
        <section className="mt-8 grid max-w-[105ch] gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-storefront-ink">Misión</h2>
            <p className="mt-2 text-ink-600">
              En Grupo Security trabajamos para ofrecer soluciones integrales en tecnología de seguridad electrónica
              que garanticen confianza, eficiencia y tranquilidad. Nuestro compromiso es brindar productos de alta
              calidad y un acompañamiento especializado, respaldado por la experiencia, el conocimiento y la pasión de
              nuestro equipo, contribuyendo al crecimiento y protección de nuestros clientes y aliados.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-bold text-storefront-ink">Visión</h2>
            <p className="mt-2 text-ink-600">
              Ser reconocidos a nivel nacional como el aliado estratégico más confiable en soluciones de seguridad
              electrónica, destacándonos por la innovación, el servicio especializado y el compromiso con la
              excelencia. Buscamos fortalecer nuestra presencia en el mercado, impulsando el crecimiento tecnológico de
              nuestros clientes y contribuyendo a construir entornos más seguros, conectados y sostenibles.
            </p>
          </div>
        </section>
        <h2 className="mt-8 text-xl font-bold text-storefront-ink">Cómo te respaldamos</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ServiceCard
            to="/catalogo"
            iconPath={ICONS.distribution}
            title="Distribución"
            description="Cámaras, grabadores, control de acceso, alarmas y más, con venta en tiendas físicas y asesoría."
            actionLabel="Ver el catálogo"
          />
          <ServiceCard
            to="/servicios/soporte"
            iconPath={ICONS.support}
            title="Soporte técnico"
            description="Ayuda para configurar, mantener y reparar los equipos que compras con nosotros."
            actionLabel="Ir a soporte"
          />
          <ServiceCard
            to="/servicios/proyectos"
            iconPath={ICONS.projects}
            title="Proyectos"
            description="Evaluamos tus necesidades y diseñamos el proyecto, desde pymes hasta grandes empresas."
            actionLabel="Cotizar un proyecto"
          />
          <ServiceCard
            to="/servicios/certificaciones"
            iconPath={ICONS.training}
            title="Formación"
            description="Cursos y certificaciones para asesores, técnicos e instaladores."
            actionLabel="Ver certificaciones"
          />
        </div>
        <section className="mt-8 rounded-card bg-surface-100 p-6">
          <h2 className="text-xl font-bold text-storefront-ink">Cuatro sedes</h2>
          <p className="mt-2 max-w-[65ch] text-ink-600">
            Estamos en {BRANCHES.map((branch) => branch.city).join(', ')}.{' '}
            <Link
              to="/sedes"
              className="font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              Ver direcciones y cómo llegar
            </Link>
            .
          </p>
        </section>
      </main>
    </StorefrontChrome>
  )
}
