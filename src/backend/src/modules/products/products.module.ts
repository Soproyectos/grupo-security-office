import { StorefrontModule } from '../storefront/storefront.module';
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductRevisionsService } from './product-revisions.service';
import { ProductsController } from './products.controller';
import { ListasPublicationController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { PublicProductDetailController } from './public-detail/public-product-detail.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';
import { PublicProductDetailService } from './public-detail/public-product-detail.service';
import { ProductSheetController } from './sheet/product-sheet.controller';
import { ProductSheetService } from './sheet/product-sheet.service';
import { ProductValidationController } from './validation/validation.controller';
import { ProductValidationService } from './validation/validation.service';
import { PublicationBoardController } from './validation/publication-board.controller';
import { PublicationBoardService } from './validation/publication-board.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from './import/import.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [StorefrontModule, PrismaModule, AclModule, AuditModule, ImportModule, FilesModule],
  controllers: [ProductsController, ListasPublicationController, PublicProductsController, PublicProductDetailController, ProductSheetController, ProductValidationController, PublicationBoardController],
  providers: [ProductsService, ProductRevisionsService, PublicPricingService, PublicCatalogService, PublicProductDetailService, ProductSheetService, ProductValidationService, PublicationBoardService],
  exports: [ProductsService, PublicProductDetailService, ProductValidationService],
})
export class ProductsModule {}
