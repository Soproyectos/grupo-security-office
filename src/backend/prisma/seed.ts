import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
     // SalesOrder permissions
     'sales-order:create', 'sales-order:read', 'sales-order:update', 'sales-order:delete',
   ],
   'Supervisor': [
     'products:read',
     'audit:read',
     'listas:publish',
     'products:publish',
     'publish:manage',
     // SalesOrder permissions
     'sales-order:read',
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
     // SalesOrder permissions
     'sales-order:create', 'sales-order:read', 'sales-order:update', 'sales-order:delete',
   ],
   'Operador': [
     'products:read',
     'categories:read',
     'brands:read',
     'prices:read',
     // SalesOrder permissions
     'sales-order:read',
   ],
   'Consulta': [
     'products:read',
     'categories:read',
     'brands:read',
     'prices:read',
     // SalesOrder permissions
     'sales-order:read',
   ],
 };

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'Super Admin': 'Acceso total al sistema y gestión de usuarios y auditoría',
  'Supervisor': 'Supervisión comercial, publicación de productos y auditoría',
  'Admin Comercial': 'Gestión comercial del catálogo, precios, publicación, acceso a usuarios (solo lectura) y auditoría comercial',
  'Operador': 'Consulta del catálogo y precios',
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
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: ROLE_PERMISSIONS[name].map((permission) => ({
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
  await upsertRole('Operador');
  await upsertRole('Consulta');

  console.log('✅ Roles created');

  // Migra roles antiguos (Admin, Gerente, Operator, Viewer) → nuevos
  await migrateLegacyRoles();

  // Create super admin user (definitivo del negocio)
  const hashedPassword = await bcrypt.hash('admin123', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@gruposecurity.co' },
    update: { password: hashedPassword, name: 'Administrador', isActive: true },
    create: {
      email: 'admin@gruposecurity.co',
      name: 'Administrador',
      password: hashedPassword,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superAdminRole.id },
  });

  console.log('✅ Admin user created (admin@gruposecurity.co / admin123) → Super Admin');

  // Usuario real de Compras (Admin Comercial — rol que gestiona PO según TAREA 2).
  const comprasPassword = await bcrypt.hash('compras123', 12);

  const comprasUser = await prisma.user.upsert({
    where: { email: 'compras@gruposecurity.co' },
    update: { password: comprasPassword, name: 'Compras Security', isActive: true },
    create: {
      email: 'compras@gruposecurity.co',
      name: 'Compras Security',
      password: comprasPassword,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: comprasUser.id, roleId: adminComercialRole.id } },
    update: {},
    create: { userId: comprasUser.id, roleId: adminComercialRole.id },
  });

  console.log('✅ Compras user created (compras@gruposecurity.co / compras123) → Admin Comercial');

  // DECISIÓN DE NEGOCIO: el seed NO crea datos comerciales.
  // "no pueden haber nada de listas ni marcas ni categorías ya creadas, debe de estar todo
  // limpio para que la persona de compras lo haga". La persona de compras (compras@gruposecurity.co)
  // creará listas, marcas, categorías y tarifas desde la app.
  //
  // Solo se seedean: los 5 roles + el usuario admin (Super Admin) + el usuario compras
  // (Admin Comercial). Nada de listas, categorías, marcas ni price lists.
  //
  // El seed es idempotente por email/rol y NO borra datos que ya existan en BD:
  // solo deja de crearlos (los upsert de datos comerciales fueron eliminados).
  console.log('✅ Seed completado: roles (5) + usuarios admin/compras. Sin datos comerciales (listas/marcas/categorías/tarifas).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
