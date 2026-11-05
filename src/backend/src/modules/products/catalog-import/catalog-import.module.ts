import { Module } from '@nestjs/common';
import { BibliotecaPrismaModule } from '../../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../../library-audit/library-audit.module';
import { LibrarySpecsModule } from '../../library-specs/library-specs.module';
import { AclModule } from '../../../common/acl/acl.module';
import { ProductRevisionsService } from '../product-revisions.service';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogTemplateImportController } from './catalog-template-import.controller';
import { CatalogTemplateImportService } from './catalog-template-import.service';
import { CatalogTemplateApplyService } from './catalog-template-apply.service';

@Module({
  imports: [BibliotecaPrismaModule, LibraryAuditModule, LibrarySpecsModule, AclModule],
  controllers: [CatalogImportController, CatalogTemplateImportController],
  providers: [CatalogImportService, CatalogTemplateImportService, CatalogTemplateApplyService, ProductRevisionsService],
})
export class CatalogImportModule {}
