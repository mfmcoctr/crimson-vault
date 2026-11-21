import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import * as zip from '@zip.js/zip.js';
import { newId } from '../crypto.ts';
import type {
  ArchivePreviewResponse,
  ClientCredentialType,
  ParsedImportCredential,
  ParsedImportNote,
} from '../../src/types.ts';
import type { StagedImportData, StagedImportFile } from '../session.ts';

// Ensure zip.js runs cleanly without web workers in Node.js
zip.configure({ useWebWorkers: false });

export class ZipArchiveError extends Error {
  code: 'ZIP_PASSWORD_REQUIRED' | 'ZIP_WRONG_PASSWORD' | 'ARCHIVE_INVALID';
  constructor(code: 'ZIP_PASSWORD_REQUIRED' | 'ZIP_WRONG_PASSWORD' | 'ARCHIVE_INVALID', message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_ARCHIVE_FILES = 500;
const MAX_SINGLE_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.env',
  '.json',
  '.csv',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.xml',
  '.sql',
  '.pem',
  '.pub',
  '.key',
  '.crt',
  '.cer',
  '.ppk',
  '.ovpn',
  '.htaccess',
  '.sh',
  '.ps1',
  '.bat',
  '.log',
]);

function inferCredentialType(text: string, port?: string): ClientCredentialType {
  const s = `${text} ${port || ''}`.toLowerCase();
  if (/(cpanel|plesk|whm|hosting|directadmin|cyberpanel|hostinger|natro|veridyen|guzel|turhost|hetzner|digitalocean|aws|vercel|netlify)/.test(s)) {
    return 'hosting';
  }
  if (/(sftp|ftp|filezilla)/.test(s) || port === '21') return 'ftp';
  if (/(ssh|root@|terminal|putty|bastion)/.test(s) || port === '22') return 'ssh';
  if (/(mysql|postgres|pgsql|mongodb|mongo|redis|mariadb|phpmyadmin|database|veritaban|db_)/.test(s) || ['3306', '5432', '27017', '6379'].includes(port || '')) {
    return 'database';
  }
  if (/(smtp|imap|pop3|mailgun|sendgrid|ses|eposta|e-posta|webmail|mail_)/.test(s) || ['587', '465', '993'].includes(port || '')) {
    return 'smtp';
  }
  if (/(wp-admin|wp-login|admin|yonetim|yönetim|panel|dashboard|cms|strapi|ghost|shopify)/.test(s)) {
    return 'admin';
  }
  if (/(cloudflare|godaddy|namecheap|domain|registrar|dns|nic\.tr|trabis)/.test(s)) {
    return 'domain';
  }
  if (/(api|token|secret|stripe|iyzico|paytr|openai|gemini|oauth|webhook|sdk)/.test(s)) {
    return 'api';
  }
  return 'other';
}

function classifyFileCategory(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  if (['.pem', '.ppk', '.pub', '.key'].includes(ext) || lower.includes('id_rsa') || lower.includes('id_ed25519')) {
    return 'ssh-key';
  }
  if (['.crt', '.cer', '.pfx', '.p12', '.csr', '.ca-bundle'].includes(ext)) {
    return 'ssl-cert';
  }
  if (lower.startsWith('.env') || ext === '.env' || lower.includes('.env.')) {
    return 'env';
  }
  if (['.conf', '.ini', '.yml', '.yaml', '.toml', '.xml', '.htaccess', '.ovpn', '.json', '.sql'].includes(ext)) {
    return 'config';
  }
  return 'archive-file';
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename.toLowerCase());
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.env': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.pem': 'application/x-pem-file',
    '.key': 'application/pkcs8',
    '.crt': 'application/x-x509-ca-cert',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.sql': 'application/sql',
  };
  return map[ext] || 'application/octet-stream';
}

function isPreviewableText(filename: string, buf: Buffer): boolean {
  const lower = path.basename(filename).toLowerCase();
  const ext = path.extname(lower);
  if (buf.length > 512 * 1024) return false;
  if (TEXT_EXTENSIONS.has(ext) || lower.startsWith('.env') || lower.includes('id_rsa') || lower.includes('id_ed25519')) {
    return !buf.subarray(0, 1024).includes(0);
  }
  return false;
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_');
}

