// Smoke test for the portal auth (Better Auth) against a LOCAL API.
// Usage (from src/backend): node scripts/smoke-portal-auth.mjs
// Needs: API on :3000, local postgres (gs_web_local), .env.local4173 (read, never printed).
// The API must run with TURNSTILE_SECRET_KEY set to Cloudflare's always-pass TEST key
// (1x0000000000000000000000000000000AA) so the dummy token below is accepted.
// Passwords are random-looking on purpose: they must satisfy the server rules and not appear in haveibeenpwned.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

const API = process.env.SMOKE_API ?? 'http://127.0.0.1:3000';
const ORIGIN = 'http://127.0.0.1:4173';
const DB = 'postgresql://postgres@127.0.0.1:5432/gs_web_local';
const env = Object.fromEntries(readFileSync('.env.local4173', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const psql = (sql) => execFileSync('psql', [DB, '-Atc', sql], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

class Jar {
  cookies = new Map();
  store(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v) this.cookies.set(kv.slice(0, i), v); else this.cookies.delete(kv.slice(0, i)); } }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(path, { method = 'GET', body, raw, headers = {} } = {}) {
    const res = await fetch(API + path, { method, redirect: 'manual', headers: { origin: ORIGIN, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(raw ? { 'content-type': 'application/json' } : {}), cookie: this.header(), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    this.store(res);
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, res };
  }
}

const stamp = Date.now();
let email = `smoke+${stamp}@example.com`; // changes in block (m) when the email is changed
const pass1 = 'Qv8#rLn2$Xwk-Pj5';
const pass2 = 'Hd4%tYm9!Zcb-Ns7';
const CAP = { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const outbox = () => readFileSync('outbox/ultimo-correo.txt', 'utf8');
const a = new Jar();

// (a) sign-up: ahora exige confirmar el correo antes de tener sesión
const lastLink = () => readFileSync('outbox/ultimo-correo.txt', 'utf8').match(/Enlace: (\S+)/)?.[1] ?? '';
let r = await a.req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'Smoke Test', email, password: pass1, companyName: 'Empresa Smoke', type: 'INSTALLER', acceptPrivacy: true, callbackURL: '/clientes' } });
check('a1 sign-up 200', r.status === 200, String(r.status));
await wait(500);
const vlink = lastLink(); // verification link of this account
check('a1b sign-up NO deja sesión abierta (falta confirmar correo)', (await a.req('/api/customer-portal/auth/me')).status === 401);
r = await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass1 } });
check('a1c sin confirmar correo no entra (403)', r.status === 403, String(r.status));
let row = psql(`select state,type,coalesce("tierId",'null'),"companyName",("privacyAcceptedAt" is not null),coalesce("privacyVersion",'null') from portal_accounts where email='${email}'`);
check('a2 PortalAccount ACTIVE, FINAL_CUSTOMER, sin tier, con consentimiento y version', /^ACTIVE\|FINAL_CUSTOMER\|null\|Empresa Smoke\|t\|(?!null)/.test(row), row);
check('a3 el tipo INSTALLER pedido se ignora (input bloqueado)', psql(`select type from portal_auth_user where email='${email}'`) === 'FINAL_CUSTOMER');
const outboxBefore = { text: outbox(), mtime: statSync('outbox/ultimo-correo.txt').mtimeMs };
r = await new Jar().req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'Otro', email: ` ${email.toUpperCase()} `, password: pass2, companyName: 'X', acceptPrivacy: true } });
check('a4 registro con correo repetido -> 409 EMAIL_ALREADY_REGISTERED', r.status === 409 && r.json?.code === 'EMAIL_ALREADY_REGISTERED' && /ya está registrado/.test(r.json?.message ?? ''), `${r.status} ${r.json?.code}`);
await wait(500);
check('a4b el correo repetido NO envía ningún correo (outbox sin cambios)', outbox() === outboxBefore.text && statSync('outbox/ultimo-correo.txt').mtimeMs === outboxBefore.mtime);
r = await new Jar().req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'Sin Consentimiento', email: `nc${stamp}@example.com`, password: pass2, companyName: 'X' } });
check('a4c sin acceptPrivacy -> 400 PRIVACY_NOT_ACCEPTED', r.status === 400 && r.json?.code === 'PRIVACY_NOT_ACCEPTED', `${r.status} ${r.json?.code}`);
r = await new Jar().req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'Clave Debil', email: `wk${stamp}@example.com`, password: 'abc', companyName: 'X', acceptPrivacy: true } });
check('a4d clave débil -> 400 WEAK_PASSWORD', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await new Jar().req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'Clave Nombre', email: `nm${stamp}@example.com`, password: 'Clave-Nombre-9x!Zq', companyName: 'X', acceptPrivacy: true } });
check('a4e clave con el nombre -> 400 WEAK_PASSWORD', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await new Jar().req('/api/portal-auth/sign-up/email', { method: 'POST', body: { name: 'Sin Captcha', email: `nk${stamp}@example.com`, password: pass2, companyName: 'X', acceptPrivacy: true } });
check('a4f sin captcha -> 400 MISSING_RESPONSE', r.status === 400 && r.json?.code === 'MISSING_RESPONSE', `${r.status} ${r.json?.code}`);
check('a4g los intentos rechazados no crearon cuentas', psql(`select count(*) from portal_auth_user where email in ('nc${stamp}@example.com','wk${stamp}@example.com','nm${stamp}@example.com','nk${stamp}@example.com')`) === '0');
// confirmar el correo con el enlace de outbox: abre sesión
const vres = await fetch(vlink.replace(ORIGIN, API), { redirect: 'manual', headers: { origin: ORIGIN } });
a.store(vres);
check('a5 enlace de confirmación redirige y abre sesión', vres.status >= 300 && vres.status < 400 && a.cookies.size > 0, String(vres.status));
check('a6 correo queda verificado', psql(`select "emailVerified" from portal_auth_user where email='${email}'`) === 't');
check('a7 token de Google/credencial no queda en texto plano (sin tokens de acceso en credential)', psql(`select count(*) from portal_auth_account where "providerId"='credential' and "accessToken" is not null`) === '0');

// (b) /me
r = await a.req('/api/customer-portal/auth/me');
const me = r.json?.data ?? r.json;
check('b /me 200 con tier null', r.status === 200 && me?.account?.tier == null && me?.account?.email === email, `${r.status}`);
check('b1b /me trae hasPassword true', me?.account?.hasPassword === true, String(me?.account?.hasPassword));
check('b2 /me trae profileComplete true y consentimiento', me?.account?.profileComplete === true && !!me?.account?.privacyAcceptedAt && me?.account?.deletionRequestedAt === null, JSON.stringify({ pc: me?.account?.profileComplete }));

// (c) sign-out
r = await a.req('/api/portal-auth/sign-out', { method: 'POST', body: {} });
check('c1 sign-out 200', r.status === 200, String(r.status));
r = await a.req('/api/customer-portal/auth/me');
check('c2 /me tras salir -> 401', r.status === 401, String(r.status));

// (d) sign-in
r = await a.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass1 } });
check('d1 sign-in correcto 200', r.status === 200, String(r.status));
const b = new Jar();
r = await b.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: 'clave-mala-1234567' } });
check('d2 clave mala 401', r.status === 401, String(r.status));
r = await b.req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'X', email: `x${stamp}@example.com`, password: 'corta', companyName: 'X', acceptPrivacy: true } });
check('d3 clave corta rechazada (400)', r.status === 400, String(r.status));
r = await b.req('/api/portal-auth/sign-up/email', { method: 'POST', headers: CAP, body: { name: 'X', email: `y${stamp}@example.com`, password: pass1, acceptPrivacy: true } });
check('d4 sin empresa rechazado (400)', r.status === 400, String(r.status));

