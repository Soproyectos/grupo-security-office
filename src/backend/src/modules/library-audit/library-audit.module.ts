import { Module } from '@nestjs/common';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditService } from './library-audit.service';

@Module({ imports: [BibliotecaPrismaModule], providers: [LibraryAuditService], exports: [LibraryAuditService] })
export class LibraryAuditModule {}