function pickField(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const val = record[alias];
    if (val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function extractDomainFromUrl(raw: string): string {
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.hostname && u.hostname.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) {
      return u.hostname.replace(/^www\./i, '');
    }
  } catch {
    // ignore
  }
  return '';
}

function parseCsvCredentials(content: string, sourceFile: string): ParsedImportCredential[] {
  const rows = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  }) as Record<string, string>[];

  const results: ParsedImportCredential[] = [];
  for (const rawRow of rows) {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      row[normalizeHeaderKey(k)] = v == null ? '' : String(v);
    }

    const title = pickField(row, ['name', 'title', 'baslik', 'site', 'service', 'servis', 'label', 'hesap', 'account']);
    const hostOrUrl = pickField(row, [
      'url',
      'login_uri',
      'website',
      'host',
      'hostname',
      'domain',
      'adres',
      'sunucu',
      'server',
      'uri',
    ]);
    const username = pickField(row, [
      'username',
      'login_username',
      'user',
      'email',
      'e_posta',
      'eposta',
      'kullanici',
      'kullanici_adi',
      'login',
    ]);
    const password = pickField(row, [
      'password',
      'login_password',
      'pass',
      'sifre',
      'parola',
      'secret',
      'token',
      'api_key',
    ]);
    const port = pickField(row, ['port']);
    const rawType = pickField(row, ['type', 'tur', 'category', 'kategori', 'credential_type', 'folder']);
    const notes = pickField(row, ['note', 'notes', 'not', 'notlar', 'description', 'aciklama', 'extra', 'comment']);
    const rawTags = pickField(row, ['tags', 'etiketler', 'folder']);

    if (!title && !hostOrUrl && !username && !password) continue;

    const computedTitle = title || extractDomainFromUrl(hostOrUrl) || username || path.basename(sourceFile);
    const credentialType = inferCredentialType(`${rawType} ${computedTitle} ${hostOrUrl}`, port);

    results.push({
      tempId: newId(),
      title: computedTitle,
      credentialType,
      hostOrUrl,
      username,
      password,
      port,
      notes,
      tags: rawTags
        ? rawTags
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      sourceFile,
    });
  }
  return results;
}

function parseJsonCredentials(content: string, sourceFile: string): { credentials: ParsedImportCredential[]; consumed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { credentials: [], consumed: false };
  }

  const results: ParsedImportCredential[] = [];

  // Bitwarden JSON export: { items: [{ name, notes, login: { username, password, uris: [{ uri }] } }] }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      for (const item of obj.items as Record<string, unknown>[]) {
        const login = item.login as Record<string, unknown> | undefined;
        if (login && (login.username || login.password)) {
          const uris = Array.isArray(login.uris) ? (login.uris as { uri?: string }[]) : [];
          const uri = uris[0]?.uri || '';
          const title = String(item.name || extractDomainFromUrl(uri) || 'Giriş Bilgisi');
          results.push({
            tempId: newId(),
            title,
            credentialType: inferCredentialType(`${title} ${uri}`),
            hostOrUrl: uri,
            username: String(login.username || ''),
            password: String(login.password || ''),
            port: '',
            notes: String(item.notes || ''),
            tags: ['bitwarden'],
            sourceFile,
          });
        }
      }
      if (results.length > 0) return { credentials: results, consumed: true };
    }

    // PersonVault / generic object wrapper { credentials: [...] } or { passwords: [...] }
    const arr = Array.isArray(obj.credentials)
      ? obj.credentials
      : Array.isArray(obj.passwords)
        ? obj.passwords
        : null;
    if (arr) {
      parsed = arr;
    }
  }

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as Record<string, unknown>;
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string' || typeof v === 'number') {
          norm[normalizeHeaderKey(k)] = String(v);
        }
      }
      const password = pickField(norm, ['password', 'pass', 'sifre', 'parola', 'secret', 'token', 'api_key']);
      const username = pickField(norm, ['username', 'user', 'email', 'kullanici', 'kullanici_adi', 'login']);
      const hostOrUrl = pickField(norm, ['host_or_url', 'url', 'website', 'host', 'domain', 'adres', 'server']);
      const title = pickField(norm, ['title', 'name', 'baslik', 'site', 'service']);
      if (!password && !username) continue;

      const port = pickField(norm, ['port']);
      const rawType = pickField(norm, ['credential_type', 'type', 'tur', 'category']);
      const notes = pickField(norm, ['notes', 'note', 'not', 'description']);
      const computedTitle = title || extractDomainFromUrl(hostOrUrl) || username || 'Kayıt';

      results.push({
        tempId: newId(),
        title: computedTitle,
        credentialType: inferCredentialType(`${rawType} ${computedTitle} ${hostOrUrl}`, port),
        hostOrUrl,
        username,
        password,
        port,
        notes,
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        sourceFile,
      });
    }
    if (results.length > 0) return { credentials: results, consumed: true };
  }

  return { credentials: [], consumed: false };
}

