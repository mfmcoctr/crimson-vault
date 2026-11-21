import { Router } from 'express';
import { newId } from '../crypto.ts';
import {
  deleteEvent,
  deleteNote,
  deletePassword,
  deleteSubscription,
  listClientCredentials,
  listClientFiles,
  listClientNotes,
  listClients,
  listEvents,
  listNotes,
  listPasswords,
  listSubscriptions,
  listTrackedProducts,
  saveEvent,
  saveNote,
  savePassword,
  saveSubscription,
} from '../db.ts';
import { getActiveDek, requireUnlocked } from '../session.ts';
import type {
  CalendarEventEntry,
  GlobalSearchResult,
  NoteEntry,
  PasswordEntry,
  SubscriptionEntry,
} from '../../src/types.ts';

const router = Router();
router.use(requireUnlocked);

// --- Passwords ---
router.get('/passwords', (_req, res) => {
  res.json(listPasswords(getActiveDek()));
});

router.post('/passwords', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<PasswordEntry>;
  if (!body.title?.trim()) {
    res.status(400).json({ error: 'Başlık zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const entry: PasswordEntry = {
    id: newId(),
    title: body.title.trim(),
    username: body.username || '',
    password: body.password || '',
    url: body.url || '',
    category: body.category || 'Genel',
    tags: Array.isArray(body.tags) ? body.tags : [],
    notes: body.notes || '',
    favorite: Boolean(body.favorite),
    customFields: Array.isArray(body.customFields) ? body.customFields : [],
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(savePassword(entry, dek));
});

router.put('/passwords/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = listPasswords(dek).find((p) => p.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Şifre kaydı bulunamadı.' });
    return;
  }
  const body = req.body as Partial<PasswordEntry>;
  const updated: PasswordEntry = {
    ...existing,
    ...body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(savePassword(updated, dek));
});

router.delete('/passwords/:id', (req, res) => {
  const deleted = deletePassword(req.params.id);
  res.json({ ok: deleted });
});

// --- Subscriptions ---
router.get('/subscriptions', (_req, res) => {
  res.json(listSubscriptions(getActiveDek()));
});

router.post('/subscriptions', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<SubscriptionEntry>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Abonelik adı zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const entry: SubscriptionEntry = {
    id: newId(),
    name: body.name.trim(),
    price: Number(body.price) || 0,
    currency: body.currency || 'TRY',
    billingCycle: body.billingCycle || 'monthly',
    nextBillingDate: body.nextBillingDate || now.slice(0, 10),
    category: body.category || 'Genel',
    status: body.status || 'active',
    autoRenew: body.autoRenew ?? true,
    paymentMethod: body.paymentMethod || '',
    url: body.url || '',
    notes: body.notes || '',
    remindDaysBefore: Number(body.remindDaysBefore ?? 3),
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveSubscription(entry, dek));
});

router.put('/subscriptions/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = listSubscriptions(dek).find((s) => s.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Abonelik bulunamadı.' });
    return;
  }
  const body = req.body as Partial<SubscriptionEntry>;
  const updated: SubscriptionEntry = {
    ...existing,
    ...body,
    price: body.price !== undefined ? Number(body.price) : existing.price,
    remindDaysBefore: body.remindDaysBefore !== undefined ? Number(body.remindDaysBefore) : existing.remindDaysBefore,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveSubscription(updated, dek));
});

router.delete('/subscriptions/:id', (req, res) => {
  res.json({ ok: deleteSubscription(req.params.id) });
});

// --- Notes ---
router.get('/notes', (_req, res) => {
  res.json(listNotes(getActiveDek()));
});

router.post('/notes', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<NoteEntry>;
  const now = new Date().toISOString();
  const entry: NoteEntry = {
    id: newId(),
    title: body.title?.trim() || 'Başlıksız Not',
    content: body.content || '',
    category: body.category || 'Genel',
    tags: Array.isArray(body.tags) ? body.tags : [],
    pinned: Boolean(body.pinned),
    color: body.color || 'crimson',
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveNote(entry, dek));
});

router.put('/notes/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = listNotes(dek).find((n) => n.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Not bulunamadı.' });
    return;
  }
  const body = req.body as Partial<NoteEntry>;
  const updated: NoteEntry = {
    ...existing,
    ...body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveNote(updated, dek));
});

router.delete('/notes/:id', (req, res) => {
  res.json({ ok: deleteNote(req.params.id) });
});

// --- Calendar Events ---
router.get('/events', (_req, res) => {
  res.json(listEvents(getActiveDek()));
});

