import { Module } from '@nestjs/common';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../library-audit/library-audit.module';
import { SubcategoriesController } from './subcategories.controller';
import { SubcategoriesService } from './subcategories.service';

@Module({
  imports: [BibliotecaPrismaModule, LibraryAuditModule],
  controllers: [SubcategoriesController],
  providers: [SubcategoriesService],
  exports: [SubcategoriesService],
})
export class SubcategoriesModule {}
