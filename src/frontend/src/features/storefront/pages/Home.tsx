import { Link } from 'react-router-dom'
import StorefrontLayout from '../components/StorefrontLayout'
import CategoryTile from '../components/CategoryTile'
import ProductCard from '../components/ProductCard'
import PromoBanner from '../components/PromoBanner'

const PRODUCTS_1 = [
  {
    brand: 'Hikvision',
    name: 'Cámara IP domo 4MP con IR 30m',
    sku: 'GS-CAM-0142',
    tag: 'MÁS VENDIDO',
    stock: 'En stock',
    stockColor: '#047857',
  },
  {
    brand: 'Dahua',
    name: 'NVR 16 canales 4K con PoE',
    sku: 'GS-NVR-0056',
    stock: 'En stock',
    stockColor: '#047857',
  },
  {
    brand: 'EZVIZ',
    name: 'Cámara Wi-Fi interior 360° 2MP',
    sku: 'GS-CAM-0211',
    tag: 'NUEVO',
    stock: 'En stock',
    stockColor: '#047857',
  },
  {
    brand: 'Hikvision',
    name: 'Cámara bullet turbo HD 2MP',
    sku: 'GS-CAM-0098',
    stock: 'Pocas unidades',
    stockColor: '#B45309',
  },
]

const PRODUCTS_2 = [
  {
    brand: 'Epcom',
    name: 'Controlador de acceso biométrico',
    sku: 'GS-CTL-0067',
    tag: 'NUEVO',
    stock: 'En stock',
    stockColor: '#047857',
  },
  {
    brand: 'Zkteco',
    name: 'Lector de tarjetas RFID exterior',
    sku: 'GS-CTL-0102',
    stock: 'En stock',
    stockColor: '#047857',
  },
  {
    brand: 'Hikvision',
    name: 'Videoportero IP con pantalla táctil',
    sku: 'GS-CTL-0140',
    stock: 'Agotado',
    stockColor: '#DC2626',
  },
  {
    brand: 'Epcom',
    name: 'Cerradura electromagnética 180kg',
    sku: 'GS-CTL-0088',
    stock: 'En stock',
    stockColor: '#047857',
  },
]

export default function Home() {
  return (
    <StorefrontLayout showHeader showFooter>
      <div className="px-12 py-9 flex flex-col gap-9">
        {/* Hero */}
        <div
          className="relative h-[300px] rounded-[18px] overflow-hidden flex items-center px-14 py-0"
          style={{
            background: 'linear-gradient(115deg,#1A1A1A 0%,#262626 55%,#CE0203 130%)',
          }}
        >
          <div style={{ maxWidth: '600px' }}>
            <span
              className="inline-block font-black text-[11px] uppercase px-3.5 py-1.5 rounded-full"
              style={{ backgroundColor: '#FFB020', color: '#1F1300' }}
            >
              Todo para tu proyecto de seguridad
            </span>
            <h1
              className="mt-4.5 text-[38px] font-black text-white leading-[1.1]"
              style={{ marginTop: '18px' }}
            >
              Cámaras, control de acceso y alarmas al mejor precio
            </h1>
            <div className="flex gap-3 mt-5.5">
              <button
                className="bg-white text-[#1A1A1A] border-none rounded-[10px] px-6 py-3.25 text-sm font-black hover:opacity-90"
                style={{ padding: '13px 24px' }}
              >
                Explorar catálogo
              </button>
              <Link
                to="/tienda/solicitar-acceso"
                className="bg-transparent text-white border-2 border-white border-opacity-55 rounded-[10px] px-6 py-3.25 text-sm font-bold hover:opacity-90"
                style={{ padding: '13px 24px' }}
              >
                Crear cuenta gratis
              </Link>
            </div>
          </div>
        </div>

        {/* Category tiles */}
        <div className="grid grid-cols-3 gap-[18px]">
          <CategoryTile
            name="Videovigilancia"
            iconBg="#FEF2F2"
            iconColor="#CE0203"
            count="480+"
          />
          <CategoryTile
            name="Control de Acceso"
            iconBg="#F3F4F6"
            iconColor="#484748"
            count="210+"
          />
          <CategoryTile
            name="Alarmas y Smart Home"
            iconBg="#ECFDF5"
            iconColor="#059669"
            count="130+"
          />
        </div>

        {/* Section 1: Videovigilancia */}
        <div>
          <div className="flex justify-between mb-4">
            <h2 className="m-0 text-[20px] font-black text-[#1A1A1A]">
              Lo más pedido en Videovigilancia
            </h2>
            <a
              href="#"
              className="text-sm font-bold hover:opacity-80"
              style={{ fontSize: '13px' }}
            >
              Ver toda la categoría →
            </a>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {PRODUCTS_1.map((p) => (
              <ProductCard key={p.sku} {...p} />
            ))}
          </div>
        </div>

        {/* Promo banner */}
        <PromoBanner
          eyebrow="Para instaladores y distribuidores"
          title="Cotización preferencial al registrarte como cliente"
        />

        {/* Section 2: Control de Acceso */}
        <div>
          <div className="flex justify-between mb-4">
            <h2 className="m-0 text-[20px] font-black text-[#1A1A1A]">
              Nuevo en Control de Acceso
            </h2>
            <a
              href="#"
              className="text-sm font-bold hover:opacity-80"
              style={{ fontSize: '13px' }}
            >
              Ver toda la categoría →
            </a>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {PRODUCTS_2.map((p) => (
              <ProductCard key={p.sku} {...p} />
            ))}
          </div>
        </div>

        {/* CTA pair */}
        <div className="grid grid-cols-2 gap-5">
          <div
            className="rounded-[16px] px-8 py-8 flex flex-col justify-center"
            style={{ backgroundColor: '#1A1A1A' }}
          >
            <h3 className="m-0 text-[20px] font-black text-white">
              ¿Ya tienes cuenta?
            </h3>
            <p className="m-0 mt-2 text-sm text-[#CBD5E1]">
              Accede a tu panel de cliente y descubre ofertas exclusivas
            </p>
            <Link
              to="/tienda/login"
              className="mt-4 self-start bg-white text-[#1A1A1A] border-none rounded-[10px] px-6 py-2.5 font-black hover:opacity-90"
              style={{ fontSize: '13px', padding: '13px 24px' }}
            >
              Inicia sesión
            </Link>
          </div>
          <div
            className="rounded-[16px] px-8 py-8 flex flex-col justify-center border-2"
            style={{ backgroundColor: '#FFF5F5', borderColor: '#FFD9D9' }}
          >
            <h3 className="m-0 text-[20px] font-black text-[#1A1A1A]">
              ¿Eres nuevo?
            </h3>
            <p className="m-0 mt-2 text-sm text-[#475569]">
              Solicita tu acceso como cliente y obtén acceso a nuestro catálogo
              con precios especiales
            </p>
            <Link
              to="/tienda/solicitar-acceso"
              className="mt-4 self-start border-none rounded-[10px] px-6 py-2.5 font-black hover:opacity-90 text-white"
              style={{
                fontSize: '13px',
                padding: '13px 24px',
                backgroundColor: '#CE0203',
              }}
            >
              Solicita tu acceso
            </Link>
          </div>
        </div>
      </div>
    </StorefrontLayout>
  )
}
