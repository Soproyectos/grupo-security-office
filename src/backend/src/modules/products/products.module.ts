import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ListasPublicationController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { PublicProductDetailController } from './public-detail/public-product-detail.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';
import { PublicProductDetailService } from './public-detail/public-product-detail.service';
import { ProductSheetController } from './sheet/product-sheet.controller';
import { ProductSheetService } from './sheet/product-sheet.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from './import/import.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [PrismaModule, AclModule, AuditModule, ImportModule, FilesModule],
  controllers: [ProductsController, ListasPublicationController, PublicProductsController, PublicProductDetailController, ProductSheetController],
  providers: [ProductsService, PublicPricingService, PublicCatalogService, PublicProductDetailService, ProductSheetService],
  exports: [ProductsService, PublicProductDetailService],
})
export class ProductsModule {}
