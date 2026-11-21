import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as zip from '@zip.js/zip.js';
import { resolveSafeFolderImage, scanImageFolder } from '../routes/settings.ts';
import {
  createEncryptedBackup,
  decryptBuffer,
  decryptEncryptedBackup,
  deriveKey,
  encryptBuffer,
  generateDek,
  generateSalt,
  newId,
} from '../crypto.ts';
import {
  changeMasterPassword,
  getClientFileWithContent,
  getDb,
  initializeVault,
  isVaultInitialized,
  listPasswords,
  resetDbForTest,
  saveClient,
  saveClientFile,
  savePassword,
  unlockVaultWithPassword,
} from '../db.ts';
import { ZipArchiveError, buildEncryptedClientZip, parseUploadedArchiveOrFiles } from '../parsers/archiveParser.ts';

zip.configure({ useWebWorkers: false });

test('AES-256-GCM encrypt/decrypt roundtrip and AAD tamper detection', () => {
  const key = generateDek();
  const secret = Buffer.from('SuperSecretPassword!2026', 'utf8');
  const encrypted = encryptBuffer(secret, key, 'passwords:row-1');
  assert.notEqual(encrypted.toString('utf8').includes('SuperSecret'), true);

  const decrypted = decryptBuffer(encrypted, key, 'passwords:row-1');
  assert.equal(decrypted.toString('utf8'), 'SuperSecretPassword!2026');

  // Swapping AAD must fail authentication
  assert.throws(() => decryptBuffer(encrypted, key, 'passwords:row-2'));
});

test('Encrypted .pvault backup export and restore with password validation', () => {
  const sample = { passwords: [{ id: '1', title: 'Bank', password: 'secret' }] };
  const env = createEncryptedBackup(sample, 'YedekParola123!');
  assert.equal(env.format, 'personvault-backup');
  assert.equal(env.payload.includes('Bank'), false);

  const restored = decryptEncryptedBackup<typeof sample>(env, 'YedekParola123!');
  assert.deepEqual(restored, sample);

  assert.throws(() => decryptEncryptedBackup(env, 'YanlisParola'));
});

