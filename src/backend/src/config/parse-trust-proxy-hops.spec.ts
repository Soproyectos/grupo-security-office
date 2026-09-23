import { parseTrustProxyHops } from './parse-trust-proxy-hops';

describe('parseTrustProxyHops', () => {
  it('defaults to 1 when unset', () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
  });

  it('defaults to 1 when the empty string', () => {
    expect(parseTrustProxyHops('')).toBe(1);
  });

  it('parses a valid non-negative integer', () => {
    expect(parseTrustProxyHops('2')).toBe(2);
  });

  it('throws for a non-integer string', () => {
    expect(() => parseTrustProxyHops('abc')).toThrow(
      'TRUST_PROXY_HOPS must be a non-negative integer, got: "abc"',
    );
  });

  it('throws for a negative number', () => {
    expect(() => parseTrustProxyHops('-1')).toThrow(
      'TRUST_PROXY_HOPS must be a non-negative integer, got: "-1"',
    );
  });

  it('throws for a decimal number', () => {
    expect(() => parseTrustProxyHops('1.5')).toThrow(
      'TRUST_PROXY_HOPS must be a non-negative integer, got: "1.5"',
    );
  });
});
