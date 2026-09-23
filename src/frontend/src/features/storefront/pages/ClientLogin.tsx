import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'

export default function ClientLogin() {
  const navigate = useNavigate()
  const [showMessage, setShowMessage] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Show info message instead of logging in
    setShowMessage(true)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-10"
      style={{ backgroundColor: '#F8FAFC' }}
    >
      <div
        className="w-full max-w-[900px] bg-white rounded-[20px] border overflow-hidden flex"
        style={{ boxShadow: 'var(--shadow-lg)', borderColor: 'var(--color-border)' }}
      >
        {/* Left panel - Logo */}
        <div
          className="w-5/12 flex-shrink-0 flex items-center justify-center p-12"
          style={{ backgroundColor: '#E5E7EB', borderRight: '1px solid #D1D5DB' }}
        >
          <img
            src="/logo-grupo-security.png"
            alt="Grupo Security"
            className="max-w-full h-auto"
            style={{
              maxWidth: '240px',
              aspectRatio: 'auto',
            }}
          />
        </div>

        {/* Right panel - Form */}
        <div className="flex-1 flex flex-col">
          {/* Back link */}
          <div className="px-10 pt-5">
            <button
              onClick={() => navigate('/tienda')}
              className="inline-flex items-center gap-1.5 text-ink-400 text-[12.5px] font-semibold hover:opacity-80"
            >
              ← Volver a la tienda
            </button>
          </div>

          {/* Form content */}
          <div className="flex-1 flex items-center justify-center px-10 py-5 max-w-[456px] mx-auto w-full">
            <div className="w-full">
              {!showMessage ? (
                <>
                  <div className="mb-[18px]">
                    <h1 className="m-0 text-[20px] font-bold text-[#171717]">
                      Inicia sesión
                    </h1>
                    <p className="m-0 mt-1.5 text-sm text-[#404040]">
                      Accede a tu cuenta de cliente Grupo Security S.A.S.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-[18px]">
                    <Input
                      label="Correo electrónico"
                      name="email"
                      placeholder="contacto@tuempresa.com"
                      type="email"
                    />
                    <Input
                      label="Contraseña"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                    />

                    <div className="flex justify-between items-center">
                      <label className="flex items-center gap-[7px] text-sm text-[#404040]">
                        <input
                          type="checkbox"
                          style={{ accentColor: '#CE0203' }}
                        />
                        Mantener sesión iniciada
                      </label>
                      <a
                        href="#"
                        className="text-sm font-medium hover:opacity-80"
                      >
                        ¿Olvidaste tu contraseña?
                      </a>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      style={{ fontSize: '13.5px', padding: '11px 18px' }}
                    >
                      Ingresar
                    </Button>
                  </form>

                  {/* Info box */}
                  <div
                    className="mt-[18px] text-center rounded-[10px] p-3.5 border"
                    style={{
                      backgroundColor: '#FFF5F5',
                      borderColor: '#FFD9D9',
                    }}
                  >
                    <p className="m-0 mb-1.5 text-[12.5px] text-[#475569]">
                      ¿Aún no tienes acceso como cliente?
                    </p>
                    <Link
                      to="/tienda/solicitar-acceso"
                      className="text-sm font-bold hover:opacity-80"
                    >
                      Solicita tu acceso
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto mb-4 text-security-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">
                    El portal de clientes estará disponible pronto.
                  </h2>
                  <p className="text-sm text-[#475569] mb-6">
                    Si ya solicitaste acceso, un asesor te contactará.
                  </p>
                  <button
                    onClick={() => navigate('/tienda')}
                    className="inline-block bg-security-500 text-white font-bold py-2 px-6 rounded-lg hover:opacity-90"
                    style={{ backgroundColor: '#CE0203' }}
                  >
                    Volver a la tienda
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
