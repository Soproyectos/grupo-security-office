import { Link } from 'react-router-dom'

interface PromoBannerProps {
  eyebrow: string
  title: string
}

export default function PromoBanner({ eyebrow, title }: PromoBannerProps) {
  return (
    <div
      className="rounded-[16px] px-10 py-7 flex justify-between items-center"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <div>
        <p
          className="m-0 text-[11px] font-bold uppercase"
          style={{ color: '#FFB020' }}
        >
          {eyebrow}
        </p>
        <h3
          className="m-0 mt-1.5 text-[20px] font-black"
          style={{ color: '#fff' }}
        >
          {title}
        </h3>
      </div>
      <Link
        to="/tienda/solicitar-acceso"
        className="bg-white text-[#1A1A1A] border-none rounded-[10px] px-6 py-3.5 text-[13.5px] font-black flex-shrink-0 hover:opacity-90"
      >
        Solicitar acceso
      </Link>
    </div>
  )
}
