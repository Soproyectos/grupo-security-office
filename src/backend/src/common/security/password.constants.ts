/**
 * Parámetros de hashing de contraseñas. Fuente única de verdad: cualquier punto
 * del sistema que derive un hash debe importar esta constante, nunca escribir el
 * número a mano.
 *
 * Contexto (SEC-SEED-001): el proyecto tenía dos costes distintos conviviendo —
 * el seed usaba 12 y `users.service.ts` usaba 10. Los usuarios creados desde la
 * aplicación quedaban con un hash cuatro veces más barato de romper que los del
 * seed, sin que nada lo hiciera evidente.
 *
 * El valor sigue la recomendación de OWASP para bcrypt (>= 12). Subirlo encarece
 * el login de forma lineal; medir antes de tocarlo.
 */
export const BCRYPT_ROUNDS = 12;
