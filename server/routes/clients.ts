import { Router } from 'express';
import multer from 'multer';
import { newId } from '../crypto.ts';
import {
  deleteClient,
  deleteClientCredential,
  deleteClientFile,
  deleteClientNote,
  getClient,
  getClientFileWithContent,
  getDb,
  listClientCredentials,
  listClientFiles,
  listClientNotes,
  listClients,
  saveClient,
  saveClientCredential,
  saveClientFile,
  saveClientNote,
} from '../db.ts';
import {
  deleteStagedImport,
  getActiveDek,
  getStagedImport,
  requireUnlocked,
  saveStagedImport,
} from '../session.ts';
import {
  ZipArchiveError,
  buildEncryptedClientZip,
  parseUploadedArchiveOrFiles,
} from '../parsers/archiveParser.ts';
import type { ClientCredential, ClientFileMeta, ClientNote, ClientVault } from '../../src/types.ts';

const router = Router();
router.use(requireUnlocked);

// Pure in-memory upload so client secrets NEVER touch disk unencrypted
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024, // 60 MB max archive
    files: 25,
  },
});

// --- Client Vault CRUD ---
router.get('/', (_req, res) => {
  res.json(listClients(getActiveDek()));
});

router.post('/', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<ClientVault>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Müşteri adı zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const client: ClientVault = {
    id: newId(),
    name: body.name.trim(),
    company: body.company || '',
    domain: body.domain || '',
    extraDomains: Array.isArray(body.extraDomains) ? body.extraDomains : [],
    contactEmail: body.contactEmail || '',
    contactPhone: body.contactPhone || '',
    status: body.status || 'active',
    tags: Array.isArray(body.tags) ? body.tags : [],
    notes: body.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json({ ...saveClient(client, dek), credentialCount: 0, noteCount: 0, fileCount: 0 });
});

router.get('/:id/detail', (req, res) => {
  const dek = getActiveDek();
  const client = getClient(req.params.id, dek);
  if (!client) {
    res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
    return;
  }
  res.json({
    client,
    credentials: listClientCredentials(client.id, dek),
    notes: listClientNotes(client.id, dek),
    files: listClientFiles(client.id, dek),
  });
});

router.put('/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = getClient(req.params.id, dek);
  if (!existing) {
    res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
    return;
  }
  const body = req.body as Partial<ClientVault>;
  const { credentialCount, noteCount, fileCount, ...cleanBody } = body;
  const updated: ClientVault = {
    ...existing,
    ...cleanBody,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveClient(updated, dek));
});

router.delete('/:id', (req, res) => {
  res.json({ ok: deleteClient(req.params.id) });
});