// (e) password reset
const reset = (e) => new Jar().req('/api/portal-auth/request-password-reset', { method: 'POST', headers: CAP, body: { email: e, redirectTo: '/clientes/restablecer' } });
const r1 = await reset(email);
const r2 = await reset(`noexiste+${stamp}@example.com`);
check('e1 misma respuesta existente/inexistente', r1.status === r2.status && JSON.stringify(r1.json?.status ?? r1.json) === JSON.stringify(r2.json?.status ?? r2.json), `${r1.status}/${r2.status}`);
await wait(500);
const mail = outbox();
const url = mail.match(/Enlace: (\S+)/)?.[1] ?? '';
const token = url.split('/reset-password/')[1]?.split('?')[0];
check('e2 enlace en outbox', !!token && mail.includes(email), url ? 'enlace presente' : 'sin enlace');
// el enlace redirige a /clientes/restablecer?token=...
const link = await fetch(url.replace(ORIGIN, API), { redirect: 'manual', headers: { origin: ORIGIN } });
check('e3 enlace redirige a /clientes/restablecer?token=', link.status >= 300 && link.status < 400 && /\/clientes\/restablecer\?token=/.test(link.headers.get('location') ?? ''), `${link.status} ${(link.headers.get('location') ?? '').replace(/token=.*/, 'token=…')}`);
r = await new Jar().req('/api/portal-auth/reset-password', { method: 'POST', body: { newPassword: pass2, token } });
check('e4 reset-password 200', r.status === 200, String(r.status));
r = await new Jar().req('/api/portal-auth/reset-password', { method: 'POST', body: { newPassword: 'Wm6&kRt3@Gfd-Ux8', token } });
check('e5 segundo uso falla', r.status >= 400, String(r.status));
r = await new Jar().req('/api/portal-auth/reset-password', { method: 'POST', body: { newPassword: 'corta', token: 'x' } });
check('e5b reset con clave débil -> 400 WEAK_PASSWORD', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await a.req('/api/customer-portal/auth/me');
check('e6 sesión previa revocada (401)', r.status === 401, String(r.status));
r = await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass1 } });
check('e7 clave vieja ya no entra', r.status === 401, String(r.status));
const c = new Jar();
r = await c.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass2 } });
check('e8 clave nueva entra', r.status === 200, String(r.status));

