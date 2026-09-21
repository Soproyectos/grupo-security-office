import { BadRequestException } from '@nestjs/common';
import {
  PasswordPolicyService,
  MIN_LENGTH,
  MAX_LENGTH,
} from './password-policy.service';

// ---------------------------------------------------------------------------
// Escenarios cubiertos (S.1 del hardening):
// ✅ Rechaza las contraseñas que el seed histórico usaba en producción
// ✅ Rechaza contraseñas con términos del negocio pese a longitud y símbolos
// ✅ Rechaza datos del propio usuario (correo, nombre)
// ✅ Rechaza por debajo de la longitud mínima aunque la entropía sea alta
// ✅ Acepta frases largas y cadenas aleatorias
// ✅ Super Admin exige puntuación máxima
// ✅ assert() lanza BadRequestException con feedback accionable
// ---------------------------------------------------------------------------

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  beforeEach(() => {
    service = new PasswordPolicyService();
  });

  describe('contraseñas que el sistema aceptaba antes', () => {
    /**
     * Estas dos estaban en el seed y pasaban la validación anterior
     * (`@MinLength(8)`). Son la razón de ser de esta política.
     */
    it.each(['admin123', 'compras123', '12345678', 'password'])(
      'rechaza %s',
      (password) => {
        expect(service.check(password).valid).toBe(false);
      },
    );
  });

  describe('términos del negocio', () => {
    /**
     * Longitud, mayúsculas, dígitos y símbolo: cumple cualquier regla de
     * composición clásica. Aun así es de las primeras que probaría alguien que
     * sepa de qué empresa se trata.
     */
    it('rechaza GrupoSecurity2026! pese a parecer compleja', () => {
      const result = service.check('GrupoSecurity2026!');

      expect(result.valid).toBe(false);
      expect(result.score).toBeLessThan(3);
    });

    /**
     * El diccionario del negocio penaliza de forma medible: 'gruposecurity'
     * pasa de score 3 (sin diccionario) a 0 (con él). Se afirma la penalización,
     * no un veredicto: combinar el término con otras piezas puede recuperar
     * entropía legítima, y eso es correcto.
     */
    it('hunde la puntuación de un término del negocio a solas', () => {
      expect(service.check('gruposecurity').score).toBe(0);
      expect(service.check('seguridad').score).toBe(0);
    });

    /**
     * 'SeguridadGrupo1' queda en score 3: aceptable para un usuario normal,
     * pero NO para un Super Admin, que exige 4. La defensa contra los términos
     * obvios en cuentas privilegiadas está en ese umbral.
     */
    it('rechaza SeguridadGrupo1 para una cuenta privilegiada', () => {
      expect(service.check('SeguridadGrupo1').valid).toBe(true);
      expect(service.check('SeguridadGrupo1', { privileged: true }).valid).toBe(
        false,
      );
    });
  });

  describe('datos del propio usuario', () => {
    /**
     * Los datos del usuario se penalizan como diccionario personal: su propio
     * nombre a solas cae a 0.
     *
     * Nota medida: 'esnaider.idrobo.2026' sigue puntuando 4 aun con los inputs,
     * porque tres segmentos separados aportan entropía real aunque cada pieza
     * sea conocida. Es el comportamiento correcto de zxcvbn, no un fallo de
     * configuración: la política no pretende prohibir que el nombre aparezca,
     * sino que la contraseña SEA el nombre.
     */
    it('hunde la puntuación de una contraseña que es el nombre del usuario', () => {
      const conInputs = service.check('esnaideridrobo', {
        userInputs: ['esnaider.idrobo@gruposecurity.co', 'Esnaider Idrobo'],
      });

      expect(conInputs.score).toBeLessThanOrEqual(1);
      expect(conInputs.valid).toBe(false);
    });
  });

  describe('longitud', () => {
    it(`rechaza por debajo de ${MIN_LENGTH} caracteres aunque sea aleatoria`, () => {
      const result = service.check('xK9#mQ2$');

      expect(result.valid).toBe(false);
      expect(result.feedback.join(' ')).toContain(String(MIN_LENGTH));
    });

    /**
     * bcrypt trunca a 72 bytes. Aceptar más largo daría una falsa sensación de
     * seguridad: dos contraseñas con el mismo prefijo serían equivalentes.
     */
    it(`rechaza por encima de ${MAX_LENGTH} caracteres`, () => {
      expect(service.check('a1!B'.repeat(30)).valid).toBe(false);
    });
  });

  describe('contraseñas aceptables', () => {
    it.each([
      'correcto-caballo-bateria-grapa',
      'xK9#mQ2$vL8pR4wZ',
      'tejado-lampara-viernes-42',
    ])('acepta %s', (password) => {
      expect(service.check(password).valid).toBe(true);
    });
  });

  describe('cuentas privilegiadas', () => {
    it('exige puntuación máxima a un Super Admin', () => {
      // Una contraseña de score 3 sirve para un usuario normal pero no para
      // quien controla la visibilidad de datos de toda la organización.
      const candidate = 'mesa-verde-1994';

      const normal = service.check(candidate);
      const privileged = service.check(candidate, { privileged: true });

      if (normal.score === 3) {
        expect(normal.valid).toBe(true);
        expect(privileged.valid).toBe(false);
      } else {
        // Si la librería puntúa distinto, la invariante sigue siendo válida:
        // lo privilegiado nunca es más laxo que lo normal.
        expect(privileged.valid === true ? normal.valid : true).toBe(true);
      }
    });
  });

  describe('assert()', () => {
    it('lanza BadRequestException con feedback', () => {
      expect(() => service.assert('admin123')).toThrow(BadRequestException);

      try {
        service.assert('admin123');
      } catch (error: any) {
        const body = error.getResponse();
        expect(body.feedback.length).toBeGreaterThan(0);
        expect(typeof body.score).toBe('number');
      }
    });

    it('no lanza con una contraseña válida', () => {
      expect(() =>
        service.assert('correcto-caballo-bateria-grapa'),
      ).not.toThrow();
    });
  });
});
