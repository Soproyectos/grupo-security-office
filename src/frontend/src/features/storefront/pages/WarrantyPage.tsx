import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PageIntro from '../components/PageIntro'
import ServiceCard from '../components/ServiceCard'

/** PDFs copied from the previous site (gruposecurity.co, 2026-11-03) and served from /documentos. */
export const WARRANTY_POLICY_PDF = '/documentos/politica-garantias-cambios-devolucion.pdf'
export const EXCHANGE_FORM_PDF = '/documentos/formulario-cambio-mercancia.pdf'

const ICONS = {
  policy: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z M9 12l2 2 4-4',
  support: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z',
  branches: 'M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
}

interface PolicySection {
  title: string
  paragraphs?: string[]
  items?: string[]
  lead?: string
  after?: string[]
}

const SECTIONS: PolicySection[] = [
  {
    title: 'Definiciones',
    items: [
      'Garantía: obligación temporal, solidaria a cargo del productor y el proveedor, de responder por el buen estado del producto y su conformidad con las condiciones de idoneidad, calidad y seguridad legalmente exigibles o las ofrecidas. La garantía legal no tiene costo adicional al precio del producto.',
      'Garantía legal: obligación, en los términos de la ley, a cargo de todo productor y/o proveedor de responder por la calidad, idoneidad, seguridad y el buen estado y funcionamiento de los productos. En los servicios con obligación de medio, la garantía está dada no por el resultado, sino por las condiciones de calidad en la prestación del servicio.',
      'Promociones y ofertas: ofrecimiento temporal de productos en condiciones especiales favorables o de manera gratuita como incentivo para el consumidor, incluidos los productos con contenido adicional gratuito o a precio reducido y los sistemas de incentivos como rifas, sorteos, concursos y similares.',
      'Derecho de retracto: facultad del consumidor, prevista en el artículo 47 de la ley 1480 de 2011, de terminar unilateralmente un contrato de compraventa y arrepentirse de la compra, sin que el proveedor deba estar de acuerdo. No se puede ejercer en todos los casos: la ley contempla excepciones.',
    ],
  },
  {
    title: 'Garantía',
    paragraphs: [
      'La garantía de los productos de Grupo Security SAS, como cámaras de videovigilancia, NVR, DVR, sistemas de videoportero o de control de acceso, monitores y demás elementos de seguridad electrónica, es de 1 año a partir de la fecha de entrega del producto al comprador.',
      'Los accesorios como cables, baterías, fuentes de poder, multitomas, productos con electroimanes y demás accesorios que funcionen con corriente eléctrica en instalaciones de seguridad electrónica tienen una garantía de 3 meses a partir de la fecha de entrega.',
      'Esta garantía cubre daños o mal funcionamiento del producto y sus accesorios originados por defectos de fabricación.',
    ],
  },
  {
    title: 'Aspectos incluidos en la garantía legal',
    items: [
      'Como regla general, reparación totalmente gratuita de los defectos del bien, incluido su transporte si es necesario, y suministro oportuno de repuestos. Si el bien no admite reparación, se repone o se devuelve el dinero.',
      'Si la falla se repite, según la naturaleza del bien y del defecto, se hace una nueva reparación o el cambio parcial o total por otro de la misma especie y características similares, nunca inferiores a las del producto original.',
      'Instrucciones para la instalación, mantenimiento y utilización de los productos.',
      'Asistencia técnica para la instalación, el mantenimiento y el uso de los productos. La asistencia técnica puede tener un costo adicional.',
      'Las partes, insumos, accesorios o componentes adheridos a bienes inmuebles que deban cambiarse por efectividad de la garantía pueden ser de igual o mejor calidad, aunque no necesariamente idénticos a los originales.',
    ],
  },
  {
    title: 'Constancias de recibo y reparación',
    paragraphs: [
      'Cuando entregas un producto para hacer efectiva la garantía, Grupo Security SAS expide una constancia de recibo que indica los motivos de la reclamación.',
      'Cuando el producto se repara en cumplimiento de la garantía legal, Grupo Security SAS entrega una constancia de reparación con:',
    ],
    items: [
      'Descripción de la reparación efectuada.',
      'Las piezas reemplazadas o reparadas.',
      'La fecha en que el consumidor entregó el producto.',
      'La fecha de devolución del producto.',
    ],
  },
  {
    title: 'Cuándo no aplica la garantía',
    lead: 'Grupo Security SAS queda exonerado de la garantía cuando demuestre que el defecto proviene de:',
    items: [
      'Fuerza mayor o caso fortuito (descarga eléctrica, inundaciones, etc.).',
      'El hecho de un tercero.',
      'El uso indebido del bien por parte del cliente (mala instalación).',
      'No haber atendido las instrucciones de instalación, uso o mantenimiento del manual del producto y de la garantía. Esta causal no puede alegarse si no se entregó manual en castellano.',
      'Sello de garantía roto o con alteraciones en la fecha allí plasmada.',
    ],
  },
  {
    title: 'Retracto',
    paragraphs: [
      'El plazo máximo para ejercer el derecho de retracto es de cinco (5) días hábiles contados desde la entrega del bien o desde la celebración del contrato, si es un servicio.',
      'Debes devolver el producto a Grupo Security SAS por los mismos medios y en las mismas condiciones en que lo recibiste. Los costos de transporte y los demás que implique la devolución los cubre el cliente.',
      'El retracto aplica a bienes o servicios comprados con financiación, por internet, televisión o catálogos y métodos no tradicionales, como la venta puerta a puerta o fuera del establecimiento de comercio. Lo que compres en un establecimiento de comercio sigue el trámite de cambio.',
    ],
    after: [
      'Grupo Security SAS devuelve en dinero todas las sumas pagadas, sin descuentos ni retenciones. La devolución no puede exceder los treinta (30) días calendario desde que ejerciste el derecho.',
    ],
  },
  {
    title: 'Casos en que no aplica el retracto',
    items: [
      'Contratos de prestación de servicios cuya prestación haya comenzado con el acuerdo del consumidor.',
      'Contratos de bienes o servicios cuyo precio esté sujeto a variaciones del mercado financiero que Grupo Security S.A.S. no controla.',
      'Contratos de bienes en los que el cliente tuvo contacto directo con la tienda y el producto y pagó con un medio tradicional o en efectivo.',
      'Bienes que no estaban en inventario y se piden bajo pedido directo con orden de compra, cotización firmada o confirmación escrita por cualquier medio de mensajería electrónica (WhatsApp, correo, etc.).',
    ],
  },
  {
    title: 'Política de cambio',
    paragraphs: [
      'Salvo que las condiciones particulares de venta digan otra cosa, todos los productos comprados en Grupo Security SAS pueden cambiarse, siempre que avises por escrito dentro de 3 (tres) días hábiles contados desde la entrega y cumplas el resto de requisitos de este documento.',
      'Para hacerlo, diligencia el formulario de cambio de mercancía y envíalo con el número de la factura de compra por los canales establecidos: correo electrónico, WhatsApp o esta página web.',
      'Grupo Security SAS cuenta con 3 (tres) días hábiles desde que recibe el formulario para aprobar o no el cambio.',
      'Si la devolución se pide por un error en la orden de compra o en la cotización firmada por el cliente, Grupo Security SAS se reserva el derecho de aceptarla o no.',
    ],
  },
  {
    title: 'Cuándo no se acepta una devolución',
    items: [
      'Si el producto se pidió bajo pedido a nuestro proveedor por orden de compra del cliente, es decir, no era parte del stock de rotación.',
      'Si el producto tiene señales de mala manipulación (rayones, huellas de herramientas, suciedad, etc.), embalaje deteriorado o le faltan accesorios, manuales o documentación de registro.',
      'Si se compró en oferta o promoción.',
      'Si la causa es una falla del producto: en ese caso se aplica la garantía legal.',
      'Si cambiaste de opinión y ya no quieres el producto.',
      'Si el sello de garantía está roto o con alteraciones en la fecha.',
    ],
    after: [
      'No se hace devolución de dinero por cambio de producto. Se genera una nota crédito a tu favor, que puede reducir tu cuenta por pagar o servir de anticipo para tu próxima compra, válida por un año desde su elaboración.',
      'Pasados los 3 (tres) días hábiles, Grupo Security SAS no acepta devoluciones ni cancelaciones por compras de productos incorrectos o cancelaciones de servicios.',
    ],
  },
  {
    title: 'Producto dañado en el envío o incorrecto',
    paragraphs: [
      'Si recibes el producto dañado durante el envío, puedes devolverlo en un plazo de 2 (dos) días hábiles desde la recepción del pedido. Revisa el paquete y su contenido al llegar. No aceptes la entrega si el empaque está en mal estado o abierto, o si notas daños o piezas faltantes: con tu firma aceptas que llegó en orden y el seguro del envío no será válido.',
      'Si el producto no coincide con tu pedido, también puedes devolverlo en 2 (dos) días hábiles desde la recepción.',
      'En ambos casos debes presentar el formulario de cambio de mercancía, y Grupo Security S.A.S. repone la mercancía.',
      'Grupo Security SAS puede modificar este documento cuando sea necesario.',
    ],
  },
]

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'
const DOWNLOAD_CLASS = `inline-flex min-h-11 items-center gap-1 rounded-control border border-security-600 px-4 font-bold !text-security-600 hover:underline hover:!text-security-600 ${FOCUS}`