// (j) perfil, catálogo bloqueado y eliminación
const accountId = psql(`select id from portal_accounts where email='${email}'`);
r = await c.req('/api/customer-portal/auth/me/profile', { method: 'PATCH', body: { companyName: 'Empresa Smoke 2', documentId: '900123456', phone: '3001234567' } });
check('j1 PATCH perfil 200 y devuelve profileComplete', r.status === 200 && (r.json?.data ?? r.json)?.account?.companyName === 'Empresa Smoke 2' && (r.json?.data ?? r.json)?.account?.profileComplete === true && (r.json?.data ?? r.json)?.account?.phone === '3001234567', `${r.status}`);
check('j1b PATCH no cambia tipo, estado ni escalafón', psql(`select type||'|'||state||'|'||coalesce("tierId",'null') from portal_accounts where id='${accountId}'`) === 'FINAL_CUSTOMER|ACTIVE|null');
r = await c.req('/api/customer-portal/auth/me/profile', { method: 'PATCH', body: { companyName: 'X' } });
check('j1c PATCH con empresa demasiado corta -> 400', r.status === 400, String(r.status));
r = await c.req('/api/customer-portal/customer/catalog/prices?ids=00000000-0000-4000-8000-000000000000');
check('j2 precios de cliente con perfil completo -> 200', r.status === 200, String(r.status));
psql(`update portal_accounts set "companyName"='(sin empresa)', "privacyAcceptedAt"=null, "privacyVersion"=null where id='${accountId}'`);
r = await c.req('/api/customer-portal/customer/catalog/prices?ids=00000000-0000-4000-8000-000000000000');
check('j3 perfil incompleto -> 403 PROFILE_INCOMPLETE', r.status === 403 && r.json?.code === 'PROFILE_INCOMPLETE', `${r.status} ${r.json?.code}`);
r = await c.req('/api/customer-portal/auth/me');
check('j3b /me con perfil incompleto: profileComplete false', r.status === 200 && (r.json?.data ?? r.json)?.account?.profileComplete === false, String(r.status));
r = await c.req('/api/customer-portal/auth/me/profile', { method: 'PATCH', body: { companyName: 'Empresa Smoke 3' } });
check('j4 PATCH sin acceptPrivacy (aún sin consentimiento) -> 400 PRIVACY_NOT_ACCEPTED', r.status === 400 && r.json?.code === 'PRIVACY_NOT_ACCEPTED', `${r.status} ${r.json?.code}`);
r = await c.req('/api/customer-portal/auth/me/profile', { method: 'PATCH', body: { companyName: 'Empresa Smoke 3', acceptPrivacy: true } });
check('j5 PATCH con acceptPrivacy -> 200 y perfil completo', r.status === 200 && (r.json?.data ?? r.json)?.account?.profileComplete === true && !!(r.json?.data ?? r.json)?.account?.privacyAcceptedAt, `${r.status}`);
check('j5b versión de política guardada por el servidor', psql(`select coalesce("privacyVersion",'null') from portal_accounts where id='${accountId}'`) !== 'null');
r = await c.req('/api/customer-portal/auth/me/deletion-request', { method: 'POST', body: {} });
const del1 = (r.json?.data ?? r.json)?.deletionRequestedAt;
check('j6 solicitud de eliminación 200 con fecha', r.status === 200 && !!del1, String(r.status));
r = await c.req('/api/customer-portal/auth/me/deletion-request', { method: 'POST', body: {} });
check('j7 repetir es idempotente (misma fecha)', r.status === 200 && (r.json?.data ?? r.json)?.deletionRequestedAt === del1, String(r.status));
check('j7b la cuenta sigue existiendo (no se borra nada)', psql(`select state from portal_accounts where id='${accountId}'`) === 'ACTIVE');