function parseEnvContent(content: string, sourceFile: string): { credentials: ParsedImportCredential[]; note: ParsedImportNote } {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  const credentials: ParsedImportCredential[] = [];
  const baseName = path.basename(sourceFile);

  // Extract Database credential if present
  const dbPass = vars.DB_PASSWORD || vars.DB_PASS || vars.MYSQL_PASSWORD || vars.POSTGRES_PASSWORD || vars.DATABASE_URL;
  const dbUser = vars.DB_USERNAME || vars.DB_USER || vars.MYSQL_USER || vars.POSTGRES_USER || '';
  const dbHost = vars.DB_HOST || vars.MYSQL_HOST || vars.POSTGRES_HOST || '';
  if (dbPass || (dbHost && dbUser)) {
    credentials.push({
      tempId: newId(),
      title: `Veritabanı (${vars.DB_DATABASE || vars.DB_NAME || baseName})`,
      credentialType: 'database',
      hostOrUrl: dbHost || vars.DATABASE_URL || '',
      username: dbUser,
      password: dbPass || '',
      port: vars.DB_PORT || '',
      notes: vars.DB_DATABASE ? `Database: ${vars.DB_DATABASE}` : `${sourceFile} dosyasından otomatik çıkarıldı.`,
      tags: ['env', 'database'],
      sourceFile,
    });
  }

  // Extract SMTP / Mail credential if present
  const mailPass = vars.MAIL_PASSWORD || vars.SMTP_PASSWORD || vars.SMTP_PASS;
  const mailUser = vars.MAIL_USERNAME || vars.SMTP_USER || vars.SMTP_USERNAME || '';
  const mailHost = vars.MAIL_HOST || vars.SMTP_HOST || '';
  if (mailPass || (mailHost && mailUser)) {
    credentials.push({
      tempId: newId(),
      title: `SMTP / E-posta (${baseName})`,
      credentialType: 'smtp',
      hostOrUrl: mailHost,
      username: mailUser,
      password: mailPass || '',
      port: vars.MAIL_PORT || vars.SMTP_PORT || '',
      notes: vars.MAIL_FROM_ADDRESS ? `From: ${vars.MAIL_FROM_ADDRESS}` : `${sourceFile} dosyasından çıkarıldı.`,
      tags: ['env', 'smtp'],
      sourceFile,
    });
  }

  // Extract FTP/SFTP credential if present
  const ftpPass = vars.FTP_PASSWORD || vars.FTP_PASS || vars.SFTP_PASSWORD;
  const ftpUser = vars.FTP_USERNAME || vars.FTP_USER || vars.SFTP_USER || '';
  const ftpHost = vars.FTP_HOST || vars.SFTP_HOST || '';
  if (ftpPass || (ftpHost && ftpUser)) {
    credentials.push({
      tempId: newId(),
      title: `FTP / SFTP (${baseName})`,
      credentialType: 'ftp',
      hostOrUrl: ftpHost,
      username: ftpUser,
      password: ftpPass || '',
      port: vars.FTP_PORT || vars.SFTP_PORT || '',
      notes: `${sourceFile} dosyasından çıkarıldı.`,
      tags: ['env', 'ftp'],
      sourceFile,
    });
  }

  // Extract standalone API keys / Secrets
  for (const [k, v] of Object.entries(vars)) {
    if (!v) continue;
    if (/(API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY|JWT_SECRET|STRIPE_SECRET|WEBHOOK_SECRET)/i.test(k)) {
      credentials.push({
        tempId: newId(),
        title: k,
        credentialType: 'api',
        hostOrUrl: vars.APP_URL || vars.SITE_URL || vars.NEXT_PUBLIC_APP_URL || '',
        username: k,
        password: v,
        port: '',
        notes: `${sourceFile} dosyasındaki ortam değişkeni`,
        tags: ['env', 'api-key'],
        sourceFile,
      });
    }
  }

  return {
    credentials,
    note: {
      tempId: newId(),
      title: `${sourceFile} (Ortam Değişkenleri)`,
      content,
      noteType: 'env',
      sourceFile,
    },
  };
}

