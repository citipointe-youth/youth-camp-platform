import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEYLEN = 64;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [salt, storedKey] = hash.split(':');
    if (!salt || !storedKey) return false;
    const derivedKey = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
    const storedKeyBuf = Buffer.from(storedKey, 'hex');
    if (derivedKey.length !== storedKeyBuf.length) return false;
    return timingSafeEqual(derivedKey, storedKeyBuf);
  } catch {
    return false;
  }
}
