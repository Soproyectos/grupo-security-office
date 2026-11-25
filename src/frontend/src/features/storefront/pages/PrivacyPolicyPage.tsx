import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'

/**
 * Data processing policy of the customer portal.
 * DRAFT: the official text must be approved by the company before production.
 * Source: docs/handoffs/politica-tratamiento-datos-prueba.md
 */
export const PRIVACY_POLICY_VERSION_LABEL = 'Versión en revisión (borrador 2026-11)'

export default function PrivacyPolicyPage() {
  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <article className="rounded-card border border-surface-200 bg-white px-6 py-8 sm:px-10">
          <Link to="/clientes/registro" className="inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500">
            ← Volver al registro
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Política de tratamiento de datos del portal</h1>
          <p role="note" className="mt-3 rounded-control bg-surface-100 p-3 text-sm text-ink-900">
            {PRIVACY_POLICY_VERSION_LABEL}. Este texto aún no es la versión oficial.
          </p>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-ink-700">
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Quién administra tus datos</h2>
              <p className="mt-2">Grupo Security S.A.S. administra los datos que facilitas al crear y usar una cuenta del portal. Los datos de identificación y contacto del responsable se completarán en la versión oficial.</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Qué datos usamos y para qué</h2>
              <p className="mt-2">Pedimos nombre, empresa y correo electrónico, y de forma opcional tu documento o NIT y tu teléfono. Los usamos para crear y administrar tu cuenta, atender tus solicitudes, proteger el acceso y enviarte los mensajes necesarios para usar el portal, como la confirmación de tu correo y la recuperación de tu contraseña.</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Servicios que intervienen</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Google, solo si eliges entrar con tu cuenta de Google: recibimos tu nombre y correo.</li>
                <li>Cloudflare, para comprobar que quien se registra o entra no es un programa automático.</li>
                <li>Nuestro proveedor de correo, para enviarte los mensajes del portal.</li>
                <li>Al crear o cambiar tu contraseña comprobamos si apareció en filtraciones públicas. Nunca enviamos tu contraseña: solo un fragmento cifrado que no permite conocerla.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Cómo ejercer tus derechos</h2>
              <p className="mt-2">Puedes conocer, actualizar o corregir tus datos desde «Mis datos» en el portal, y pedir que eliminemos tu cuenta desde esa misma página. También puedes revocar tu autorización cuando corresponda. El canal de atención de privacidad se indicará en la versión oficial.</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Conservación y cambios</h2>
              <p className="mt-2">Conservaremos los datos durante los plazos que se definan para administrar la cuenta, atender solicitudes y cumplir las obligaciones aplicables. Guardamos la fecha y la versión de esta política que aceptaste; si cambia, te lo informaremos.</p>
            </section>
          </div>
        </article>
      </main>
    </StorefrontChrome>
  )
}
