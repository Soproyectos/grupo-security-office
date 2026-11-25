import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const PREFIX = 'sha256:';
const COST = 12;
const sha256hex = (value: string) => createHash('sha256').update(value).digest('hex');

/** New format: "sha256:" + bcrypt(sha256hex(password)), cost 12. */
export async function hashPortalPassword(password: string): Promise<string> {
  return PREFIX + (await bcrypt.hash(sha256hex(password), COST));
}

/** Accepts the new format and plain bcrypt ($2a/$2b/$2y). */
export async function verifyPortalPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    if (hash.startsWith(PREFIX)) return await bcrypt.compare(sha256hex(password), hash.slice(PREFIX.length));
    if (/^\$2[aby]\$/.test(hash)) return await bcrypt.compare(password, hash);
    return false;
  } catch {
    return false;
  }
}
