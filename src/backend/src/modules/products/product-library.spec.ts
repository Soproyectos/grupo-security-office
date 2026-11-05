import { directLegacyProductLibrary } from './product-library';

describe('Direct product constructors cannot bypass the selected library or freeze', () => {
  const originalMode = process.env.LIBRARY_DATABASE_MODE;
  const originalFrozen = process.env.LIBRARY_WRITES_FROZEN;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.LIBRARY_DATABASE_MODE;
    else process.env.LIBRARY_DATABASE_MODE = originalMode;
    if (originalFrozen === undefined) delete process.env.LIBRARY_WRITES_FROZEN;
    else process.env.LIBRARY_WRITES_FROZEN = originalFrozen;
  });

  it('refuses an absent dedicated provider before any database use', () => {
    process.env.LIBRARY_DATABASE_MODE = 'dedicated';
    expect(() => directLegacyProductLibrary({} as never)).toThrow('require the library provider');
  });

  it('preserves the legacy freeze even for direct constructors', () => {
    process.env.LIBRARY_DATABASE_MODE = 'legacy';
    process.env.LIBRARY_WRITES_FROZEN = 'true';
    const library = directLegacyProductLibrary({} as never);
    expect(() => library.assertWritesAllowed()).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) }));
  });
});
