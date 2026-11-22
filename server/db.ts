import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_KDF_PARAMS,
  VERIFIER_SENTINEL,
  decryptBuffer,
  decryptJson,
  deriveKey,
  encryptBuffer,
  encryptJson,
  generateDek,
  generateSalt,
  KdfParams,
} from './crypto.ts';
import {
  AppSettings,
  CalendarEventEntry,
  ClientCredential,
  ClientFileMeta,
  ClientNote,
  ClientVault,
  DEFAULT_SETTINGS,
  FreecashOffer,
  NoteEntry,
  PasswordEntry,
  SubscriptionEntry,
  TrackedProduct,
} from '../src/types.ts';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'personvault.db');
export const CUSTOM_BG_PATH = path.join(DATA_DIR, 'custom-background.bin');
export const CUSTOM_BG_META_PATH = path.join(DATA_DIR, 'custom-background.meta.json');

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) return dbInstance;
  const targetPath = customPath || DB_PATH;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbForTest(testDb: DatabaseSync): void {
  dbInstance = testDb;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ui_prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS passwords (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS client_credentials (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_client_credentials_client ON client_credentials(client_id);

    CREATE TABLE IF NOT EXISTS client_notes (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);

    CREATE TABLE IF NOT EXISTS client_files (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      meta_payload BLOB NOT NULL,
      content_payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files(client_id);

    CREATE TABLE IF NOT EXISTS encrypted_settings (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracked_products (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS freecash_offers (
      id TEXT PRIMARY KEY,
      payload BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// --- Vault Meta & Key Management ---

export function isVaultInitialized(): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM vault_meta WHERE key = 'wrapped_dek'`).get() as { value: string } | undefined;
  return Boolean(row?.value);
}

export function initializeVault(masterPassword: string): Buffer {
  if (isVaultInitialized()) {
    throw new Error('Kasa zaten kurulmuş.');
  }
  const db = getDb();
  const salt = generateSalt(32);
  const masterKey = deriveKey(masterPassword, salt, DEFAULT_KDF_PARAMS);
  const dek = generateDek();

  try {
    const wrappedDek = encryptBuffer(dek, masterKey, 'vault:dek');
    const verifier = encryptBuffer(Buffer.from(VERIFIER_SENTINEL, 'utf8'), dek, 'vault:verify');

    const insert = db.prepare(`INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)`);
    db.exec('BEGIN');
    insert.run('kdf_salt', salt.toString('base64'));
    insert.run('kdf_params', JSON.stringify(DEFAULT_KDF_PARAMS));
    insert.run('wrapped_dek', wrappedDek.toString('base64'));
    insert.run('verifier', verifier.toString('base64'));
    insert.run('created_at', new Date().toISOString());
    db.exec('COMMIT');

    saveSettings(DEFAULT_SETTINGS, dek);
    return dek;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    masterKey.fill(0);
  }
}

export function unlockVaultWithPassword(masterPassword: string): Buffer {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM vault_meta`).all() as { key: string; value: string }[];
  const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!meta.kdf_salt || !meta.wrapped_dek || !meta.verifier) {
    throw new Error('Kasa henüz kurulmamış.');
  }
  const salt = Buffer.from(meta.kdf_salt, 'base64');
  const params: KdfParams = meta.kdf_params ? JSON.parse(meta.kdf_params) : DEFAULT_KDF_PARAMS;
  const masterKey = deriveKey(masterPassword, salt, params);

  try {
    const wrappedDek = Buffer.from(meta.wrapped_dek, 'base64');
    const dek = decryptBuffer(wrappedDek, masterKey, 'vault:dek');
    const verified = decryptBuffer(Buffer.from(meta.verifier, 'base64'), dek, 'vault:verify').toString('utf8');
    if (verified !== VERIFIER_SENTINEL) {
      dek.fill(0);
      throw new Error('Ana parola hatalı.');
    }
    return dek;
  } catch {
    throw new Error('Ana parola hatalı.');
  } finally {
    masterKey.fill(0);
  }
}

export function changeMasterPassword(currentPassword: string, newPassword: string): Buffer {
  const dek = unlockVaultWithPassword(currentPassword);
  const db = getDb();
  const newSalt = generateSalt(32);
  const newMasterKey = deriveKey(newPassword, newSalt, DEFAULT_KDF_PARAMS);
  try {
    const newWrappedDek = encryptBuffer(dek, newMasterKey, 'vault:dek');
    const upsert = db.prepare(`INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)`);
    db.exec('BEGIN');
    upsert.run('kdf_salt', newSalt.toString('base64'));
    upsert.run('kdf_params', JSON.stringify(DEFAULT_KDF_PARAMS));
    upsert.run('wrapped_dek', newWrappedDek.toString('base64'));
    upsert.run('password_changed_at', new Date().toISOString());
    db.exec('COMMIT');
    return dek;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    dek.fill(0);
    throw err;
  } finally {
    newMasterKey.fill(0);
  }
}

// --- Public UI Background Preview (non-sensitive aesthetic prefs for Lock Screen) ---

export function getPublicUiPreview(): {
  backgroundOpacity: number;
  backgroundBlur: number;
  cardOpacity: number;
  hasCustomBackground: boolean;
  customBackgroundVersion: number;
} {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM ui_prefs WHERE key = 'appearance'`).get() as { value: string } | undefined;
  const hasCustom = fs.existsSync(CUSTOM_BG_PATH);
  if (!row) {
    return {
      backgroundOpacity: DEFAULT_SETTINGS.backgroundOpacity,
      backgroundBlur: DEFAULT_SETTINGS.backgroundBlur,
      cardOpacity: DEFAULT_SETTINGS.cardOpacity,
      hasCustomBackground: hasCustom,
      customBackgroundVersion: 1,
    };
  }
  const parsed = JSON.parse(row.value);
  return {
    backgroundOpacity: parsed.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity,
    backgroundBlur: parsed.backgroundBlur ?? DEFAULT_SETTINGS.backgroundBlur,
    cardOpacity: parsed.cardOpacity ?? DEFAULT_SETTINGS.cardOpacity,
    hasCustomBackground: hasCustom,
    customBackgroundVersion: parsed.customBackgroundVersion ?? 1,
  };
}

function syncPublicUiPreview(settings: AppSettings): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO ui_prefs (key, value) VALUES ('appearance', ?)`).run(
    JSON.stringify({
      backgroundOpacity: settings.backgroundOpacity,
      backgroundBlur: settings.backgroundBlur,
      cardOpacity: settings.cardOpacity,
      customBackgroundVersion: settings.customBackgroundVersion,
    }),
  );
}

// --- Encrypted Settings ---

export function getSettings(dek: Buffer): AppSettings {
  const db = getDb();
  const row = db.prepare(`SELECT payload FROM encrypted_settings WHERE id = 'main'`).get() as
    | { payload: Uint8Array }
    | undefined;
  const hasCustomBackground = fs.existsSync(CUSTOM_BG_PATH);
  if (!row) {
    return { ...DEFAULT_SETTINGS, hasCustomBackground };
  }
  const saved = decryptJson<Partial<AppSettings>>(row.payload, dek, 'encrypted_settings:main');
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates, ...(saved.exchangeRates || {}) },
    hasCustomBackground,
  };
}

