import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { BCRYPT_ROUNDS } from '../src/common/security/password.constants';
import { dashboardPermissionsForRole } from '../src/common/security/dashboard-permissions';

const prisma = new PrismaClient();

/**
 * Genera una contraseña aleatoria fuerte para el primer arranque.
 * 24 bytes en base64url ≈ 192 bits de entropía.
 */
function generateStrongPassword(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Crea un usuario del sistema SIN tocar la contraseña si el usuario ya existe.
 *
 * SEGURIDAD (SEC-SEED-001): la versión anterior hacía `update: { password }` con
 * una constante ('admin123'), de modo que **cada ejecución del seed restablecía
 * la contraseña del Super Admin a un valor público**, anulando cualquier cambio
 * hecho por el titular. Un despliegue o una migración rutinaria reabría el acceso.
 *
 * Reglas ahora:
 *  - Si el usuario existe: sólo se normalizan nombre y estado. La contraseña es
 *    intocable desde el seed.
 *  - Si no existe: se usa la variable de entorno indicada; si no está definida,
 *    se genera una aleatoria y se imprime UNA sola vez para su custodia.
 */
async function upsertSystemUser(opts: {
  email: string;
  name: string;
  roleId: string;
  passwordEnvVar: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: opts.email },
    select: { id: true },
  });

  let user: { id: string };

  if (existing) {
    user = await prisma.user.update({
      where: { email: opts.email },
      data: { name: opts.name, isActive: true },
      select: { id: true },
    });
    console.log(`✅ ${opts.email} ya existe → contraseña conservada (el seed no la toca)`);
  } else {
    const fromEnv = process.env[opts.passwordEnvVar];
    const plain = fromEnv || generateStrongPassword();

    user = await prisma.user.create({
      data: {
        email: opts.email,
        name: opts.name,
        password: await bcrypt.hash(plain, BCRYPT_ROUNDS),
        isActive: true,
      },
      select: { id: true },
    });

    if (fromEnv) {
      console.log(`✅ ${opts.email} creado con la contraseña de ${opts.passwordEnvVar}`);
    } else {
      console.log('');
      console.log('   ┌───────────────────────────────────────────────────────────┐');
      console.log('   │  CONTRASEÑA GENERADA — SE MUESTRA UNA SOLA VEZ            │');
      console.log('   └───────────────────────────────────────────────────────────┘');
      console.log(`   Usuario:    ${opts.email}`);
      console.log(`   Contraseña: ${plain}`);
      console.log('   Guárdela en el gestor de contraseñas y cámbiela al primer ingreso.');
      console.log(`   Para fijarla desde el entorno, defina ${opts.passwordEnvVar}.`);
      console.log('');
    }
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: opts.roleId } },
    update: {},
    create: { userId: user.id, roleId: opts.roleId },
  });

  return user;
}

// Matriz de permisos por rol (fuente de verdad del negocio).
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': [
    'products:read', 'products:write', 'products:delete',
    'categories:read', 'categories:write',
    'brands:read', 'brands:write',
    'prices:read', 'prices:write',
    'users:read', 'users:write', 'users:manage',
    'audit:read',
    // RBAC híbrido (BE-RBAC-001): permisos granulares canónicos.
    'listas:create', 'listas:update', 'listas:duplicate', 'listas:import',
    'listas:archive', 'listas:delete', 'listas:publish',
    'products:publish',
    'assignments:manage',
    // Legacy: se mantiene por compatibilidad temporal con el guard.
    // La excepción Super Admin del PermissionsGuard no depende de esta lista.
    'publish:manage',
  ],
  'Supervisor': [
    'products:read',
    'audit:read',
    'listas:publish',
    'products:publish',
    'publish:manage',
  ],
  'Admin Comercial': [
    'products:read', 'products:write', 'products:delete',
    'categories:read', 'categories:write',
    'brands:read', 'brands:write',
    'prices:read', 'prices:write',
    'users:read',
    'audit:read',
    // RBAC híbrido (BE-RBAC-001): Admin Comercial administra listas y accesos.
    'listas:create', 'listas:update', 'listas:duplicate', 'listas:import',
    'listas:archive', 'listas:delete', 'listas:publish',
    'products:publish',
    'assignments:manage',
    'publish:manage',
  ],
  // Vendedor: opera su propio pipeline comercial (cotizaciones, clientes, pedidos
  // y metas). No administra catálogo ni Listas: solo las lee para cotizar.
  'Vendedor': [
    'products:read',
    'categories:read',
    'brands:read',
    'prices:read',
  ],
  // Operador: RESERVADO. Se mantiene definido pero sin uso comercial activo.
  // Destino futuro: técnico de campo / soporte / inventario. Hasta que ese
  // alcance se defina, conserva únicamente lectura de catálogo.
  'Operador': [
    'products:read',
    'categories:read',
    'brands:read',
    'prices:read',
  ],
  'Consulta': [
    'products:read',
    'categories:read',
    'brands:read',
    'prices:read',
  ],
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'Super Admin': 'Acceso total al sistema y gestión de usuarios y auditoría',
  'Supervisor': 'Supervisión comercial, publicación de productos y auditoría',
  'Admin Comercial': 'Gestión comercial del catálogo, precios, publicación, acceso a usuarios (solo lectura) y auditoría comercial',
  'Vendedor': 'Gestión del pipeline comercial propio: cotizaciones, clientes, pedidos y metas de venta',
  'Operador': 'RESERVADO — sin uso activo. Destino futuro: técnico de campo, soporte o inventario',
  'Consulta': 'Solo lectura de catálogo y precios',
};

