// ---------------------------------------------------------------------------
// Mock de bcrypt — evita error de binding nativo en Windows
// ---------------------------------------------------------------------------
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock de PrismaService — evita depender de prisma generate
// ---------------------------------------------------------------------------
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

// ---------------------------------------------------------------------------
// Imports reales
// ---------------------------------------------------------------------------
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountLockoutService } from '../../common/security/account-lockout.service';
import { MfaService } from '../../common/security/mfa.service';
import { SessionService } from '../../common/security/session.service';
import { UserPermissionsService } from '../../common/security/user-permissions.service';
import {
  buildActiveUser,
  buildInactiveUser,
  buildAdminRole,
  buildOperatorRole,
  buildUserWithRoles,
} from '../../__test__/fixtures/auth.fixture';

// ---------------------------------------------------------------------------
// Escenarios cubiertos (Fase S — hardening):
// ✅ login - credenciales válidas sin MFA → sesión emitida con jti
// ✅ login - email con mayúsculas → normalizado a lowercase
// ✅ login - usuario no existe → 401 y bcrypt SÍ se ejecuta (anti-enumeración)
// ✅ login - usuario inactivo → 401 con el mismo mensaje genérico
// ✅ login - password incorrecto → 401 y se registra el intento fallido
// ✅ login - cuenta bloqueada → 403 sin consultar credenciales
// ✅ login - usuario con MFA activo → MFA_REQUIRED, sin sesión
// ✅ login - Super Admin sin MFA → MFA_ENROLLMENT_REQUIRED, sin sesión
// ✅ login - roles múltiples → permisos deduplicados
// ✅ login - duración de sesión reducida para rol privilegiado
// ✅ verifyMfa - código válido → sesión emitida
// ✅ verifyMfa - código inválido → 401 y se registra el fallo
// ✅ consumeChallenge - scope incorrecto → 401
// ✅ logout - revoca la sesión del jti
// ---------------------------------------------------------------------------

const mockJwtService = {
  sign: jest.fn().mockReturnValue('jwt-token-mock'),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockLockout = {
  getStatus: jest.fn(),
  record: jest.fn(),
  unlock: jest.fn(),
};

const mockMfa = {
  getState: jest.fn(),
  isRequiredForRoles: jest.fn(),
  verify: jest.fn(),
  confirmEnrollment: jest.fn(),
};

const mockSessions = {
  create: jest.fn(),
  revoke: jest.fn(),
  revokeAllForUser: jest.fn(),
};

const mockUserPermissions = {
  // Por defecto el usuario no tiene concesiones individuales: los permisos
  // salen solo de sus roles.
  effectivePermissionsFor: jest.fn().mockResolvedValue([]),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => fallback),
};

/**
 * `buildActiveUser()` devuelve el User plano; `buildIdentity` necesita la forma
 * con `roles` incluidos que entrega Prisma. Este helper la arma con un rol
 * básico, que es lo que espera la mayoría de los casos.
 */
const activeUserWithRoles = (permissions: string[] = ['products:read']) =>
  buildUserWithRoles(buildActiveUser(), [
    { role: buildOperatorRole(), permissions },
  ]);

