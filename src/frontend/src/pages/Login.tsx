import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import api from '../services/api'
import MfaChallenge, {
  BackupCodes,
  type MfaStage,
} from '../features/auth/components/MfaChallenge'

interface LoginForm {
  email: string
  password: string
}

interface LoginErrors {
  email?: string
  password?: string
  general?: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>('')
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  // Segundo paso del login (Fase S). Mientras `challenge` no sea null, el
  // usuario NO está autenticado: sólo demostró conocer la contraseña.
  const [challenge, setChallenge] = useState<{
    stage: MfaStage
    token: string
  } | null>(null)
  const [pendingBackupCodes, setPendingBackupCodes] = useState<string[] | null>(null)

  // Validación en tiempo real con dominio corporativo
  const validateField = (name: string, value: string): string => {
    if (name === 'email' && value) {
      if (!EMAIL_REGEX.test(value)) {
        return 'Ingresa un correo electrónico corporativo válido'
      }
      if (!value.endsWith('@gruposecurity.co') && !value.endsWith('@grupo-security.com')) {
        return 'Solo se permiten correos corporativos'
      }
    }
    if (name === 'password' && value) {
      if (value.length < 8) {
        return 'La contraseña debe tener al menos 8 caracteres'
      }
    }
    return ''
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    
    // Limpiar error del campo al usuario empezar a escribir
    if (errors[name as keyof LoginErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setSubmitError('')
    
    // Validación del lado del cliente
    const newErrors: LoginErrors = {}
    Object.keys(form).forEach(key => {
      const error = validateField(key, form[key as keyof LoginForm])
      if (error) newErrors[key as keyof LoginErrors] = error
    })
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await api.post('/auth/login', form)
      const { status, user, challengeToken } = response.data

      // El backend responde con un resultado discriminado. Sólo 'COMPLETE'
      // trae sesión: los otros dos estados exigen el segundo factor, y tratar
      // su respuesta como un login exitoso marcaría al usuario como
      // autenticado sin cookie de sesión.
      if (status === 'MFA_REQUIRED') {
        setChallenge({ stage: 'verify', token: challengeToken })
        return
      }

      if (status === 'MFA_ENROLLMENT_REQUIRED') {
        setChallenge({ stage: 'enroll', token: challengeToken })
        return
      }

      login(user)
      navigate('/', { replace: true })
    } catch (err: any) {
      const status = err.response?.status
      const msg = err.response?.data?.message
      
      // Consolidar manejo de errores similares
      if (!status) {
        setSubmitError('No fue posible conectar con el servidor. Verifica tu conexión a internet.')
      } else if (status === 403) {
        // Cuenta bloqueada por intentos fallidos: el backend explica cuánto
        // falta, y ocultarlo dejaría al usuario reintentando a ciegas.
        setSubmitError(msg || 'Cuenta bloqueada temporalmente. Intenta más tarde.')
      } else if (status === 401) {
        setSubmitError('Credenciales inválidas. Verifica tu correo y contraseña.')
      } else if (status === 429) {
        setSubmitError('Demasiados intentos. Espera unos minutos antes de intentar nuevamente.')
      } else {
        setSubmitError(msg || 'Error al iniciar sesión. Intenta de nuevo.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Limpiar errores generales al cambiar el formulario
  useEffect(() => {
    if (submitError) setSubmitError('')
  }, [form.email, form.password])

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-neutral-200 flex overflow-hidden">

        {/* Columna izquierda: Logo corporativo */}
        <div className="hidden lg:flex lg:w-5/12 bg-neutral-200 border-r border-neutral-300 items-center justify-center p-15">
          <img
            src="/logo-grupo-security.png"
            alt="Grupo Security"
            className="h-48 md:h-80 lg:h-1024 w-auto"
          />
        </div>

        {/* Columna derecha: Formulario */}
        <div className="w-full lg:w-7/12 flex flex-col">
          <div className="flex-1 w-full max-w-md mx-auto px-8 py-12 flex flex-col justify-center">

            {/* Logo móvil */}
            <div className="lg:hidden mb-10 flex justify-center">
              <img
                src="/logo-grupo-security.png"
                alt="Grupo Security"
                className="h-64 md:h-80 lg:h-1024 w-auto"
              />
            </div>

            {pendingBackupCodes ? (
              <BackupCodes
                codes={pendingBackupCodes}
                onContinue={() => navigate('/', { replace: true })}
              />
            ) : challenge ? (
              <MfaChallenge
                stage={challenge.stage}
                challengeToken={challenge.token}
                onSuccess={(user, backupCodes) => {
                  login(user as never)
                  if (backupCodes?.length) {
                    setPendingBackupCodes(backupCodes)
                  } else {
                    navigate('/', { replace: true })
                  }
                }}
                onCancel={() => {
                  setChallenge(null)
                  setForm({ email: '', password: '' })
                }}
              />
            ) : (
            <>
            {/* Encabezado único */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-neutral-900 mb-1.5">
                Iniciar sesión
              </h1>
              <p className="text-sm text-neutral-800">
                Accede al panel empresarial de Grupo Security S.A.S.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Error general */}
              {submitError && (
                <div className="p-4 bg-security-50 border border-security-200 text-security-700 rounded-lg text-sm flex items-start gap-3" role="alert">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{submitError}</span>
                </div>
              )}

              {/* Correo */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-2">
                  Correo corporativo
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-security-500/30 focus:border-security-500 transition-colors text-sm ${
                    errors.email
                      ? 'border-security-500 bg-security-50'
                      : 'border-neutral-300 bg-white hover:border-neutral-400'
                  }`}
                  placeholder="tu@gruposecurity.co"
                  required
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-security-600">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Contraseña */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-security-500/30 focus:border-security-500 transition-colors text-sm ${
                      errors.password
                        ? 'border-security-500 bg-security-50'
                        : 'border-neutral-300 bg-white hover:border-neutral-400'
                    }`}
                    placeholder="••••••••"
                    required
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-security-500/30 rounded"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    disabled={isSubmitting}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-sm text-security-600">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Acciones auxiliares */}
              <div className="flex items-center justify-between">
                <label htmlFor="remember" className="flex items-center cursor-pointer">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 text-security-600 border-neutral-300 rounded focus:ring-2 focus:ring-security-500/40"
                    disabled={isSubmitting}
                  />
                  <span className="ml-2 text-sm text-neutral-700">Mantener sesión iniciada</span>
                </label>
                <a
                  href="/recuperar-contrasena"
                  className="text-sm text-security-600 hover:text-security-700 font-medium"
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>

              {/* CTA principal */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-security-600 hover:bg-security-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-security-500/30 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Validando acceso...
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>
            </>
            )}

            {/* Nota de seguridad */}
            <div className="mt-8 flex items-start gap-2">
              <svg className="w-4 h-4 text-security-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-xs text-neutral-600 leading-snug">
                No compartas tus credenciales. Ante actividad inusual, contacta a{' '}
                <a href="mailto:soporte@gruposecurity.com" className="text-security-600 hover:text-security-700 font-medium">
                  soporte TI
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