// Equivalencia de roles antiguos a los nuevos según la matriz.
const LEGACY_ROLE_MAPPING: Record<string, string> = {
  Admin: 'Super Admin',
  Gerente: 'Admin Comercial',
  Operator: 'Operador',
  Viewer: 'Consulta',
};

async function upsertRole(name: string) {
  const role = await prisma.role.upsert({
    where: { name },
    update: { description: ROLE_DESCRIPTIONS[name] },
    create: { name, description: ROLE_DESCRIPTIONS[name] },
  });

  // Reemplaza permisos para que el estado final coincida exactamente con la matriz
  // (idempotente: re-ejecutar deja el mismo resultado).
  //
  // Los permisos de dashboard (`dashboard:pack:*`) se derivan de
  // ROLE_DASHBOARD_PACKS en vez de escribirse a mano en cada rol: asi el mapeo
  // paquete -> rol tiene una sola fuente de verdad.
  const permissions = [
    ...new Set([...ROLE_PERMISSIONS[name], ...dashboardPermissionsForRole(name)]),
  ];

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permission,
    })),
  });

  return role;
}

async function migrateLegacyRoles() {
  for (const [oldName, newName] of Object.entries(LEGACY_ROLE_MAPPING)) {
    const oldRole = await prisma.role.findUnique({
      where: { name: oldName },
      include: { users: true },
    });

    if (!oldRole) continue;

    // Reasigna usuarios al rol equivalente antes de eliminar.
    const newRole = await prisma.role.findUnique({ where: { name: newName } });
    if (newRole) {
      for (const userRole of oldRole.users) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: userRole.userId, roleId: newRole.id } },
          update: {},
          create: { userId: userRole.userId, roleId: newRole.id },
        });
      }
    }

    // Elimina las asignaciones restantes del rol antiguo; de lo contrario
    // la FK RESTRICT de user_roles impide borrar el rol.
    await prisma.userRole.deleteMany({ where: { roleId: oldRole.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: oldRole.id } });
    await prisma.role.delete({ where: { id: oldRole.id } });

    console.log(`♻️ Rol antiguo "${oldName}" migrado a "${newName}"`);
  }
}

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles (definitivos, en español)
  const superAdminRole = await upsertRole('Super Admin');
  await upsertRole('Supervisor');
  const adminComercialRole = await upsertRole('Admin Comercial');
  await upsertRole('Vendedor');
  await upsertRole('Operador');
  await upsertRole('Consulta');

  console.log('✅ Roles created');

  // Migra roles antiguos (Admin, Gerente, Operator, Viewer) → nuevos
  await migrateLegacyRoles();

  // Super Admin (definitivo del negocio). La contraseña NO se fija en el código:
  // ver upsertSystemUser / SEC-SEED-001.
  await upsertSystemUser({
    email: 'admin@gruposecurity.co',
    name: 'Administrador',
    roleId: superAdminRole.id,
    passwordEnvVar: 'SEED_SUPER_ADMIN_PASSWORD',
  });

  // Usuario real de Compras (Admin Comercial — rol que gestiona PO según TAREA 2).
  await upsertSystemUser({
    email: 'compras@gruposecurity.co',
    name: 'Compras Security',
    roleId: adminComercialRole.id,
    passwordEnvVar: 'SEED_COMPRAS_PASSWORD',
  });

  // DECISIÓN DE NEGOCIO: el seed NO crea datos comerciales.
  // "no pueden haber nada de listas ni marcas ni categorías ya creadas, debe de estar todo
  // limpio para que la persona de compras lo haga". La persona de compras (compras@gruposecurity.co)
  // creará listas, marcas, categorías y tarifas desde la app.
  //
  // Solo se seedean: los 6 roles + el usuario admin (Super Admin) + el usuario compras
  // (Admin Comercial). Nada de listas, categorías, marcas ni price lists.
  //
  // El seed es idempotente por email/rol y NO borra datos que ya existan en BD:
  // solo deja de crearlos (los upsert de datos comerciales fueron eliminados).
  console.log('✅ Seed completado: roles (6) + usuarios admin/compras. Sin datos comerciales (listas/marcas/categorías/tarifas).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