// (k) suspender y reactivar desde la API de administración
const adm = new Jar();
r = await adm.req('/api/auth/login', { method: 'POST', body: { email: 'admin@gruposecurity.co', password: env.SEED_SUPER_ADMIN_PASSWORD } });
const adminLogin = r;
r.json = r.json?.data ?? r.json;
if (r.json?.status !== 'COMPLETE') console.log(`NOTA: el login de admin no abrió sesión (${r.json?.status}, p. ej. segundo factor); se omiten los casos de suspensión`);
else {
  const base = `/api/customer-portal/admin/accounts/${accountId}`;
  r = await adm.req(`${base}/suspend`, { method: 'POST', body: { reason: 'x' } });
  check('k0 motivo demasiado corto -> 400', r.status === 400, String(r.status));
  r = await adm.req(`${base}/suspend`, { method: 'POST', body: { reason: 'Prueba de humo' } });
  check('k1 suspender 200', r.status === 200 && r.json?.state === 'SUSPENDED', `${r.status}`);
  r = await c.req('/api/customer-portal/auth/me');
  check('k2 la sesión del cliente suspendido da 401', r.status === 401, String(r.status));
  check('k2b sesiones de Better Auth borradas', psql(`select count(*) from portal_auth_session s join portal_auth_user u on u.id=s."userId" where u.email='${email}'`) === '0');
  r = await adm.req(`${base}/suspend`, { method: 'POST', body: { reason: 'Otra vez' } });
  check('k3 suspender dos veces -> 400', r.status === 400, String(r.status));
  r = await adm.req('/api/customer-portal/admin/accounts');
  const listed = (Array.isArray(r.json) ? r.json : r.json?.data ?? []).find((x) => x.id === accountId);
  check('k4 el listado trae state, privacyAcceptedAt y deletionRequestedAt', listed?.state === 'SUSPENDED' && 'privacyAcceptedAt' in listed && !!listed?.deletionRequestedAt, JSON.stringify(listed && { s: listed.state }));
  r = await adm.req(`${base}/reactivate`, { method: 'POST', body: {} });
  check('k5 reactivar 200', r.status === 200 && r.json?.state === 'ACTIVE', `${r.status}`);
  r = await adm.req(`${base}/reactivate`, { method: 'POST', body: {} });
  check('k6 reactivar una cuenta activa -> 400', r.status === 400, String(r.status));
  const c2 = new Jar();
  r = await c2.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass2 } });
  check('k7 tras reactivar entra de nuevo', r.status === 200 && (await c2.req('/api/customer-portal/auth/me')).status === 200, String(r.status));
}

