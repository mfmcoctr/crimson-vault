import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import {
  createEncryptedBackup,
  decryptEncryptedBackup,
  type EncryptedBackupEnvelope,
} from '../crypto.ts';
import {
  CUSTOM_BG_META_PATH,
  CUSTOM_BG_PATH,
  DATA_DIR,
  exportFullVaultSnapshot,
  getSettings,
  restoreVaultSnapshot,
  saveSettings,
  type FullVaultSnapshot,
} from '../db.ts';
import { getActiveDek, requireUnlocked } from '../session.ts';
import type { AppSettings, MobileAccessInfo } from '../../src/types.ts';

const execFileAsync = promisify(execFile);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Public endpoint to serve custom background image (visual asset only, not secret data)
router.get('/background/custom', (_req, res) => {
  if (!fs.existsSync(CUSTOM_BG_PATH)) {
    res.status(404).end();
    return;
  }
  let mime = 'image/jpeg';
  if (fs.existsSync(CUSTOM_BG_META_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(CUSTOM_BG_META_PATH, 'utf8'));
      if (meta.mimeType) mime = meta.mimeType;
    } catch {
      // ignore
    }
  }
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-cache');
  res.send(fs.readFileSync(CUSTOM_BG_PATH));
});

// Protected routes below
router.use(requireUnlocked);

router.get('/', (_req, res) => {
  res.json(getSettings(getActiveDek()));
});

router.put('/', (req, res) => {
  const dek = getActiveDek();
  const current = getSettings(dek);
  const body = req.body as Partial<AppSettings>;
  const updated = saveSettings(
    {
      ...current,
      ...body,
      exchangeRates: {
        ...current.exchangeRates,
        ...(body.exchangeRates || {}),
      },
    },
    dek,
  );
  res.json(updated);
});

const ALLOWED_IMAGE_EXTS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

const MAX_SLIDESHOW_IMAGES = 2000;
const MAX_SCAN_DEPTH = 3;

