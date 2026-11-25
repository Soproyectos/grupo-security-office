import { Link } from 'react-router-dom'
import { SALES_PHONE_DISPLAY, WHATSAPP_MESSAGES, whatsappUrl } from '../../storefront/constants/contact'

export default function CustomerHelpPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="portal-account__title">Ayuda y soporte</h1>
        <p className="mt-2 text-ink-600">Elige el canal según lo que quieras resolver.</p>
      </header>
      <div className="portal-account__panel space-y-5">
        <section>
          <h2 className="portal-account__section-title">Soporte técnico</h2>
          <p className="mt-1 text-ink-600">Encuentra ayuda para configurar un equipo, diagnosticar un problema o solicitar una garantía.</p>
          <Link to="/servicios/soporte" className="portal-account__text-link">Consultar opciones de soporte</Link>
        </section>
        <section className="border-t border-neutral-200 pt-5">
          <h2 className="portal-account__section-title">Precios y asesoría</h2>
          <p className="mt-1 text-ink-600">Consulta las condiciones de tu cuenta o pide ayuda para elegir un equipo.</p>
          <a href={whatsappUrl(WHATSAPP_MESSAGES.contact)} target="_blank" rel="noreferrer" className="portal-account__text-link">
            Escribir por WhatsApp al {SALES_PHONE_DISPLAY}
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        </section>
        <section className="border-t border-neutral-200 pt-5">
          <h2 className="portal-account__section-title">Mi cuenta y mis datos</h2>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <Link to="/clientes/seguridad" className="portal-account__text-link">Revisar mi acceso</Link>
            <Link to="/clientes/privacidad#contacto-privacidad" className="portal-account__text-link">Consultar canales de privacidad</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