// --- Client Credentials ---
router.post('/:id/credentials', (req, res) => {
  const dek = getActiveDek();
  const client = getClient(req.params.id, dek);
  if (!client) {
    res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
    return;
  }
  const body = req.body as Partial<ClientCredential>;
  if (!body.title?.trim()) {
    res.status(400).json({ error: 'Erişim başlığı zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const entry: ClientCredential = {
    id: newId(),
    clientId: client.id,
    title: body.title.trim(),
    credentialType: body.credentialType || 'other',
    hostOrUrl: body.hostOrUrl || '',
    username: body.username || '',
    password: body.password || '',
    port: body.port || '',
    notes: body.notes || '',
    tags: Array.isArray(body.tags) ? body.tags : [],
    sourceFile: body.sourceFile,
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveClientCredential(entry, dek));
});

router.put('/:id/credentials/:credId', (req, res) => {
  const dek = getActiveDek();
  const existing = listClientCredentials(req.params.id, dek).find((c) => c.id === req.params.credId);
  if (!existing) {
    res.status(404).json({ error: 'Erişim kaydı bulunamadı.' });
    return;
  }
  const body = req.body as Partial<ClientCredential>;
  const updated: ClientCredential = {
    ...existing,
    ...body,
    id: existing.id,
    clientId: existing.clientId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveClientCredential(updated, dek));
});

router.delete('/:id/credentials/:credId', (req, res) => {
  res.json({ ok: deleteClientCredential(req.params.credId) });
});

// --- Client Notes ---
router.post('/:id/notes', (req, res) => {
  const dek = getActiveDek();
  const client = getClient(req.params.id, dek);
  if (!client) {
    res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
    return;
  }
  const body = req.body as Partial<ClientNote>;
  const now = new Date().toISOString();
  const entry: ClientNote = {
    id: newId(),
    clientId: client.id,
    title: body.title?.trim() || 'Başlıksız Müşteri Notu',
    content: body.content || '',
    noteType: body.noteType || 'markdown',
    sourceFile: body.sourceFile,
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveClientNote(entry, dek));
});

router.put('/:id/notes/:noteId', (req, res) => {
  const dek = getActiveDek();
  const existing = listClientNotes(req.params.id, dek).find((n) => n.id === req.params.noteId);
  if (!existing) {
    res.status(404).json({ error: 'Not bulunamadı.' });
    return;
  }
  const body = req.body as Partial<ClientNote>;
  const updated: ClientNote = {
    ...existing,
    ...body,
    id: existing.id,
    clientId: existing.clientId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  res.json(saveClientNote(updated, dek));
});

router.delete('/:id/notes/:noteId', (req, res) => {
  res.json({ ok: deleteClientNote(req.params.noteId) });
});

// --- Client Encrypted Files ---
router.post('/:id/files', upload.array('files', 15), (req, res) => {
  const dek = getActiveDek();
  const client = getClient(String(req.params.id), dek);
  if (!client) {
    res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
    return;
  }
  const uploaded = (req.files as Express.Multer.File[]) || [];
  if (uploaded.length === 0) {
    res.status(400).json({ error: 'Yüklenecek dosya seçilmedi.' });
    return;
  }
  const saved: ClientFileMeta[] = [];
  for (const f of uploaded) {
    const lower = f.originalname.toLowerCase();
    const isText =
      f.size <= 512 * 1024 &&
      !f.buffer.subarray(0, 1024).includes(0) &&
      (f.mimetype.startsWith('text/') ||
        /\.(env|pem|ppk|key|crt|pub|json|yml|yaml|conf|ini|xml|sql|txt|md|ovpn|sh|htaccess)$/i.test(lower));

    let category = 'other';
    if (/\.(pem|ppk|key|pub)$/i.test(lower)) category = 'ssh-key';
    else if (/\.(crt|cer|pfx|p12)$/i.test(lower)) category = 'ssl-cert';
    else if (/\.env/i.test(lower)) category = 'env';
    else if (/\.(json|yml|yaml|conf|ini|xml|sql|ovpn)$/i.test(lower)) category = 'config';

    const meta: ClientFileMeta = {
      id: newId(),
      clientId: client.id,
      filename: f.originalname,
      mimeType: f.mimetype || 'application/octet-stream',
      sizeBytes: f.size,
      category,
      isTextPreviewable: isText,
      notes: String(req.body?.notes || ''),
      createdAt: new Date().toISOString(),
    };
    saved.push(saveClientFile(meta, f.buffer, dek));
  }
  res.status(201).json(saved);
});

router.get('/:id/files/:fileId/preview', (req, res) => {
  const dek = getActiveDek();
  const item = getClientFileWithContent(req.params.fileId, dek);
  if (!item || item.meta.clientId !== req.params.id) {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
    return;
  }
  if (!item.meta.isTextPreviewable) {
    res.status(400).json({ error: 'Bu dosya metin olarak önizlenemez; indirerek açabilirsiniz.' });
    return;
  }
  res.json({
    meta: item.meta,
    text: item.content.toString('utf8'),
  });
});

router.get('/:id/files/:fileId/download', (req, res) => {
  const dek = getActiveDek();
  const item = getClientFileWithContent(req.params.fileId, dek);
  if (!item || item.meta.clientId !== req.params.id) {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
    return;
  }
  const safeName = item.meta.filename.replace(/[^\w.\-() ]+/g, '_');
  res.setHeader('Content-Type', item.meta.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(item.content);
});

router.delete('/:id/files/:fileId', (req, res) => {
  res.json({ ok: deleteClientFile(req.params.fileId) });
});

// --- Bulk ZIP / Archive Import: Step 1 (Preview & Parse in Memory) ---
router.post('/import/preview', upload.array('archive', 25), async (req, res) => {
  try {
    const uploaded = (req.files as Express.Multer.File[]) || [];
    if (uploaded.length === 0) {
      res.status(400).json({ error: 'Lütfen bir ZIP arşivi veya şifre/yapılandırma dosyası yükleyin.' });
      return;
    }
    const zipPassword = typeof req.body?.zipPassword === 'string' ? req.body.zipPassword : undefined;
    const { preview, staged } = await parseUploadedArchiveOrFiles(
      uploaded.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
      zipPassword,
    );
    saveStagedImport(staged);
    res.json(preview);
  } catch (err) {
    if (err instanceof ZipArchiveError) {
      res.status(422).json({ code: err.code, error: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Arşiv ayrıştırılamadı.' });
  }
});

// --- Bulk ZIP / Archive Import: Step 2 (Commit Encrypted into Target Client Vault) ---
router.post('/import/commit', (req, res) => {
  const dek = getActiveDek();
  const {
    stagingId,
    targetClientId,
    newClient,
    selectedCredentialIds,
    selectedNoteIds,
    selectedFileIds,
  } = req.body as {
    stagingId?: string;
    targetClientId?: string;
    newClient?: { name: string; company?: string; domain?: string; tags?: string[] };
    selectedCredentialIds?: string[];
    selectedNoteIds?: string[];
    selectedFileIds?: string[];
  };

  if (!stagingId) {
    res.status(400).json({ error: 'Geçersiz önizleme oturumu.' });
    return;
  }
  const staged = getStagedImport(stagingId);
  if (!staged) {
    res.status(410).json({ error: 'Önizleme süresi doldu. Lütfen arşivi tekrar yükleyin.' });
    return;
  }

  let client: ClientVault | null = null;
  const now = new Date().toISOString();

  const db = getDb();
  db.exec('BEGIN');
  try {
    if (targetClientId && targetClientId !== '__new__') {
      client = getClient(targetClientId, dek);
      if (!client) {
        throw new Error('Hedef müşteri kasası bulunamadı.');
      }
    } else {
      if (!newClient?.name?.trim()) {
        throw new Error('Yeni müşteri adı zorunludur.');
      }
      client = saveClient(
        {
          id: newId(),
          name: newClient.name.trim(),
          company: newClient.company || '',
          domain: newClient.domain || '',
          extraDomains: [],
          contactEmail: '',
          contactPhone: '',
          status: 'active',
          tags: Array.isArray(newClient.tags) ? newClient.tags : ['zip-ice-aktarim'],
          notes: '',
          createdAt: now,
          updatedAt: now,
        },
        dek,
      );
    }

    const credSet = new Set(selectedCredentialIds || staged.credentials.map((c) => c.tempId));
    const noteSet = new Set(selectedNoteIds || staged.notes.map((n) => n.tempId));
    const fileSet = new Set(selectedFileIds || staged.files.map((f) => f.tempId));

    let importedCredentials = 0;
    let importedNotes = 0;
    let importedFiles = 0;

    for (const c of staged.credentials) {
      if (!credSet.has(c.tempId)) continue;
      saveClientCredential(
        {
          id: newId(),
          clientId: client.id,
          title: c.title,
          credentialType: c.credentialType,
          hostOrUrl: c.hostOrUrl,
          username: c.username,
          password: c.password,
          port: c.port,
          notes: c.notes,
          tags: c.tags,
          sourceFile: c.sourceFile,
          createdAt: now,
          updatedAt: now,
        },
        dek,
      );
      importedCredentials++;
    }

    for (const n of staged.notes) {
      if (!noteSet.has(n.tempId)) continue;
      saveClientNote(
        {
          id: newId(),
          clientId: client.id,
          title: n.title,
          content: n.content,
          noteType: n.noteType,
          sourceFile: n.sourceFile,
          createdAt: now,
          updatedAt: now,
        },
        dek,
      );
      importedNotes++;
    }

    for (const f of staged.files) {
      if (!fileSet.has(f.tempId)) continue;
      saveClientFile(
        {
          id: newId(),
          clientId: client.id,
          filename: f.filename,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          category: f.category,
          isTextPreviewable: f.isTextPreviewable,
          notes: 'Toplu arşivden şifrelenerek aktarıldı',
          createdAt: now,
        },
        f.buffer,
        dek,
      );
      importedFiles++;
    }

    db.exec('COMMIT');
    deleteStagedImport(stagingId);
    res.json({
      ok: true,
      clientId: client.id,
      clientName: client.name,
      importedCredentials,
      importedNotes,
      importedFiles,
    });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    res.status(400).json({ error: err instanceof Error ? err.message : 'İçe aktarma başarısız.' });
  }
});

// --- Export Single Client Vault as Encrypted/Plain ZIP ---
router.post('/:id/export-zip', async (req, res) => {
  try {
    const dek = getActiveDek();
    const client = getClient(req.params.id, dek);
    if (!client) {
      res.status(404).json({ error: 'Müşteri kasası bulunamadı.' });
      return;
    }
    const { zipPassword } = req.body as { zipPassword?: string };
    const credentials = listClientCredentials(client.id, dek);
    const notes = listClientNotes(client.id, dek);
    const fileMetas = listClientFiles(client.id, dek);
    const files: { filename: string; content: Buffer }[] = [];
    for (const m of fileMetas) {
      const full = getClientFileWithContent(m.id, dek);
      if (full) files.push({ filename: full.meta.filename, content: full.content });
    }

    const zipBuf = await buildEncryptedClientZip(client.name, credentials, notes, files, zipPassword);
    const safeSlug = client.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'musteri';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSlug}-kasa.zip"`);
    res.send(zipBuf);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'ZIP oluşturulamadı.' });
  }
});

// --- Sample CSV Template Download ---
router.get('/templates/csv', (_req, res) => {
  const sample = [
    'title,type,url,username,password,port,notes,tags',
    '"WordPress Admin Panel",admin,https://ornek-musteri.com/wp-admin,admin,SifreOrnek!2026,,"Ana yönetim paneli","wordpress,cms"',
    '"cPanel Hosting",hosting,https://ornek-musteri.com:2083,cpanel_user,HostPass#9921,2083,"Hosting kontrol paneli","hosting"',
    '"Production MySQL",database,127.0.0.1,db_prod,DbSecret$8812,3306,"Veritabanı adı: prod_web","mysql,db"',
    '"SFTP Erişimi",ftp,sftp.ornek-musteri.com,deploy,SftpKey!4401,22,"Deploy kullanıcısı","sftp"',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="personvault-musteri-sablon.csv"');
  res.send('\uFEFF' + sample);
});

export default router;
