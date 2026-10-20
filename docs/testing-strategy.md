# Estrategia de Testing — Grupo Security Office

> **Versión:** 1.0  
> **Última actualización:** 2026-07-23  
> **Stack:** NestJS 10 + TypeScript + Prisma ORM + PostgreSQL 18 + JWT + RBAC  
> **Herramientas:** Jest + Supertest + ts-jest  
> **Documentos relacionados:** `backend-architecture.md`, `backend-remediation-plan.md`, `auth-architecture.md`

---

## Tabla de Contenidos

1. [Objetivos del Testing](#1-objetivos-del-testing)
2. [Estado Actual (Línea Base)](#2-estado-actual-línea-base)
3. [Tipos de Tests](#3-tipos-de-tests)
4. [Herramientas y Configuración](#4-herramientas-y-configuración)
5. [Estructura de Carpetas y Convenciones](#5-estructura-de-carpetas-y-convenciones)
6. [Estrategia de Datos de Prueba](#6-estrategia-de-datos-de-prueba)
7. [Cobertura por Módulo](#7-cobertura-por-módulo)
8. [Criterios de Aceptación por Módulo](#8-criterios-de-aceptación-por-módulo)
9. [Qué Cubrir Sí o Sí Antes de Producción](#9-qué-cubrir-sí-o-sí-antes-de-producción)
10. [Integración con Remediation Plan y Auth Architecture](#10-integración-con-remediation-plan-y-auth-architecture)
11. [Plan Incremental (MVP → Post-MVP)](#11-plan-incremental-mvp--post-mvp)
12. [Ejemplos Concretos Sobre Módulos Actuales](#12-ejemplos-concretos-sobre-módulos-actuales)
13. [Checklist de Validación](#13-checklist-de-validación)

---

## 1. Objetivos del Testing

### 1.1 Objetivos primarios

| Objetivo | Descripción | Indicador |
|----------|-------------|-----------|
| **Seguridad** | Verificar que auth, guards y filtros funcionan correctamente y no hay fugas de autorización | 0 vulnerabilidades funcionales en tests de auth |
| **Estabilidad** | Las operaciones CRUD no producen errores inesperados en flujos normales y límite | >95% de tests unitarios verdes |
| **Regresiones** | Cambios en el código no rompen funcionalidad existente | Suite completa ejecutada en CI antes de merge |

### 1.2 Objetivos secundarios

| Objetivo | Descripción |
|----------|-------------|
| **Documentación viva** | Los tests sirven como especificación del comportamiento esperado de cada módulo |
| **Refactor seguro** | Poder refactorizar con confianza gracias a la red de seguridad de los tests |
| **Calidad del código** | Identificar código difícil de testear como señal de acoplamiento excesivo |

### 1.3 Lo que NO busca esta estrategia

- ❌ Cobertura del 100% (no es realista para MVP)
- ❌ Tests de frontend (queda fuera del alcance de este documento)
- ❌ Tests de integración con ERP Yéminus (no existe aún)
- ❌ Tests de carga/performance (post-MVP)

---

## 2. Estado Actual (Línea Base)

### 2.1 Diagnóstico al 2026-07-23

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Tests unitarios | ❌ No existen | `glob src/backend/**/*.spec.ts` → 0 archivos |
| Tests e2e | ❌ No existen | `ls src/backend/test/` → directorio no existe |
| Configuración Jest | ⚠️ Parcial | `"test": "jest"` en `package.json` pero sin `jest.config.ts` |
| ts-jest | ❌ No instalado | No aparece en `devDependencies` |
| Supertest | ❌ No instalado | No aparece en `devDependencies` |
| Tipos Jest | ❌ No instalados | `@types/jest` no aparece en `devDependencies` |
| Cobertura | ❌ 0% | No hay reporte de cobertura |

### 2.2 Riesgo actual

**Cada cambio en el código existente es un riesgo de regresión no detectado.** No hay red de seguridad. La probabilidad de introducir bugs aumenta linealmente con el tamaño del código base (~2500+ líneas de TypeScript en servicios).

---

## 3. Tipos de Tests

### 3.1 Pirámide de testing

```
         ┌──────┐
         │ E2E  │  ← 5-10 tests (flujos críticos)
         │  5%  │
        ┌┴──────┴┐
        │Integr. │  ← 10-20 tests (servicios con Prisma real)
        │  15%   │
       ┌┴────────┴┐
       │ Unitario │  ← 80-100 tests (servicios mockeados)
       │   80%    │
       └──────────┘
```

### 3.2 Tests unitarios

| Atributo | Detalle |
|----------|---------|
| **Propósito** | Validar lógica de negocio en aislamiento |
| **Qué se testea** | Servicios, guards, decoradores, filtros, pipes |
| **Dependencias externas** | Mockeadas (PrismaService mock, JwtService mock, etc.) |
| **Velocidad** | < 10ms por test |
| **Cantidad objetivo MVP** | ~80 tests |
| **Herramienta** | Jest + ts-jest |

**Reglas:**
- Mockear `PrismaService` completamente (no usar DB real)
- Mockear `JwtService` para auth
- No mockear clases del dominio (ej: DTOs, excepciones)
- Cada método público del servicio debe tener al menos:
  - 1 test de flujo feliz (happy path)
  - 1 test por cada condición de error (NotFoundException, ConflictException, etc.)

### 3.3 Tests de integración

| Atributo | Detalle |
|----------|---------|
| **Propósito** | Validar interacción servicio + Prisma + DB real |
| **Qué se testea** | Servicios con PostgreSQL real (vía Prisma) |
| **Base de datos** | Instancia PostgreSQL separada (test DB) o SQLite (alternativa) |
| **Velocidad** | ~200-500ms por test |
| **Cantidad objetivo MVP** | ~10-15 tests |
| **Herramienta** | Jest + Prisma Client (real) |

**Nota para MVP:** Los tests de integración se priorizan después de los unitarios. Se pueden simular con mocks bien estructurados inicialmente.

### 3.4 Tests e2e

| Atributo | Detalle |
|----------|---------|
| **Propósito** | Validar flujo completo HTTP: request → guards → pipes → controller → service → Prisma → DB → response |
| **Qué se testea** | Endpoints HTTP completos con autenticación real |
| **Base de datos** | Instancia PostgreSQL separada con seed |
| **Velocidad** | ~500-2000ms por test |
| **Cantidad objetivo MVP** | ~5-10 tests |
| **Herramienta** | Jest + Supertest + NestJS TestingModule |

---

## 4. Herramientas y Configuración

### 4.1 Dependencias a instalar

```bash
# Ya deberían estar en package.json (verificar):
#   "jest": "^29.0.0"          (viene con NestJS por defecto)

# Instalar si no existen:
npm install --save-dev @types/jest ts-jest supertest @types/supertest
```

### 4.2 Configuración de Jest

**Crear archivo:** `src/backend/jest.config.ts` (si no existe)

```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.service.ts',
    'src/**/*.guard.ts',
    'src/**/*.filter.ts',
    'src/**/*.interceptor.ts',
    'src/**/*.strategy.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/prisma/**',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
```

**O bien mantener configuración en `package.json`:**

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.service.ts",
      "**/*.guard.ts",
      "**/*.filter.ts",
      "**/*.interceptor.ts",
      "**/*.strategy.ts"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

### 4.3 Scripts de npm

```json
{
  "scripts": {
    "test": "jest",                                    // Tests unitarios rápidos
    "test:watch": "jest --watch",                      // Modo watch para desarrollo
    "test:cov": "jest --coverage",                     // Tests con reporte de cobertura
    "test:e2e": "jest --config ./test/jest-e2e.json",  // Tests e2e (si se requiere config separada)
    "test:all": "npm run test && npm run test:e2e"     // Suite completa
  }
}
```

### 4.4 tsconfig para tests

Asegurar que `tsconfig.json` incluya los archivos de test:

```json
{
  "compilerOptions": {
    // ... opciones existentes
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

---

## 5. Estructura de Carpetas y Convenciones

### 5.1 Ubicación de tests

```
src/backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.service.spec.ts         ← Test junto al source
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.controller.spec.ts      ← Test del controlador
│   │   │   ├── jwt.strategy.ts
│   │   │   └── jwt.strategy.spec.ts         ← Test de la estrategia
│   │   ├── products/
│   │   │   ├── products.service.ts
│   │   │   └── products.service.spec.ts     ← Test junto al source
│   │   └── ... (resto de módulos)
│   ├── common/
│   │   ├── guards/
│   │   │   ├── roles.guard.ts
│   │   │   └── roles.guard.spec.ts          ← Test del guard
│   │   ├── filters/
│   │   │   ├── http-exception.filter.ts
│   │   │   └── http-exception.filter.spec.ts ← Test del filter
│   │   └── interceptors/
│   │       ├── transform.interceptor.ts
│   │       └── transform.interceptor.spec.ts  ← Test del interceptor
│   │   └── decorators/
│   │       ├── roles.decorator.ts
│   │       └── roles.decorator.spec.ts       ← Test del decorador
│   └── ...
├── test/
│   ├── auth.e2e-spec.ts                   ← Test e2e de auth
│   ├── products.e2e-spec.ts               ← Test e2e de products
│   └── jest-e2e.json                      ← Config para e2e (opcional)
└── prisma/
    └── seed.ts                            ← Seed usado por tests e2e
```

### 5.2 Convención de nombres

| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Test unitario | `<nombre>.spec.ts` | `auth.service.spec.ts` |
| Test e2e | `<nombre>.e2e-spec.ts` | `auth.e2e-spec.ts` |
| Directorio de tests | `test/` | `src/backend/test/` |

### 5.3 Estructura interna de un spec

```typescript
// auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';

// ============================================
//描述 (Describe) del módulo
// ============================================
describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  // ==========================================
  // Setup: beforeAll / beforeEach
  // ==========================================
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ==========================================
  // Tests agrupados por método
  // ==========================================
  describe('validateUser', () => {
    it('debe lanzar UnauthorizedException si el usuario no existe', async () => { ... });
    it('debe lanzar UnauthorizedException si el usuario está inactivo', async () => { ... });
    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => { ... });
    it('debe retornar datos del usuario si las credenciales son válidas', async () => { ... });
    it('debe normalizar email a minúsculas antes de buscar', async () => { ... });
    it('debe deduplicar permisos cuando el usuario tiene múltiples roles', async () => { ... });
  });

  describe('login', () => {
    it('debe generar un JWT con el payload correcto', async () => { ... });
    it('debe retornar el token y datos del usuario', async () => { ... });
  });

  describe('getProfile', () => {
    it('debe retornar el perfil del usuario', async () => { ... });
    it('debe lanzar UnauthorizedException si el usuario no existe', async () => { ... });
  });
});
```

---

## 6. Estrategia de Datos de Prueba

### 6.1 Tests unitarios: Mocks de Prisma

**Estrategia:** Mock completo de `PrismaService` usando objetos literales con funciones `jest.fn()`.

```typescript
// Mock base para PrismaService
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  category: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), ... },
  brand: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), ... },
  // ... resto de modelos
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
```

**Ventajas:**
- Rápidos (< 5ms por test)
- No requieren DB
- Fáciles de resetear entre tests (`jest.clearAllMocks()`)
- Fallan rápido si el servicio cambia la forma de interactuar con Prisma

**Desventaja:**
- No detectan errores de schema (ej: campos mal escritos). Para eso están los tests e2e.

### 6.2 Tests unitarios: Mocks de servicios externos

```typescript
// Mock de JwtService
const mockJwtService = {
  sign: jest.fn().mockReturnValue('fake-jwt-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-id', ... }),
};

// Mock de bcrypt (si se testea en aislamiento)
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
}));
```

### 6.3 Tests e2e: Base de datos real

**Estrategia 1 (Recomendada para MVP): Usar DB de desarrollo con seed**

```typescript
// test/auth.e2e-spec.ts
beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
});
```

- Conecta a la misma DB configurada en `DATABASE_URL`
- El seed debe ejecutarse antes de los tests
- **Riesgo:** Contaminación de datos. Mitigación: Usar transacciones con rollback o una DB dedicada para tests.

**Estrategia 2 (Post-MVP): DB separada para tests**

```bash
# .env.test
DATABASE_URL="postgresql://user:pass@localhost:5432/grupo_security_test"
JWT_SECRET="test-secret-key-for-testing-only"
```

```typescript
// Usar ConfigModule.forRoot({ envFilePath: '.env.test' }) en tests
```

### 6.4 Datos de seed para tests

El seed existente en `prisma/seed.ts` ya crea:
- 4 roles (Admin, Gerente, Operator, Viewer)
- 1 usuario admin (`admin@grupo-security.com` / `admin123`)
- Categorías y subcategorías
- Marcas
- Listas de precios

**Recomendación:** Crear un seed específico para tests (`prisma/seed.test.ts`) con datos controlados:

```typescript
// prisma/seed.test.ts
export const TEST_USER = {
  email: 'test@grupo-security.com',
  password: 'TestPass123',
  name: 'Test User',
};