function parseTextCredentialsAndNote(
  content: string,
  sourceFile: string,
): { credentials: ParsedImportCredential[]; note: ParsedImportNote } {
  const credentials: ParsedImportCredential[] = [];
  // Split into blocks separated by blank lines or dashed dividers
  const blocks = content.split(/\n\s*\n|\n-{3,}\n|\n={3,}\n/);

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    let title = '';
    let hostOrUrl = '';
    let username = '';
    let password = '';
    let port = '';
    const extraNotes: string[] = [];

    for (const line of lines) {
      const m = line.match(/^([^:]{2,32}):\s*(.+)$/);
      if (!m) {
        if (!title && line.length < 80) title = line.replace(/^#+\s*/, '');
        else extraNotes.push(line);
        continue;
      }
      const key = normalizeHeaderKey(m[1]);
      const val = m[2].trim();
      if (['title', 'baslik', 'service', 'servis', 'site', 'hesap', 'name', 'panel'].includes(key)) {
        title = val;
      } else if (['url', 'website', 'host', 'hostname', 'domain', 'adres', 'server', 'sunucu', 'ip'].includes(key)) {
        hostOrUrl = val;
      } else if (['user', 'username', 'kullanici', 'kullanici_adi', 'email', 'e_posta', 'eposta', 'login'].includes(key)) {
        username = val;
      } else if (['pass', 'password', 'sifre', 'parola', 'secret', 'token', 'key'].includes(key)) {
        password = val;
      } else if (key === 'port') {
        port = val;
      } else {
        extraNotes.push(line);
      }
    }

    if (password && (username || hostOrUrl || title)) {
      const computedTitle = title || extractDomainFromUrl(hostOrUrl) || path.basename(sourceFile, path.extname(sourceFile));
      credentials.push({
        tempId: newId(),
        title: computedTitle,
        credentialType: inferCredentialType(`${computedTitle} ${hostOrUrl} ${extraNotes.join(' ')}`, port),
        hostOrUrl,
        username,
        password,
        port,
        notes: extraNotes.join('\n'),
        tags: ['metin-ice-aktarim'],
        sourceFile,
      });
    }
  }

  const ext = path.extname(sourceFile).toLowerCase();
  return {
    credentials,
    note: {
      tempId: newId(),
      title: path.basename(sourceFile),
      content,
      noteType: ext === '.md' ? 'markdown' : 'text',
      sourceFile,
    },
  };
}