export function saveSettings(settings: AppSettings, dek: Buffer): AppSettings {
  const db = getDb();
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates, ...(settings.exchangeRates || {}) },
    hasCustomBackground: fs.existsSync(CUSTOM_BG_PATH),
  };
  const payload = encryptJson(merged, dek, 'encrypted_settings:main');
  db.prepare(`INSERT OR REPLACE INTO encrypted_settings (id, payload, updated_at) VALUES ('main', ?, ?)`).run(
    payload,
    new Date().toISOString(),
  );
  syncPublicUiPreview(merged);
  return merged;
}

// --- Generic Encrypted Table Helpers ---

function listTable<T>(table: string, dek: Buffer): T[] {
  const db = getDb();
  const rows = db.prepare(`SELECT id, payload FROM ${table} ORDER BY updated_at DESC`).all() as {
    id: string;
    payload: Uint8Array;
  }[];
  return rows.map((row) => decryptJson<T>(row.payload, dek, `${table}:${row.id}`));
}

function upsertRow<T extends { id: string; createdAt: string; updatedAt: string }>(
  table: string,
  item: T,
  dek: Buffer,
): T {
  const db = getDb();
  const payload = encryptJson(item, dek, `${table}:${item.id}`);
  db.prepare(`INSERT OR REPLACE INTO ${table} (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    item.id,
    payload,
    item.createdAt,
    item.updatedAt,
  );
  return item;
}

function deleteRow(table: string, id: string): boolean {
  const db = getDb();
  const res = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return Number(res.changes) > 0;
}

// --- Passwords ---
export const listPasswords = (dek: Buffer) => listTable<PasswordEntry>('passwords', dek);
export const savePassword = (entry: PasswordEntry, dek: Buffer) => upsertRow('passwords', entry, dek);
export const deletePassword = (id: string) => deleteRow('passwords', id);

// --- Subscriptions ---
export const listSubscriptions = (dek: Buffer) => listTable<SubscriptionEntry>('subscriptions', dek);
export const saveSubscription = (entry: SubscriptionEntry, dek: Buffer) => upsertRow('subscriptions', entry, dek);
export const deleteSubscription = (id: string) => deleteRow('subscriptions', id);

// --- Notes ---
export const listNotes = (dek: Buffer) => listTable<NoteEntry>('notes', dek);
export const saveNote = (entry: NoteEntry, dek: Buffer) => upsertRow('notes', entry, dek);
export const deleteNote = (id: string) => deleteRow('notes', id);

// --- Calendar Events ---
export const listEvents = (dek: Buffer) => listTable<CalendarEventEntry>('calendar_events', dek);
export const saveEvent = (entry: CalendarEventEntry, dek: Buffer) => upsertRow('calendar_events', entry, dek);
export const deleteEvent = (id: string) => deleteRow('calendar_events', id);

// --- Tracked Products (Deals & Wishlist) ---
export const listTrackedProducts = (dek: Buffer) => listTable<TrackedProduct>('tracked_products', dek);
export const saveTrackedProduct = (entry: TrackedProduct, dek: Buffer) => upsertRow('tracked_products', entry, dek);
export const deleteTrackedProduct = (id: string) => deleteRow('tracked_products', id);

// --- Freecash Offers ---
export const listFreecashOffers = (dek: Buffer) => listTable<FreecashOffer>('freecash_offers', dek);
export const saveFreecashOffer = (entry: FreecashOffer, dek: Buffer) => upsertRow('freecash_offers', entry, dek);
export const deleteFreecashOffer = (id: string) => deleteRow('freecash_offers', id);

// --- Client Vaults ---
export function listClients(dek: Buffer): ClientVault[] {
  const db = getDb();
  const clients = listTable<ClientVault>('clients', dek);
  const credCounts = new Map<string, number>();
  const noteCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const r of db.prepare(`SELECT client_id, COUNT(*) as c FROM client_credentials GROUP BY client_id`).all() as {
    client_id: string;
    c: number;
  }[]) {
    credCounts.set(r.client_id, Number(r.c));
  }
  for (const r of db.prepare(`SELECT client_id, COUNT(*) as c FROM client_notes GROUP BY client_id`).all() as {
    client_id: string;
    c: number;
  }[]) {
    noteCounts.set(r.client_id, Number(r.c));
  }
  for (const r of db.prepare(`SELECT client_id, COUNT(*) as c FROM client_files GROUP BY client_id`).all() as {
    client_id: string;
    c: number;
  }[]) {
    fileCounts.set(r.client_id, Number(r.c));
  }

  return clients.map((c) => ({
    ...c,
    credentialCount: credCounts.get(c.id) || 0,
    noteCount: noteCounts.get(c.id) || 0,
    fileCount: fileCounts.get(c.id) || 0,
  }));
}

export function getClient(id: string, dek: Buffer): ClientVault | null {
  const db = getDb();
  const row = db.prepare(`SELECT id, payload FROM clients WHERE id = ?`).get(id) as
    | { id: string; payload: Uint8Array }
    | undefined;
  if (!row) return null;
  return decryptJson<ClientVault>(row.payload, dek, `clients:${row.id}`);
}

export const saveClient = (entry: ClientVault, dek: Buffer) => upsertRow('clients', entry, dek);
export const deleteClient = (id: string) => deleteRow('clients', id);

// --- Client Credentials ---
export function listClientCredentials(clientId: string | null, dek: Buffer): ClientCredential[] {
  const db = getDb();
  const rows = (
    clientId
      ? db.prepare(`SELECT id, payload FROM client_credentials WHERE client_id = ? ORDER BY updated_at DESC`).all(clientId)
      : db.prepare(`SELECT id, payload FROM client_credentials ORDER BY updated_at DESC`).all()
  ) as { id: string; payload: Uint8Array }[];
  return rows.map((r) => decryptJson<ClientCredential>(r.payload, dek, `client_credentials:${r.id}`));
}

export function saveClientCredential(entry: ClientCredential, dek: Buffer): ClientCredential {
  const db = getDb();
  const payload = encryptJson(entry, dek, `client_credentials:${entry.id}`);
  db.prepare(
    `INSERT OR REPLACE INTO client_credentials (id, client_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(entry.id, entry.clientId, payload, entry.createdAt, entry.updatedAt);
  return entry;
}

export const deleteClientCredential = (id: string) => deleteRow('client_credentials', id);

// --- Client Notes ---
export function listClientNotes(clientId: string | null, dek: Buffer): ClientNote[] {
  const db = getDb();
  const rows = (
    clientId
      ? db.prepare(`SELECT id, payload FROM client_notes WHERE client_id = ? ORDER BY updated_at DESC`).all(clientId)
      : db.prepare(`SELECT id, payload FROM client_notes ORDER BY updated_at DESC`).all()
  ) as { id: string; payload: Uint8Array }[];
  return rows.map((r) => decryptJson<ClientNote>(r.payload, dek, `client_notes:${r.id}`));
}

export function saveClientNote(entry: ClientNote, dek: Buffer): ClientNote {
  const db = getDb();
  const payload = encryptJson(entry, dek, `client_notes:${entry.id}`);
  db.prepare(
    `INSERT OR REPLACE INTO client_notes (id, client_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(entry.id, entry.clientId, payload, entry.createdAt, entry.updatedAt);
  return entry;
}

export const deleteClientNote = (id: string) => deleteRow('client_notes', id);

// --- Client Encrypted Files ---
export function listClientFiles(clientId: string | null, dek: Buffer): ClientFileMeta[] {
  const db = getDb();
  const rows = (
    clientId
      ? db.prepare(`SELECT id, meta_payload FROM client_files WHERE client_id = ? ORDER BY created_at DESC`).all(clientId)
      : db.prepare(`SELECT id, meta_payload FROM client_files ORDER BY created_at DESC`).all()
  ) as { id: string; meta_payload: Uint8Array }[];
  return rows.map((r) => decryptJson<ClientFileMeta>(r.meta_payload, dek, `client_files:meta:${r.id}`));
}

export function saveClientFile(meta: ClientFileMeta, rawContent: Buffer, dek: Buffer): ClientFileMeta {
  const db = getDb();
  const metaPayload = encryptJson(meta, dek, `client_files:meta:${meta.id}`);
  const contentPayload = encryptBuffer(rawContent, dek, `client_files:content:${meta.id}`);
  db.prepare(
    `INSERT OR REPLACE INTO client_files (id, client_id, meta_payload, content_payload, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(meta.id, meta.clientId, metaPayload, contentPayload, meta.createdAt);
  return meta;
}

export function getClientFileWithContent(id: string, dek: Buffer): { meta: ClientFileMeta; content: Buffer } | null {
  const db = getDb();
  const row = db.prepare(`SELECT id, meta_payload, content_payload FROM client_files WHERE id = ?`).get(id) as
    | { id: string; meta_payload: Uint8Array; content_payload: Uint8Array }
    | undefined;
  if (!row) return null;
  const meta = decryptJson<ClientFileMeta>(row.meta_payload, dek, `client_files:meta:${row.id}`);
  const content = decryptBuffer(row.content_payload, dek, `client_files:content:${row.id}`);
  return { meta, content };
}

export const deleteClientFile = (id: string) => deleteRow('client_files', id);

// --- Full Snapshot Export / Restore ---

export interface FullVaultSnapshot {
  exportedAt: string;
  passwords: PasswordEntry[];
  subscriptions: SubscriptionEntry[];
  notes: NoteEntry[];
  events: CalendarEventEntry[];
  trackedProducts?: TrackedProduct[];
  freecashOffers?: FreecashOffer[];
  clients: ClientVault[];
  clientCredentials: ClientCredential[];
  clientNotes: ClientNote[];
  clientFiles: { meta: ClientFileMeta; contentBase64: string }[];
  settings: AppSettings;
}

export function exportFullVaultSnapshot(dek: Buffer): FullVaultSnapshot {
  const db = getDb();
  const fileRows = db.prepare(`SELECT id, meta_payload, content_payload FROM client_files`).all() as {
    id: string;
    meta_payload: Uint8Array;
    content_payload: Uint8Array;
  }[];
  const clientFiles = fileRows.map((row) => ({
    meta: decryptJson<ClientFileMeta>(row.meta_payload, dek, `client_files:meta:${row.id}`),
    contentBase64: decryptBuffer(row.content_payload, dek, `client_files:content:${row.id}`).toString('base64'),
  }));

  return {
    exportedAt: new Date().toISOString(),
    passwords: listPasswords(dek),
    subscriptions: listSubscriptions(dek),
    notes: listNotes(dek),
    events: listEvents(dek),
    trackedProducts: listTrackedProducts(dek),
    freecashOffers: listFreecashOffers(dek),
    clients: listTable<ClientVault>('clients', dek),
    clientCredentials: listClientCredentials(null, dek),
    clientNotes: listClientNotes(null, dek),
    clientFiles,
    settings: getSettings(dek),
  };
}

export function restoreVaultSnapshot(snapshot: FullVaultSnapshot, mode: 'merge' | 'replace', dek: Buffer): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    if (mode === 'replace') {
      db.exec(`
        DELETE FROM passwords;
        DELETE FROM subscriptions;
        DELETE FROM notes;
        DELETE FROM calendar_events;
        DELETE FROM tracked_products;
        DELETE FROM freecash_offers;
        DELETE FROM client_files;
        DELETE FROM client_notes;
        DELETE FROM client_credentials;
        DELETE FROM clients;
      `);
    }
    for (const p of snapshot.passwords || []) savePassword(p, dek);
    for (const s of snapshot.subscriptions || []) saveSubscription(s, dek);
    for (const n of snapshot.notes || []) saveNote(n, dek);
    for (const e of snapshot.events || []) saveEvent(e, dek);
    for (const tp of snapshot.trackedProducts || []) saveTrackedProduct(tp, dek);
    for (const fc of snapshot.freecashOffers || []) saveFreecashOffer(fc, dek);
    for (const c of snapshot.clients || []) {
      const { credentialCount, noteCount, fileCount, ...cleanClient } = c;
      saveClient(cleanClient, dek);
    }
    for (const cc of snapshot.clientCredentials || []) saveClientCredential(cc, dek);
    for (const cn of snapshot.clientNotes || []) saveClientNote(cn, dek);
    for (const cf of snapshot.clientFiles || []) {
      saveClientFile(cf.meta, Buffer.from(cf.contentBase64, 'base64'), dek);
    }
    if (snapshot.settings && mode === 'replace') {
      saveSettings(snapshot.settings, dek);
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