export const TEST_ADMIN = {
  email: 'admin@grupo-security.com',
  password: 'admin123',
  name: 'Admin Test',
};

export async function seedTestData(prisma: PrismaClient) {
  // Crear datos controlados para tests
  // ...
}
```

---

## 7. Cobertura por Módulo

### 7.1 Priorización MVP

| Prioridad | Módulo | Tipo de test | # Tests | Esfuerzo |
|-----------|--------|-------------|---------|----------|
| **P0** 🔴 | AuthService | Unitario | 10-12 | 3h |
| **P0** 🔴 | JwtAuthGuard | Unitario | 4-6 | 1h |
| **P0** 🔴 | RolesGuard | Unitario | 4-6 | 1h |
| **P0** 🔴 | Auth (e2e) | E2E | 5 | 3h |
| **P1** 🟡 | ProductsService | Unitario | 8-10 | 3h |
| **P1** 🟡 | ProductsController | Unitario | 4-6 | 1.5h |
| **P1** 🟡 | UsersService | Unitario | 6-8 | 2h |
| **P2** 🔵 | HttpExceptionFilter | Unitario | 3-4 | 1h |
| **P2** 🔵 | TransformInterceptor | Unitario | 2-3 | 0.5h |
| **P2** 🔵 | CategoriesService | Unitario | 4-6 | 1.5h |
| **P2** 🔵 | BrandsService | Unitario | 4-6 | 1.5h |
| **P2** 🔵 | PricesService | Unitario | 4-6 | 1.5h |
| **P3** ⚪ | AuditService | Unitario | 3-4 | 1h |
| **P3** ⚪ | RolesService | Unitario | 4-6 | 1.5h |

**Total MVP:** ~60-80 tests unitarios + 5 e2e = **~20-25 horas**

### 7.2 Mapa de cobertura por archivo

```
src/backend/src/
├── modules/
│   ├── auth/
│   │   ├── auth.service.ts           → auth.service.spec.ts          [P0] 10-12 tests
│   │   ├── auth.controller.ts        → auth.controller.spec.ts       [P1] 4-6 tests
│   │   ├── jwt.strategy.ts           → jwt.strategy.spec.ts          [P1] 3-4 tests
│   │   └── jwt-auth.guard.ts         → jwt-auth.guard.spec.ts        [P0] 4-6 tests
│   ├── products/
│   │   ├── products.service.ts       → products.service.spec.ts      [P1] 8-10 tests
│   │   └── products.controller.ts    → products.controller.spec.ts   [P1] 4-6 tests
│   ├── users/
│   │   └── users.service.ts          → users.service.spec.ts         [P1] 6-8 tests
│   ├── categories/
│   │   └── categories.service.ts     → categories.service.spec.ts    [P2] 4-6 tests
│   ├── brands/
│   │   └── brands.service.ts         → brands.service.spec.ts        [P2] 4-6 tests
│   ├── prices/
│   │   └── prices.service.ts         → prices.service.spec.ts        [P2] 4-6 tests
│   ├── audit/
│   │   └── audit.service.ts          → audit.service.spec.ts         [P3] 3-4 tests
│   └── roles/
│       └── roles.service.ts          → roles.service.spec.ts         [P3] 4-6 tests
├── common/
│   ├── guards/
│   │   ├── roles.guard.ts            → roles.guard.spec.ts           [P0] 4-6 tests
│   │   └── permissions.guard.ts      → permissions.guard.spec.ts     [P2] 2-3 tests
│   ├── filters/
│   │   └── http-exception.filter.ts  → http-exception.filter.spec.ts [P2] 3-4 tests
│   ├── interceptors/
│   │   └── transform.interceptor.ts  → transform.interceptor.spec.ts [P2] 2-3 tests
│   └── decorators/
│       ├── roles.decorator.ts        → roles.decorator.spec.ts       [P2] 1-2 tests
│       └── current-user.decorator.ts → current-user.decorator.spec.ts[P2] 1-2 tests
│
test/
├── auth.e2e-spec.ts                  → Auth flujo completo           [P0] 5 tests
└── products.e2e-spec.ts              → Products CRUD                 [P1] 3-4 tests
```

---

## 8. Criterios de Aceptación por Módulo

### 8.1 AuthService

```typescript
describe('AuthService', () => {
  // validateUser
  it('debe lanzar UnauthorizedException si email no existe');
  it('debe lanzar UnauthorizedException si usuario está inactivo');
  it('debe lanzar UnauthorizedException si password es incorrecto');
  it('debe normalizar email a minúsculas antes de buscar');
  it('debe retornar id, email, name, roles[], permissions[] en éxito');
  it('debe deduplicar permisos cuando el usuario tiene múltiples roles');

  // login
  it('debe generar un JWT con payload { sub, email, name, roles, permissions }');
  it('debe retornar { user, token }');

  // getProfile
  it('debe retornar perfil completo con roles y permisos');
  it('debe lanzar UnauthorizedException si userId no existe');
});
```

**Criterio de aceptación:** 10-12 tests, todos verdes. Cobertura de línea >85% en `auth.service.ts`.

### 8.2 JwtAuthGuard

```typescript
describe('JwtAuthGuard', () => {
  it('debe permitir acceso si endpoint tiene @Public()');
  it('debe denegar acceso si no hay token');
  it('debe denegar acceso si token es inválido');
  it('debe permitir acceso si token es válido');
  it('debe extraer usuario y asignarlo a request.user');
  it('debe respetar metadata @Public() a nivel de clase');
});
```

**Criterio de aceptación:** 4-6 tests, todos verdes.

### 8.3 RolesGuard

```typescript
describe('RolesGuard', () => {
  it('debe permitir acceso si no hay @Roles() definido');
  it('debe permitir acceso si user.roles contiene al menos un rol requerido');
  it('debe denegar acceso si user.roles NO contiene ningún rol requerido');
  it('debe denegar acceso si request.user no existe');
  it('debe denegar acceso si user.roles es undefined');
  it('debe hacer match exacto de nombre de rol (case-sensitive)');
});
```

**Criterio de aceptación:** 4-6 tests, todos verdes.

### 8.4 ProductsService

```typescript
describe('ProductsService', () => {
  // findAll
  it('debe retornar lista paginada { data, meta }');
  it('debe aplicar filtro search por nombre, SKU y descripción');
  it('debe filtrar por categoryId');
  it('debe filtrar por brandId');
  it('debe filtrar por isVisible');
  it('debe filtrar por isActive');

  // findOne
  it('debe retornar producto con relaciones category, brand, images, prices');
  it('debe lanzar NotFoundException si id no existe');

  // create
  it('debe crear producto con datos válidos');
  it('debe lanzar ConflictException si SKU ya existe');
  it('debe lanzar NotFoundException si categoryId no existe');
  it('debe lanzar NotFoundException si brandId no existe');

  // update
  it('debe actualizar producto existente');
  it('debe lanzar NotFoundException si producto no existe');
  it('debe lanzar ConflictException si nuevo SKU ya existe');

  // toggleVisibility
  it('debe invertir isVisible de true a false');
  it('debe invertir isVisible de false a true');
  it('debe lanzar NotFoundException si producto no existe');

  // remove
  it('debe eliminar producto y sus relaciones (prices, images)');
  it('debe lanzar NotFoundException si producto no existe');
});
```

**Criterio de aceptación:** 8-10 tests, todos verdes. Cobertura de línea >80%.

### 8.5 UsersService

```typescript
describe('UsersService', () => {
  it('findAll: debe retornar lista paginada sin campo password');
  it('findAll: debe filtrar por search (name, email)');
  it('findOne: debe retornar usuario sin password');
  it('findOne: debe lanzar NotFoundException si no existe');
  it('create: debe crear usuario con password hasheado');
  it('create: debe lanzar ConflictException si email ya existe');
  it('create: debe asignar roles si se proporcionan');
  it('update: debe actualizar campos permitidos');
  it('update: debe lanzar ConflictException si nuevo email ya existe');
  it('remove: debe eliminar userRoles + user');
  it('remove: debe lanzar NotFoundException si no existe');
});
```

**Criterio de aceptación:** 6-8 tests, todos verdes.

### 8.6 HttpExceptionFilter

```typescript
describe('HttpExceptionFilter', () => {
  it('debe devolver formato { statusCode, timestamp, path, message }');
  it('debe usar el statusCode correcto (ej: 404, 400, 401)');
  it('debe extraer message de HttpException');
  it('debe incluir la URL del request en path');
  it('debe manejar excepciones con response en formato string');
});
```

**Criterio de aceptación:** 3-4 tests, todos verdes.

### 8.7 TransformInterceptor

```typescript
describe('TransformInterceptor', () => {
  it('debe envolver la respuesta en { data }');
  it('debe mantener arrays dentro de data');
  it('debe mantener objetos anidados');
});
```

**Criterio de aceptación:** 2-3 tests, todos verdes.

### 8.8 Tests e2e de Auth

```typescript
describe('Auth (e2e)', () => {
  it('POST /api/auth/login — credenciales válidas → 200 + cookie + user');
  it('POST /api/auth/login — email incorrecto → 401');
  it('POST /api/auth/login — password incorrecto → 401');
  it('POST /api/auth/login — email inválido → 400 (ValidationPipe)');
  it('POST /api/auth/login — password < 8 chars → 400 (ValidationPipe)');
  it('GET /api/auth/profile — con cookie válida → 200 + datos usuario');
  it('GET /api/auth/profile — sin cookie → 401');
  it('POST /api/auth/logout — → 200 + cookie eliminada');
  it('GET /api/products — sin autenticación → 401');
  it('GET /api/products — con cookie de Admin → 200 + lista');
});
```

---

## 9. Qué Cubrir Sí o Sí Antes de Producción

### 9.1 Mínimo obligatorio (Go/No-Go para producción)

| ID | Requisito | Tipo | ¿Por qué es obligatorio? |
|----|-----------|------|--------------------------|
| T01 | AuthService.validateUser: 3 casos de error | Unitario | Validar que credenciales inválidas siempre dan 401 |
| T02 | AuthService.login: payload JWT correcto | Unitario | Verificar que el token contiene roles y permisos |
| T03 | JwtAuthGuard: @Public() funciona | Unitario | Rutas públicas deben ser accesibles sin token |
| T04 | JwtAuthGuard: sin token → 401 | Unitario | Rutas protegidas deben requerir autenticación |
| T05 | RolesGuard: rol requerido vs user.roles | Unitario | Verificar que la autorización por rol funciona |
| T06 | RolesGuard: sin rol definido → permite | Unitario | Comportamiento por defecto del guard |
| T07 | Login e2e: éxito → 200 + Set-Cookie | E2E | El flujo completo de login funciona |
| T08 | Login e2e: credenciales inválidas → 401 | E2E | El flujo completo de error funciona |
| T09 | Profile e2e: sin cookie → 401 | E2E | La protección por JWT funciona a nivel HTTP |
| T10 | Products CRUD: NotFoundException | Unitario | Validar que recursos inexistentes dan 404 |

### 9.2 Umbrales de cobertura (mínimos)

| Métrica | Mínimo | Objetivo |
|---------|--------|----------|
| Cobertura de línea (services core) | >70% | >85% |
| Cobertura de línea (guards) | >80% | >90% |
| Cobertura de línea (global) | >50% | >70% |
| Tests unitarios | >50 | >80 |
| Tests e2e | >5 | >10 |
| Tests sin side effects | 100% independientes y paralelizables |

---

## 10. Integración con Remediation Plan y Auth Architecture

### 10.1 Correspondencia con hallazgos del remediation plan

| Hallazgo | Remediation | Tests requeridos |
|----------|-------------|-----------------|
| **H1** — Rate limiting | Instalar @nestjs/throttler | Test e2e: 6 requests rápidas → 429 |
| **H2** — JWT secret hardcodeado | Exigir variable de entorno | Test unitario: server no arranca sin JWT_SECRET |
| **H3** — @MinLength(6) | Cambiar a @MinLength(8) | Test e2e: password de 6 chars → 400 |
| **H5** — ExceptionFilter no registrado | Registrar globalmente | Test unitario: formato de error correcto |
| **H6** — Interceptor no registrado | Registrar globalmente | Test unitario: respuesta envuelta en { data } |
| **H7** — Query params manuales | DTOs tipados | Test unitario: validación de query params |
| **H8** — Guards duplicados | Eliminar duplicados | Verificar imports no rotos (build test) |
| **H9** — process.env directo | ConfigService | Test unitario con mocking de ConfigService |

### 10.2 Integración con auth-architecture.md

| Componente de auth-architecture | Tests que lo cubren |
|--------------------------------|-------------------|
| Flujo de login completo | `auth.service.spec.ts` + `auth.e2e-spec.ts` |
| Emisión y validación JWT | `auth.service.spec.ts` + `jwt.strategy.spec.ts` |
| Cookie HttpOnly | `auth.e2e-spec.ts` (verificar Set-Cookie) |
| JwtAuthGuard | `jwt-auth.guard.spec.ts` |
| RolesGuard + decoradores | `roles.guard.spec.ts` + `roles.decorator.spec.ts` |
| RBAC payload | `auth.service.spec.ts` (payload contiene roles y permissions) |
| Rate limiting | `auth.e2e-spec.ts` |
| Política de contraseñas | `auth.e2e-spec.ts` (validation pipe) |
| Auditoría de eventos auth | `audit.service.spec.ts` |

### 10.3 Orden de implementación recomendado

```
FASE 1: Tests de seguridad (P0)
  ├── AuthService.spec.ts
  ├── JwtAuthGuard.spec.ts
  ├── RolesGuard.spec.ts
  └── Auth e2e