async function extractZipEntries(
  buffer: Buffer,
  zipPassword?: string,
): Promise<{ entries: { path: string; buffer: Buffer }[]; wasEncryptedZip: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  let reader: zip.ZipReader<Uint8Array> | null = null;
  try {
    reader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(buffer)));
    const zipEntries = await reader.getEntries();

    const fileEntries = zipEntries.filter((e) => {
      if (e.directory) return false;
      const fn = e.filename.replace(/\\/g, '/');
      if (fn.startsWith('__MACOSX/') || fn.includes('/__MACOSX/')) return false;
      const base = path.posix.basename(fn);
      if (base === '.DS_Store' || base === 'Thumbs.db') return false;
      return true;
    });

    if (fileEntries.length > MAX_ARCHIVE_FILES) {
      throw new ZipArchiveError('ARCHIVE_INVALID', `Arşiv çok fazla dosya içeriyor (maksimum ${MAX_ARCHIVE_FILES}).`);
    }

    const hasEncrypted = fileEntries.some((e) => e.encrypted);
    if (hasEncrypted && !zipPassword) {
      throw new ZipArchiveError(
        'ZIP_PASSWORD_REQUIRED',
        'Bu ZIP arşivi parola korumalı. İçeriğini çözmek için lütfen ZIP parolasını girin.',
      );
    }

    const extracted: { path: string; buffer: Buffer }[] = [];
    for (const entry of fileEntries) {
      if (entry.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
        warnings.push(`"${entry.filename}" 25MB limitini aştığı için atlandı.`);
        continue;
      }
      try {
        if (entry.directory || !('getData' in entry) || !entry.getData) continue;
        const data = await entry.getData(new zip.Uint8ArrayWriter(), {
          password: zipPassword || undefined,
        });
        // Sanitize zip-slip paths
        const safeRelPath = entry.filename
          .replace(/\\/g, '/')
          .split('/')
          .filter((seg) => seg && seg !== '.' && seg !== '..')
          .join('/');
        if (!safeRelPath) continue;
        extracted.push({ path: safeRelPath, buffer: Buffer.from(data) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (hasEncrypted || /password|invalid|decrypt|signature|crc/i.test(msg)) {
          throw new ZipArchiveError(
            'ZIP_WRONG_PASSWORD',
            'ZIP parolası hatalı veya şifre çözme başarısız. Lütfen parolayı kontrol edin.',
          );
        }
        warnings.push(`"${entry.filename}" okunamadı: ${msg}`);
      }
    }

    return { entries: extracted, wasEncryptedZip: hasEncrypted, warnings };
  } catch (err) {
    if (err instanceof ZipArchiveError) throw err;
    throw new ZipArchiveError(
      'ARCHIVE_INVALID',
      `ZIP dosyası açılamadı: ${err instanceof Error ? err.message : 'Geçersiz arşiv'}`,
    );
  } finally {
    if (reader) {
      await reader.close().catch(() => {});
    }
  }
}