test('Encrypted SQLite vault stores zero plaintext secrets and supports master password rotation', () => {
  const memDb = new DatabaseSync(':memory:');
  resetDbForTest(memDb);
  // Initialize schema on memory DB
  getDb(':memory:');
  // Re-bind via resetDbForTest after creating schema directly
  const seeded = getDb(':memory:');
  resetDbForTest(seeded);

  assert.equal(isVaultInitialized(), false);
  const dek = initializeVault('AnaParola!2026');
  assert.equal(isVaultInitialized(), true);

  // Wrong password rejected
  assert.throws(() => unlockVaultWithPassword('YanlisParola'));

  // Save a password and verify raw SQLite blob does NOT contain plaintext
  const now = new Date().toISOString();
  savePassword(
    {
      id: newId(),
      title: 'GitHub',
      username: 'dev@example.com',
      password: 'UltraSecretToken_998877',
      url: 'https://github.com',
      category: 'Geliştirme',
      tags: ['git'],
      notes: '2FA aktif',
      favorite: true,
      customFields: [],
      createdAt: now,
      updatedAt: now,
    },
    dek,
  );

  const rawRow = seeded.prepare('SELECT payload FROM passwords LIMIT 1').get() as { payload: Uint8Array };
  const rawStr = Buffer.from(rawRow.payload).toString('utf8');
  assert.equal(rawStr.includes('UltraSecretToken_998877'), false);
  assert.equal(rawStr.includes('GitHub'), false);

  // Save an encrypted client SSH key file and verify decryption
  const clientId = newId();
  saveClient(
    {
      id: clientId,
      name: 'Test Müşteri',
      company: 'Test A.Ş.',
      domain: 'testmusteri.com',
      extraDomains: [],
      contactEmail: '',
      contactPhone: '',
      status: 'active',
      tags: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
    dek,
  );
  const keyFileId = newId();
  saveClientFile(
    {
      id: keyFileId,
      clientId,
      filename: 'id_ed25519.pem',
      mimeType: 'application/x-pem-file',
      sizeBytes: 36,
      category: 'ssh-key',
      isTextPreviewable: true,
      notes: '',
      createdAt: now,
    },
    Buffer.from('-----BEGIN PRIVATE KEY-----\nSECRET\n'),
    dek,
  );

  // Rotate Master Password and verify DEK still decrypts all data!
  const rotatedDek = changeMasterPassword('AnaParola!2026', 'YeniGucluParola#2027');
  assert.throws(() => unlockVaultWithPassword('AnaParola!2026'));
  const reopenedDek = unlockVaultWithPassword('YeniGucluParola#2027');

  const loadedPasswords = listPasswords(reopenedDek);
  assert.equal(loadedPasswords.length, 1);
  assert.equal(loadedPasswords[0].password, 'UltraSecretToken_998877');

  const loadedFile = getClientFileWithContent(keyFileId, reopenedDek);
  assert.ok(loadedFile);
  assert.equal(loadedFile.content.toString('utf8'), '-----BEGIN PRIVATE KEY-----\nSECRET\n');

  dek.fill(0);
  rotatedDek.fill(0);
  reopenedDek.fill(0);
});

test('Password-protected AES-256 ZIP archive parsing extracts CSV, .env, .txt and SSH keys', async () => {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
    password: 'ZipSecret!42',
    encryptionStrength: 3,
  });

  await writer.add(
    'passwords.csv',
    new zip.TextReader(
      'name,url,username,password,note\n"WP Admin",https://ornek-site.com/wp-admin,admin,WpPass!99,"Ana panel"\n',
    ),
  );
  await writer.add(
    '.env.production',
    new zip.TextReader('APP_URL=https://ornek-site.com\nDB_HOST=10.0.0.5\nDB_USERNAME=prod_db\nDB_PASSWORD=DbSecret#123\nSTRIPE_SECRET_KEY=sk_live_abc123\n'),
  );
  await writer.add(
    'server_key.pem',
    new zip.TextReader('-----BEGIN OPENSSH PRIVATE KEY-----\nTESTKEYDATA\n-----END OPENSSH PRIVATE KEY-----'),
  );
  const zipBytes = Buffer.from(await writer.close());

  // 1. Missing password must return ZIP_PASSWORD_REQUIRED
  await assert.rejects(
    () => parseUploadedArchiveOrFiles([{ originalname: 'ornek-site-archive.zip', buffer: zipBytes }]),
    (err: unknown) => err instanceof ZipArchiveError && err.code === 'ZIP_PASSWORD_REQUIRED',
  );

  // 2. Wrong password must return ZIP_WRONG_PASSWORD
  await assert.rejects(
    () => parseUploadedArchiveOrFiles([{ originalname: 'ornek-site-archive.zip', buffer: zipBytes }], 'WrongPwd'),
    (err: unknown) => err instanceof ZipArchiveError && err.code === 'ZIP_WRONG_PASSWORD',
  );

  // 3. Correct password decrypts & classifies everything
  const { preview } = await parseUploadedArchiveOrFiles(
    [{ originalname: 'ornek-site-archive.zip', buffer: zipBytes }],
    'ZipSecret!42',
  );
  assert.equal(preview.wasEncryptedZip, true);
  assert.equal(preview.detectedDomain, 'ornek-site.com');
  assert.ok(preview.credentials.length >= 3); // WP Admin + DB + STRIPE_SECRET_KEY
  assert.equal(preview.notes.length, 1); // .env.production note
  assert.ok(preview.files.some((f) => f.filename === 'server_key.pem' && f.category === 'ssh-key'));

  // 4. Re-exporting client vault into AES-256 ZIP also succeeds
  const exportedZip = await buildEncryptedClientZip(
    'Örnek Site',
    preview.credentials,
    preview.notes,
    [{ filename: 'server_key.pem', content: Buffer.from('TEST') }],
    'ExportPwd!99',
  );
  assert.ok(exportedZip.length > 100);
});

test('Local folder background slideshow scanner filters images and blocks path traversal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-slides-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'one.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'two.webp'), Buffer.from('RIFF'));
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not an image');

    const withSub = scanImageFolder(tmpDir, true);
    assert.equal(withSub.images.length, 2);

    const rootOnly = scanImageFolder(tmpDir, false);
    assert.equal(rootOnly.images.length, 1);

    const validResolved = resolveSafeFolderImage(tmpDir, withSub.images[0].id);
    assert.ok(validResolved);
    assert.equal(validResolved.mimeType, 'image/png');

    // Path traversal attempt must return null
    const traversalId = Buffer.from('../secret.png', 'utf8').toString('base64url');
    assert.equal(resolveSafeFolderImage(tmpDir, traversalId), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

