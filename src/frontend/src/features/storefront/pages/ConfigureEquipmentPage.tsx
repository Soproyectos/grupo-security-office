import { useState } from 'react'
import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import { configureSupportMessage, whatsappUrl } from '../constants/contact'

/** `need` completes the sentence "necesito ..." of the WhatsApp message. */
export const CONFIGURE_OPTIONS = [
  { id: 'connect', label: 'Conectar mi cámara a la red y a la aplicación', need: 'conectar mi cámara a la red y a la aplicación' },
  { id: 'firmware', label: 'Actualizar el firmware', need: 'actualizar el firmware' },
  { id: 'password', label: 'Cambiar o recuperar la contraseña', need: 'cambiar o recuperar la contraseña' },
  { id: 'other', label: 'Otra duda de configuración', need: 'ayuda con otra duda de configuración' },
] as const

const READY_ITEMS = [
  'La referencia del equipo, impresa en la caja o en la etiqueta',
  'El número de factura o pedido',
  'La ciudad donde compraste',
]

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

export default function ConfigureEquipmentPage() {
  const [selectedId, setSelectedId] = useState<string>(CONFIGURE_OPTIONS[0].id)
  const selected = CONFIGURE_OPTIONS.find((option) => option.id === selectedId) ?? CONFIGURE_OPTIONS[0]
  const message = configureSupportMessage(selected.need)

  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Servicios', to: '/servicios' }, { label: 'Soporte técnico', to: '/servicios/soporte' }, { label: 'Configurar un equipo' }]}
        title="Configurar un equipo"
        description="Para equipos comprados en Grupo Security. Cuéntanos qué necesitas y te orientamos por WhatsApp."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <fieldset>
              <legend className="text-xl font-bold text-storefront-ink">1. ¿Qué necesitas?</legend>
              <div className="mt-4 grid gap-3">
                {CONFIGURE_OPTIONS.map((option) => (
                  <div key={option.id} className="relative">
                    <input
                      type="radio"
                      id={`configure-${option.id}`}
                      name="configure-need"
                      value={option.id}
                      checked={selectedId === option.id}
                      onChange={() => setSelectedId(option.id)}
                      className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <label
                      htmlFor={`configure-${option.id}`}
                      className="flex min-h-14 cursor-pointer items-center rounded-card border border-surface-300 bg-white px-4 py-3 font-medium text-storefront-ink peer-checked:border-2 peer-checked:border-security-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-security-600"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
            <h2 className="mt-8 text-xl font-bold text-storefront-ink">2. Ten a la mano</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-600">
              {READY_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <section className="h-fit rounded-card border border-surface-200 bg-white p-6">
            <h2 className="text-xl font-bold text-storefront-ink">3. Escríbenos</h2>
            <p className="mt-2 text-ink-600">Este es el mensaje que enviarás. Completa los datos entre corchetes en WhatsApp.</p>
            <p className="mt-4 rounded-control bg-surface-100 p-4 text-storefront-ink" style={{ whiteSpace: 'pre-line' }} data-testid="configure-message">
              {message}
            </p>
            <a
              href={whatsappUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-5 inline-flex min-h-12 items-center justify-center rounded-control bg-security-600 px-6 font-bold !text-white hover:bg-security-500 hover:!text-white ${FOCUS}`}
            >
              Escribir por WhatsApp
            </a>
          </section>
        </div>
        <p className="mt-8 text-ink-600">
          ¿El equipo no enciende o se ve dañado? Eso es diagnóstico o reparación.{' '}
          <Link to="/servicios/soporte" className={`inline-flex min-h-11 items-center font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 ${FOCUS}`}>
            Ver las opciones de soporte
          </Link>
        </p>
      </main>
    </StorefrontChrome>
  )
}