FASE 2: Tests de servicios core (P1)
  ├── ProductsService.spec.ts
  ├── UsersService.spec.ts
  └── ProductsController.spec.ts

FASE 3: Tests de infraestructura (P2)
  ├── HttpExceptionFilter.spec.ts
  ├── TransformInterceptor.spec.ts
  ├── CategoriesService.spec.ts
  ├── BrandsService.spec.ts
  └── PricesService.spec.ts

FASE 4: Tests complementarios (P3)
  ├── AuditService.spec.ts
  ├── RolesService.spec.ts
  └── PermissionsGuard.spec.ts
```

---

## 11. Plan Incremental (MVP → Post-MVP)

### 11.1 MVP (Fase actual — Día 0 al Día 15)

| Semana | Actividad | Entregable |
|--------|-----------|------------|
| **Semana 1** | Configurar Jest + ts-jest + Supertest | `npm test` funciona con 1 test dummy |
| **Semana 1** | AuthService tests (P0) | `auth.service.spec.ts` — 10 tests |
| **Semana 1** | JwtAuthGuard + RolesGuard tests (P0) | `jwt-auth.guard.spec.ts` + `roles.guard.spec.ts` — 10 tests |
| **Semana 2** | Auth e2e tests (P0) | `test/auth.e2e-spec.ts` — 5 tests |
| **Semana 2** | ProductsService tests (P1) | `products.service.spec.ts` — 8 tests |
| **Semana 2** | UsersService tests (P1) | `users.service.spec.ts` — 6 tests |
| **Semana 2** | HttpExceptionFilter + TransformInterceptor tests (P2) | 5 tests |

**MVP total:** ~44 tests, cobertura >50%

### 11.2 Post-MVP (Día 16 al Día 30)

| Actividad | Tests | Esfuerzo |
|-----------|-------|----------|
| CategoriesService + BrandsService + PricesService tests | 12-18 tests | 4h |
| AuditService + RolesService tests | 7-10 tests | 2.5h |
| Products e2e tests | 3-4 tests | 2h |
| Decorators tests (Roles, CurrentUser, Public, Permissions) | 4-6 tests | 1h |
| PermissionsGuard tests | 2-3 tests | 0.5h |
| Subir cobertura a >70% | Refinar tests existentes | 3h |

**Post-MVP total:** ~30 tests adicionales, cobertura >70%

### 11.3 Post-Producción (Mantenimiento continuo)

| Actividad | Frecuencia |
|-----------|-----------|
| Tests en CI (cada push a main) | Automático |
| Revisión de cobertura (cada release) | Mensual |
| Agregar tests por cada bug fix | Por evento |
| Agregar tests por cada nuevo endpoint | Por implementación |
| Migrar a test DB separada | Cuando el equipo crezca |

---

## 12. Ejemplos Concretos Sobre Módulos Actuales

### 12.1 Ejemplo completo: AuthService

```typescript
// src/backend/src/modules/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Mock completo de PrismaService
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('jwt-token'),
};

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService) as any;
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    const validUser = {
      id: 'uuid-1',
      email: 'test@test.com',
      name: 'Test User',
      password: '$2b$12$hashedpassword',
      isActive: true,
      roles: [
        {
          role: {
            name: 'Admin',
            permissions: [
              { permission: 'products:*' },
              { permission: 'users:*' },
            ],
          },
        },
        {
          role: {
            name: 'Gerente',
            permissions: [
              { permission: 'products:read' },
            ],
          },
        },
      ],
    };

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('noexiste@test.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'noexiste@test.com' },
        include: expect.any(Object),
      });
    });

    it('debe lanzar UnauthorizedException si el usuario está inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...validUser, isActive: false });

      await expect(
        service.validateUser('test@test.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser('test@test.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe retornar datos del usuario si las credenciales son válidas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'CorrectPass123');

      expect(result).toEqual({
        id: 'uuid-1',
        email: 'test@test.com',
        name: 'Test User',
        roles: ['Admin', 'Gerente'],
        permissions: ['products:*', 'users:*', 'products:read'],
      });
    });

    it('debe normalizar email a minúsculas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateUser('TEST@TEST.COM', 'CorrectPass123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
        include: expect.any(Object),
      });
    });

    it('debe deduplicar permisos cuando hay múltiples roles', async () => {
      const userWithDupes = {
        ...validUser,
        roles: [
          { role: { name: 'Admin', permissions: [{ permission: 'products:*' }] } },
          { role: { name: 'Gerente', permissions: [{ permission: 'products:*' }] } },
        ],
      };
      mockPrisma.user.findUnique.mockResolvedValue(userWithDupes);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'CorrectPass123');

      expect(result.permissions).toEqual(['products:*']);
      expect(result.permissions.length).toBe(1);
    });
  });

  describe('login', () => {
    it('debe generar JWT con payload correcto', async () => {
      const userData = {
        id: 'uuid-1',
        email: 'test@test.com',
        name: 'Test User',
        roles: ['Admin'],
        permissions: ['products:*'],
      };

      const result = await service.login(userData);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'uuid-1',
        email: 'test@test.com',
        name: 'Test User',
        roles: ['Admin'],
        permissions: ['products:*'],
      });

      expect(result).toEqual({
        token: 'jwt-token',
        user: {
          id: 'uuid-1',
          email: 'test@test.com',
          name: 'Test User',
          roles: ['Admin'],
          permissions: ['products:*'],
        },
      });
    });
  });

  describe('getProfile', () => {
    it('debe retornar el perfil del usuario', async () => {
      const user = {
        id: 'uuid-1',
        email: 'test@test.com',
        name: 'Test User',
        password: '$2b$12$...',
        isActive: true,
        roles: [
          { role: { name: 'Admin', permissions: [{ permission: 'products:*' }] } },
        ],
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getProfile('uuid-1');

      expect(result).toEqual({
        id: 'uuid-1',
        email: 'test@test.com',
        name: 'Test User',
        roles: ['Admin'],
        permissions: ['products:*'],
      });
    });

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('uuid-noexiste'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
```

### 12.2 Ejemplo completo: RolesGuard

```typescript
// src/backend/src/common/guards/roles.guard.spec.ts
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockContext = (user?: any, roles?: string[]) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as ExecutionContext;

  beforeEach(async () => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('debe permitir acceso si no hay @Roles() definido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = mockContext({ roles: ['Admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si user.roles contiene un rol requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['Admin', 'Gerente']);
    const context = mockContext({ roles: ['Admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si user.roles contiene al menos un rol requerido (match parcial)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['Admin', 'Gerente']);
    const context = mockContext({ roles: ['Gerente', 'Viewer'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe denegar acceso si user.roles NO contiene ningún rol requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['Admin']);
    const context = mockContext({ roles: ['Viewer'] });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('debe denegar acceso si request.user no existe', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['Admin']);
    const context = mockContext(undefined);

    expect(guard.canActivate(context)).toBe(false);
  });

  it('debe hacer match exacto de nombre de rol (case-sensitive)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = mockContext({ roles: ['Admin'] });

    expect(guard.canActivate(context)).toBe(false);
  });
});
```

### 12.3 Ejemplo completo: HttpExceptionFilter

```typescript
// src/backend/src/common/filters/http-exception.filter.spec.ts
import { HttpExceptionFilter } from './http-exception.filter';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = { status: mockStatus };
    mockRequest = { url: '/api/test' };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('debe devolver formato { statusCode, timestamp, path, message }', () => {
    const exception = new NotFoundException('Recurso no encontrado');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      timestamp: expect.any(String),
      path: '/api/test',
      message: 'Recurso no encontrado',
    });
  });

  it('debe usar el statusCode correcto para cada tipo de excepción', () => {
    const exception400 = new BadRequestException('Datos inválidos');
    filter.catch(exception400, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(400);

    const exception404 = new NotFoundException('No encontrado');
    filter.catch(exception404, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(404);
  });

  it('debe extraer mensaje de excepción con response string', () => {
    // Algunas HttpException tienen getResponse() como string
    const exception = new NotFoundException('Not Found');
    // Forzar response como string
    jest.spyOn(exception, 'getResponse').mockReturnValue('Not Found');

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not Found' }),
    );
  });

  it('debe incluir la URL del request', () => {
    const exception = new NotFoundException();
    mockRequest.url = '/api/products/999';

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/products/999' }),
    );
  });
});
```

### 12.4 Ejemplo completo: TransformInterceptor

```typescript
// src/backend/src/common/interceptors/transform.interceptor.spec.ts
import { TransformInterceptor } from './transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('debe envolver la respuesta en { data }', (done) => {
    const mockContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: () => of({ id: 1, name: 'test' }),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: 1, name: 'test' } });
      done();
    });
  });

  it('debe mantener arrays dentro de data', (done) => {
    const mockContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: () => of([{ id: 1 }, { id: 2 }]),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result).toEqual({ data: [{ id: 1 }, { id: 2 }] });
      done();
    });
  });
});
```

### 12.5 Ejemplo completo: Auth e2e

```typescript
// src/backend/test/auth.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as cookieParser from 'cookie-parser';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    const validCredentials = {
      email: 'admin@grupo-security.com',
      password: 'admin123',
    };

    it('debe retornar 200 y Set-Cookie con credenciales válidas', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send(validCredentials)
        .expect(200)
        .expect((res) => {
          // Verificar cuerpo
          expect(res.body.user).toBeDefined();
          expect(res.body.user.email).toBe('admin@grupo-security.com');
          expect(res.body.user.roles).toContain('Admin');
          expect(res.body.user.permissions).toBeInstanceOf(Array);

          // Verificar cookie
          const cookies = res.headers['set-cookie'];
          expect(cookies).toBeDefined();
          const authCookie = cookies.find((c: string) => c.startsWith('access_token='));
          expect(authCookie).toBeDefined();
          expect(authCookie).toContain('HttpOnly');
          // sameSite no aparece en supertest siempre, verificar según entorno
        });
    });

    it('debe retornar 401 con email incorrecto', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'noexiste@test.com', password: 'admin123' })
        .expect(401);
    });

    it('debe retornar 401 con password incorrecto', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: 'wrongpass' })
        .expect(401);
    });

    it('debe retornar 400 con email inválido', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'email-invalido', password: 'admin123' })
        .expect(400);
    });

    it('debe retornar 400 con password menor a 8 caracteres', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: '1234567' })
        .expect(400);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('debe retornar 401 sin cookie de autenticación', () => {
      return request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });

    it('debe retornar 200 con perfil del usuario si hay cookie válida', async () => {
      // Primero hacer login para obtener cookie
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: 'admin123' });

      const cookies = loginRes.headers['set-cookie'];

      return request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Cookie', cookies)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe('admin@grupo-security.com');
          expect(res.body.roles).toContain('Admin');
        });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('debe retornar 200 y limpiar la cookie', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: 'admin123' });

      const cookies = loginRes.headers['set-cookie'];

      return request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Sesión cerrada exitosamente');
          // Verificar que la cookie se limpia (max-age=0)
          const clearCookie = res.headers['set-cookie'];
          expect(clearCookie).toBeDefined();
        });
    });
  });

  describe('Protección global JWT', () => {
    it('debe retornar 401 al acceder a /api/products sin autenticación', () => {
      return request(app.getHttpServer())
        .get('/api/products')
        .expect(401);
    });

    it('debe retornar 200 al acceder a /api/products con autenticación', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: 'admin123' });

      const cookies = loginRes.headers['set-cookie'];

      return request(app.getHttpServer())
        .get('/api/products?take=5')
        .set('Cookie', cookies)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeDefined();
          expect(res.body.meta).toBeDefined();
        });
    });
  });
});
```

---

## 13. Checklist de Validación

### 13.1 Previo a escribir tests

- [ ] `jest.config.ts` (o configuración en package.json) existe y es correcta
- [ ] `ts-jest` está instalado como devDependency
- [ ] `@types/jest` está instalado como devDependency
- [ ] `supertest` y `@types/supertest` están instalados (para e2e)
- [ ] `npm test` ejecuta sin errores (aunque sea 0 tests)
- [ ] `npm run test:cov` genera reporte de cobertura

### 13.2 Durante la escritura de tests (por módulo)

- [ ] Tests siguen la estructura `describe → beforeEach → it`
- [ ] Mocks se resetean en `beforeEach` con `jest.clearAllMocks()`
- [ ] Cada método público del servicio tiene al menos 2 tests (happy + error)
- [ ] Los tests no dependen de estado compartido entre sí
- [ ] Los tests no hacen llamadas reales a DB (unitarios)
- [ ] Los nombres de tests son descriptivos en español

### 13.3 Post-implementación (Go/No-Go para merge)

- [ ] `npm test` → todos verdes (0 fallos, 0 errores)
- [ ] `npm run build` → sin errores de compilación
- [ ] Cobertura de línea en servicios core >70%
- [ ] Test e2e de login exitoso + fallido pasan
- [ ] Test de guards (JwtAuth + Roles) pasan
- [ ] No hay tests marcados como `.skip` o `todo`
- [ ] El tiempo total de la suite es < 30 segundos

### 13.4 Checklist de QA (pre-producción)

```bash
# Ejecutar suite completa
npm run test:all

