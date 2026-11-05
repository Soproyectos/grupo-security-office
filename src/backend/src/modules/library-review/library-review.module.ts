import { Module } from '@nestjs/common';
import { AclModule } from '../../common/acl/acl.module';
import { AclService } from '../../common/acl/acl.service';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../library-audit/library-audit.module';
import { LibraryReviewController } from './library-review.controller';
import { LIBRARY_PRODUCT_ACCESS, LibraryReviewService } from './library-review.service';

@Module({
  imports: [AclModule, BibliotecaPrismaModule, LibraryAuditModule],
  controllers: [LibraryReviewController],
  providers: [LibraryReviewService, { provide: LIBRARY_PRODUCT_ACCESS, useExisting: AclService }],
  exports: [LibraryReviewService],
})
export class LibraryReviewModule {}
