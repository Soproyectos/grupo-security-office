/**
 * Detrás de nginx (y a veces del nginx del contenedor del frontend) el socket de la API siempre llega desde la
 * red privada de Docker o `127.0.0.1`. Sin `trust proxy`, `req.ip` es esa dirección y el ThrottlerGuard (que
 * cuenta por `req.ip`) mete a TODOS los visitantes en un único contador.
 *
 * Con `trust proxy` Express toma de `X-Forwarded-For` la dirección más a la derecha que NO sea de confianza: es
 * la que nginx añadió con `$proxy_add_x_forwarded_for`, o sea la del cliente real; lo que el cliente escriba a
 * la izquierda de la cabecera no puede suplantarla.
 *
 * Por defecto se confía en las redes privadas (loopback, link-local, rangos privados). Se puede cambiar con
 * `TRUST_PROXY`: lista Express (`loopback, 172.16.0.0/12`), un número de saltos (`1`) o `false`.
 */
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

export function resolveTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_TRUST_PROXY;
  if (value.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function applyTrustProxy(app: { set(setting: string, value: unknown): unknown }, raw: string | undefined): void {
  app.set('trust proxy', resolveTrustProxy(raw));
}
