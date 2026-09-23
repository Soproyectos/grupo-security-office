/**
 * Parses the `TRUST_PROXY_HOPS` environment variable into a validated
 * non-negative integer.
 *
 * Defaults to 1 hop when unset or empty. Throws a startup Error for any
 * value that is not a non-negative integer, so a misconfiguration fails
 * fast instead of silently disabling (or over-trusting) the proxy chain
 * that the public throttle relies on.
 */
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return 1;
  }

  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a non-negative integer, got: "${raw}"`,
    );
  }

  return parseInt(raw, 10);
}