export async function parseUploadedArchiveOrFiles(
  uploads: { originalname: string; buffer: Buffer }[],
  zipPassword?: string,
): Promise<{ preview: ArchivePreviewResponse; staged: StagedImportData }> {
  const credentials: ParsedImportCredential[] = [];
  const notes: ParsedImportNote[] = [];
  const files: StagedImportFile[] = [];
  const warnings: string[] = [];
  let wasEncryptedZip = false;

  const flatEntries: { relPath: string; buffer: Buffer }[] = [];

  for (const upload of uploads) {
    const ext = path.extname(upload.originalname).toLowerCase();
    // Also detect ZIP magic header PK\x03\x04
    const isZip =
      ext === '.zip' ||
      (upload.buffer.length >= 4 &&
        upload.buffer[0] === 0x50 &&
        upload.buffer[1] === 0x4b &&
        (upload.buffer[2] === 0x03 || upload.buffer[2] === 0x05));

    if (isZip) {
      const res = await extractZipEntries(upload.buffer, zipPassword);
      if (res.wasEncryptedZip) wasEncryptedZip = true;
      warnings.push(...res.warnings);
      for (const e of res.entries) {
        flatEntries.push({ relPath: e.path, buffer: e.buffer });
      }
    } else {
      flatEntries.push({ relPath: path.basename(upload.originalname), buffer: upload.buffer });
    }
  }

  for (const item of flatEntries) {
    const lowerBase = path.basename(item.relPath).toLowerCase();
    const ext = path.extname(lowerBase);
    const previewable = isPreviewableText(item.relPath, item.buffer);

    if (ext === '.csv') {
      try {
        const text = item.buffer.toString('utf8');
        const parsedCreds = parseCsvCredentials(text, item.relPath);
        if (parsedCreds.length > 0) {
          credentials.push(...parsedCreds);
        } else {
          warnings.push(`"${item.relPath}" içinde şifre sütunu bulunamadı; şifreli dosya olarak eklendi.`);
          files.push(makeStagedFile(item.relPath, item.buffer, previewable));
        }
      } catch {
        warnings.push(`"${item.relPath}" CSV olarak ayrıştırılamadı; şifreli dosya olarak eklendi.`);
        files.push(makeStagedFile(item.relPath, item.buffer, previewable));
      }
      continue;
    }

    if (ext === '.json') {
      const text = item.buffer.toString('utf8');
      const jsonRes = parseJsonCredentials(text, item.relPath);
      if (jsonRes.consumed) {
        credentials.push(...jsonRes.credentials);
      } else {
        files.push(makeStagedFile(item.relPath, item.buffer, previewable));
      }
      continue;
    }

    if (lowerBase === '.env' || lowerBase.startsWith('.env.') || ext === '.env') {
      const text = item.buffer.toString('utf8');
      const envRes = parseEnvContent(text, item.relPath);
      credentials.push(...envRes.credentials);
      notes.push(envRes.note);
      files.push(makeStagedFile(item.relPath, item.buffer, true));
      continue;
    }

    if (ext === '.txt' || ext === '.md') {
      const text = item.buffer.toString('utf8');
      const txtRes = parseTextCredentialsAndNote(text, item.relPath);
      credentials.push(...txtRes.credentials);
      notes.push(txtRes.note);
      continue;
    }

    // Security keys, SSL certs, configs, binaries -> Encrypted Files!
    files.push(makeStagedFile(item.relPath, item.buffer, previewable));
  }

  // Suggest client name & domain from uploaded filename and extracted credentials
  const primaryFilename = uploads[0]?.originalname || 'Yeni Müşteri';
  const cleanedName = path
    .basename(primaryFilename, path.extname(primaryFilename))
    .replace(/[-_]+/g, ' ')
    .replace(/\b(passwords|sifreler|backup|yedek|vault|export|archive|arsiv|credentials)\b/gi, '')
    .trim();

  let detectedDomain = '';
  for (const c of credentials) {
    const dom = extractDomainFromUrl(c.hostOrUrl);
    if (dom) {
      detectedDomain = dom;
      break;
    }
  }

  const stagingId = newId();
  const staged: StagedImportData = {
    stagingId,
    createdAt: Date.now(),
    credentials,
    notes,
    files,
  };

  const preview: ArchivePreviewResponse = {
    stagingId,
    suggestedClientName: cleanedName || detectedDomain || 'Yeni Müşteri',
    detectedDomain,
    archiveFilename: primaryFilename,
    wasEncryptedZip,
    credentials,
    notes,
    files: files.map(({ buffer: _b, ...meta }) => meta),
    warnings,
  };

  return { preview, staged };
}

function makeStagedFile(relPath: string, buffer: Buffer, previewable: boolean): StagedImportFile {
  return {
    tempId: newId(),
    filename: relPath,
    mimeType: guessMimeType(relPath),
    sizeBytes: buffer.length,
    category: classifyFileCategory(relPath),
    isTextPreviewable: previewable,
    textPreview: previewable ? buffer.toString('utf8').slice(0, 4000) : undefined,
    buffer,
  };
}

export async function buildEncryptedClientZip(
  clientName: string,
  credentials: unknown[],
  notes: { title: string; content: string; noteType: string }[],
  files: { filename: string; content: Buffer }[],
  zipPassword?: string,
): Promise<Buffer> {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
    password: zipPassword || undefined,
    encryptionStrength: zipPassword ? 3 : undefined, // AES-256 when password set!
  });

  await writer.add(
    'credentials.json',
    new zip.TextReader(JSON.stringify({ client: clientName, exportedAt: new Date().toISOString(), credentials }, null, 2)),
  );

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const safeTitle = n.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || `note_${i + 1}`;
    const ext = n.noteType === 'env' ? '.env' : n.noteType === 'markdown' ? '.md' : '.txt';
    const fname = safeTitle.endsWith(ext) ? `notes/${safeTitle}` : `notes/${safeTitle}${ext}`;
    await writer.add(fname, new zip.TextReader(n.content));
  }

  for (const f of files) {
    const safePath = f.filename.replace(/^\/+/, '');
    await writer.add(`files/${safePath}`, new zip.Uint8ArrayReader(new Uint8Array(f.content)));
  }

  const bytes = await writer.close();
  return Buffer.from(bytes);
}