router.post('/events', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<CalendarEventEntry>;
  if (!body.title?.trim() || !body.date) {
    res.status(400).json({ error: 'Başlık ve tarih zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const eventType = body.eventType || 'important';
  const entry: CalendarEventEntry = {
    id: newId(),
    title: body.title.trim(),
    eventType,
    date: body.date,
    birthYear: body.birthYear ? Number(body.birthYear) : null,
    recurrence: body.recurrence || (eventType === 'birthday' || eventType === 'anniversary' ? 'yearly' : 'none'),
    remindDaysBefore: Number(body.remindDaysBefore ?? 3),
    notes: body.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveEvent(entry, dek));
});

router.put('/events/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = listEvents(dek).find((e) => e.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    return;
  }
  const body = req.body as Partial<CalendarEventEntry>;
  const updated: CalendarEventEntry = {
    ...existing,
    ...body,
    birthYear: body.birthYear !== undefined ? (body.birthYear ? Number(body.birthYear) : null) : existing.birthYear,
    remindDaysBefore: body.remindDaysBefore !== undefined ? Number(body.remindDaysBefore) : existing.remindDaysBefore,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveEvent(updated, dek));
});

router.delete('/events/:id', (req, res) => {
  res.json({ ok: deleteEvent(req.params.id) });
});

// --- Universal Global Search (Ctrl+K) ---
router.get('/search', (req, res) => {
  const q = String(req.query.q || '')
    .trim()
    .toLowerCase();
  const dek = getActiveDek();
  const results: GlobalSearchResult[] = [];

  const matches = (...fields: (string | undefined)[]) => {
    if (!q) return true;
    return fields.some((f) => (f || '').toLowerCase().includes(q));
  };

  for (const p of listPasswords(dek)) {
    if (matches(p.title, p.username, p.url, p.category, p.tags.join(' '), p.notes)) {
      results.push({
        id: p.id,
        kind: 'password',
        title: p.title,
        subtitle: p.username || p.url || p.category,
        badge: p.category,
      });
    }
  }

  for (const s of listSubscriptions(dek)) {
    if (matches(s.name, s.category, s.notes, s.url)) {
      results.push({
        id: s.id,
        kind: 'subscription',
        title: s.name,
        subtitle: `${s.price} ${s.currency} · ${s.nextBillingDate}`,
        badge: s.category,
      });
    }
  }

  for (const n of listNotes(dek)) {
    if (matches(n.title, n.content, n.category, n.tags.join(' '))) {
      results.push({
        id: n.id,
        kind: 'note',
        title: n.title,
        subtitle: n.content.replace(/[#*_`>\n]/g, ' ').slice(0, 75),
        badge: n.category,
      });
    }
  }

  for (const e of listEvents(dek)) {
    if (matches(e.title, e.notes, e.date)) {
      results.push({
        id: e.id,
        kind: 'event',
        title: e.title,
        subtitle: e.date,
        badge: e.eventType,
      });
    }
  }

  const clientMap = new Map<string, string>();
  for (const c of listClients(dek)) {
    clientMap.set(c.id, c.name);
    if (matches(c.name, c.company, c.domain, c.extraDomains.join(' '), c.tags.join(' '), c.notes)) {
      results.push({
        id: c.id,
        kind: 'client',
        title: c.name,
        subtitle: c.domain || c.company || 'Müşteri Kasası',
        badge: 'Müşteri',
      });
    }
  }

  for (const cc of listClientCredentials(null, dek)) {
    const cname = clientMap.get(cc.clientId) || 'Müşteri';
    if (matches(cc.title, cc.hostOrUrl, cc.username, cc.notes, cc.tags.join(' '), cname)) {
      results.push({
        id: cc.id,
        parentId: cc.clientId,
        kind: 'client-credential',
        title: cc.title,
        subtitle: `${cname} · ${cc.username || cc.hostOrUrl}`,
        badge: cc.credentialType.toUpperCase(),
      });
    }
  }

  for (const cn of listClientNotes(null, dek)) {
    const cname = clientMap.get(cn.clientId) || 'Müşteri';
    if (matches(cn.title, cn.content, cname)) {
      results.push({
        id: cn.id,
        parentId: cn.clientId,
        kind: 'client-note',
        title: cn.title,
        subtitle: `${cname} · ${cn.noteType.toUpperCase()}`,
        badge: 'Müşteri Notu',
      });
    }
  }

  for (const cf of listClientFiles(null, dek)) {
    const cname = clientMap.get(cf.clientId) || 'Müşteri';
    if (matches(cf.filename, cf.category, cf.notes, cname)) {
      results.push({
        id: cf.id,
        parentId: cf.clientId,
        kind: 'client-file',
        title: cf.filename,
        subtitle: `${cname} · ${cf.category}`,
        badge: 'Şifreli Dosya',
      });
    }
  }

  for (const dp of listTrackedProducts(dek)) {
    if (matches(dp.name, dp.store, dp.url, dp.notes)) {
      results.push({
        id: dp.id,
        kind: 'deal',
        title: dp.name,
        subtitle: `${dp.store} · ${dp.currentPrice} ${dp.currency} (Hedef: ${dp.targetPrice} ${dp.currency})`,
        badge: 'İndirim Takibi',
      });
    }
  }

  res.json(results.slice(0, 40));
});

export default router;

