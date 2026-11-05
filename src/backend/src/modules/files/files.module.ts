import { Global, Module } from '@nestjs/common';
import { FilesService, LEGACY_FILE_AUDIT } from './files.service';
import { FilesController } from './files.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../library-audit/library-audit.module';

@Global()
@Module({
  // CAT-04 (D4): la autorización de medios privados reutiliza JwtService (con
  // el MISMO secreto y validaciones que jwt.strategy), SessionService (@Global)
  // y AclService; la retención de bytes se audita (AuditModule).
  imports: [PrismaModule, AuthModule, AclModule, AuditModule, BibliotecaPrismaModule, LibraryAuditModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: LEGACY_FILE_AUDIT, useExisting: AuditService }],
  exports: [FilesService],
})
export class FilesModule {}
