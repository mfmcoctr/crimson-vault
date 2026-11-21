import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getSettings } from './db.ts';

export const SESSION_COOKIE_NAME = 'pv_session';

interface VaultRuntimeState {
  dek: Buffer | null;
  sessionTokens: Set<string>;
  lastActivityAt: number;
}

const state: VaultRuntimeState = {
  dek: null,
  sessionTokens: new Set<string>(),
  lastActivityAt: Date.now(),
};

// Temporary staging store for bulk archive import previews (wiped on lock!)
export interface StagedImportFile {
  tempId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  isTextPreviewable: boolean;
  textPreview?: string;
  buffer: Buffer;
}

export interface StagedImportData {
  stagingId: string;
  createdAt: number;
  credentials: import('../src/types.ts').ParsedImportCredential[];
  notes: import('../src/types.ts').ParsedImportNote[];
  files: StagedImportFile[];
}

const stagedImports = new Map<string, StagedImportData>();

export function saveStagedImport(data: StagedImportData): void {
  const cutoff = Date.now() - 20 * 60 * 1000;
  for (const [key, val] of stagedImports.entries()) {
    if (val.createdAt < cutoff) stagedImports.delete(key);
  }
  stagedImports.set(data.stagingId, data);
}

export function getStagedImport(stagingId: string): StagedImportData | undefined {
  return stagedImports.get(stagingId);
}

export function deleteStagedImport(stagingId: string): void {
  stagedImports.delete(stagingId);
}

/**
 * Unlocks the vault in memory and issues a new device session token.
 * Supports multiple simultaneous devices (e.g., PC + Phone via Tailscale) staying unlocked together.
 */
export function setUnlockedSession(dek: Buffer, resetAllDevices = false): string {
  if (state.dek) {
    state.dek.fill(0);
  }
  state.dek = Buffer.from(dek);
  if (resetAllDevices) {
    state.sessionTokens.clear();
  }
  const token = crypto.randomBytes(32).toString('hex');
  state.sessionTokens.add(token);
  // Keep reasonable cap on concurrent device tokens
  if (state.sessionTokens.size > 16) {
    const oldest = state.sessionTokens.values().next().value;
    if (oldest) state.sessionTokens.delete(oldest);
  }
  state.lastActivityAt = Date.now();
  return token;
}

/**
 * Immediately wipes the DEK from RAM and invalidates ALL active device sessions.
 */
export function lockVaultMemory(): void {
  if (state.dek) {
    state.dek.fill(0);
    state.dek = null;
  }
  state.sessionTokens.clear();
  stagedImports.clear();
}

export function checkAutoLock(): void {
  if (!state.dek) return;
  try {
    const settings = getSettings(state.dek);
    if (settings.autoLockMinutes > 0) {
      const elapsedMs = Date.now() - state.lastActivityAt;
      if (elapsedMs > settings.autoLockMinutes * 60 * 1000) {
        lockVaultMemory();
      }
    }
  } catch {
    // ignore if settings unavailable
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    result[k] = decodeURIComponent(v);
  }
  return result;
}

export function isRequestAuthenticated(req: Request): boolean {
  checkAutoLock();
  if (!state.dek || state.sessionTokens.size === 0) return false;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return false;
  const a = Buffer.from(token);
  for (const valid of state.sessionTokens) {
    const b = Buffer.from(valid);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function getActiveDek(): Buffer {
  if (!state.dek) {
    throw new Error('Kasa kilitli.');
  }
  return state.dek;
}

export function requireUnlocked(req: Request, res: Response, next: NextFunction): void {
  if (!isRequestAuthenticated(req)) {
    res.status(401).json({ error: 'Kasa kilitli. Lütfen ana parolanızla giriş yapın.' });
    return;
  }
  state.lastActivityAt = Date.now();
  next();
}
