import { StorefrontModule } from '../storefront/storefront.module';
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductRevisionsService } from './product-revisions.service';
import { ProductsController } from './products.controller';
import { ProductChangesController } from './product-changes.controller';
import { ProductChangeService } from './product-change.service';
import { ListasPublicationController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { PublicProductDetailController } from './public-detail/public-product-detail.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';
import { PublicProductDetailService } from './public-detail/public-product-detail.service';
import { ProductSheetController } from './sheet/product-sheet.controller';
import { ProductSheetService } from './sheet/product-sheet.service';
import { ProductInternalNotesController } from './sheet/product-internal-notes.controller';
import { ProductInternalNotesService } from './sheet/product-internal-notes.service';
import { ProductValidationController } from './validation/validation.controller';
import { ProductValidationService } from './validation/validation.service';
import { PublicationBoardController } from './validation/publication-board.controller';
import { PublicationBoardService } from './validation/publication-board.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from './import/import.module';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../library-audit/library-audit.module';
import { FilesModule } from '../files/files.module';
import { CatalogImportModule } from './catalog-import/catalog-import.module';
import { LibrarySpecsModule } from '../library-specs/library-specs.module';
import { ProductPreviewDetailController } from './public-detail/product-preview-detail.controller';
import { PublicCatalogKeySpecFacetsController } from './public-catalog-key-spec-facets.controller';
import { ClassificationService } from './classification/classification.service';

@Module({
  imports: [LibrarySpecsModule, BibliotecaPrismaModule, LibraryAuditModule, StorefrontModule, PrismaModule, AclModule, AuditModule, ImportModule, CatalogImportModule, FilesModule],
  controllers: [ProductsController, ProductChangesController, ListasPublicationController, PublicProductsController, PublicProductDetailController, ProductPreviewDetailController, PublicCatalogKeySpecFacetsController, ProductSheetController, ProductInternalNotesController, ProductValidationController, PublicationBoardController],
  providers: [ClassificationService, ProductsService, ProductChangeService, ProductRevisionsService, PublicPricingService, PublicCatalogService, PublicProductDetailService, ProductSheetService, ProductInternalNotesService, ProductValidationService, PublicationBoardService],
  exports: [ClassificationService, ProductsService, ProductChangeService, ProductRevisionsService, PublicProductDetailService, ProductValidationService],
})
export class ProductsModule {}