// (f) dos resets simultáneos con el mismo token
await new Jar().req('/api/portal-auth/request-password-reset', { method: 'POST', headers: CAP, body: { email, redirectTo: '/clientes/restablecer' } });
await wait(500);
const token2 = outbox().match(/reset-password\/([^?\s]+)/)?.[1];
const both = await Promise.all([1, 2].map((i) => new Jar().req('/api/portal-auth/reset-password', { method: 'POST', body: { newPassword: `Sim-clave-${i}-Zq7!Vb`, token: token2 } })));
const oks = both.filter((x) => x.status === 200).length;
check('f exactamente un reset ok de dos simultáneos', oks === 1, both.map((x) => x.status).join(','));

// (g) Google
r = await new Jar().req('/api/portal-auth/sign-in/social', { method: 'POST', body: { provider: 'google', callbackURL: '/clientes', errorCallbackURL: '/clientes/login?error=google' } });
const gurl = r.json?.url ?? '';
const redirectUri = gurl ? new URL(gurl).searchParams.get('redirect_uri') : null;
check('g1 URL de accounts.google.com', gurl.startsWith('https://accounts.google.com/'), gurl.split('?')[0]);
check('g2 redirect_uri exacto', redirectUri === 'http://127.0.0.1:4173/api/portal-auth/callback/google', String(redirectUri));

// (h) empleado (el login se hizo en la sección k)
check('h login de empleado responde (200/201, no 404/500)', [200, 201].includes(adminLogin.status), String(adminLogin.status));

// (i) JSON inválido
r = await new Jar().req('/api/auth/login', { method: 'POST', raw: '{no-es-json' });
check('i JSON inválido -> 400', r.status === 400, String(r.status));

// (l) borrar la cuenta uno mismo: ULTIMO paso de la cuenta de prueba
let pass3 = 'Rk5&vBn8#Yqe-Lt3';
await new Jar().req('/api/portal-auth/request-password-reset', { method: 'POST', headers: CAP, body: { email, redirectTo: '/clientes/restablecer' } });
await wait(500);
const token3 = outbox().match(/reset-password\/([^?\s]+)/)?.[1];
r = await new Jar().req('/api/portal-auth/reset-password', { method: 'POST', body: { newPassword: pass3, token: token3 } });
check('l0 clave conocida para el borrado', r.status === 200, String(r.status));
const d = new Jar();
r = await d.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass3 } });
check('l1 sign-in con la clave conocida', r.status === 200, String(r.status));

