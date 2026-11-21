import { Router } from 'express';
import {
  changeMasterPassword,
  getPublicUiPreview,
  initializeVault,
  isVaultInitialized,
  unlockVaultWithPassword,
} from '../db.ts';
import {
  SESSION_COOKIE_NAME,
  isRequestAuthenticated,
  lockVaultMemory,
  requireUnlocked,
  setUnlockedSession,
} from '../session.ts';

const router = Router();

function isHttpsRequest(req: import('express').Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req: import('express').Request, res: import('express').Response, token: string): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secureFlag}`,
  );
}

function clearSessionCookie(req: import('express').Request, res: import('express').Response): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`);
}

router.get('/status', (req, res) => {
  res.json({
    initialized: isVaultInitialized(),
    unlocked: isRequestAuthenticated(req),
    settingsPreview: getPublicUiPreview(),
  });
});

router.post('/setup', (req, res) => {
  try {
    const { masterPassword } = req.body as { masterPassword?: string };
    if (!masterPassword || masterPassword.length < 6) {
      res.status(400).json({ error: 'Ana parola en az 6 karakter olmalıdır.' });
      return;
    }
    const dek = initializeVault(masterPassword);
    const token = setUnlockedSession(dek, true);
    dek.fill(0);
    setSessionCookie(req, res, token);
    res.json({ ok: true, unlocked: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Kurulum hatası.' });
  }
});

router.post('/unlock', (req, res) => {
  try {
    const { masterPassword } = req.body as { masterPassword?: string };
    if (!masterPassword) {
      res.status(400).json({ error: 'Lütfen ana parolanızı girin.' });
      return;
    }
    const dek = unlockVaultWithPassword(masterPassword);
    const token = setUnlockedSession(dek, false);
    dek.fill(0);
    setSessionCookie(req, res, token);
    res.json({ ok: true, unlocked: true });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Ana parola hatalı.' });
  }
});

router.post('/lock', (req, res) => {
  lockVaultMemory();
  clearSessionCookie(req, res);
  res.json({ ok: true, unlocked: false });
});

router.post('/change-password', requireUnlocked, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Mevcut parola ve en az 6 karakterlik yeni parola gereklidir.' });
      return;
    }
    const dek = changeMasterPassword(currentPassword, newPassword);
    const token = setUnlockedSession(dek, true);
    dek.fill(0);
    setSessionCookie(req, res, token);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Parola değiştirilemedi.' });
  }
});

export default router;

