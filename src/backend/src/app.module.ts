import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BrandsModule } from './modules/brands/brands.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { PricesModule } from './modules/prices/prices.module';
import { ListasModule } from './modules/listas/listas.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { FilesModule } from './modules/files/files.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CustomersModule } from './modules/commercial/customers/customers.module';
import { QuotesModule } from './modules/commercial/quotes/quotes.module';
import { HierarchyModule } from './common/hierarchy/hierarchy.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { SalesOrdersModule } from './modules/commercial/sales-orders/sales-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Scheduler P6: cron interno del ciclo de vida de Product (tick cada minuto).
    // Se registra a nivel raíz (ámbito global) porque el servicio que lo usa vive
    // en ProductsModule; es el patrón estándar de @nestjs/schedule.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 20),
          },
        ],
      }),
    }),
    PrismaModule,
    HierarchyModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    AssignmentsModule,
    PricesModule,
    ListasModule,
    
    AuditModule,
    HealthModule,
    FilesModule,
    DashboardModule,
    CustomersModule,
    QuotesModule,
    SalesOrdersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      // RBAC híbrido (BE-RBAC-001): hace efectivos los permisos granulares
      // vía @Permissions(). Global para que se evalúe en todo endpoint decorado.
      // Guarda contextual (ACL por Lista) permanece en los servicios.
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
