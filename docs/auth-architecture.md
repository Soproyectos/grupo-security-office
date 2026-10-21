# Arquitectura de Autenticación y Autorización — Grupo Security Office

> **Versión:** 1.0  
> **Última actualización:** 2026-07-23  
> **Stack:** NestJS 10 + Passport JWT + bcrypt + Prisma ORM + PostgreSQL 18  
> **Documentos relacionados:** `backend-architecture.md`, `backend-remediation-plan.md`, `security-checklist-v1.md`

---

## Tabla de Contenidos

1. [Objetivo del Subsistema](#1-objetivo-del-subsistema)
2. [Arquitectura de AuthModule](#2-arquitectura-de-authmodule)
3. [Flujo de Login Completo](#3-flujo-de-login-completo)
4. [Emisión y Validación de JWT](#4-emisión-y-validación-de-jwt)
5. [Uso de Cookie HttpOnly](#5-uso-de-cookie-httponly)
6. [JwtStrategy y JwtAuthGuard](#6-jwtstrategy-y-jwtauthguard)
7. [RolesGuard y Decoradores](#7-rolesguard-y-decoradores)
8. [Modelo RBAC con Roles y Permisos](#8-modelo-rbac-con-roles-y-permisos)
9. [Estructura del Payload JWT](#9-estructura-del-payload-jwt)
10. [Refresh Token y Logout Propuesto](#10-refresh-token-y-logout-propuesto)
11. [Rate Limiting y Brute Force Protection](#11-rate-limiting-y-brute-force-protection)
12. [Validación de Credenciales y Política de Contraseñas](#12-validación-de-credenciales-y-política-de-contraseñas)
13. [Auditoría de Eventos de Auth](#13-auditoría-de-eventos-de-auth)
14. [Riesgos, Mitigaciones y Checklist Técnico](#14-riesgos-mitigaciones-y-checklist-técnico)

---

## 1. Objetivo del Subsistema

El subsistema de autenticación y autorización tiene como objetivo garantizar que **solo usuarios legítimos y autorizados** accedan a los recursos del panel administrativo de Grupo Security, mediante:

- **Autenticación:** Verificar la identidad del usuario mediante credenciales (email + contraseña) y emitir un JWT firmado como prueba de identidad.
- **Autorización:** Controlar el acceso a cada endpoint según el **rol** del usuario y los **permisos** asociados a dicho rol.
- **Seguridad:** Proteger las credenciales con bcrypt, transmitir tokens exclusivamente por cookie HttpOnly, y proteger contra ataques de fuerza bruta.
- **Auditoría:** Registrar eventos de autenticación (login exitoso, login fallido, logout) para trazabilidad forense.

### Principios rectores

| Principio | Aplicación en auth |
|-----------|-------------------|
| **Confidencialidad** | Contraseñas hasheadas con bcrypt (salt rounds 12). Token JWT firmado con clave secreta. |
| **Integridad** | JWT firmado (HS256). Cualquier manipulación del payload invalida la firma. |
| **Disponibilidad** | Rate limiting protege contra DoS en login. |
| **No repudio** | Auditoría de eventos de auth con timestamp e IP. |
| **Mínimo privilegio** | RBAC: cada rol tiene solo los permisos necesarios. |

---

## 2. Arquitectura de AuthModule

### 2.1 Estructura de archivos

```
src/backend/src/modules/auth/
├── dto/
│   └── login.dto.ts                           # Validación de credenciales
├── auth.controller.ts                         # Endpoints públicos y protegidos
├── auth.service.ts                            # Lógica de validación y emisión de tokens
├── auth.module.ts                             # Configuración del módulo
├── jwt.strategy.ts                            # Estrategia Passport para validar JWT
├── jwt-auth.guard.ts                          # Guard global de autenticación
├── roles.guard.ts                             # [DUPLICADO] Usar common/guards/roles.guard.ts
└── permissions.guard.ts                       # [DUPLICADO] Usar common/guards/permissions.guard.ts
```

### 2.2 Dependencias del módulo

```
AuthModule
├── PrismaModule          # Global (no requiere import explícito)
├── PassportModule        # Registra passport en NestJS
├── JwtModule             # Configura JwtService para firmar/verificar tokens
│   ├── JwtService.sign(payload)       → Emitir token
│   └── JwtService.verify(token)       → Validar token (usado por JwtStrategy)
├── ThrottlerModule       # [PENDIENTE] Rate limiting
└── ConfigService         # [PENDIENTE] JWT_SECRET desde variables de entorno
```

### 2.3 Registro global de JwtAuthGuard

En `app.module.ts`, `JwtAuthGuard` se registra como `APP_GUARD`:

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,     // Protege TODAS las rutas por defecto
  },
],
```

Esto significa que **todos los endpoints requieren autenticación** a menos que tengan el decorador `@Public()`.

### 2.4 Diagrama de componentes

```
┌─────────────────────────────────────────────────────────┐
│                      AuthModule                          │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐   │
│  │ AuthController │───▶│      AuthService           │   │
│  │                │    │                            │   │
│  │ POST /login    │    │ validateUser()             │   │
│  │ GET /profile   │    │ login()                    │   │
│  │ POST /logout   │    │ getProfile()               │   │
│  └────────────────┘    └──────────┬─────────────────┘   │
│                                   │                      │
│  ┌────────────────────┐           ▼                      │
│  │   JwtStrategy      │    ┌──────────────┐              │
│  │ (Passport Strategy)│    │ PrismaService │              │
│  │                    │    └──────┬───────┘              │
│  │ validate(payload)  │           │                      │
│  └────────────────────┘           ▼                      │
│                           ┌──────────────┐              │
│  ┌────────────────────┐   │ PostgreSQL   │              │
│  │   JwtAuthGuard     │   │ (users,      │              │
│  │ (APP_GUARD global) │   │  roles,      │              │
│  └────────────────────┘   │  permissions)│              │
│                           └──────────────┘              │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    common/guards/                        │
│  ┌──────────────────┐   ┌──────────────────────┐        │
│  │   RolesGuard     │   │  PermissionsGuard    │        │
│  │ @Roles('Admin')  │   │ @Permissions('w')    │        │
│  └──────────────────┘   └──────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Flujo de Login Completo

### 3.1 Diagrama de secuencia

```
[Cliente]                [Controller]          [AuthService]           [Prisma]          [JwtService]
    │                        │                      │                    │                   │
    │  POST /api/auth/login  │                      │                    │                   │
    │  { email, password }   │                      │                    │                   │
    │───────────────────────▶│                      │                    │                   │
    │                        │                      │                    │                   │
    │                        │  1. ValidationPipe   │                    │                   │
    │                        │  ─── class-validator │                    │                   │
    │                        │  email: @IsEmail()   │                    │                   │
    │                        │  pass: @MinLength(8) │                    │                   │
    │                        │                      │                    │                   │
    │                        │  2. validateUser()   │                    │                   │
    │                        │─────────────────────▶│                    │                   │
    │                        │                      │  3. findUnique()   │                   │
    │                        │                      │───────────────────▶│                   │
    │                        │                      │                    │                   │
    │                        │                      │  4. user (o null)  │                   │
    │                        │                      │◀───────────────────│                   │
    │                        │                      │                    │                   │
    │                        │                      │  5. Verificar:     │                   │
    │                        │                      │  ─ user exists?    │                   │
    │                        │                      │  ─ isActive?       │                   │
    │                        │                      │  ─ bcrypt.compare  │                   │
    │                        │                      │                    │                   │
    │                        │                      │  6. Extraer:       │                   │
    │                        │                      │  ─ roles[]         │                   │
    │                        │                      │  ─ permissions[]   │                   │
    │                        │                      │                    │                   │
    │                        │    user data ◀───────┤                    │                   │
    │                        │                      │                    │                   │
    │                        │  7. login(user)      │                    │                   │
    │                        │─────────────────────▶│                    │                   │
    │                        │                      │                    │                   │
    │                        │                      │  8. JwtService     │                   │
    │                        │                      │     .sign(payload) │                   │
    │                        │                      │──────────────────────────────────▶│     │
    │                        │                      │                    │                   │
    │                        │                      │  9. token ◀────────┼───────────────────│
    │                        │                      │                    │                   │
    │                        │  10. { token, user } │                    │                   │
    │                        │◀─────────────────────│                    │                   │
    │                        │                      │                    │                   │
    │                        │  11. Set-Cookie      │                    │                   │
    │                        │  access_token=<JWT>  │                    │                   │
    │                        │  httpOnly; secure;   │                    │                   │
    │                        │  sameSite=lax        │                    │                   │
    │                        │                      │                    │                   │
    │  200 OK                │                      │                    │                   │
    │  { user: { id, email,  │                      │                    │                   │
    │    name, roles,        │                      │                    │                   │
    │    permissions } }     │                      │                    │                   │
    │◀───────────────────────│                      │                    │                   │
```

### 3.2 Flujo paso a paso

| Paso | Componente | Acción | Validación |
|------|-----------|--------|-----------|
| 1 | ValidationPipe | Deserializa y valida `LoginDto` | `@IsEmail()`, `@IsString()`, `@MinLength(8)` |
| 2 | `Controller.login()` | Llama a `AuthService.validateUser()` | — |
| 3 | `AuthService.validateUser()` | Busca usuario por email en DB | `prisma.user.findUnique({ where: { email } })` |
| 4 | Prisma | Retorna usuario con roles y permisos anidados | Incluye `roles → role → permissions` |
| 5 | `AuthService.validateUser()` | Verifica existencia y estado activo | Si no existe o `!isActive` → `401 Unauthorized` |
| 6 | `AuthService.validateUser()` | Compara contraseña con bcrypt | `bcrypt.compare(password, user.password)` → si no coincide → `401` |
| 7 | `AuthService.validateUser()` | Extrae roles[] y permissions[] planos | Mapea UserRole[] → string[], Set único |
| 8 | `Controller.login()` | Llama a `AuthService.login(user)` | Construye payload y firma JWT |
| 9 | `AuthService.login()` | Crea payload y firma con `JwtService.sign()` | `{ sub, email, name, roles, permissions }` |
| 10 | `Controller.login()` | Establece cookie HttpOnly | `res.cookie('access_token', token, opts)` |
| 11 | Controller | Retorna `{ user }` al cliente | Sin token en body (solo cookie) |

### 3.3 Respuesta de login exitoso

```
Status: 200 OK
Set-Cookie: access_token=eyJhbGciOiJIUzI1NiIs...; HttpOnly; Secure; SameSite=Lax; Max-Age=28800; Path=/
Content-Type: application/json

{
  "user": {
    "id": "uuid-del-usuario",
    "email": "admin@grupo-security.com",
    "name": "Administrador",
    "roles": ["Admin"],
    "permissions": ["products:*", "categories:*", "brands:*", "prices:*", "users:*", "audit:read", "publish:manage"]
  }
}
```

### 3.4 Respuesta de login fallido

```
Status: 401 Unauthorized
Content-Type: application/json

{
  "statusCode": 401,
  "timestamp": "2026-07-23T10:30:00.000Z",
  "path": "/api/auth/login",
  "message": "Credenciales inválidas"
}
```

> **Nota de seguridad:** El mensaje de error es genérico ("Credenciales inválidas") en lugar de específico ("Usuario no encontrado" vs "Contraseña incorrecta") para no revelar qué parte de la credencial es incorrecta.

---

## 4. Emisión y Validación de JWT

### 4.1 Configuración

| Parámetro | Valor | Origen |
|-----------|-------|--------|
| **Algoritmo** | HS256 | Por defecto en `@nestjs/jwt` |
| **Secret** | `JWT_SECRET` | Variable de entorno (exigida) |
| **Expiración** | `8h` (28800 segundos) | `signOptions.expiresIn` |
| **Issuer** | No configurado | Opcional para futuro |
| **Audience** | No configurado | Opcional para futuro |

### 4.2 Emisión (AuthService.login)

```typescript
async login(user: ValidatedUser) {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    permissions: user.permissions,
  };

  const token = this.jwtService.sign(payload);
  // token es un string JWT: header.payload.signature

  return { token, user };
}
```

### 4.3 Validación (JwtStrategy.validate)

```typescript
async validate(payload: JwtPayload): Promise<RequestUser> {
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedException('Usuario no encontrado o inactivo');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: payload.roles,
    permissions: payload.permissions,
  };
}
```

### 4.4 Ciclo de vida del token

```
Emisión (login)                      Expiración (8h)
    │──────────────────────────────────────│
    │                                      │
    │  Requests con cookie <JWT>           │
    │  ──────────────────────────────────▶ │
    │                                      │
    │  Si token expirado:                  │
    │  ─ 401 Unauthorized                  │
    │  ─ Frontend redirige a /login        │
    │                                      │
    │  Si usuario desactivado:             │
    │  ─ JwtStrategy.validate() falla      │
    │  ─ 401 Unauthorized                  │
```

### 4.5 Seguridad del JWT

- ✅ **Firma HMAC-SHA256**: El payload no puede ser modificado sin conocer el secret.
- ✅ **Expiración de 8h**: Ventana de exposición limitada si el token es robado.
- ✅ **Validación en cada request**: JwtStrategy consulta `isActive` en DB → baja inmediata de usuario desactivado.
- ❌ **Sin refresh token hoy**: Sección 10 detalla la propuesta.
- ❌ **Sin rotación de tokens**: Pendiente para post-MVP.

---

## 5. Uso de Cookie HttpOnly

### 5.1 Configuración de la cookie

```typescript
res.cookie('access_token', token, {
  httpOnly: true,                                    // No accesible desde JavaScript
  secure: process.env.NODE_ENV === 'production',     // Solo HTTPS en producción
  sameSite: 'lax',                                   // Mitiga CSRF
  maxAge: 8 * 60 * 60 * 1000,                        // 8 horas (coincide con expiración JWT)
  path: '/',                                         // Disponible en todo el sitio
});
```

### 5.2 Flags de seguridad

| Flag | Valor | Propósito |
|------|-------|-----------|
| `httpOnly` | `true` | Impide acceso desde `document.cookie` (mitiga XSS) |
| `secure` | `true` en prod | Solo se envía por HTTPS (mitiga sniffing) |
| `sameSite` | `lax` | No se envía en requests cross-site (mitiga CSRF) |
| `maxAge` | `28800` (8h) | Coincide con `expiresIn` del JWT |
| `path` | `/` | Disponible para todos los endpoints de la API |

### 5.3 ¿Por qué cookie HttpOnly y no localStorage?

| Aspecto | Cookie HttpOnly | localStorage |
|---------|----------------|--------------|
| Acceso desde JS | ❌ No (`httpOnly`) | ✅ Sí (`getItem`) |
| Vulnerable a XSS | ❌ No | ✅ Sí |
| Envío automático | ✅ Sí (en cada request) | ❌ No (toca adjuntar manual en header) |
| CSRF protection | Requiere `sameSite` | No aplica |
| Tamaño máximo | ~4KB (suficiente para JWT) | ~5-10MB |
| Limpieza en logout | ✅ `res.clearCookie()` | Manual desde frontend |

### 5.4 Estrategia de logout

```typescript
@Post('logout')
@UseGuards(JwtAuthGuard)
async logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('access_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return { message: 'Sesión cerrada exitosamente' };
}
```

El logout del lado frontend también limpia el estado de la store:

```typescript
// Frontend: al recibir 200 del logout
const logout = useAuthStore(state => state.logout);
logout();                      // Limpia Zustand + persist
window.location.href = '/login';  // Redirige
```

---

## 6. JwtStrategy y JwtAuthGuard

### 6.1 JwtStrategy (Passport Strategy)

**Archivo:** `src/backend/src/modules/auth/jwt.strategy.ts`

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: (req) => {
        // 1. Intentar cookie primero (HttpOnly)
        if (req?.cookies?.access_token) {
          return req.cookies.access_token;
        }
        // 2. Fallback a Authorization: Bearer (para Swagger/testing)
        const authHeader = req?.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          return authHeader.substring(7);
        }
        return null;
      },
      ignoreExpiration: false,     // Rechazar tokens expirados
      secretOrKey: process.env.JWT_SECRET,  // Exigir variable de entorno
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Verificar que el usuario aún existe y está activo
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    // Retornar el objeto que se inyectará en request.user
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
```

**Comportamiento de extracción del token:**

```
Request HTTP
    │
    ├── ¿Cookie "access_token" existe?
    │   ├── Sí → Usar cookie
    │   └── No  → ¿Header "Authorization: Bearer <token>"?
    │               ├── Sí → Usar header
    │               └── No  → null → 401 Unauthorized
    │
    ▼
Secreto configurado validado → ¿JWT_SECRET existe en entorno?
    ├── Sí → Verificar firma con ese secreto
    └── No  → Error fatal al arrancar el servidor
```

### 6.2 JwtAuthGuard (Guard global)

**Archivo:** `src/backend/src/modules/auth/jwt-auth.guard.ts`

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si el endpoint tiene @Public(), saltar autenticación
    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('No autorizado');
    }
    return user;
  }
}
```

**Registro como APP_GUARD** (en `app.module.ts`):

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,   // Global: protege TODAS las rutas
  },
],
```

### 6.3 Decorador @Public()

```typescript
// common/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**Uso:**

```typescript
@Public()
@Post('login')
async login(@Body() loginDto: LoginDto) { ... }
```

### 6.4 Decorador @CurrentUser()

```typescript
// common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;  // Inyectado por Passport después de validar JWT
  },
);
```

**Uso:**

```typescript
@Get('profile')
getProfile(@CurrentUser() user: RequestUser) {
  return this.authService.getProfile(user.sub);
}
```

**Estructura de `request.user` (RequestUser):**

```typescript
interface RequestUser {
  sub: string;           // ID del usuario (UUID)
  email: string;
  name: string;
  roles: string[];       // Ej: ['Admin', 'Gerente']
  permissions: string[]; // Ej: ['products:read', 'products:write']
}
```

---

## 7. RolesGuard y Decoradores

### 7.1 RolesGuard

**Archivo canónico:** `src/backend/src/common/guards/roles.guard.ts`

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no hay roles requeridos, permitir acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // Si no hay usuario autenticado, denegar
    if (!user || !user.roles) {
      return false;
    }

    // El usuario tiene al menos UNO de los roles requeridos
    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
```

### 7.2 PermissionsGuard

**Archivo:** `src/backend/src/common/guards/permissions.guard.ts`

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY, [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.permissions) {
      return false;
    }

    // El usuario debe tener TODOS los permisos requeridos
    return requiredPermissions.every((permission) =>
      user.permissions.includes(permission),
    );
  }
}
```

### 7.3 Decoradores

```typescript
// common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// common/decorators/permissions.decorator.ts
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

### 7.4 Jerarquía de ejecución

```
Request
  │
  ▼
┌─────────────────────┐
│   JwtAuthGuard      │  ← Global (APP_GUARD). Verifica que el JWT sea válido.
│   (autenticación)   │    Inyecta request.user con { sub, email, name, roles, permissions }
│                     │    Si @Public() → skips
└─────────┬───────────┘
          │ (request.user disponible)
          ▼
┌─────────────────────┐
│   RolesGuard        │  ← Por módulo (@UseGuards en clase del controller).
│   (autorización     │    Lee @Roles() del handler.
│    por rol)         │    Verifica intersección requeridos ∩ user.roles.
│                     │    Si no hay @Roles() → permite.
└─────────┬───────────┘
          │ (rol verificado)
          ▼
┌─────────────────────┐
│  PermissionsGuard   │  ← Opcional (no usado actualmente en ningún controller).
│  (autorización      │    Lee @Permissions() del handler.
│   por permiso)      │    Verifica que requeridos ⊆ user.permissions.
│                     │    Si no hay @Permissions() → permite.
└─────────┬───────────┘
          │ (permisos verificados)
          ▼
    Ejecuta handler
```

### 7.5 Uso combinado en controladores

```typescript
@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)   // Orden: JWT primero, luego roles
export class ProductsController {

  @Get()
  @Roles('Admin', 'Gerente', 'Operator', 'Viewer')
  findAll() { ... }

  @Post()
  @Roles('Admin', 'Gerente')
  create(@Body() dto: CreateProductDto) { ... }

  @Delete(':id')
  @Roles('Admin')
  remove(@Param('id') id: string) { ... }
}
```

### 7.6 Matriz de roles por módulo

| Módulo | Lectura | Escritura | Eliminación |
|--------|---------|-----------|-------------|
| **Products** | Admin, Gerente, Operator, Viewer | Admin, Gerente | Admin |
| **Categories** | Admin, Gerente, Operator, Viewer | Admin, Gerente | Admin |
| **Brands** | Admin, Gerente, Operator, Viewer | Admin, Gerente | Admin |
| **Prices** | Admin, Gerente, Operator, Viewer | Admin, Gerente | Admin |
| **Users** | Admin, Gerente | Admin | Admin |
| **Roles** | Admin, Gerente | Admin | Admin |
| **Audit** | Admin, Gerente | — | — |

---

## 8. Modelo RBAC con Roles y Permisos

### 8.1 Modelo de datos (Prisma)

```prisma
model User {
  id        String     @id @default(uuid())
  email     String     @unique
  name      String
  password  String           // bcrypt hash
  isActive  Boolean    @default(true)
  roles     UserRole[]
  auditLogs AuditLog[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  @@map("users")
}

model Role {
  id          String           @id @default(uuid())
  name        String           @unique      // "Admin", "Gerente", "Operator", "Viewer"
  description String?
  permissions RolePermission[]
  users       UserRole[]
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  @@map("roles")
}

model UserRole {
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  role      Role     @relation(fields: [roleId], references: [id])
  roleId    String
  createdAt DateTime @default(now())
  @@id([userId, roleId])
  @@map("user_roles")
}

model RolePermission {
  role       Role     @relation(fields: [roleId], references: [id])
  roleId     String
  permission String           // "products:read", "products:write", etc.
  createdAt  DateTime @default(now())
  @@id([roleId, permission])
  @@map("role_permissions")
}
```

### 8.2 Relaciones

```
User ──── M:N ──── Role ──── M:N ──── String (permission)
  │                    │
  │                    │
  ▼                    ▼
UserRole           RolePermission
(tabla pivote)     (tabla pivote)
userId + roleId    roleId + permission
```

### 8.3 Roles del seed

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| **Admin** | Acceso total | `products:*`, `categories:*`, `brands:*`, `prices:*`, `users:*`, `audit:read`, `publish:manage` |
| **Gerente** | Gestión de productos, precios y publicación | `products:read/write`, `categories:read/write`, `brands:read/write`, `prices:read/write`, `audit:read`, `publish:manage` |
| **Operator** | Edición limitada de productos y consulta de precios | `products:read/write`, `categories:read`, `brands:read`, `prices:read` |
| **Viewer** | Solo lectura del catálogo | `products:read`, `categories:read`, `brands:read`, `prices:read` |

### 8.4 Convención de naming de permisos

```
<formato>: <entidad>:<acción>

Ejemplos:
products:read       → Leer productos
products:write      → Crear/editar productos
products:delete     → Eliminar productos
publish:manage      → Publicar/despublicar productos
audit:read          → Leer logs de auditoría
users:manage        → Gestión completa de usuarios
```

**Acciones estándar:**

| Acción | Significado |
|--------|-------------|
| `read` | GET (listar y obtener por ID) |
| `write` | POST y PUT (crear y actualizar) |
| `delete` | DELETE (eliminar) |
| `manage` | Todas las acciones anterior |
| `*` | Comodín: todas las acciones |

### 8.5 Carga de roles y permisos en el JWT

En `AuthService.validateUser()`:

```typescript
const roles = user.roles.map((ur) => ur.role.name);
const permissions = [
  ...new Set(
    user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission),
    ),
  ),
];
```

Esto produce arrays planos como:

```typescript
roles: ['Admin']
permissions: ['products:*', 'categories:*', 'brands:*', 'prices:*', 'users:*', 'audit:read', 'publish:manage']
```

---

## 9. Estructura del Payload JWT

### 9.1 Payload actual

```typescript
interface JwtPayload {
  sub: string;           // UUID del usuario (obligatorio en JWT)
  email: string;         // Email del usuario
  name: string;          // Nombre completo
  roles: string[];       // Nombres de roles: ['Admin', 'Gerente']
  permissions: string[]; // Permisos planos: ['products:read', 'products:write']
  iat?: number;          // Issued at (agregado por JwtService automáticamente)
  exp?: number;          // Expiration (agregado por JwtService según expiresIn)
}
```

### 9.2 Ejemplo concreto

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@grupo-security.com",
  "name": "Administrador",
  "roles": ["Admin"],
  "permissions": [
    "products:*",
    "categories:*",
    "brands:*",
    "prices:*",
    "users:*",
    "audit:read",
    "publish:manage"
  ],
  "iat": 1721738400,
  "exp": 1721767200
}
```

### 9.3 Tamaño del JWT

El payload descrito genera un JWT de aproximadamente **600-800 bytes** (dependiendo de la cantidad de permisos). Esto es cómodo dentro del límite de 4KB de cookies.

### 9.4 Información NO incluida en el payload

| Campo | Motivo de exclusión |
|-------|-------------------|
| `password` | Nunca incluir datos sensibles |
| `isActive` | Se verifica en DB en cada request (JwtStrategy.validate) |
| `createdAt` | No necesario para autorización |
| `updatedAt` | No necesario para autorización |

### 9.5 Decisión de diseño: roles y permisos en el JWT

**Decisión:** Incluir `roles` y `permissions` en el payload del JWT en lugar de consultar la DB en cada request.

**Razonamiento:**
- **Performance:** Evita una query a DB por cada request para obtener roles/permisos.
- **Atomicidad:** El token contiene toda la info necesaria para autorizar.
- **Trade-off:** Si se cambian los permisos de un usuario, el cambio no es efectivo hasta que el token expire (8h) o el usuario haga login de nuevo.

**Mitigación del trade-off:** La validación de `isActive` sí se hace contra DB en cada request, lo que permite desactivar usuarios inmediatamente.

---

## 10. Refresh Token y Logout Propuesto

### 10.1 Estado actual

- **Hoy:** JWT con expiración de 8h. No hay refresh token.
- **Logout:** Limpia la cookie del lado del servidor. El token sigue siendo válido hasta su expiración natural, pero al no tener la cookie, el cliente no puede usarlo.
- **Riesgo:** Si un token es robado, es válido por 8h sin posibilidad de revocación (salvo desactivar al usuario).

### 10.2 Propuesta de implementación (post-MVP)

#### Modelo RefreshToken (Prisma)

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique        // Hash SHA256 del refresh token
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([token])
  @@map("refresh_tokens")
}
```

#### Flujo con refresh token

```
Login:
  POST /api/auth/login
  Response:
    Set-Cookie: access_token=<JWT 8h>
    Set-Cookie: refresh_token=<opaco 7d> (HttpOnly, Secure, SameSite=Strict, Path=/api/auth/refresh)
    { user: {...} }

Uso normal:
  Request con cookie access_token
  Si 401 → frontend llama a:
    POST /api/auth/refresh (con cookie refresh_token)
    → Nuevo access_token + nuevo refresh_token (rotación)
    → Reintenta request original

Logout:
  POST /api/auth/logout
  → Revoca refresh_token en DB
  → Limpia ambas cookies
  → Frontend redirige a /login
```

#### Endpoints adicionales

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/auth/refresh` | `@Public()` (usa cookie refresh_token) | Rotar tokens |
| `POST` | `/api/auth/logout` | JWT + refresh_token | Revocar refresh + limpiar cookies |

#### Seguridad de refresh tokens

- **Token opaco:** El refresh token es un string aleatorio (no JWT), almacenado como hash SHA256 en DB.
- **Rotación:** Cada vez que se usa un refresh token, se emite uno nuevo y se revoca el anterior.
- **Revocación:** En logout o cambio de contraseña, se revocan todos los refresh tokens del usuario.
- **Expiración:** 7 días. Si el usuario no usa la app por 7 días, debe hacer login completo.
- **Protección:** Cookie `refresh_token` con `Path=/api/auth/refresh` para que solo se envíe al endpoint de refresh, no a todos los endpoints.

### 10.3 Prioridad de implementación

| Componente | Prioridad | Dependencia |
|-----------|-----------|-------------|
| Refresh token model + migration | Media | Schema Prisma |
| AuthService.refresh() | Media | RefreshToken model |
| AuthController.refresh() | Media | AuthService |
| Rotación de tokens | Media | RefreshService |
| Revocación en logout | Alta | RefreshService |
| Revocación en cambio de password | Alta | UsersService + AuthService |

> **Nota:** Refresh tokens **no son necesarios para el MVP**. Se prioriza rate limiting y JWT sin fallback (Fase 1 del remediation plan) sobre refresh tokens.

---

## 11. Rate Limiting y Brute Force Protection

### 11.1 Estrategia de defensa en capas

```
Capa 1: Rate limiting por IP (login)
Capa 2: Mensaje genérico de error
Capa 3: [Futuro] Account lockout tras N intentos
Capa 4: [Futuro] Monitoreo y alertas
```

### 11.2 Rate limiting con @nestjs/throttler

**Dependencia:** `npm install @nestjs/throttler` (pendiente de instalar)

**Configuración global (recomendada para login):**

```typescript
// auth.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // ...
    ThrottlerModule.forRoot([{
      ttl: 60000,     // Ventana de 1 minuto
      limit: 10,      // Máximo 10 requests globales por minuto
    }]),
  ],
  // ...
})
```

**Configuración específica para login (más restrictiva):**

```typescript
// auth.controller.ts
import { Throttle } from '@nestjs/throttler';

@Public()
@Post('login')
@Throttle({ default: { limit: 5, ttl: 60000 } })  // 5 intentos por minuto
@HttpCode(HttpStatus.OK)
async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
  // ...
}
```

### 11.3 Configuración propuesta

| Endpoint | Límite | Ventana | Comportamiento |
|----------|--------|---------|----------------|
| `POST /api/auth/login` | 5 | 1 minuto | `429 Too Many Requests` |
| Otros endpoints | 30 | 1 minuto | `429 Too Many Requests` |

### 11.4 Account lockout (futuro)

Para una protección más robusta, se puede implementar bloqueo de cuenta:

```typescript
// En AuthService.validateUser():
const FAILED_ATTEMPT_THRESHOLD = 10;
const LOCKOUT_DURATION_MINUTES = 15;

// Si login falla:
await this.prisma.user.update({
  where: { id: user.id },
  data: {
    failedLoginAttempts: { increment: 1 },
    ...(user.failedLoginAttempts + 1 >= FAILED_ATTEMPT_THRESHOLD && {
      lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000),
    }),
  },
});

// Si login exitoso:
await this.prisma.user.update({
  where: { id: user.id },
  data: { failedLoginAttempts: 0, lockedUntil: null },
});
```

**Modelo User requeriría campos adicionales:**

```prisma
model User {
  // ... campos existentes
  failedLoginAttempts Int     @default(0)
  lockedUntil         DateTime?
}
```

> **Nota:** Account lockout está fuera del alcance del MVP. Se recomienda implementar después de rate limiting.

### 11.5 Mensaje de error genérico

Siempre devolver el mismo mensaje para cualquier fallo de autenticación:

```typescript
throw new UnauthorizedException('Credenciales inválidas');
```

No diferenciar entre "usuario no encontrado" y "contraseña incorrecta" para no filtrar información.

---

## 12. Validación de Credenciales y Política de Contraseñas

### 12.1 Política de contraseñas

| Requisito | Valor | Validación |
|-----------|-------|-----------|
| Longitud mínima | **8 caracteres** | `@MinLength(8)` en DTOs |
| Longitud máxima | Sin límite explícito | Recomendado: 128 caracteres (bcrypt acepta hasta 72) |
| Complejidad | Sin reglas adicionales en MVP | Recomendado post-MVP: mayúscula, número, especial |
| Hash | bcrypt con salt rounds **12** | `bcrypt.hash(password, 12)` |
| Almacenamiento | Solo hash, nunca texto plano | Modelo `User.password` contiene el hash |

### 12.2 DTOs de validación

**LoginDto** (debe ser `@MinLength(8)` — actualmente tiene `@MinLength(6)`):

```typescript
export class LoginDto {
  @ApiProperty({ example: 'admin@grupo-security.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(8)        // ← Debe SER 8, no 6
  password: string;
}
```

**CreateUserDto** (ya tiene `@MinLength(8)`):

```typescript
export class CreateUserDto {
  @ApiProperty({ example: 'admin@grupo-security.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  @MinLength(8)        // ← Correcto
  password: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsOptional()
  roleIds?: string[];
}
```

### 12.3 Validación de credenciales (AuthService.validateUser)

```typescript
async validateUser(email: string, password: string) {
  // 1. Buscar usuario por email (normalizado a minúsculas)
  const user = await this.prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });

  // 2. Verificar existencia y estado activo
  if (!user || !user.isActive) {
    throw new UnauthorizedException('Credenciales inválidas');
  }

  // 3. Verificar contraseña con bcrypt
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new UnauthorizedException('Credenciales inválidas');
  }

  // 4. Extraer roles y permisos
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission)
    )),
  ];

  return { id: user.id, email: user.email, name: user.name, roles, permissions };
}
```

### 12.4 Normalización de email

- **Almacenamiento:** El email se guarda en minúsculas.
- **Búsqueda:** `email.toLowerCase()` antes de la query.
- **Unicidad:** Garantizada por `@unique` en Prisma.

### 12.5 Bcrypt: configuración

```typescript
import * as bcrypt from 'bcrypt';

// Para crear usuario:
const hashedPassword = await bcrypt.hash(password, 12);  // salt rounds = 12

// Para verificar login:
const isValid = await bcrypt.compare(password, user.password);
```

**¿Por qué salt rounds 12?**
- 10 rounds (~10 hashes/segundo en hardware moderno): mínimo aceptable.
- 12 rounds (~4 hashes/segundo): balance seguridad/performance.
- 14+ rounds (~1 hash/segundo): seguro pero lento para login concurrente.

Para un panel administrativo con ~50 usuarios concurrentes, salt rounds 12 es el punto óptimo.

---

## 13. Auditoría de Eventos de Auth

### 13.1 Eventos a auditar

| Evento | Acción | Datos a registrar |
|--------|--------|-------------------|
| **Login exitoso** | `LOGIN` | `userId`, `entity: "auth"`, `action: "LOGIN"`, `newValues: { email }`, `ipAddress`, `userAgent` |
| **Login fallido** | `LOGIN_FAILED` | `userId?` (puede no existir), `entity: "auth"`, `action: "LOGIN_FAILED"`, `newValues: { email }`, `ipAddress`, `userAgent` |
| **Logout** | `LOGOUT` | `userId`, `entity: "auth"`, `action: "LOGOUT"`, `ipAddress`, `userAgent` |
| **Refresh token** | `TOKEN_REFRESH` | `userId`, `entity: "auth"`, `action: "TOKEN_REFRESH"` (futuro) |

### 13.2 Modelo AuditLog (ya existe)

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?           // Quién realizó la acción
  user      User?    @relation(fields: [userId], references: [id])
  action    String            // "LOGIN" | "LOGIN_FAILED" | "LOGOUT"
  entity    String            // "auth"
  entityId  String            // Email del usuario o "unknown"
  oldValues Json?             // No aplica para auth
  newValues Json?             // { email: "user@test.com" } o { reason: "invalid_password" }
  ipAddress String?           // IP del request
  userAgent String?           // User-Agent del navegador
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 13.3 Integración en AuthService

```typescript
async validateUser(email: string, password: string, context?: { ip?: string; userAgent?: string }) {
  const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, ... });

  if (!user || !user.isActive) {
    // Auditar login fallido (usuario no existe o inactivo)
    await this.auditService.log({
      action: 'LOGIN_FAILED',
      entity: 'auth',
      entityId: email.toLowerCase(),
      newValues: { email: email.toLowerCase(), reason: 'user_not_found_or_inactive' },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    });
    throw new UnauthorizedException('Credenciales inválidas');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    // Auditar login fallido (contraseña incorrecta)
    await this.auditService.log({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'auth',
      entityId: user.id,
      newValues: { email: email.toLowerCase(), reason: 'invalid_password' },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    });
    throw new UnauthorizedException('Credenciales inválidas');
  }

  // Auditar login exitoso
  await this.auditService.log({
    userId: user.id,
    action: 'LOGIN',
    entity: 'auth',
    entityId: user.id,
    newValues: { email: user.email },
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return { id: user.id, email: user.email, name: user.name, roles, permissions };
}
```

### 13.4 Consulta de auditoría

```typescript
// Obtener historial de auth de un usuario
GET /api/audit?entity=auth&userId=<uuid>&action=LOGIN

// Obtener todos los intentos de login (exitosos y fallidos)
GET /api/audit?entity=auth

// Obtener intentos fallidos recientes
GET /api/audit?entity=auth&action=LOGIN_FAILED&take=20
```

---

## 14. Riesgos, Mitigaciones y Checklist Técnico

### 14.1 Matriz de riesgos

| # | Riesgo | Impacto | Probabilidad | Severidad | Mitigación |
|---|--------|---------|-------------|-----------|-----------|
| R1 | **Fuerza bruta sobre login** | Toma de cuenta | Alta | 🔴 Crítica | Rate limiting (H1), account lockout futuro |
| R2 | **JWT secret hardcodeado** | Falsificación de tokens | Media | 🔴 Crítica | Exigir variable de entorno (H2) |
| R3 | **Contraseña débil (6 chars)** | Ataque de diccionario | Alta | 🔴 Crítica | `@MinLength(8)` en LoginDto (H3) |
| R4 | **Token robado por XSS** | Suplantación de identidad | Media | 🔴 Crítica | Cookie HttpOnly + sameSite (ya implementado) |
| R5 | **Token válido post-logout** | Sesión persistente no deseada | Baja | 🟡 Alta | Refresh tokens + revocación (futuro) |
| R6 | **Usuario desactivado sigue accediendo** | Acceso no autorizado | Baja | 🟡 Alta | JwtStrategy.validate() verifica isActive en DB cada request |
| R7 | **Permiso cambiado no reflejado hasta nuevo login** | Acceso indebido por 8h | Media | 🟡 Media | Documentado como trade-off |
| R8 | **Error de autenticación revela información** | Enumeración de usuarios | Media | 🟡 Alta | Mensaje genérico "Credenciales inválidas" |

### 14.2 Checklist técnico de auth

#### Previo a producción

- [ ] **Rate limiting**: `@nestjs/throttler` instalado y configurado (5/min en login)
- [ ] **JWT_SECRET**: Variable de entorno exigida, sin fallback hardcodeado
- [ ] **@MinLength(8)**: LoginDto.password validado a mínimo 8 caracteres
- [ ] **HttpExceptionFilter**: Registrado globalmente para errores consistentes
- [ ] **Cookie flags**: `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`
- [ ] **bcrypt salt rounds**: Configurado a 12
- [ ] **Mensaje genérico**: Login fallido siempre dice "Credenciales inválidas"
- [ ] **Logout**: Limpia cookie + store frontend
- [ ] **JwtAuthGuard**: Registrado como `APP_GUARD` global
- [ ] **RolesGuard**: Aplicado en cada módulo con `@Roles()`
- [ ] **Permisos seed**: Admin, Gerente, Operator, Viewer con sus permisos
- [ ] **Auditoría**: LOGIN y LOGIN_FAILED registrados en AuditLog
- [ ] **Sin duplicación de guards**: `modules/auth/roles.guard.ts` y `permissions.guard.ts` eliminados

#### Post-MVP

- [ ] **Refresh tokens**: Implementar rotación y revocación
- [ ] **Account lockout**: Bloqueo tras 10 intentos fallidos
- [ ] **Complejidad de contraseña**: Agregar reglas de mayúscula, número, especial
- [ ] **MFA/TOTP**: Para usuarios Admin (reservar endpoint)
- [ ] **Monitoreo**: Alertas por múltiples LOGIN_FAILED desde misma IP
- [ ] **Logging estructurado**: JSON para logs de auth

### 14.3 Pruebas de verificación

```typescript
// Tests mínimos requeridos para auth
describe('AuthService', () => {
  it('validateUser: email no existe → 401');
  it('validateUser: contraseña incorrecta → 401');
  it('validateUser: usuario inactivo → 401');
  it('validateUser: credenciales válidas → retorna user con roles y permissions');
  it('login: genera JWT con payload correcto');
  it('login: payload incluye sub, email, name, roles, permissions');
  it('getProfile: usuario existe → retorna datos');
  it('getProfile: usuario no existe → 401');
});

describe('Auth (e2e)', () => {
  it('POST /api/auth/login: éxito → 200 + Set-Cookie + user');
  it('POST /api/auth/login: credenciales inválidas → 401');
  it('POST /api/auth/login: email inválido → 400');
  it('POST /api/auth/login: password < 8 chars → 400');
  it('GET /api/auth/profile: con cookie válida → 200');
  it('GET /api/auth/profile: sin cookie → 401');
  it('POST /api/auth/logout: → 200 + cookie limpiada');
  it('POST /api/auth/login: rate limit → 429 después de 5 intentos');
});
```

---

## Apéndice A: Resumen de Archivos de Auth

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `src/backend/src/modules/auth/auth.module.ts` | Configuración del módulo | ✅ Existe, requiere migrar JWT a ConfigService |
| `src/backend/src/modules/auth/auth.controller.ts` | Endpoints /login, /profile, /logout | ✅ Existe |
| `src/backend/src/modules/auth/auth.service.ts` | Lógica de validación, login, perfil | ✅ Existe, requiere auditoría |
| `src/backend/src/modules/auth/jwt.strategy.ts` | Estrategia Passport JWT | ✅ Existe, requiere migrar a ConfigService |
| `src/backend/src/modules/auth/jwt-auth.guard.ts` | Guard global de autenticación | ✅ Existe |
| `src/backend/src/modules/auth/dto/login.dto.ts` | DTO de login | ⚠️ Existe, requiere @MinLength(8) |
| `src/backend/src/modules/auth/roles.guard.ts` | DUPLICADO (usar common/) | ❌ Eliminar |
| `src/backend/src/modules/auth/permissions.guard.ts` | DUPLICADO (usar common/) | ❌ Eliminar |
| `src/backend/src/common/guards/roles.guard.ts` | Guard canónico de roles | ✅ Existe |
| `src/backend/src/common/guards/permissions.guard.ts` | Guard canónico de permisos | ✅ Existe |
| `src/backend/src/common/decorators/public.decorator.ts` | Decorador @Public() | ✅ Existe |
| `src/backend/src/common/decorators/current-user.decorator.ts` | Decorador @CurrentUser() | ✅ Existe |
| `src/backend/src/common/decorators/roles.decorator.ts` | Decorador @Roles() | ✅ Existe |
| `src/backend/src/common/decorators/permissions.decorator.ts` | Decorador @Permissions() | ✅ Existe |
| `src/backend/prisma/schema.prisma` | Modelos User, Role, UserRole, RolePermission | ✅ Existe |

## Apéndice B: Configuración de Variables de Entorno

```bash
# .env — Autenticación
JWT_SECRET=<string-de-64-caracteres-aleatorio>
# Generar con: openssl rand -hex 32

NODE_ENV=development|production

# .env.example
JWT_SECRET=   # ← Requerido, sin valor por defecto
```

---

> **Documento mantenido por:** Equipo de Desarrollo Grupo Security  
> **Última actualización:** 2026-07-23  
> **Próxima revisión:** Al implementar refresh tokens (post-MVP)