// (n) metodos de entrada: cuenta de correo, vincular Google y crear clave en una cuenta de Google simulada
r = await d.req('/api/customer-portal/auth/me');
const meN = r.json?.data ?? r.json;
check('n1 /me trae hasPassword true y linkedProviders ["credential"]', meN?.account?.hasPassword === true && JSON.stringify(meN?.account?.linkedProviders) === '["credential"]', JSON.stringify({ h: meN?.account?.hasPassword, l: meN?.account?.linkedProviders }));
r = await new Jar().req('/api/portal-auth/link-social', { method: 'POST', body: { provider: 'google', callbackURL: '/clientes/cuenta' } });
check('n2 link-social sin sesion -> 401', r.status === 401, String(r.status));
r = await d.req('/api/portal-auth/link-social', { method: 'POST', body: { provider: 'google', callbackURL: '/clientes/cuenta?vinculado=google', errorCallbackURL: '/clientes/cuenta?error=google', disableRedirect: true } });
const lurl = r.json?.url ?? '';
const lredirect = lurl ? new URL(lurl).searchParams.get('redirect_uri') : null;
check('n3 link-social con sesion -> URL de accounts.google.com', r.status === 200 && lurl.startsWith('https://accounts.google.com/'), `${r.status} ${lurl.split('?')[0]}`);
check('n4 link-social usa el mismo redirect_uri exacto', lredirect === 'http://127.0.0.1:4173/api/portal-auth/callback/google', String(lredirect));
check('n5 vincular no cambia tipo, estado ni escalafon', psql(`select type||'|'||state||'|'||coalesce("tierId",'null') from portal_accounts where email='${email}'`) === 'FINAL_CUSTOMER|ACTIVE|null');
r = await new Jar().req('/api/customer-portal/auth/me/password', { method: 'POST', body: { newPassword: pass1 } });
check('n6 crear clave sin sesion -> 401', r.status === 401, String(r.status));
// Cuenta de Google simulada (sin clave) con sesion propia: la cookie se firma como Better Auth (HMAC-SHA256 del token con BETTER_AUTH_SECRET).
const gUser = `smoke-google-${stamp}`;
const gEmail = `smoke-google+${stamp}@example.com`;
const gToken = `smoke-token-${stamp}-${Math.random().toString(36).slice(2)}`;
const gCookie = `gs_portal.session_token=${encodeURIComponent(`${gToken}.${createHmac('sha256', env.BETTER_AUTH_SECRET).update(gToken).digest('base64')}`)}`;
psql(`insert into portal_auth_user (id,name,email,"emailVerified","companyName",type) values ('${gUser}','Cuenta Google Humo','${gEmail}',true,'Empresa Google','FINAL_CUSTOMER')`);
psql(`insert into portal_auth_account (id,"accountId","providerId","userId","updatedAt") values ('${gUser}-acc','goog-${stamp}','google','${gUser}',now())`);
psql(`insert into portal_accounts (id,email,"passwordHash","contactName","companyName",type,state,"authUserId","privacyAcceptedAt","privacyVersion","updatedAt") values ('${gUser}-pa','${gEmail}','!better-auth','Cuenta Google Humo','Empresa Google','FINAL_CUSTOMER','ACTIVE','${gUser}',now(),'humo',now())`);
psql(`insert into portal_auth_session (id,token,"userId","expiresAt","updatedAt") values ('${gUser}-s','${gToken}','${gUser}',(now() at time zone 'utc') + interval '1 hour',now())`);
const g = new Jar(); g.cookies.set(...gCookie.split(/=(.*)/s).slice(0, 2));
r = await g.req('/api/customer-portal/auth/me');
const meG = r.json?.data ?? r.json;
check('n7 /me de cuenta Google: hasPassword false, linkedProviders ["google"], profileComplete true (clave opcional)', r.status === 200 && meG?.account?.hasPassword === false && JSON.stringify(meG?.account?.linkedProviders) === '["google"]' && meG?.account?.profileComplete === true, `${r.status} ${JSON.stringify({ h: meG?.account?.hasPassword, p: meG?.account?.profileComplete })}`);
r = await g.req('/api/customer-portal/customer/catalog/prices?ids=00000000-0000-4000-8000-000000000000');
check('n8 catalogo de cliente sin clave (con empresa y privacidad) -> 200', r.status === 200, `${r.status} ${r.json?.code}`);
r = await g.req('/api/customer-portal/auth/me/password', { method: 'POST', body: { newPassword: 'corta' } });
check('n9 clave debil -> 400 WEAK_PASSWORD', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await g.req('/api/customer-portal/auth/me/password', { method: 'POST', body: { newPassword: 'Password1234!' } });
check('n9b clave filtrada -> 400 WEAK_PASSWORD (haveibeenpwned)', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await g.req('/api/customer-portal/auth/me/password', { method: 'POST', body: { newPassword: pass2 } });
check('n10 crear clave -> 200 {hasPassword:true}', r.status === 200 && (r.json?.data ?? r.json)?.hasPassword === true, `${r.status}`);
r = await g.req('/api/customer-portal/customer/catalog/prices?ids=00000000-0000-4000-8000-000000000000');
check('n11 catalogo de cliente con clave -> 200', r.status === 200, String(r.status));
r = await g.req('/api/customer-portal/auth/me');
check('n11b /me ahora refleja hasPassword true y profileComplete true', r.status === 200 && (r.json?.data ?? r.json)?.account?.hasPassword === true && (r.json?.data ?? r.json)?.account?.profileComplete === true, `${r.status}`);
r = await g.req('/api/customer-portal/auth/me/password', { method: 'POST', body: { newPassword: pass2 } });
check('n12 segunda vez -> 400 PASSWORD_ALREADY_SET', r.status === 400 && r.json?.code === 'PASSWORD_ALREADY_SET', `${r.status} ${r.json?.code}`);
r = await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email: gEmail, password: pass2 } });
check('n13 la clave nueva permite entrar por correo', r.status === 200, String(r.status));
psql(`delete from portal_accounts where id='${gUser}-pa'`);
psql(`delete from portal_auth_session where "userId"='${gUser}'`);
psql(`delete from portal_auth_account where "userId"='${gUser}'`);
psql(`delete from portal_auth_user where id='${gUser}'`);
psql(`delete from audit_logs where action='set-password' and "entityId"='${gUser}-pa'`);
check('n14 no quedan filas de la cuenta de Google simulada', psql(`select (select count(*) from portal_auth_user where id='${gUser}')||'|'||(select count(*) from portal_accounts where id='${gUser}-pa')||'|'||(select count(*) from portal_auth_account where "userId"='${gUser}')`) === '0|0|0');