export default function WarrantyPage() {
  return (
    <StorefrontChrome>
      <PageIntro
        breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Garantías y devoluciones' }]}
        title="Garantías y devoluciones"
        description="Úsalo cuando un equipo comprado en Grupo Security falla, llegó dañado o quieres pedir un cambio."
      />
      <main className="mx-auto w-full max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">
        <section className="max-w-[65ch]">
          <h2 className="text-xl font-bold text-storefront-ink">Nuestro compromiso</h2>
          <p className="mt-2 text-ink-600">
            Queremos que estés satisfecho con tu compra. Ofrecemos cambios y devoluciones bajo las condiciones de esta
            política, que se rige por la ley 1480 de 2011. Los plazos para avisar son cortos: ten a la mano tu factura
            o número de pedido.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={WARRANTY_POLICY_PDF} download className={DOWNLOAD_CLASS}>
              Descargar la política (PDF)
            </a>
            <a href={EXCHANGE_FORM_PDF} download className={DOWNLOAD_CLASS}>
              Descargar el formulario de cambio (PDF)
            </a>
          </div>
        </section>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <ServiceCard
            highlight
            to="/servicios/soporte"
            iconPath={ICONS.support}
            title="Soporte técnico"
            description="Si necesitas configurar, diagnosticar o reparar un equipo, empieza por aquí."
            actionLabel="Ir a soporte técnico"
          />
          <ServiceCard
            to="/sedes"
            iconPath={ICONS.branches}
            title="Nuestras sedes"
            description="Encuentra la sede más cercana para llevar tu equipo."
            actionLabel="Ver las sedes"
          />
          <ServiceCard
            href={EXCHANGE_FORM_PDF}
            iconPath={ICONS.policy}
            title="Formulario de cambio"
            description="Diligéncialo y envíalo con tu factura por correo, WhatsApp o esta página."
            actionLabel="Abrir el formulario"
          />
        </div>
        <div className="mt-10 max-w-[75ch]">
          {SECTIONS.map((section) => (
            <section key={section.title} className="mt-8 first:mt-0">
              <h2 className="text-xl font-bold text-storefront-ink">{section.title}</h2>
              {section.lead && <p className="mt-2 text-ink-600">{section.lead}</p>}
              {section.paragraphs?.map((text) => (
                <p key={text} className="mt-2 text-ink-600">
                  {text}
                </p>
              ))}
              {section.items && (
                <ul className="mt-2 list-disc space-y-2 pl-6 text-ink-600">
                  {section.items.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {section.after?.map((text) => (
                <p key={text} className="mt-3 font-bold text-storefront-ink">
                  {text}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-8 max-w-[65ch] text-ink-600">
          ¿No sabes si es una garantía? Revisa primero{' '}
          <Link
            to="/servicios/soporte"
            className={`font-bold !text-security-600 underline underline-offset-4 hover:!text-security-600 ${FOCUS}`}
          >
            qué tipo de ayuda necesitas
          </Link>
          .
        </p>
      </main>
    </StorefrontChrome>
  )
}
