import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import ServiceCard from '../components/ServiceCard'

const ICONS = {
  configure: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  repair: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z',
  warranty: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z M9 12l2 2 4-4',
}

export default function SupportPage() {
  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Servicios', to: '/servicios' }, { label: 'Soporte técnico' }]}
        title="Soporte técnico"
        description="Elige el tipo de ayuda que necesitas. Configurar un equipo nuevo no es lo mismo que repararlo."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid gap-6 sm:grid-cols-3">
          <ServiceCard
            highlight
            to="/servicios/soporte/configurar"
            iconPath={ICONS.configure}
            title="Configurar un equipo"
            description="Puesta en marcha, aplicación móvil, firmware, contraseñas y pruebas de funcionamiento de equipos comprados en Grupo Security."
            actionLabel="Pedir ayuda para configurar"
          />
          <ServiceCard
            to="/sedes"
            iconPath={ICONS.repair}
            title="Diagnóstico o reparación"
            description="El punto de servicio autorizado atiende mantenimiento, reparación y garantías en nuestras sedes. Elige la más cercana."
            actionLabel="Ver las sedes"
          />
          <ServiceCard
            to="/garantias"
            iconPath={ICONS.warranty}
            title="Garantías y devoluciones"
            description="Consulta la política oficial antes de llevar o enviar un equipo."
            actionLabel="Ver garantías y devoluciones"
          />
        </div>
        <section aria-labelledby="support-ours-title" className="mt-8 max-w-[75ch]">
          <h2 id="support-ours-title" className="text-xl font-bold text-storefront-ink">
            Nuestro soporte
          </h2>
          <p className="mt-2 text-ink-600">
            Ofrecemos soporte técnico especializado, ya que contamos con una robusta plantilla de profesionales con
            amplia trayectoria y las certificaciones correspondientes, lo cual es garantía de que tus equipos están en
            las mejores manos. En Grupo Security SAS contamos con profesionales capacitados y certificados para
            brindarte asesoría confiable en seguridad electrónica.
          </p>
          <p className="mt-2 text-ink-600">
            Te acompañamos sin costo adicional en la configuración, puesta en marcha y correcto funcionamiento de los
            productos adquiridos con nosotros. Nuestro personal altamente capacitado está disponible para atenderte y
            guiarte.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-ink-600">
            <li>Restablecimiento de contraseñas.</li>
            <li>Actualizaciones de firmware.</li>
            <li>Soporte o asistencia presencial y telefónica para todas las marcas y categorías adquiridas.</li>
            <li>
              Capacitaciones sobre el correcto manejo de los equipos, incluyendo la manipulación adecuada y puesta en
              funcionamiento.
            </li>
            <li>Pruebas diagnósticas.</li>
            <li>Pruebas de compatibilidad y funcionamiento.</li>
          </ul>
        </section>
        <section aria-labelledby="support-pstah-title" className="mt-8 max-w-[75ch]">
          <h2 id="support-pstah-title" className="text-xl font-bold text-storefront-ink">
            Punto de servicio técnico autorizado Hikvision (PSTAH)
          </h2>
          <p className="mt-2 text-ink-600">
            Bienvenido a nuestro servicio técnico autorizado respaldado por Hikvision, Hilook y Ezviz. Contamos con un
            equipo altamente calificado dispuesto a solucionar de manera eficiente y confiable tus necesidades de
            mantenimiento y reparación de equipos.
          </p>
          <h3 className="mt-4 text-lg font-bold text-storefront-ink">Para realizar un ingreso por garantía</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-ink-600">
            <li>
              Encuentra nuestra{' '}
              <Link to="/sedes" className="font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600">
                sede más cercana
              </Link>{' '}
              en Armenia, Cali, Manizales o Pereira.
            </li>
            <li>Lleva tu equipo junto con todos sus accesorios.</li>
            <li>Permite que nuestro personal realice el diagnóstico y la reparación si es necesario.</li>
            <li>Recoge tu equipo una vez completado el proceso y continúa disfrutando de los beneficios de su instalación.</li>
          </ol>
          <h3 className="mt-4 text-lg font-bold text-storefront-ink">Nuestros servicios incluyen</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-ink-600">
            <li>Atención a garantías.</li>
            <li>Asistencia técnica profesional especializada.</li>
            <li>Mantenimiento preventivo y correctivo.</li>
            <li>Diagnóstico y reparación integral.</li>
            <li>Actualizaciones de firmware.</li>
            <li>Desvinculación de dispositivos.</li>
            <li>Restablecimiento de contraseñas.</li>
          </ul>
          <p className="mt-3 text-ink-600">
            Nuestro compromiso es ofrecerte la mejor solución garantizando la calidad, eficacia y la atención que solo
            el personal capacitado y certificado por Hikvision puede brindar. Trabajamos para mantener tus equipos en
            perfecto estado de funcionamiento.
          </p>
        </section>
        <section className="mt-8 rounded-card bg-surface-100 p-6">
          <h2 className="text-xl font-bold text-storefront-ink">¿No sabes cuál elegir?</h2>
          <p className="mt-2 max-w-[65ch] text-ink-600">
            Si el equipo enciende pero no logras conectarlo o verlo en la aplicación, empieza por{' '}
            <Link
              to="/servicios/soporte/configurar"
              className="font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600"
            >
              configurar
            </Link>
            . Si no enciende, se ve dañado o dejó de funcionar, pide diagnóstico.
          </p>
        </section>
      </main>
    </StorefrontChrome>
  )
}