// (m) cambiar clave y cambiar correo desde la cuenta (la sesión `d` sigue siendo la del borrado final)
const pass4 = 'Wm6&kRt3@Gfd-Ux8';
const d2 = new Jar();
r = await d2.req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass3 } });
check('m0 segunda sesión abierta', r.status === 200, String(r.status));
r = await d.req('/api/portal-auth/change-password', { method: 'POST', body: { currentPassword: 'clave-mala-1234567', newPassword: pass4, revokeOtherSessions: true } });
check('m1 cambiar clave con la actual mala -> 400 INVALID_PASSWORD', r.status === 400 && r.json?.code === 'INVALID_PASSWORD', `${r.status} ${r.json?.code}`);
r = await d.req('/api/portal-auth/change-password', { method: 'POST', body: { currentPassword: pass3, newPassword: 'debil', revokeOtherSessions: true } });
check('m1b clave nueva débil -> 400 WEAK_PASSWORD', r.status === 400 && r.json?.code === 'WEAK_PASSWORD', `${r.status} ${r.json?.code}`);
r = await d.req('/api/portal-auth/change-password', { method: 'POST', body: { currentPassword: pass3, newPassword: pass4, revokeOtherSessions: true } });
check('m2 cambiar clave buena + revokeOtherSessions -> 200', r.status === 200, String(r.status));
check('m2b la otra sesión queda cerrada (401)', (await d2.req('/api/customer-portal/auth/me')).status === 401);
check('m2c la sesión actual sigue (200)', (await d.req('/api/customer-portal/auth/me')).status === 200);
check('m2d la clave vieja ya no entra', (await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass3 } })).status === 401);
check('m2e la clave nueva entra', (await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass4 } })).status === 200);
pass3 = pass4;

