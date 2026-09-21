import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PasswordPolicyService } from './password-policy.service';
import { AccountLockoutService } from './account-lockout.service';
import { MfaCryptoService } from './mfa-crypto.service';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';
import { PrivilegedAccountService } from './privileged-account.service';
import { UserPermissionsService } from './user-permissions.service';
import { AuditModule } from '../../modules/audit/audit.module';

/**
 * Servicios transversales del hardening (Fase S).
 *
 * Es `@Global` porque los consumen módulos que no deben depender unos de otros:
 * `auth` (login, MFA, sesiones), `users` (política de contraseñas) y los guards
 * de step-up. Agruparlos aquí evita que `users` tenga que importar `auth`.
 */
@Global()
@Module({
  imports: [ConfigModule, PrismaModule, AuditModule],
  providers: [
    PasswordPolicyService,
    AccountLockoutService,
    MfaCryptoService,
    MfaService,
    SessionService,
    PrivilegedAccountService,
    UserPermissionsService,
  ],
  exports: [
    PasswordPolicyService,
    AccountLockoutService,
    MfaCryptoService,
    MfaService,
    SessionService,
    PrivilegedAccountService,
    UserPermissionsService,
  ],
})
export class SecurityModule {}