export function scanImageFolder(
  folderPath: string,
  includeSubfolders = true,
): { resolvedRoot: string; images: { id: string; name: string }[] } {
  const cleaned = folderPath.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) {
    throw new Error('Lütfen geçerli bir klasör yolu girin.');
  }
  const resolvedRoot = path.resolve(cleaned);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Klasör bulunamadı: ${resolvedRoot}`);
  }
  const stat = fs.statSync(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new Error('Girilen yol bir klasör değil.');
  }

  const images: { id: string; name: string }[] = [];

  function walk(currentDir: string, depth: number) {
    if (images.length >= MAX_SLIDESHOW_IMAGES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (images.length >= MAX_SLIDESHOW_IMAGES) break;
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (includeSubfolders && depth < MAX_SCAN_DEPTH) {
          walk(full, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_IMAGE_EXTS[ext]) {
          const rel = path.relative(resolvedRoot, full);
          images.push({
            id: Buffer.from(rel, 'utf8').toString('base64url'),
            name: entry.name,
          });
        }
      }
    }
  }

  walk(resolvedRoot, 0);
  return { resolvedRoot, images };
}

export function resolveSafeFolderImage(folderPath: string, encodedId: string): { fullPath: string; mimeType: string } | null {
  const cleaned = folderPath.trim().replace(/^["']|["']$/g, '');
  if (!cleaned || !encodedId) return null;
  const resolvedRoot = path.resolve(cleaned);
  let rel: string;
  try {
    rel = Buffer.from(encodedId, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!rel || path.isAbsolute(rel)) return null;
  const fullPath = path.resolve(resolvedRoot, rel);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (!fullPath.toLowerCase().startsWith(rootWithSep.toLowerCase())) {
    return null;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ALLOWED_IMAGE_EXTS[ext];
  if (!mimeType || !fs.existsSync(fullPath)) return null;
  return { fullPath, mimeType };
}

router.post('/background', upload.single('image'), (req, res) => {
  const dek = getActiveDek();
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Lütfen bir görsel dosyası seçin.' });
    return;
  }
  if (!file.mimetype.startsWith('image/')) {
    res.status(400).json({ error: 'Sadece görsel dosyaları (PNG, JPG, WEBP) desteklenir.' });
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CUSTOM_BG_PATH, file.buffer);
  fs.writeFileSync(
    CUSTOM_BG_META_PATH,
    JSON.stringify({ mimeType: file.mimetype, updatedAt: new Date().toISOString() }),
  );
  const current = getSettings(dek);
  const updated = saveSettings(
    {
      ...current,
      backgroundMode: 'custom',
      hasCustomBackground: true,
      customBackgroundVersion: Date.now(),
    },
    dek,
  );
  res.json(updated);
});

router.delete('/background', (_req, res) => {
  const dek = getActiveDek();
  if (fs.existsSync(CUSTOM_BG_PATH)) fs.unlinkSync(CUSTOM_BG_PATH);
  if (fs.existsSync(CUSTOM_BG_META_PATH)) fs.unlinkSync(CUSTOM_BG_META_PATH);
  const current = getSettings(dek);
  const updated = saveSettings(
    {
      ...current,
      backgroundMode: current.backgroundMode === 'custom' ? 'default' : current.backgroundMode,
      hasCustomBackground: false,
      customBackgroundVersion: Date.now(),
    },
    dek,
  );
  res.json(updated);
});

// --- Local Folder Background Slideshow Endpoints ---
router.post('/background/folder/test', (req, res) => {
  try {
    const { folderPath, includeSubfolders } = req.body as { folderPath?: string; includeSubfolders?: boolean };
    const { resolvedRoot, images } = scanImageFolder(folderPath || '', includeSubfolders ?? true);
    res.json({
      ok: true,
      resolvedPath: resolvedRoot,
      count: images.length,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Klasör okunamadı.' });
  }
});

router.get('/background/folder/list', (_req, res) => {
  try {
    const settings = getSettings(getActiveDek());
    if (!settings.backgroundFolderPath?.trim()) {
      res.json({ count: 0, items: [] });
      return;
    }
    const { images } = scanImageFolder(settings.backgroundFolderPath, settings.slideshowIncludeSubfolders ?? true);
    res.json({ count: images.length, items: images });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Slayt klasörü okunamadı.', count: 0, items: [] });
  }
});

router.get('/background/folder/image', (req, res) => {
  const fileId = String(req.query.file || '');
  const settings = getSettings(getActiveDek());
  const resolved = resolveSafeFolderImage(settings.backgroundFolderPath || '', fileId);
  if (!resolved) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', resolved.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(resolved.fullPath);
});

// --- Mobile Access & Tailscale HTTPS Status + QR Code ---
function resolveTailscaleBinary(): string | null {
  const winDefault = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  if (process.platform === 'win32' && fs.existsSync(winDefault)) {
    return winDefault;
  }
  return 'tailscale';
}

function getLocalLanUrls(port: number): string[] {
  const urls: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }
  return urls;
}

async function inspectMobileAccess(port: number): Promise<MobileAccessInfo> {
  const tsBin = resolveTailscaleBinary();
  let tailscaleInstalled = false;
  let tailscaleRunning = false;
  let tailscaleDnsName = '';
  let serveActive = false;

  if (tsBin) {
    try {
      const { stdout } = await execFileAsync(tsBin, ['status', '--json'], { timeout: 3500 });
      tailscaleInstalled = true;
      const parsed = JSON.parse(stdout || '{}');
      tailscaleRunning = parsed.BackendState === 'Running';
      const rawDns = String(parsed?.Self?.DNSName || '').replace(/\.$/, '');
      if (rawDns) tailscaleDnsName = rawDns;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      // ENOENT means binary not installed; non-zero exit (e.g. stopped/logged out) still means installed
      if (code !== 'ENOENT') {
        tailscaleInstalled = true;
      }
    }

    if (tailscaleRunning) {
      try {
        const { stdout } = await execFileAsync(tsBin, ['serve', 'status', '--json'], { timeout: 3500 });
        const serveJson = JSON.parse(stdout || '{}');
        const webObj = serveJson?.Web || {};
        for (const hostCfg of Object.values(webObj) as { Handlers?: Record<string, { Proxy?: string }> }[]) {
          for (const handler of Object.values(hostCfg?.Handlers || {})) {
            if (String(handler?.Proxy || '').includes(`:${port}`)) {
              serveActive = true;
            }
          }
        }
      } catch {
        // serve not configured yet
      }
    }
  }

  const tailscaleHttpsUrl = tailscaleDnsName ? `https://${tailscaleDnsName}` : '';
  const lanUrls = getLocalLanUrls(port);
  const qrTarget = tailscaleHttpsUrl || lanUrls[0] || `http://127.0.0.1:${port}`;

  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(qrTarget, {
      type: 'svg',
      margin: 2,
      color: { dark: '#F8F4F5', light: '#00000000' },
    });
  } catch {
    qrSvg = '';
  }

  return {
    tailscaleInstalled,
    tailscaleRunning,
    tailscaleDnsName,
    tailscaleHttpsUrl,
    serveActive,
    lanUrls,
    port,
    qrSvg,
  };
}

