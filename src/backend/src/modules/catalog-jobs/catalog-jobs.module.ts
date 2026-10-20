import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { ProductsModule } from '../products/products.module';
import { CatalogJobsService } from './catalog-jobs.service';
import { CatalogJobsController, CatalogJobsHistoryController } from './catalog-jobs.controller';

/**
 * CAT-07 — Trabajos persistidos e historial por recurso.
 * Contrato COMÚN (regla 1): ningún otro módulo crea su propia cola; los
 * historiales de dominio (publication_events, price_import_revisions) siguen
 * siendo de su paso, pero todo TRABAJO de fondo vive aquí.
 * Usa el motor CAT-05 vía ProductsModule (exporta ProductValidationService).
 */
@Module({
  imports: [PrismaModule, AclModule, ProductsModule],
  providers: [CatalogJobsService],
  controllers: [CatalogJobsController, CatalogJobsHistoryController],
  exports: [CatalogJobsService],
})
export class CatalogJobsModule {}