# Verificar cobertura
npm run test:cov
# Revisar archivo coverage/lcov-report/index.html

# Verificar que los tests e2e usan datos del seed
npm run db:seed && npm run test:e2e

# Verificar que no hay tests flaky (ejecutar 3 veces seguidas)
for ($i=0; $i -lt 3; $i++) { npm test }
```

---

## Apéndice A: Resumen de Archivos a Crear

| Archivo | Tipo | Prioridad | Tests estimados |
|---------|------|-----------|-----------------|
| `src/modules/auth/auth.service.spec.ts` | Unitario | P0 🔴 | 10-12 |
| `src/modules/auth/jwt-auth.guard.spec.ts` | Unitario | P0 🔴 | 4-6 |
| `src/modules/auth/jwt.strategy.spec.ts` | Unitario | P1 🟡 | 3-4 |
| `src/modules/auth/auth.controller.spec.ts` | Unitario | P1 🟡 | 4-6 |
| `src/common/guards/roles.guard.spec.ts` | Unitario | P0 🔴 | 4-6 |
| `src/common/guards/permissions.guard.spec.ts` | Unitario | P2 🔵 | 2-3 |
| `src/common/filters/http-exception.filter.spec.ts` | Unitario | P2 🔵 | 3-4 |
| `src/common/interceptors/transform.interceptor.spec.ts` | Unitario | P2 🔵 | 2-3 |
| `src/common/decorators/roles.decorator.spec.ts` | Unitario | P2 🔵 | 1-2 |
| `src/common/decorators/current-user.decorator.spec.ts` | Unitario | P2 🔵 | 1-2 |
| `src/modules/products/products.service.spec.ts` | Unitario | P1 🟡 | 8-10 |
| `src/modules/products/products.controller.spec.ts` | Unitario | P1 🟡 | 4-6 |
| `src/modules/users/users.service.spec.ts` | Unitario | P1 🟡 | 6-8 |
| `src/modules/categories/categories.service.spec.ts` | Unitario | P2 🔵 | 4-6 |
| `src/modules/brands/brands.service.spec.ts` | Unitario | P2 🔵 | 4-6 |
| `src/modules/prices/prices.service.spec.ts` | Unitario | P2 🔵 | 4-6 |
| `src/modules/audit/audit.service.spec.ts` | Unitario | P3 ⚪ | 3-4 |
| `src/modules/roles/roles.service.spec.ts` | Unitario | P3 ⚪ | 4-6 |
| `test/auth.e2e-spec.ts` | E2E | P0 🔴 | 5 |
| `test/products.e2e-spec.ts` | E2E | P1 🟡 | 3-4 |
| `jest.config.ts` | Config | P0 🔴 | — |

**Total archivos:** 21 (19 spec + 1 e2e + 1 config)  
**Total tests estimados:** ~75-95  
**Esfuerzo total estimado:** ~20-25 horas  

---

> **Documento mantenido por:** Equipo de Desarrollo Grupo Security  
> **Última actualización:** 2026-07-23  
> **Próxima revisión:** Al completar MVP de tests y antes de producción