router.get('/mobile-access', async (_req, res) => {
  const port = Number(process.env.PORT || 4848);
  res.json(await inspectMobileAccess(port));
});

router.post('/mobile-access/enable-serve', async (_req, res) => {
  const port = Number(process.env.PORT || 4848);
  const tsBin = resolveTailscaleBinary();
  if (!tsBin) {
    res.status(400).json({ error: 'Tailscale bu bilgisayarda kurulu değil.' });
    return;
  }
  try {
    await execFileAsync(tsBin, ['serve', '--bg', `http://127.0.0.1:${port}`], { timeout: 10000 });
    res.json(await inspectMobileAccess(port));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Tailscale serve başlatılamadı.';
    res.status(400).json({
      error: `Tailscale HTTPS tüneli açılamadı. Tailscale uygulamasında oturumunuzun açık olduğundan ve Tailscale yönetim panelinde MagicDNS + HTTPS'in etkin olduğundan emin olun. (${msg})`,
    });
  }
});

// --- Encrypted Full Vault Backup (.pvault) ---
router.post('/backup/export', (req, res) => {
  try {
    const { backupPassword } = req.body as { backupPassword?: string };
    if (!backupPassword || backupPassword.length < 6) {
      res.status(400).json({ error: 'Yedekleme parolası en az 6 karakter olmalıdır.' });
      return;
    }
    const dek = getActiveDek();
    const snapshot = exportFullVaultSnapshot(dek);
    const envelope = createEncryptedBackup(snapshot, backupPassword);
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="personvault-yedek-${stamp}.pvault"`);
    res.send(JSON.stringify(envelope, null, 2));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Yedek oluşturulamadı.' });
  }
});

router.post('/backup/import', upload.single('backup'), (req, res) => {
  try {
    const file = req.file;
    const backupPassword = String(req.body?.backupPassword || '');
    const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';

    if (!file) {
      res.status(400).json({ error: 'Lütfen bir .pvault yedek dosyası seçin.' });
      return;
    }
    if (!backupPassword) {
      res.status(400).json({ error: 'Lütfen yedek parolasını girin.' });
      return;
    }

    const envelope = JSON.parse(file.buffer.toString('utf8')) as EncryptedBackupEnvelope;
    const snapshot = decryptEncryptedBackup<FullVaultSnapshot>(envelope, backupPassword);
    const dek = getActiveDek();
    restoreVaultSnapshot(snapshot, mode, dek);

    res.json({
      ok: true,
      restored: {
        passwords: snapshot.passwords?.length || 0,
        subscriptions: snapshot.subscriptions?.length || 0,
        notes: snapshot.notes?.length || 0,
        events: snapshot.events?.length || 0,
        clients: snapshot.clients?.length || 0,
        clientCredentials: snapshot.clientCredentials?.length || 0,
        clientNotes: snapshot.clientNotes?.length || 0,
        clientFiles: snapshot.clientFiles?.length || 0,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Yedek geri yüklenemedi.' });
  }
});

export default router;

