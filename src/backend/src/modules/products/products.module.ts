import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ListasPublicationController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from './import/import.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [PrismaModule, AclModule, AuditModule, ImportModule, FilesModule],
  controllers: [ProductsController, ListasPublicationController, PublicProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
