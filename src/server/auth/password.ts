import 'server-only';
import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * Argon2id parameters.
 *
 * m = 19456 KiB, t = 2 passes, p = 1 lane, 32-byte output. This is the
 * OWASP-recommended baseline (19 MiB / t=2 / p=1) and costs roughly 40–70 ms per
 * verification on a typical laptop — slow enough to blunt offline cracking, fast
 * enough for interactive sign-in.
 *
 * `algorithm` is the numeric value behind `Algorithm.Argon2id`. The library
 * declares that as an ambient const enum, which cannot be referenced under
 * `isolatedModules`, so the number is written out and typed once here.
 */
const OPTIONS: Options = {
  algorithm: 2,
  // `Version.V0x13` is the library default; omitting it avoids depending on an
  // ambient const enum, which cannot be referenced under `isolatedModules`.
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwertyuiop',
  'letmein', 'welcome', 'monkey', 'dragon', 'iloveyou', 'admin', 'abc123',
  'football', 'baseball', 'sunshine', 'princess', 'trustno1', 'superman',
  'qazwsx', 'starwars', 'whatever', 'zaq12wsx', 'passw0rd', 'p@ssw0rd',
]);

/**
 * Accepts any passphrase a student would actually type. Length is the dominant
 * factor in offline resistance, so the policy is length-first: 12 characters
 * minimum, and no requirement for character-class gymnastics that push people
 * toward `Passw0rd!`.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 200) problems.push('Keep it under 200 characters.');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push('This password is far too common.');
  }
  if (/^(.)\1+$/.test(password)) problems.push('This is a single repeated character.');
  if (new Set(password).size < 5) problems.push('This uses too few different characters.');

  const lowered = password.toLowerCase();
  if (/^(.)\1{2,}/.test(lowered)) problems.push('Avoid repeating characters in sequence.');

  return { ok: problems.length === 0, problems };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(storedHash: string | null, candidate: string): Promise<boolean> {
  if (!storedHash) {
    // Still spend comparable time so the absence of an account is not faster
    // to detect than a wrong password.
    await hash(candidate, OPTIONS).catch(() => undefined);
    return false;
  }
  try {
    return await verify(storedHash, candidate, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Counts the cheapest possible shapes, used only to decide whether to demand
 * a second factor. Never stored.
 */
export function passwordLooksTrivial(password: string): boolean {
  return (
    password.length < 10 ||
    COMMON_PASSWORDS.has(password.toLowerCase()) ||
    new Set(password).size < 4
  );
}