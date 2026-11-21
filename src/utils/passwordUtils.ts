import type { PasswordEntry } from '../types';

export interface GeneratorOptions {
  mode: 'random' | 'passphrase';
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  wordCount: number;
  separator: string;
  capitalizeWords: boolean;
  includeNumber: boolean;
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  mode: 'random',
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: true,
  wordCount: 4,
  separator: '-',
  capitalizeWords: true,
  includeNumber: true,
};

const PASSPHRASE_WORDS = [
  'kizil', 'golge', 'hisar', 'kale', 'yildiz', 'yakut', 'gece', 'ayna', 'ates', 'ruzgar',
  'demir', 'gumus', 'zeytin', 'kartal', 'kuzgun', 'firtina', 'volkan', 'sancak', 'muhur', 'kasa',
  'kalkan', 'hanedan', 'simya', 'kristal', 'buzul', 'ormanci', 'okyanus', 'bulut', 'safir', 'mercan',
  'pusula', 'fener', 'zirve', 'vadi', 'nehir', 'toprak', 'gunes', 'hilal', 'sovalye', 'ejder',
  'kivilcim', 'serap', 'destan', 'efsane', 'gecit', 'kule', 'liman', 'atlas', 'kuvars', 'elmas',
  'ankara', 'izmir', 'efes', 'truva', 'kapadokya', 'bogaz', 'toros', 'uludag', 'nemrut', 'gokyuzu',
];

function secureRandomInt(max: number): number {
  const arr = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let v = 0;
  do {
    crypto.getRandomValues(arr);
    v = arr[0];
  } while (v >= limit);
  return v % max;
}

export function generatePassword(opts: GeneratorOptions): string {
  if (opts.mode === 'passphrase') {
    const words: string[] = [];
    for (let i = 0; i < opts.wordCount; i++) {
      let w = PASSPHRASE_WORDS[secureRandomInt(PASSPHRASE_WORDS.length)];
      if (opts.capitalizeWords) w = w.charAt(0).toUpperCase() + w.slice(1);
      words.push(w);
    }
    if (opts.includeNumber) {
      const idx = secureRandomInt(words.length);
      words[idx] += String(10 + secureRandomInt(90));
    }
    return words.join(opts.separator || '-');
  }

  let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let lower = 'abcdefghijklmnopqrstuvwxyz';
  let nums = '0123456789';
  const syms = '!@#$%^&*()-_=+[]{}|;:,.<>?';

  if (opts.excludeAmbiguous) {
    upper = upper.replace(/[IO]/g, '');
    lower = lower.replace(/[lo]/g, '');
    nums = nums.replace(/[01]/g, '');
  }

  const pools: string[] = [];
  if (opts.uppercase) pools.push(upper);
  if (opts.lowercase) pools.push(lower);
  if (opts.numbers) pools.push(nums);
  if (opts.symbols) pools.push(syms);
  if (pools.length === 0) pools.push(lower, nums);

  const allChars = pools.join('');
  const chars: string[] = [];
  for (const pool of pools) {
    chars.push(pool[secureRandomInt(pool.length)]);
  }
  while (chars.length < Math.max(8, opts.length)) {
    chars.push(allChars[secureRandomInt(allChars.length)]);
  }
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, opts.length).join('');
}

export interface StrengthInfo {
  score: number; // 0..100
  label: string;
  level: 'very-weak' | 'weak' | 'medium' | 'strong' | 'excellent';
  barColor: string;
  textColor: string;
}

export function evaluatePasswordStrength(password: string): StrengthInfo {
  if (!password) {
    return { score: 0, label: 'Boş', level: 'very-weak', barColor: 'bg-zinc-600', textColor: 'text-zinc-400' };
  }
  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  const entropy = password.length * Math.log2(Math.max(poolSize, 1));
  let score = Math.min(100, Math.round((entropy / 90) * 100));

  // Penalize very common patterns or short lengths
  if (password.length < 8) score = Math.min(score, 32);
  if (/^(123456|password|qwerty|admin|sifre|parola|111111)/i.test(password)) score = Math.min(score, 15);
  if (/(.)\1{3,}/.test(password)) score = Math.max(10, score - 15);

  if (score < 28) {
    return { score, label: 'Çok Zayıf', level: 'very-weak', barColor: 'bg-red-600', textColor: 'text-red-400' };
  }
  if (score < 50) {
    return { score, label: 'Zayıf', level: 'weak', barColor: 'bg-orange-500', textColor: 'text-orange-300' };
  }
  if (score < 72) {
    return { score, label: 'Orta', level: 'medium', barColor: 'bg-amber-400', textColor: 'text-amber-200' };
  }
  if (score < 88) {
    return { score, label: 'Güçlü', level: 'strong', barColor: 'bg-emerald-500', textColor: 'text-emerald-300' };
  }
  return { score, label: 'Çok Güçlü', level: 'excellent', barColor: 'bg-rose-400', textColor: 'text-rose-200' };
}

export interface VaultSecurityAudit {
  healthScore: number;
  weakIds: Set<string>;
  reusedIds: Set<string>;
  reusedGroups: number;
}

export function auditPasswords(passwords: PasswordEntry[]): VaultSecurityAudit {
  const weakIds = new Set<string>();
  const reusedIds = new Set<string>();
  const byValue = new Map<string, string[]>();

  for (const p of passwords) {
    if (!p.password) continue;
    const st = evaluatePasswordStrength(p.password);
    if (st.score < 50) weakIds.add(p.id);
    const list = byValue.get(p.password) || [];
    list.push(p.id);
    byValue.set(p.password, list);
  }

  let reusedGroups = 0;
  for (const ids of byValue.values()) {
    if (ids.length > 1) {
      reusedGroups++;
      for (const id of ids) reusedIds.add(id);
    }
  }

  if (passwords.length === 0) {
    return { healthScore: 100, weakIds, reusedIds, reusedGroups: 0 };
  }

  const avgStrength =
    passwords.reduce((acc, p) => acc + evaluatePasswordStrength(p.password).score, 0) / passwords.length;
  const reusePenalty = (reusedIds.size / passwords.length) * 35;
  const weakPenalty = (weakIds.size / passwords.length) * 25;
  const healthScore = Math.max(5, Math.min(100, Math.round(avgStrength - reusePenalty - weakPenalty + 12)));

  return { healthScore, weakIds, reusedIds, reusedGroups };
}

