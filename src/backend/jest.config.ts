import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      diagnostics: false,
    }],
  },
  // otplib v13 y sus plugins (@otplib/*, @scure/*) se publican como ESM. Jest
  // ignora node_modules al transformar, así que sin esta excepción los specs que
  // alcanzan MfaService fallan al cargar con "Cannot use import statement
  // outside a module".
  transformIgnorePatterns: [
    'node_modules/(?!(otplib|@otplib|@scure|@noble)/)',
  ],
  collectCoverageFrom: [
    '**/*.service.ts',
    '**/*.controller.ts',
    '**/*.guard.ts',
    '**/common/**/*.guard.ts',
    '**/common/**/*.decorator.ts',
    '!**/__test__/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