const inactiveUserWithRoles = () =>
  buildUserWithRoles(buildInactiveUser(), [
    { role: buildOperatorRole(), permissions: ['products:read'] },
  ]);

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Por defecto: cuenta sin bloqueo, sin MFA, rol no privilegiado.
    mockLockout.getStatus.mockResolvedValue({
      locked: false,
      until: null,
      recentFailures: 0,
    });
    mockMfa.getState.mockResolvedValue({ enabled: false, confirmedAt: null });
    mockMfa.isRequiredForRoles.mockReturnValue(false);
    mockSessions.create.mockResolvedValue('jti-mock');
    mockUserPermissions.effectivePermissionsFor.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AccountLockoutService, useValue: mockLockout },
        { provide: MfaService, useValue: mockMfa },
        { provide: SessionService, useValue: mockSessions },
        { provide: UserPermissionsService, useValue: mockUserPermissions },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // -----------------------------------------------------------------------
  //  login — paso 1 (credenciales)
  // -----------------------------------------------------------------------

  describe('login', () => {
    it('emite sesión cuando las credenciales son válidas y no hay MFA', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login('test@test.com', 'password123');

      expect(result.status).toBe('COMPLETE');

      if (result.status !== 'COMPLETE') throw new Error('esperaba COMPLETE');

      expect(result.token).toBe('jwt-token-mock');
      expect(result.user.email).toBe(buildActiveUser().email);
      expect(mockSessions.create).toHaveBeenCalledTimes(1);
    });

    it('incluye el jti de la sesión en el payload del JWT', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockSessions.create.mockResolvedValue('jti-especifico');

      await authService.login('test@test.com', 'password123');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 'jti-especifico' }),
        expect.anything(),
      );
    });

    it('normaliza el email a minúsculas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authService.login('TEST@TEST.COM', 'password123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'test@test.com' } }),
      );
    });

    /**
     * Anti-enumeración: con un correo inexistente bcrypt debe ejecutarse igual
     * contra un hash de descarte. Si se omitiera, la respuesta sería mucho más
     * rápida y ese tiempo revelaría qué correos están registrados.
     */
    it('ejecuta bcrypt aunque el usuario no exista (tiempo constante)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login('desconocido@test.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('usa el mismo mensaje para usuario inexistente e inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const errorDesconocido = await authService
        .login('nadie@test.com', 'x')
        .catch((e) => e.message);

      mockPrisma.user.findUnique.mockResolvedValue(inactiveUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const errorInactivo = await authService
        .login('test@test.com', 'x')
        .catch((e) => e.message);

      expect(errorDesconocido).toBe(errorInactivo);
    });

    it('registra el intento fallido cuando la contraseña es incorrecta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login('test@test.com', 'mala'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLockout.record).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, reason: 'BAD_PASSWORD' }),
      );
    });

    it('registra el acceso correcto', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authService.login('test@test.com', 'password123');

      expect(mockLockout.record).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    /**
     * Con la cuenta bloqueada no se llega a comprobar la contraseña: el bloqueo
     * es la primera puerta, de lo contrario seguiría siendo un oráculo de
     * credenciales durante el propio bloqueo.
     */
    it('rechaza con 403 si la cuenta está bloqueada, sin comprobar credenciales', async () => {
      mockLockout.getStatus.mockResolvedValue({
        locked: true,
        until: new Date(Date.now() + 900_000),
        recentFailures: 5,
      });

      await expect(
        authService.login('test@test.com', 'password123'),
      ).rejects.toThrow(ForbiddenException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    it('no emite sesión si el usuario tiene MFA activo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockMfa.getState.mockResolvedValue({
        enabled: true,
        confirmedAt: new Date(),
      });

      const result = await authService.login('test@test.com', 'password123');

      expect(result.status).toBe('MFA_REQUIRED');
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    /**
     * Un Super Admin sin segundo factor no obtiene sesión: sólo un token para
     * enrolarlo. Sin esta regla, la obligatoriedad del MFA sería evitable
     * simplemente no activándolo.
     */
    it('obliga a enrolar MFA a un rol privilegiado que no lo tiene', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockMfa.isRequiredForRoles.mockReturnValue(true);

      const result = await authService.login('admin@test.com', 'password123');

      expect(result.status).toBe('MFA_ENROLLMENT_REQUIRED');
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    it('deduplica permisos entre varios roles', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildUserWithRoles(buildActiveUser(), [
          // 'products:read' aparece en ambos roles: debe salir una sola vez.
          { role: buildAdminRole(), permissions: ['products:read', 'users:manage'] },
          { role: buildOperatorRole(), permissions: ['products:read'] },
        ]),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login('test@test.com', 'password123');

      if (result.status !== 'COMPLETE') throw new Error('esperaba COMPLETE');

      const unique = new Set<string>(result.user.permissions);
      expect(result.user.permissions.length).toBe(unique.size);
    });

    /**
     * Fase 5: el permiso concedido a un usuario concreto se suma a los de sus
     * roles. El rol sigue siendo el piso; la concesión sólo añade.
     */
    it('suma las concesiones individuales a los permisos del rol', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles(['products:read']));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserPermissions.effectivePermissionsFor.mockResolvedValue([
        'dashboard:pack:ventas',
      ]);

      const result = await authService.login('test@test.com', 'password123');

      if (result.status !== 'COMPLETE') throw new Error('esperaba COMPLETE');

      expect(result.user.permissions).toContain('products:read');
      expect(result.user.permissions).toContain('dashboard:pack:ventas');
    });

    it('no duplica un permiso que ya venía del rol', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles(['dashboard:pack:ventas']));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserPermissions.effectivePermissionsFor.mockResolvedValue([
        'dashboard:pack:ventas',
      ]);

      const result = await authService.login('test@test.com', 'password123');

      if (result.status !== 'COMPLETE') throw new Error('esperaba COMPLETE');

      const ocurrencias = result.user.permissions.filter(
        (p) => p === 'dashboard:pack:ventas',
      );
      expect(ocurrencias).toHaveLength(1);
    });

    it('acorta la sesión para roles privilegiados', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockMfa.isRequiredForRoles.mockReturnValue(true);
      mockMfa.getState.mockResolvedValue({
        enabled: true,
        confirmedAt: new Date(),
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', scope: 'mfa' });
      mockMfa.verify.mockResolvedValue(true);

      await authService.verifyMfa('challenge', '123456');

      // SESSION_HOURS_PRIVILEGED por defecto = 2 h, frente a 8 h de una normal.
      expect(mockConfig.get).toHaveBeenCalledWith('SESSION_HOURS_PRIVILEGED', 2);
    });
  });

  // -----------------------------------------------------------------------
  //  verifyMfa — paso 2 (segundo factor)
  // -----------------------------------------------------------------------

  describe('verifyMfa', () => {
    beforeEach(() => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', scope: 'mfa' });
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());
    });

    it('emite sesión con un código válido', async () => {
      mockMfa.verify.mockResolvedValue(true);

      const result = await authService.verifyMfa('challenge', '123456');

      expect(result.status).toBe('COMPLETE');
      expect(mockSessions.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza un código inválido y registra el fallo', async () => {
      mockMfa.verify.mockResolvedValue(false);

      await expect(
        authService.verifyMfa('challenge', '000000'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLockout.record).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, reason: 'BAD_MFA' }),
      );
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    /**
     * Un token de enrolamiento no puede hacerse pasar por uno de verificación:
     * de lo contrario se saltaría el segundo factor pidiendo el token "malo".
     */
    it('rechaza un token de desafío con scope incorrecto', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-1',
        scope: 'mfa-enroll',
      });

      await expect(
        authService.verifyMfa('challenge', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token de desafío expirado', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        authService.verifyMfa('challenge', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -----------------------------------------------------------------------
  //  getProfile / logout
  // -----------------------------------------------------------------------

  describe('getProfile', () => {
    it('devuelve los datos del usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUserWithRoles());

      const result = await authService.getProfile('user-1');

      expect(result.email).toBe(buildActiveUser().email);
      expect(result).not.toHaveProperty('password');
    });

    it('lanza 401 si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.getProfile('inexistente')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revoca la sesión del jti', async () => {
      await authService.logout('jti-abc');

      expect(mockSessions.revoke).toHaveBeenCalledWith('jti-abc', 'LOGOUT');
    });

    it('no falla si el token no traía jti', async () => {
      await expect(authService.logout(undefined)).resolves.toBeUndefined();

      expect(mockSessions.revoke).not.toHaveBeenCalled();
    });
  });
});
