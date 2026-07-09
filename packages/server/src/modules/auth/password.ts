import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SCRYPT_N = 16384;
const PASSWORD_SCRYPT_R = 8;
const PASSWORD_SCRYPT_P = 1;
export const PASSWORD_MIN_LENGTH = 6;

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const key = scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: PASSWORD_SCRYPT_N,
    r: PASSWORD_SCRYPT_R,
    p: PASSWORD_SCRYPT_P,
  }) as Buffer;

  return [
    "scrypt",
    PASSWORD_SCRYPT_N,
    PASSWORD_SCRYPT_R,
    PASSWORD_SCRYPT_P,
    salt,
    key.toString("hex"),
  ].join("$");
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, salt, hashHex] = parts;
  const iterations = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  if (
    !Number.isFinite(iterations) ||
    !Number.isFinite(blockSize) ||
    !Number.isFinite(parallelization)
  ) {
    return false;
  }

  try {
    const key = scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
      N: iterations,
      r: blockSize,
      p: parallelization,
    }) as Buffer;

    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== key.length) {
      return false;
    }

    return timingSafeEqual(expected, key);
  } catch {
    return false;
  }
}
