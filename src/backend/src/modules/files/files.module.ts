import { Global, Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  // CAT-04 (D4): la autorización de medios privados reutiliza JwtService (con
  // el MISMO secreto y validaciones que jwt.strategy), SessionService (@Global)
  // y AclService; la retención de bytes se audita (AuditModule).
  imports: [PrismaModule, AuthModule, AclModule, AuditModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