const newEmail = `smoke-nuevo+${stamp}@example.com`;
const oldEmail = email;
r = await d.req('/api/portal-auth/change-email', { method: 'POST', body: { newEmail, callbackURL: '/clientes' } });
check('m3 cambiar correo sin clave -> 400 CURRENT_PASSWORD_INVALID', r.status === 400 && r.json?.code === 'CURRENT_PASSWORD_INVALID', `${r.status} ${r.json?.code}`);
r = await d.req('/api/portal-auth/change-email', { method: 'POST', body: { newEmail, currentPassword: pass3, callbackURL: '/clientes' } });
check('m4 cambiar correo con la clave buena -> 200', r.status === 200, String(r.status));
await wait(500);
const mailNew = outbox();
check('m4b el enlace se envía SOLO al correo nuevo', mailNew.includes(`Para: ${newEmail}`) && !!mailNew.match(/Enlace: (\S+)/), mailNew.split('\n')[0]);
check('m4c el correo actual NO cambia todavía', psql(`select (select email from portal_auth_user where email='${oldEmail}')||'|'||(select email from portal_accounts where email='${oldEmail}')`) === `${oldEmail}|${oldEmail}`);
const cres = await fetch(mailNew.match(/Enlace: (\S+)/)[1].replace(ORIGIN, API), { redirect: 'manual', headers: { origin: ORIGIN, cookie: d.header() } });
check('m5 abrir el enlace redirige (302)', cres.status >= 300 && cres.status < 400, `${cres.status} ${cres.headers.get('location')}`);
await wait(600);
check('m5b portal_auth_user y portal_accounts muestran el correo nuevo', psql(`select (select count(*) from portal_auth_user where email='${newEmail}' and "emailVerified")||'|'||(select count(*) from portal_accounts where email='${newEmail}')||'|'||(select count(*) from portal_auth_user where email='${oldEmail}')||'|'||(select count(*) from portal_accounts where email='${oldEmail}')`) === '1|1|0|0');
check('m5c el aviso al correo anterior queda en el outbox', outbox().includes(`Para: ${oldEmail}`) && outbox().includes('Cambiamos el correo de tu cuenta'));
check('m5d sign-in con el correo nuevo entra', (await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email: newEmail, password: pass3 } })).status === 200);
check('m5e sign-in con el correo viejo ya no entra', (await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email: oldEmail, password: pass3 } })).status === 401);
r = await d.req('/api/customer-portal/auth/me');
check('m6 /me muestra el correo nuevo', r.status === 200 && (r.json?.data ?? r.json)?.account?.email === newEmail, String(r.status));
email = newEmail;
const delPath = '/api/customer-portal/auth/me/delete';
const unwrap = (x) => x.json?.data ?? x.json;
r = await d.req(delPath, { method: 'POST', body: { password: 'clave-mala-1234567' } });
check('l2 borrar con clave mala -> 400 DELETE_CONFIRMATION_INVALID', r.status === 400 && (unwrap(r)?.code ?? r.json?.code) === 'DELETE_CONFIRMATION_INVALID', `${r.status} ${unwrap(r)?.code}`);
check('l2b la cuenta sigue y /me responde 200', (await d.req('/api/customer-portal/auth/me')).status === 200 && psql(`select count(*) from portal_accounts where email='${email}'`) === '1');
r = await d.req(delPath, { method: 'POST', body: {} });
check('l2c borrar sin clave -> 400 DELETE_CONFIRMATION_INVALID', r.status === 400 && (unwrap(r)?.code ?? r.json?.code) === 'DELETE_CONFIRMATION_INVALID', String(r.status));
r = await d.req(delPath, { method: 'POST', body: { password: pass3 } });
check('l3 borrar con la clave buena -> 200 {deleted:true}', r.status === 200 && unwrap(r)?.deleted === true, `${r.status}`);
check('l4 /me -> 401', (await d.req('/api/customer-portal/auth/me')).status === 401);
r = await new Jar().req('/api/portal-auth/sign-in/email', { method: 'POST', headers: CAP, body: { email, password: pass3 } });
check('l5 sign-in ya no entra (401)', r.status === 401, String(r.status));
check('l6 no quedan filas en portal_accounts ni portal_auth_user', psql(`select (select count(*) from portal_accounts where email='${email}')||'|'||(select count(*) from portal_auth_user where email='${email}')`) === '0|0');

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones OK`);
process.exit(failed ? 1 : 0);
