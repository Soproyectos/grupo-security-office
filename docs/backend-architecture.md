# Arquitectura Backend — Grupo Security Office

> **Versión:** 1.0
> **Última actualización:** 2026-07-23 (Contrato FSM canónico de products: 2026-08-28)
> **Stack:** NestJS 10 + TypeScript estricto + Prisma ORM + PostgreSQL 18  
> **Propósito:** Panel administrativo interno para gestión de catálogo, precios, usuarios y publicación.

---

## Tabla de Contenidos

1. [Principios Arquitectónicos](#1-principios-arquitectónicos)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Módulos NestJS](#4-módulos-nestjs)
5. [Flujo Controller → Service → Prisma](#5-flujo-controller--service--prisma)
6. [DTOs y Validación](#6-dtos-y-validación)
7. [Estrategia de Errores](#7-estrategia-de-errores)
8. [Autenticación JWT](#8-autenticación-jwt)
9. [Autorización RBAC](#9-autorización-rbac)
10. [Auditoría](#10-auditoría)
11. [Contratos API](#11-contratos-api)
12. [Alineación Frontend ↔ Backend ↔ Base de Datos](#12-alineación-frontend--backend--base-de-datos)
13. [Seguridad](#13-seguridad)
14. [Riesgos Técnicos Identificados](#14-riesgos-técnicos-identificados)
15. [Puntos de Extensión para ERP Yéminus](#15-puntos-de-extensión-para-erp-yéminus)
16. [Glosario](#16-glosario)

---

## 1. Principios Arquitectónicos

| Principio | Descripción |
|-----------|-------------|
| **Separación por capas** | Controller → Service → Prisma → Database. Cada capa tiene responsabilidad única y se comunica con la siguiente mediante interfaces. |
| **Cohesión de módulos** | Cada módulo NestJS agrupa dominio, infraestructura y exposición API de una entidad de negocio. |
| **Bajo acoplamiento** | Los módulos se comunican vía servicios inyectados o eventos internos (NestJS EventEmitter para futuros casos de uso). |
| **Seguridad por diseño** | JWT en cookie HttpOnly, guards globales, validación en DTOs, auditoría obligatoria en operaciones CRUD. |
| **API first** | Contratos API definidos mediante DTOs y decoradores Swagger; frontend es consumidor de la API, no al revés. |
| **Resiliencia** | Manejo de errores consistente, respuestas estandarizadas, servicios transaccionales con `$transaction`. |
| **Evolucionabilidad** | Arquitectura preparada para integrar ERP Yéminus sin reescribir módulos existentes. |

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|-----------|
| **Runtime** | Node.js | LTS (20.x+) | Entorno de ejecución |
| **Framework** | NestJS | 10.4+ | Estructura MVC, DI, guards, pipes, interceptors |
| **Lenguaje** | TypeScript | 5.6+ | Tipado estático estricto |
| **ORM** | Prisma | 5.20+ | Query builder tipado, migrations, seguridad anti-SQL injection |
| **Base de datos** | PostgreSQL | 16 | Base de datos relacional |
| **Autenticación** | Passport (JWT) + bcrypt | — | JWT en cookie HttpOnly + hash de contraseñas |
| **Validación** | class-validator + class-transformer | 0.14+ / 0.5+ | DTOs con decoradores de validación |
| **Documentación API** | @nestjs/swagger | 7.4+ | Swagger UI autogenerado en `/api/docs` |
| **Testing** | Jest | — | Tests unitarios y e2e |
| **Seguridad** | helmet, cookie-parser | — | Headers HTTP seguros, cookies |
| **Importación Excel** | xlsx | 0.18+ | Lectura de archivos .xlsx para carga masiva |

### Dependencias principales (`package.json`)

```json
{
  "@nestjs/common": "^10.4.0",
  "@nestjs/config": "^3.2.0",
  "@nestjs/core": "^10.4.0",
  "@nestjs/jwt": "^10.2.0",
  "@nestjs/passport": "^10.0.0",
  "@nestjs/platform-express": "^10.4.0",
  "@nestjs/swagger": "^7.4.0",
  "@prisma/client": "^5.20.0",
  "bcrypt": "^5.1.0",
  "class-transformer": "^0.5.1",
  "class-validator": "^0.14.1",
  "cookie-parser": "^1.4.6",
  "helmet": "^7.1.0",
  "passport": "^0.7.0",
  "passport-jwt": "^4.0.1",
  "xlsx": "^0.18.5"
}
```

---

## 3. Estructura del Proyecto

```
src/backend/
├── prisma/
│   ├── schema.prisma              # Modelo de datos completo
│   ├── seed.ts                    # Datos de prueba (roles, usuario Admin)
│   └── migrations/                # Migraciones generadas por Prisma
│
├── src/
│   ├── main.ts                    # Punto de entrada (bootstrap)
│   ├── app.module.ts              # Módulo raíz (importa todos los módulos)
│   │
│   ├── prisma/
│   │   ├── prisma.module.ts       # Módulo Global (@Global) de Prisma
│   │   └── prisma.service.ts      # Extiende PrismaClient, hooks ciclo de vida
│   │
│   ├── common/                    # Código compartido cross-cutting
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── public.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   └── permissions.decorator.ts
│   │   ├── guards/
│   │   │   ├── roles.guard.ts
│   │   │   └── permissions.guard.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts
│   │   └── filters/
│   │       └── http-exception.filter.ts
│   │
│   └── modules/                   # Módulos de dominio
│       ├── auth/                  # Autenticación JWT
│       ├── users/                 # CRUD usuarios
│       ├── roles/                 # CRUD roles + permisos
│       ├── products/              # CRUD productos + importación Excel
│       ├── categories/            # CRUD categorías jerárquicas
│       ├── brands/                # CRUD marcas
│       ├── prices/                # CRUD listas de precios + precios
│       └── audit/                 # Logs de auditoría (read-only)
│
├── test/                          # Tests e2e (pendiente de implementar)
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
└── package.json
```

### Convención de nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos | `kebab-case` | `create-product.dto.ts` |
| Clases | `PascalCase` | `CreateProductDto` |
| Métodos | `camelCase` | `findAll()`, `toggleVisibility()` |
| Rutas API | `kebab-case` | `/api/products/toggle-visibility` |
| Tablas DB | `snake_case` (vía `@@map`) | `price_lists`, `audit_logs` |

---

## 4. Módulos NestJS

### 4.1 Mapa de módulos

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global)
├── AuthModule
│   ├── JwtModule
│   └── PassportModule
├── UsersModule
├── RolesModule
├── ProductsModule
├── CategoriesModule
├── BrandsModule
├── PricesModule
└── AuditModule
```

### 4.2 Descripción de cada módulo

#### AuthModule
- **Responsabilidad:** Autenticación JWT, login, logout, perfil
- **Endpoints:**
  - `POST /api/auth/login` — público, retorna cookie + datos de usuario
  - `GET /api/auth/profile` — protegido, retorna perfil del usuario autenticado
  - `POST /api/auth/logout` — protegido, limpia cookie
- **Estructura:**
  ```
  auth/
  ├── dto/
  │   └── login.dto.ts
  ├── auth.controller.ts
  ├── auth.service.ts
  ├── auth.module.ts
  ├── jwt.strategy.ts
  └── jwt-auth.guard.ts
  ```
- **Nota:** `JwtAuthGuard` se registra como `APP_GUARD` global en `app.module.ts`

#### UsersModule
- **Responsabilidad:** CRUD de usuarios internos
- **Endpoints:**
  - `GET /api/users` — listar (paginated)
  - `GET /api/users/:id` — obtener por ID
  - `POST /api/users` — crear (Admin)
  - `PUT /api/users/:id` — actualizar (Admin)
  - `DELETE /api/users/:id` — eliminar (Admin)
- **Roles requeridos:** Admin (escritura), Admin/Gerente (lectura)

#### RolesModule
- **Responsabilidad:** CRUD de roles y asignación de permisos
- **Endpoints:**
  - `GET /api/roles` — listar
  - `GET /api/roles/:id` — obtener por ID
  - `POST /api/roles` — crear (Admin)
  - `PUT /api/roles/:id` — actualizar (Admin)
  - `DELETE /api/roles/:id` — eliminar (Admin, solo si sin usuarios asignados)
- **Roles requeridos:** Admin (escritura), Admin/Gerente (lectura)

#### ProductsModule
- **Responsabilidad:** CRUD de productos + ciclo de vida (FSM canónica de 3 estados) + importación masiva desde Excel
- **Endpoints:**
  - `GET /api/products` — listar con filtros (search, categoryId, brandId)
  - `GET /api/products/:id` — obtener por ID con relaciones
  - `POST /api/products` — crear (siempre nace en `DRAFT`)
  - `PUT /api/products/:id` — actualizar (el estado se gestiona vía transition)
  - `POST /api/products/:id/transition` — **canónico**: `PUBLISH`, `UNPUBLISH`, `ARCHIVE`, `RESTORE`
  - `POST /api/products/bulk-transition` — **canónico**: transición masiva (1..500)
  - `GET /api/products/publish-scheduled` — lista `DRAFT` con `publishAt` en rango
  - `PATCH /api/products/:id/publish` — **legacy obsoleto**: publica de inmediato o programa (`DRAFT + publishAt`)
  - `PATCH /api/products/:id/unpublish` — **legacy obsoleto**: ejecuta `UNPUBLISH`
  - `PATCH /api/products/:id/toggle-visibility` — **legacy obsoleto**: `DRAFT→PUBLISH`, `PUBLISHED→UNPUBLISH`, `ARCHIVED→400`
  - `PATCH /api/products/:id/toggle-active` — **eliminado**: responde `410 Gone`
  - `DELETE /api/products/:id` — eliminar (Admin, con confirm + clave maestra)
  - `POST /api/products/import` — importar Excel (multipart/form-data)
- **Roles requeridos:** Admin/Gerente (escritura), Admin/Gerente/Operator/Viewer (lectura); `PUBLISH`/`UNPUBLISH` requieren `publish:manage`, `ARCHIVE`/`RESTORE` requieren Super Admin/Admin Comercial
- **Scheduler interno:** cron cada minuto publica `DRAFT` con `publishAt <= now` vía `PUBLISH` interno (sin auto-despublicación)

#### CategoriesModule
- **Responsabilidad:** CRUD de categorías con estructura jerárquica (auto-referencia)
- **Endpoints:**
  - `GET /api/categories` — listar planas
  - `GET /api/categories/tree` — árbol jerárquico completo
  - `GET /api/categories/:id` — obtener por ID
  - `POST /api/categories` — crear
  - `PUT /api/categories/:id` — actualizar
  - `DELETE /api/categories/:id` — eliminar (Admin)
- **Roles requeridos:** Admin/Gerente (escritura), Admin/Gerente/Operator/Viewer (lectura)

#### BrandsModule
- **Responsabilidad:** CRUD de marcas
- **Endpoints:**
  - `GET /api/brands` — listar
  - `GET /api/brands/:id` — obtener por ID
  - `POST /api/brands` — crear
  - `PUT /api/brands/:id` — actualizar
  - `DELETE /api/brands/:id` — eliminar (Admin)
- **Roles requeridos:** Admin/Gerente (escritura), Admin/Gerente/Operator/Viewer (lectura)

#### PricesModule
- **Responsabilidad:** CRUD de listas de precios y precios por producto/lista
- **Endpoints:**
  - Listas de precios:
    - `GET /api/prices/lists` — listar
    - `GET /api/prices/lists/:id` — obtener por ID
    - `POST /api/prices/lists` — crear
    - `PUT /api/prices/lists/:id` — actualizar
    - `DELETE /api/prices/lists/:id` — eliminar (Admin)
  - Precios:
    - `GET /api/prices/product/:productId` — precios de un producto
    - `GET /api/prices/list/:priceListId` — precios de una lista
    - `POST /api/prices` — crear precio
    - `PUT /api/prices/:id` — actualizar precio
    - `DELETE /api/prices/:id` — eliminar precio (Admin)
- **Roles requeridos:** Admin/Gerente (escritura), Admin/Gerente/Operator/Viewer (lectura)

#### AuditModule
- **Responsabilidad:** Consulta de logs de auditoría (solo lectura)
- **Endpoints:**
  - `GET /api/audit` — listar con filtros (entity, entityId, userId, action)
  - `GET /api/audit/:entity/:entityId` — auditoría de una entidad específica
- **Roles requeridos:** Admin/Gerente

### 4.3 Estructura estándar de un módulo

```
modules/<entidad>/
├── dto/
│   ├── create-<entidad>.dto.ts
│   └── update-<entidad>.dto.ts
├── <entidad>.controller.ts
├── <entidad>.service.ts
└── <entidad>.module.ts
```

**Reglas:**
- Todo módulo exporta su servicio para posible reutilización entre módulos.
- `PrismaModule` es global, no necesita importarse explícitamente.
- Los controladores usan `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase.
- Los decoradores `@Roles()` se aplican a nivel de método.

---

## 5. Flujo Controller → Service → Prisma

### 5.1 Diagrama de flujo

```
[HTTP Request]
      │
      ▼
[Controller] ─── @UseGuards(JwtAuthGuard, RolesGuard)
      │              │
      │              ├── Valida JWT (cookie o Bearer)
      │              ├── Extrae user { sub, email, name, roles, permissions }
      │              └── Verifica rol requerido vs user.roles
      │
      ▼
[DTO validado] ─── class-validator + ValidationPipe (whitelist, forbidNonWhitelisted)
      │
      ▼
[Service] ─── Lógica de negocio + validaciones de dominio
      │          │
      │          ├── Verifica existencia de registros
      │          ├── Valida unicidad (SKU, email, etc.)
      │          ├── Ejecuta $transaction si hay múltiples operaciones
      │          └── Lanza excepciones HTTP (@nestjs/common)
      │
      ▼
[PrismaService] ─── Query builder tipado (parameterized queries → anti SQL injection)
      │
      ▼
[PostgreSQL]
```

### 5.2 Capas y responsabilidades

| Capa | Responsabilidad | NO responsabilidad |
|------|----------------|-------------------|
| **Controller** | Recibir request, delegar al service, devolver response. Decoradores de ruta, Swagger, guards. | Lógica de negocio, acceso a DB, transformación compleja. |
| **Service** | Lógica de negocio, validaciones de dominio, orquestación de operaciones, manejo de transacciones. | Conocimiento de HTTP, formato de respuesta. |
| **PrismaService** | Query builder, conexión a DB, transacciones atómicas. | Lógica de negocio, validaciones. |
| **Prisma Client** | Queries SQL parameterizadas generadas desde el schema. | — |

### 5.3 Patrón de servicio genérico

```typescript
@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params?: FindAllParams): Promise<PaginatedResponse<Product>> {
    const where: Prisma.ProductWhereInput = this.buildWhereClause(params);
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({ where, skip, take, include: {...} }),
      this.prisma.product.count({ where }),
    ]);
    return { data, meta: { total, skip, take } };
  }

  async findOne(id: string): Promise<Product> {
    const entity = await this.prisma.product.findUnique({ where: { id }, include: {...} });
    if (!entity) throw new NotFoundException('Producto no encontrado');
    return entity;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    // Validación de unicidad
    const existing = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException('Ya existe un producto con ese SKU');
    // Validación de FK
    await this.ensureCategoryExists(dto.categoryId);
    await this.ensureBrandExists(dto.brandId);
    // Creación
    return this.prisma.product.create({ data: {...dto}, include: {...} });
  }
}
```

### 5.4 Transaccionalidad

Para operaciones que afectan múltiples tablas, se usa `PrismaService.$transaction`:

```typescript
async function createProductWithPrices(dto: CreateProductWithPricesDto) {
  return this.prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: {...dto} });
    const prices = await Promise.all(
      dto.prices.map(price =>
        tx.price.create({ data: { ...price, productId: product.id } })
      )
    );
    return { ...product, prices };
  });
}
```

---

## 6. DTOs y Validación

### 6.1 Estrategia de validación

| Componente | Configuración |
|-----------|--------------|
| **ValidationPipe** (global en `main.ts`) | `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` |
| **class-validator** | Decoradores en propiedades del DTO |
| **class-transformer** | Transformación automática de tipos (string → number, etc.) |

### 6.2 Reglas de validación por tipo de campo

| Tipo de campo | Decoradores requeridos |
|---------------|----------------------|
| `string` (requerido) | `@IsString()`, `@MinLength(2)` |
| `string` (opcional) | `@IsOptional()`, `@IsString()` |
| `email` | `@IsEmail()` |
| `number` | `@IsNumber()` |
| `boolean` | `@IsBoolean()` |
| `object` | `@IsObject()`, `@IsOptional()` |
| `UUID` | `@IsString()`, `@IsUUID()` (cuando aplica) |
| `Decimal` | `@IsNumber()`, transformación a Decimal en service |

### 6.3 Ejemplo de DTO completo

```typescript
import { IsString, MinLength, IsOptional, IsBoolean, IsObject, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'DS-2CD2143G2-I' })
  @IsString()
  @MinLength(2)
  sku: string;

  @ApiProperty({ example: 'Cámara IP Bullet 4MP' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'Cámara de alta resolución para exterior' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'uuid-category' })
  @IsString()
  categoryId: string;

  @ApiProperty({ example: 'uuid-brand' })
  @IsString()
  brandId: string;

  @ApiPropertyOptional({ example: { resolution: '4MP', lens: '2.8mm' } })
  @IsObject()
  @IsOptional()
  technicalSpecs?: Record<string, any>;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;
}
```

### 6.4 Convenciones de DTOs

- Los DTOs de creación (`Create*Dto`) pueden tener campos requeridos y opcionales.
- Los DTOs de actualización (`Update*Dto`) tienen **todos** los campos como opcionales (`@IsOptional()`).
- Los DTOs **nunca** exponen campos sensibles como `password`.
- Los DTOs incluyen decoradores `@ApiProperty`/`@ApiPropertyOptional` para documentación Swagger.

---

## 7. Estrategia de Errores

### 7.1 Formato de respuesta de error

```json
{
  "statusCode": 400,
  "timestamp": "2026-07-23T10:30:00.000Z",
  "path": "/api/products",
  "message": "El SKU ya existe"
}
```

### 7.2 HttpExceptionFilter (global)

- **Archivo:** `common/filters/http-exception.filter.ts`
- **Comportamiento:** Captura todas las `HttpException`, extrae `statusCode`, `message` y `path`, y devuelve JSON estandarizado.
- **Registro:** Debe registrarse como `APP_FILTER` o en `main.ts` con `app.useGlobalFilters()`.

**Implementación actual:**

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || 'Error',
    });
  }
}
```

### 7.3 Excepciones HTTP utilizadas

| Excepción | Uso | Código HTTP |
|-----------|-----|-------------|
| `NotFoundException` | Entidad no encontrada | 404 |
| `ConflictException` | Violación de unicidad | 409 |
| `BadRequestException` | Validación de dominio, archivo inválido | 400 |
| `UnauthorizedException` | Credenciales inválidas, token expirado | 401 |
| `ForbiddenException` | Sin permisos suficientes | 403 |
| `InternalServerErrorException` | Errores inesperados | 500 |

### 7.4 TransformInterceptor

- **Archivo:** `common/interceptors/transform.interceptor.ts`
- **Comportamiento:** Envuelve las respuestas exitosas en `{ data }`.

```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(map(data => ({ data })));
  }
}
```

**Nota:** Este interceptor **no está registrado globalmente** en `main.ts`. Cada controlador/service define su propio formato de respuesta:
- Listas paginadas: `{ data: T[], meta: { total, skip, take } }`
- Objetos individuales: el objeto plano directamente
- Operaciones de eliminación: `{ message: "..." }`

Se recomienda **registrar el interceptor globalmente** en `main.ts` y estandarizar todas las respuestas, o bien eliminar la duplicación definiendo explícitamente el formato por endpoint.

---

## 8. Autenticación JWT

### 8.1 Flujo de autenticación

```
[Cliente]                              [Servidor]
    │                                       │
    │  POST /api/auth/login                 │
    │  { email, password }                  │
    │──────────────────────────────────────►│
    │                                       │
    │  Validación:                          │
    │  1. Buscar usuario por email          │
    │  2. Verificar isActive                │
    │  3. bcrypt.compare(password, hash)    │
    │  4. Extraer roles + permisos          │
    │                                       │
    │  200 OK                               │
    │  Set-Cookie: access_token=<JWT>       │
    │  { user: { id, email, name, roles,    │
    │            permissions } }            │
    │◄──────────────────────────────────────│
    │                                       │
    │  GET /api/products (con cookie)       │
    │  Cookie: access_token=<JWT>           │
    │──────────────────────────────────────►│
    │                                       │
    │  1. JwtAuthGuard: extrae token        │
    │  2. JwtStrategy.validate: verifica    │
    │     payload + usuario activo          │
    │  3. RolesGuard: verifica rol          │
    │  4. Ejecuta handler                   │
    │                                       │
    │  200 OK { data: [...] }               │
    │◄──────────────────────────────────────│
```

### 8.2 Configuración JWT

| Parámetro | Valor |
|-----------|-------|
| **Secret** | `JWT_SECRET` (variable de entorno) |
| **Expiración** | `8h` |
| **Algoritmo** | HS256 (por defecto en `@nestjs/jwt`) |
| **Cookie name** | `access_token` |
| **Cookie flags** | `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`, `path: '/'`, `maxAge: 28800000` (8h) |

### 8.3 JwtStrategy

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: (req) => {
        // 1. Cookie primero (HttpOnly)
        if (req?.cookies?.access_token) return req.cookies.access_token;
        // 2. Fallback a Authorization header
        const authHeader = req?.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-dev-only',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }
    return { sub: payload.sub, email: payload.email, name: payload.name,
             roles: payload.roles, permissions: payload.permissions };
  }
}
```

### 8.4 JwtAuthGuard

- **Registrado como** `APP_GUARD` en `app.module.ts` — protege **todas** las rutas por defecto.
- **Excepción:** Usar `@Public()` para rutas públicas (login, health).
- **Mecanismo:** Extiende `AuthGuard('jwt')`, respeta el decorador `@Public()` vía `Reflector`.

---

## 9. Autorización RBAC

### 9.1 Modelo de roles y permisos

```
User ──M:N──► Role ──M:N──► Permission (string)
```

- **Rol:** Admin, Gerente, Operator, Viewer (definidos en seed)
- **Permiso:** Strings con formato `entidad:acción` (ej: `products:write`, `audit:read`)

### 9.2 Jerarquía de guards

```
Solicitud HTTP
      │
      ▼
┌─────────────────────┐
│   JwtAuthGuard      │ ← Global (APP_GUARD). Verifica JWT.
│   (autenticación)   │   Skip si @Public()
└─────────┬───────────┘
          │ (usuario autenticado)
          ▼
┌─────────────────────┐
│   RolesGuard        │ ← Por módulo (@UseGuards). Verifica rol.
│   (autorización     │   Skip si @Roles() no está presente.
│    por rol)         │
└─────────┬───────────┘
          │ (rol verificado)
          ▼
┌─────────────────────┐
│  PermissionsGuard   │ ← Opcional (@UseGuards).
│  (autorización      │   Verifica permisos específicos.
│   por permiso)      │   Skip si @Permissions() no está presente.
└─────────┬───────────┘
          │ (permisos OK)
          ▼
    Ejecuta handler
```

### 9.3 Decoradores

| Decorador | Uso | Propósito |
|-----------|-----|-----------|
| `@Roles('Admin', 'Gerente')` | Controller o método | Requiere al menos uno de los roles listados |
| `@Permissions('products:write')` | Controller o método | Requiere **todos** los permisos listados |
| `@Public()` | Controller o método | Omite autenticación global |
| `@CurrentUser()` | Parámetro del handler | Inyecta el usuario autenticado |

### 9.4 Matriz de roles

| Recurso | Operación | Admin | Gerente | Operator | Viewer |
|---------|-----------|-------|---------|----------|--------|
| Productos | Leer | ✅ | ✅ | ✅ | ✅ |
| Productos | Crear/Editar | ✅ | ✅ | ✅ | ❌ |
| Productos | Eliminar | ✅ | ❌ | ❌ | ❌ |
| Productos | Importar Excel | ✅ | ✅ | ❌ | ❌ |
| Productos | Publicar | ✅ | ✅ | ❌ | ❌ |
| Categorías | Leer | ✅ | ✅ | ✅ | ✅ |
| Categorías | Crear/Editar | ✅ | ✅ | ❌ | ❌ |
| Categorías | Eliminar | ✅ | ❌ | ❌ | ❌ |
| Marcas | Leer | ✅ | ✅ | ✅ | ✅ |
| Marcas | Crear/Editar | ✅ | ✅ | ❌ | ❌ |
| Marcas | Eliminar | ✅ | ❌ | ❌ | ❌ |
| Precios | Leer | ✅ | ✅ | ✅ | ✅ |
| Precios | Crear/Editar | ✅ | ✅ | ❌ | ❌ |
| Precios | Eliminar | ✅ | ❌ | ❌ | ❌ |
| Usuarios | Leer | ✅ | ✅ | ❌ | ❌ |
| Usuarios | Crear/Editar/Eliminar | ✅ | ❌ | ❌ | ❌ |
| Roles | Leer | ✅ | ✅ | ❌ | ❌ |
| Roles | Crear/Editar/Eliminar | ✅ | ❌ | ❌ | ❌ |
| Auditoría | Leer | ✅ | ✅ | ❌ | ❌ |

---

## 10. Auditoría

### 10.1 Modelo de datos

```prisma
model AuditLog {
  id        String    @id @default(uuid())
  userId    String?
  user      User?     @relation(fields: [userId], references: [id])
  productId String?
  product   Product?  @relation(fields: [productId], references: [id])
  action    String    // "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "PUBLISH"
  entity    String    // "product" | "category" | "brand" | "user" | "role" | "price"
  entityId  String
  oldValues Json?
  newValues Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime  @default(now())

  @@index([entity, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 10.2 Servicio de auditoría (`AuditService`)

```typescript
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    action: string;
    entity: string;
    entityId: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({ data: { ...params } });
  }

  async findAll(filters): Promise<PaginatedResponse<AuditLog>> { ... }
  async findByEntity(entity: string, entityId: string) { ... }
}
```

### 10.3 Cuándo auditar

| Operación | Auditoría requerida |
|-----------|-------------------|
| `CREATE` | ✅ `action: "CREATE"`, `newValues`: objeto completo creado |
| `UPDATE` | ✅ `action: "UPDATE"`, `oldValues`: valores antes, `newValues`: valores después |
| `DELETE` | ✅ `action: "DELETE"`, `oldValues`: objeto eliminado |
| `LOGIN` | ✅ `action: "LOGIN"`, sin old/new values |
| `PUBLISH` | ✅ `action: "PUBLISH"`, `newValues`: estado de publicación |
| Lecturas | ❌ No auditar |

### 10.4 Patrón de integración en servicios

Se recomienda extraer la auditoría a un **decorador de método** o **interceptor** para evitar duplicación, pero la implementación actual la hace manualmente en cada servicio. Para fase 1, es aceptable mantener la auditoría inline en los servicios.

---

## 11. Contratos API

### 11.1 Formato de respuestas

#### Respuesta paginada (GET listas)

```json
{
  "data": [ { ... }, { ... } ],
  "meta": {
    "total": 150,
    "skip": 0,
    "take": 50
  }
}
```

#### Respuesta de objeto individual (GET by ID)

```json
{
  "id": "uuid",
  "sku": "DS-2CD2143G2-I",
  "name": "Cámara IP Bullet 4MP",
  "category": { "id": "uuid", "name": "Cámaras IP" },
  "brand": { "id": "uuid", "name": "Hikvision" },
  ...
}
```

O envuelto en `{ data: { ... } }` si se usa `TransformInterceptor`.

#### Respuesta de operación sin datos

```json
{
  "message": "Producto eliminado exitosamente"
}
```

### 11.2 Formato de respuestas de error

```json
{
  "statusCode": 409,
  "timestamp": "2026-07-23T10:30:00.000Z",
  "path": "/api/products",
  "message": "Ya existe un producto con ese SKU"
}
```

### 11.3 Mapa completo de endpoints

| Método | Ruta | Autenticación | Roles | Cuerpo/Query | Descripción |
|--------|------|--------------|-------|-------------|-------------|
| **Auth** | | | | | |
| `POST` | `/api/auth/login` | Público | — | `{ email, password }` | Iniciar sesión |
| `GET` | `/api/auth/profile` | JWT | — | — | Perfil del usuario |
| `POST` | `/api/auth/logout` | JWT | — | — | Cerrar sesión |
| **Users** | | | | | |
| `GET` | `/api/users` | JWT | Admin, Gerente | `?skip=&take=&search=` | Listar usuarios |
| `GET` | `/api/users/:id` | JWT | Admin, Gerente | — | Obtener usuario |
| `POST` | `/api/users` | JWT | Admin | `CreateUserDto` | Crear usuario |
| `PUT` | `/api/users/:id` | JWT | Admin | `UpdateUserDto` | Actualizar usuario |
| `DELETE` | `/api/users/:id` | JWT | Admin | — | Eliminar usuario |
| **Roles** | | | | | |
| `GET` | `/api/roles` | JWT | Admin, Gerente | — | Listar roles |
| `GET` | `/api/roles/:id` | JWT | Admin, Gerente | — | Obtener rol |
| `POST` | `/api/roles` | JWT | Admin | `CreateRoleDto` | Crear rol |
| `PUT` | `/api/roles/:id` | JWT | Admin | `UpdateRoleDto` | Actualizar rol |
| `DELETE` | `/api/roles/:id` | JWT | Admin | — | Eliminar rol |
| **Products** | | | | | |
| `GET` | `/api/products` | JWT | Admin, Gerente, Operator, Viewer | `?skip=&take=&search=&categoryId=&brandId=` | Listar productos |
| `GET` | `/api/products/:id` | JWT | Admin, Gerente, Operator, Viewer | — | Obtener producto |
| `POST` | `/api/products` | JWT | Admin, Gerente | `CreateProductDto` | Crear producto (nace en `DRAFT`) |
| `PUT` | `/api/products/:id` | JWT | Admin, Gerente | `UpdateProductDto` | Actualizar producto (estado vía transition) |
| `POST` | `/api/products/:id/transition` | JWT | Admin, Gerente, Operator, Viewer* | `{ event, reason?, confirm? }` | **Canónico**: `PUBLISH`, `UNPUBLISH`, `ARCHIVE`, `RESTORE` |
| `POST` | `/api/products/bulk-transition` | JWT | Admin, Gerente, Operator, Viewer* | `{ ids, event, reason?, confirm? }` | **Canónico**: transición masiva |
| `GET` | `/api/products/publish-scheduled` | JWT | Admin, Gerente, Supervisor, Operador, Consulta | `?from=&to=` | Lista `DRAFT` con `publishAt` en rango |
| `PATCH` | `/api/products/:id/publish` | JWT | Admin, Gerente | `{ publishAt? }` | **Legacy obsoleto**: publicar o programar |
| `PATCH` | `/api/products/:id/unpublish` | JWT | Admin, Gerente | `{ reason? }` | **Legacy obsoleto**: `UNPUBLISH` |
| `PATCH` | `/api/products/:id/toggle-visibility` | JWT | Admin, Gerente | — | **Legacy obsoleto**: toggle hacia PUBLISH/UNPUBLISH |
| `PATCH` | `/api/products/:id/toggle-active` | JWT | Admin, Gerente | — | **Eliminado**: `410 Gone` |
| `DELETE` | `/api/products/:id` | JWT | Admin | `{ confirm, masterKey? }` | Eliminar producto |
| `POST` | `/api/products/import` | JWT | Admin, Gerente | `multipart/form-data` | Importar Excel |
| **Categories** | | | | | |
| `GET` | `/api/categories` | JWT | Admin, Gerente, Operator, Viewer | — | Listar categorías |
| `GET` | `/api/categories/tree` | JWT | Admin, Gerente, Operator, Viewer | — | Árbol de categorías |
| `GET` | `/api/categories/:id` | JWT | Admin, Gerente, Operator, Viewer | — | Obtener categoría |
| `POST` | `/api/categories` | JWT | Admin, Gerente | `CreateCategoryDto` | Crear categoría |
| `PUT` | `/api/categories/:id` | JWT | Admin, Gerente | `UpdateCategoryDto` | Actualizar categoría |
| `DELETE` | `/api/categories/:id` | JWT | Admin | — | Eliminar categoría |
| **Brands** | | | | | |
| `GET` | `/api/brands` | JWT | Admin, Gerente, Operator, Viewer | — | Listar marcas |
| `GET` | `/api/brands/:id` | JWT | Admin, Gerente, Operator, Viewer | — | Obtener marca |
| `POST` | `/api/brands` | JWT | Admin, Gerente | `CreateBrandDto` | Crear marca |
| `PUT` | `/api/brands/:id` | JWT | Admin, Gerente | `UpdateBrandDto` | Actualizar marca |
| `DELETE` | `/api/brands/:id` | JWT | Admin | — | Eliminar marca |
| **Prices** | | | | | |
| `GET` | `/api/prices/lists` | JWT | Admin, Gerente, Operator, Viewer | — | Listar listas de precios |
| `GET` | `/api/prices/lists/:id` | JWT | Admin, Gerente, Operator, Viewer | — | Obtener lista |
| `POST` | `/api/prices/lists` | JWT | Admin, Gerente | `CreatePriceListDto` | Crear lista |
| `PUT` | `/api/prices/lists/:id` | JWT | Admin, Gerente | `UpdatePriceListDto` | Actualizar lista |
| `DELETE` | `/api/prices/lists/:id` | JWT | Admin | — | Eliminar lista |
| `GET` | `/api/prices/product/:productId` | JWT | Admin, Gerente, Operator, Viewer | — | Precios de producto |
| `GET` | `/api/prices/list/:priceListId` | JWT | Admin, Gerente, Operator, Viewer | — | Precios de lista |
| `POST` | `/api/prices` | JWT | Admin, Gerente | `CreatePriceDto` | Crear precio |
| `PUT` | `/api/prices/:id` | JWT | Admin, Gerente | `UpdatePriceDto` | Actualizar precio |
| `DELETE` | `/api/prices/:id` | JWT | Admin | — | Eliminar precio |
| **Audit** | | | | | |
| `GET` | `/api/audit` | JWT | Admin, Gerente | `?skip=&take=&entity=&entityId=&userId=&action=` | Listar logs |
| `GET` | `/api/audit/:entity/:entityId` | JWT | Admin, Gerente | — | Logs de entidad |

### 11.4 Convenciones API

| Aspecto | Convención |
|---------|-----------|
| **Prefijo** | `/api/` (sin versión en ruta por ahora; si se requiere versionado usar `/api/v1/`) |
| **Nombres de recursos** | Plural: `/products`, `/users`, `/categories` |
| **Parámetros de paginación** | `skip` (offset) y `take` (limit) |
| **Parámetros de búsqueda** | `search` (búsqueda textual insensible a mayúsculas) |
| **Fechas** | ISO 8601 (`2026-07-23T10:30:00.000Z`) |
| **IDs** | UUID v4 |
| **Content-Type** | `application/json` (excepto import: `multipart/form-data`) |

---

## 12. Alineación Frontend ↔ Backend ↔ Base de Datos

### 12.1 Mapa de alineación

| Entidad | Modelo DB (Prisma) | Backend (NestJS) | Frontend (React) |
|---------|-------------------|-----------------|-----------------|
| User | `User` → `users` | `UsersModule` → `/api/users` | `useAuthStore`, `UsersPage` |
| Role | `Role` → `roles` | `RolesModule` → `/api/roles` | (gestión en `UsersPage`) |
| Permission | `RolePermission` → `role_permissions` | Embeido en `RolesModule` | (embebido en roles) |
| Product | `Product` → `products` | `ProductsModule` → `/api/products` | `ProductsPage`, `ProductCard` |
| Category | `Category` → `categories` | `CategoriesModule` → `/api/categories` | `CategoriesPage` |
| Brand | `Brand` → `brands` | `BrandsModule` → `/api/brands` | `BrandsPage` |
| PriceList | `PriceList` → `price_lists` | `PricesModule` → `/api/prices/lists` | `PricesPage` |
| Price | `Price` → `prices` | `PricesModule` → `/api/prices` | `PricesPage` |
| AuditLog | `AuditLog` → `audit_logs` | `AuditModule` → `/api/audit` | `AuditPage` |

### 12.2 Tipos compartidos (frontend ↔ backend)

Los tipos definidos en el frontend deben coincidir con las respuestas del backend:

```typescript
// Frontend: features/products/types/product.types.ts
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  brandId: string;
  technicalSpecs: Record<string, unknown> | null;
  isActive: boolean;
  isVisible: boolean;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string };
  images: Array<{ id: string; url: string; isPrimary: boolean }>;
  prices: Array<{
    id: string; value: number; currency: string;
    priceList: { id: string; name: string; code: string };
  }>;
  createdAt: string;
}
```

```typescript
// Backend: respuesta de ProductsService.findOne()
interface ProductResponse {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  brandId: string;
  technicalSpecs: Record<string, any> | null;
  isActive: boolean;
  isVisible: boolean;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string };
  images: Array<{ id: string; url: string; isPrimary: boolean; sortOrder: number }>;
  prices: Array<{
    id: string; value: number; currency: string;
    priceList: { id: string; name: string; code: string };
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

### 12.3 Flujo de comunicación

```
[React Component]
      │
      ▼
[TanStack Query] ─── useQuery / useMutation
      │
      ▼
[Axios Instance] ─── api.ts (withCredentials: true, baseURL: /api)
      │
      ▼  (HTTP sobre proxy de Vite)
[NestJS Controller] ─── @Controller('api/products')
      │
      ▼
[Service] ─── ProductsService
      │
      ▼
[Prisma Client] ─── parameterized query
      │
      ▼
[PostgreSQL]
```

### 12.4 Autenticación (alineación full-stack)

```
[Login.tsx]
  │ POST /api/auth/login { email, password }
  ▼
[AuthService.validateUser] ─── bcrypt.compare
  │                           ─── carga roles + permisos
  ▼
[JwtService.sign] ─── payload: { sub, email, name, roles, permissions }
  │
  ▼
[Response] ─── Set-Cookie: access_token=<JWT> (httpOnly)
  │           ─── { user: { id, email, name, roles, permissions } }
  ▼
[useAuthStore.login(user)] ─── Zustand + persist (localStorage)
  │
  ▼
[AdminLayout] ─── Sidebar / Header según user.roles
```

### 12.5 Puntos de verificación de alineación

| Aspecto | Backend | Frontend | Estado |
|---------|---------|----------|--------|
| Prefijo API | `/api/products` | `api.get('/products')` | ✅ Alineado |
| Formato paginado | `{ data: [], meta: {...} }` | `res.data as { data: Product[] }` | ✅ Alineado |
| Cookie auth | `access_token` httpOnly | `withCredentials: true` | ✅ Alineado |
| User store | `{ id, email, name, roles, permissions }` | Mismos campos en `useAuthStore` | ✅ Alineado |
| Product type | Service devuelve category/brand embebidos | `Product` type coincide | ✅ Alineado |
| Manual parseo de queries | `parseInt(skip)` manual | Envía strings en query params | ⚠️ Coincide pero frágil |
| Error handling | `HttpExceptionFilter` (no registrado) | Interceptor 401 en Axios | ⚠️ Gap: filtro no global |

---

## 13. Seguridad

### 13.1 Controles implementados

| Control | Implementación | Estado |
|---------|---------------|--------|
| JWT en cookie HttpOnly | `auth.service.ts` → `res.cookie('access_token', token, { httpOnly: true, ... })` | ✅ |
| Hash bcrypt | `bcrypt.compare()` + hash en seed | ✅ |
| JWT Auth global | `JwtAuthGuard` como `APP_GUARD` | ✅ |
| RBAC con RolesGuard | `@Roles()` + `RolesGuard` | ✅ |
| PermissionsGuard | `@Permissions()` + `PermissionsGuard` | ✅ |
| ValidationPipe global | `whitelist`, `forbidNonWhitelisted`, `transform` | ✅ |
| class-validator en DTOs | Todos los DTOs tienen decoradores de validación | ✅ |
| Helmet | `app.use(helmet())` en `main.ts` | ✅ |
| CORS restringido | `origin: process.env.CORS_ORIGIN || 'http://localhost:5173'` | ✅ |
| Auditoría | `AuditLog` + `AuditService` | ✅ |
| Cookie Secure | `secure: process.env.NODE_ENV === 'production'` | ✅ |
| SameSite | `sameSite: 'lax'` | ✅ |
| Logout limpia cookie | `res.clearCookie('access_token', ...)` | ✅ |

### 13.2 Controles pendientes (pre-producción)

| Control | Prioridad | Acción requerida |
|---------|-----------|-----------------|
| Rate limiting en login | Crítica | Integrar `@nestjs/throttler` con 5 intentos/min/IP |
| HttpExceptionFilter global | Alta | Registrar con `app.useGlobalFilters()` en `main.ts` |
| Contraseña mínimo 8 caracteres | Alta | Actualizar `@MinLength(6)` → `@MinLength(8)` en `LoginDto` y `CreateUserDto` |
| Account lockout tras 10 fallos | Media | Implementar contador en tabla `User` o cache |
| Body limit 1MB | Alta | `app.useBodyParser('json', { limit: '1mb' })` |
| Refresh tokens | Alta | Diseñar e implementar post-MVP |
| Rotación de refresh tokens | Media | Post-MVP |
| CSP Headers | Media | Configurar helmet CSP |
| Bloqueo de auto-modificación de roles | Alta | Validar en `UsersService.update()` que un usuario no pueda asignarse roles a sí mismo |

### 13.3 Seguridad en Prisma

- **Parameterized queries:** Prisma genera queries con parámetros, lo que elimina riesgo de SQL injection.
- **No usar `$queryRawUnsafe`** sin estricta sanitización.
- **Validación de FK:** Siempre verificar existencia de registros relacionados antes de crear (ej: categoría y marca existen antes de crear producto).

---

## 14. Riesgos Técnicos Identificados

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|--------|---------|-------------|------------|
| 1 | **HttpExceptionFilter no registrado globalmente** | Respuestas de error inconsistentes | Alta | Registrar `app.useGlobalFilters(new HttpExceptionFilter())` en `main.ts` |
| 2 | **TransformInterceptor no registrado globalmente** | Formato de respuestas inconsistente (a veces `{ data }`, a veces objeto plano) | Alta | Decidir si usar interceptor global o estandarizar manualmente en cada controlador |
| 3 | **JWT Secret hardcodeado como fallback** | Exposición si no se configura `JWT_SECRET` en producción | Media | Exigir `JWT_SECRET` en entorno, eliminar fallback o hacer que lance error si no está definido |
| 4 | **Parseo manual de query params** | Los controladores hacen `parseInt()` manualmente en lugar de usar `@Query()` con `ValidationPipe` + `transform: true` | Media | Usar DTOs de query con `@Type(() => Number)` de class-transformer |
| 5 | **Sin rate limiting en login** | Fuerza bruta sobre endpoint de autenticación | Alta | Instalar `@nestjs/throttler` y configurar throttling |
| 6 | **Auditoría manual en servicios** | Código duplicado, riesgo de olvidar registrar auditoría en nuevas operaciones | Media | Crear decorador `@AuditLog()` o interceptor para automatizar |
| 7 | **Duplicación de guards (auth y common)** | `roles.guard.ts` y `permissions.guard.ts` existen en `modules/auth/` y `common/guards/` | Baja | Eliminar duplicados de `modules/auth/`, usar solo los de `common/guards/` |
| 8 | **Sin tests implementados** | Riesgo de regresión al refactorizar | Alta | Priorizar tests unitarios de servicios y e2e de endpoints críticos (auth, products) |
| 9 | **Secretos en `auth.module.ts` vs ConfigService** | `process.env.JWT_SECRET` usado directamente en el módulo, no a través de `ConfigService` | Media | Migrar a `@nestjs/config` + `ConfigService` para toda la configuración sensible |
| 10 | **ProductImage sin timestamps** | No se puede rastrear cuándo se subió una imagen | Baja | Agregar `createdAt` en modelo `ProductImage` |

---

## 15. Puntos de Extensión para ERP Yéminus

> **Estado:** Pendiente de definir — no implementar lógica dependiente hasta confirmación.

### 15.1 Estrategia de integración

```
[Grupo Security API]        [ERP Yéminus API]
      │                            │
      │   GET /api/products        │
      │──────────────────────────► │
      │                            │
      │   200 { products: [...] }  │
      │◄───────────────────────────│
      │                            │
      │  Mapeo de campos           │
      │  Validación                │
      │  Sincronización            │
      │                            │
      ▼                            ▼
  [PostgreSQL]             [ERP Database]
```

### 15.2 Puntos de extensión previstos

| Componente | Extensión | Cuándo |
|-----------|-----------|--------|
| `modules/products/` | Servicio de sincronización bidireccional | API de Yéminus confirmada |
| `modules/prices/` | Sincronización de listas de precios | API de Yéminus confirmada |
| `common/` | Módulo `integration/` con conector REST genérico | Diseño aprobado |
| `prisma/schema.prisma` | Campo `externalId` en `Product`, `PriceList`, `Category` | Necesidad confirmada |
| `AuditModule` | Logs de sincronización (acción: "SYNC") | Integración en marcha |

### 15.3 Lo que NO se debe hacer

- ❌ No crear módulos de integración vacíos "por si acaso"
- ❌ No agregar campos `externalId` al schema hasta que se confirme el mapping
- ❌ No asumir que Yéminus usa REST, OAuth2 o GraphQL
- ❌ No implementar schedulers ni jobs de sincronización

---

## 16. Glosario

| Término | Definición |
|---------|-----------|
| **RBAC** | Role-Based Access Control — control de acceso basado en roles |
| **JWT** | JSON Web Token — estándar para tokens de autenticación |
| **HttpOnly** | Flag de cookie que impide acceso desde JavaScript |
| **Guard** | Clase NestJS que implementa `CanActivate` para autorización |
| **Interceptor** | Clase NestJS que intercepta y transforma respuestas |
| **Pipe** | Clase NestJS que transforma/valida datos de entrada |
| **DTO** | Data Transfer Object — objeto que define la forma de los datos de entrada/salida |
| **Prisma** | ORM para Node.js/TypeScript con generación de queries tipadas |
| **Parameterized Query** | Query SQL con parámetros que previene SQL injection |
| **ERP** | Enterprise Resource Planning — sistema de planificación de recursos empresariales |
| **Yéminus** | ERP de Grupo Security (pendiente de integración) |
| **SKU** | Stock Keeping Unit — identificador único de producto |
| **TOTP** | Time-based One-Time Password — estándar para MFA |

---

## Apéndice A: Checklist de implementación

- [ ] Registrar `HttpExceptionFilter` global en `main.ts`
- [ ] Registrar `TransformInterceptor` global (o estandarizar respuestas manualmente)
- [ ] Instalar `@nestjs/throttler` para rate limiting en auth
- [ ] Actualizar `@MinLength(6)` → `@MinLength(8)` en DTOs de contraseña
- [ ] Configurar `bodyParser` con límite 1MB
- [ ] Migrar `process.env` directo a `ConfigService`
- [ ] Eliminar guards duplicados en `modules/auth/`
- [ ] Escribir tests unitarios para `AuthService`, `ProductsService`
- [ ] Escribir test e2e de flujo login → listar productos
- [ ] Configurar strict mode en `tsconfig.json` (`strict: true`)
- [ ] Agregar `@IsUUID()` donde corresponda en DTOs

---

> **Documento mantenido por:** Equipo de Desarrollo Grupo Security  
> **Próxima revisión:** Post-MVP, antes de integración con ERP Yéminus
