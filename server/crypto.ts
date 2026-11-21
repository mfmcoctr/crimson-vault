import crypto from 'node:crypto';

export interface KdfParams {
  algo: 'scrypt';
  N: number;
  r: number;
  p: number;
  keylen: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  algo: 'scrypt',
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
};

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
export const VERIFIER_SENTINEL = 'PERSONVAULT_CRIMSON_SANCTUM_V1';

export function generateSalt(bytes = 32): Buffer {
  return crypto.randomBytes(bytes);
}

export function generateDek(): Buffer {
  return crypto.randomBytes(32);
}

export function deriveKey(password: string, salt: Buffer, params: KdfParams = DEFAULT_KDF_PARAMS): Buffer {
  return crypto.scryptSync(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * 1024 * 1024,
  });
}

export function encryptBuffer(plaintext: Buffer, key: Buffer, aad?: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptBuffer(blob: Buffer | Uint8Array, key: Buffer, aad?: string): Buffer {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Şifreli veri bozuk veya eksik.');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptJson(data: unknown, key: Buffer, aad: string): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(data), 'utf8');
  return encryptBuffer(jsonBuf, key, aad);
}

export function decryptJson<T>(blob: Buffer | Uint8Array, key: Buffer, aad: string): T {
  const plain = decryptBuffer(blob, key, aad);
  return JSON.parse(plain.toString('utf8')) as T;
}

export interface EncryptedBackupEnvelope {
  format: 'personvault-backup';
  version: 1;
  createdAt: string;
  kdf: KdfParams & { salt: string };
  cipher: 'aes-256-gcm';
  payload: string;
}

export function createEncryptedBackup(data: unknown, password: string): EncryptedBackupEnvelope {
  const salt = generateSalt(32);
  const key = deriveKey(password, salt, DEFAULT_KDF_PARAMS);
  const encrypted = encryptJson(data, key, 'personvault:backup:v1');
  key.fill(0);
  return {
    format: 'personvault-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: {
      ...DEFAULT_KDF_PARAMS,
      salt: salt.toString('base64'),
    },
    cipher: 'aes-256-gcm',
    payload: encrypted.toString('base64'),
  };
}

export function decryptEncryptedBackup<T>(envelope: EncryptedBackupEnvelope, password: string): T {
  if (!envelope || envelope.format !== 'personvault-backup' || envelope.version !== 1) {
    throw new Error('Geçersiz PersonVault yedek dosyası formatı.');
  }
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const key = deriveKey(password, salt, {
    algo: 'scrypt',
    N: envelope.kdf.N,
    r: envelope.kdf.r,
    p: envelope.kdf.p,
    keylen: envelope.kdf.keylen || 32,
  });
  try {
    const blob = Buffer.from(envelope.payload, 'base64');
    return decryptJson<T>(blob, key, 'personvault:backup:v1');
  } catch {
    throw new Error('Yedek parolası hatalı veya dosya bozulmuş.');
  } finally {
    key.fill(0);
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

