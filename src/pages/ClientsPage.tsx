import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Briefcase,
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileArchive,
  FileCode2,
  FileKey2,
  FileText,
  FolderArchive,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Pencil,
  Plus,
  Search,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { ApiError, api } from '../api';
import type {
  ArchivePreviewResponse,
  ClientCredential,
  ClientCredentialType,
  ClientFileMeta,
  ClientNote,
  ClientStatus,
  ClientVault,
} from '../types';
import { Modal } from '../components/Modal';
import { PasswordGeneratorModal } from '../components/PasswordGeneratorModal';
import { useToast } from '../components/Toast';

interface ClientsPageProps {
  clients: ClientVault[];
  onRefresh: () => Promise<void>;
  clipboardClearSeconds: number;
  initialClientId?: string | null;
}

const CRED_TYPE_META: Record<ClientCredentialType, { label: string; badge: string }> = {
  admin: { label: 'Admin Panel', badge: 'bg-rose-500/25 text-rose-200 border-rose-500/40' },
  hosting: { label: 'Hosting / cPanel', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  ftp: { label: 'FTP / SFTP', badge: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  ssh: { label: 'SSH / Sunucu', badge: 'bg-purple-500/25 text-purple-200 border-purple-400/35' },
  database: { label: 'Veritabanı', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  domain: { label: 'Domain / DNS', badge: 'bg-indigo-500/25 text-indigo-200 border-indigo-400/35' },
  api: { label: 'API Anahtarı', badge: 'bg-pink-500/25 text-pink-200 border-pink-400/35' },
  smtp: { label: 'SMTP / Mail', badge: 'bg-teal-500/20 text-teal-200 border-teal-400/35' },
  other: { label: 'Diğer', badge: 'bg-white/10 text-[#D7C7CC] border-white/15' },
};

const FILE_CATEGORY_LABELS: Record<string, string> = {
  'ssh-key': 'SSH Anahtarı',
  'ssl-cert': 'SSL Sertifikası',
  env: '.env Yapılandırma',
  config: 'Config / JSON',
  'archive-file': 'Arşiv Dosyası',
  other: 'Şifreli Ek',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ClientsPage: React.FC<ClientsPageProps> = ({
  clients,
  onRefresh,
  clipboardClearSeconds,
  initialClientId,
}) => {
  const { notify, copySecret } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');

  // Selected client detail state
  const [activeClientId, setActiveClientId] = useState<string | null>(initialClientId || null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    client: ClientVault;
    credentials: ClientCredential[];
    notes: ClientNote[];
    files: ClientFileMeta[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'credentials' | 'notes' | 'files'>('credentials');
  const [credFilter, setCredFilter] = useState<'all' | ClientCredentialType>('all');
  const [credSearch, setCredSearch] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Client create/edit modal
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientVault | null>(null);
  const [clientForm, setClientForm] = useState<Partial<ClientVault>>({
    name: '',
    company: '',
    domain: '',
    contactEmail: '',
    contactPhone: '',
    status: 'active',
    tags: [],
    notes: '',
  });
  const [clientTagsText, setClientTagsText] = useState('');

  // Credential modal
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [editingCred, setEditingCred] = useState<ClientCredential | null>(null);
  const [credForm, setCredForm] = useState<Partial<ClientCredential>>({});
  const [genOpen, setGenOpen] = useState(false);

  // Client note modal
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [noteForm, setNoteForm] = useState<Partial<ClientNote>>({ title: '', content: '', noteType: 'markdown' });

  // File preview modal
  const [previewModal, setPreviewModal] = useState<{ filename: string; text: string } | null>(null);

  // Export single client as encrypted ZIP modal
  const [exportZipOpen, setExportZipOpen] = useState(false);
  const [exportZipPassword, setExportZipPassword] = useState('');
  const [exportingZip, setExportingZip] = useState(false);

  // --- BULK ZIP / ARCHIVE IMPORTER STATE ---
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [zipPassword, setZipPassword] = useState('');
  const [zipPasswordError, setZipPasswordError] = useState('');
  const [needsZipPassword, setNeedsZipPassword] = useState(false);
  const [parsingArchive, setParsingArchive] = useState(false);
  const [previewData, setPreviewData] = useState<ArchivePreviewResponse | null>(null);
  const [importTargetClientId, setImportTargetClientId] = useState<string>('__new__');
  const [newClientName, setNewClientName] = useState('');
  const [newClientDomain, setNewClientDomain] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [selectedCredIds, setSelectedCredIds] = useState<Set<string>>(new Set());
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [committingImport, setCommittingImport] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialClientId) setActiveClientId(initialClientId);
  }, [initialClientId]);

  const loadClientDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await api.getClientDetail(id);
      setDetail(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Müşteri kasası yüklenemedi.', 'error');
      setActiveClientId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (activeClientId) {
      loadClientDetail(activeClientId);
    } else {
      setDetail(null);
    }
  }, [activeClientId]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.name, c.company, c.domain, c.contactEmail, c.tags.join(' '), c.notes].some((f) =>
        f.toLowerCase().includes(q),
      );
    });
  }, [clients, search, statusFilter]);

  const openCreateClient = () => {
    setEditingClient(null);
    setClientForm({
      name: '',
      company: '',
      domain: '',
      contactEmail: '',
      contactPhone: '',
      status: 'active',
      tags: [],
      notes: '',
    });
    setClientTagsText('');
    setClientModalOpen(true);
  };

  const openEditClient = (c: ClientVault) => {
    setEditingClient(c);
    setClientForm({ ...c });
    setClientTagsText(c.tags.join(', '));
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.name?.trim()) return;
    const payload = {
      ...clientForm,
      tags: clientTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (editingClient) {
      await api.updateClient(editingClient.id, payload);
      notify('Müşteri bilgileri güncellendi.');
      if (activeClientId === editingClient.id) await loadClientDetail(editingClient.id);
    } else {
      const created = await api.createClient(payload);
      notify(`"${created.name}" müşteri kasası oluşturuldu.`);
      setActiveClientId(created.id);
    }
    setClientModalOpen(false);
    await onRefresh();
  };

  const handleDeleteClient = async (c: ClientVault) => {
    if (
      !window.confirm(
        `"${c.name}" müşteri kasasını ve içindeki TÜM şifre, not ve şifreli dosyaları kalıcı olarak silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    await api.deleteClient(c.id);
    notify('Müşteri kasası silindi.');
    if (activeClientId === c.id) setActiveClientId(null);
    await onRefresh();
  };

  // --- Client Credential CRUD ---
  const openCreateCred = () => {
    setEditingCred(null);
    setCredForm({
      title: '',
      credentialType: 'admin',
      hostOrUrl: detail?.client.domain ? `https://${detail.client.domain}` : '',
      username: '',
      password: '',
      port: '',
      notes: '',
      tags: [],
    });
    setCredModalOpen(true);
  };

  const openEditCred = (c: ClientCredential) => {
    setEditingCred(c);
    setCredForm({ ...c });
    setCredModalOpen(true);
  };

  const handleSaveCred = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClientId || !credForm.title?.trim()) return;
    if (editingCred) {
      await api.updateClientCredential(activeClientId, editingCred.id, credForm);
      notify('Erişim bilgisi güncellendi.');
    } else {
      await api.createClientCredential(activeClientId, credForm);
      notify('Erişim bilgisi müşteri kasasına eklendi.');
    }
    setCredModalOpen(false);
    await loadClientDetail(activeClientId);
    await onRefresh();
  };

  const handleDeleteCred = async (c: ClientCredential) => {
    if (!activeClientId) return;
    if (!window.confirm(`"${c.title}" erişimini silmek istiyor musunuz?`)) return;
    await api.deleteClientCredential(activeClientId, c.id);
    notify('Erişim kaydı silindi.');
    await loadClientDetail(activeClientId);
    await onRefresh();
  };

  // --- Client Note CRUD ---
  const openCreateNote = () => {
    setEditingNote(null);
    setNoteForm({ title: '', content: '', noteType: 'markdown' });
    setNoteModalOpen(true);
  };

  const openEditNote = (n: ClientNote) => {
    setEditingNote(n);
    setNoteForm({ ...n });
    setNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClientId) return;
    if (editingNote) {
      await api.updateClientNote(activeClientId, editingNote.id, noteForm);
      notify('Müşteri notu güncellendi.');
    } else {
      await api.createClientNote(activeClientId, noteForm);
      notify('Müşteri notu eklendi.');
    }
    setNoteModalOpen(false);
    await loadClientDetail(activeClientId);
    await onRefresh();
  };

  const handleDeleteNote = async (n: ClientNote) => {
    if (!activeClientId) return;
    if (!window.confirm(`"${n.title}" notunu silmek istiyor musunuz?`)) return;
    await api.deleteClientNote(activeClientId, n.id);
    notify('Müşteri notu silindi.');
    await loadClientDetail(activeClientId);
    await onRefresh();
  };

  // --- Direct Encrypted File Upload / Preview / Download ---
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeClientId || !e.target.files?.length) return;
    try {
      await api.uploadClientFiles(activeClientId, Array.from(e.target.files));
      notify(`${e.target.files.length} dosya AES-256-GCM ile şifrelenerek eklendi.`);
      await loadClientDetail(activeClientId);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Dosya yüklenemedi.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handlePreviewFile = async (f: ClientFileMeta) => {
    if (!activeClientId) return;
    try {
      const res = await api.previewClientFile(activeClientId, f.id);
      setPreviewModal({ filename: res.meta.filename, text: res.text });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Önizlenemedi.', 'error');
    }
  };

  const handleDeleteFile = async (f: ClientFileMeta) => {
    if (!activeClientId) return;
    if (!window.confirm(`"${f.filename}" şifreli dosyasını silmek istiyor musunuz?`)) return;
    await api.deleteClientFile(activeClientId, f.id);
    notify('Şifreli dosya silindi.');
    await loadClientDetail(activeClientId);
    await onRefresh();
  };

  // --- Bulk Archive / ZIP Import Flow ---
  const openImportModal = (preselectedClientId?: string) => {
    setImportFiles([]);
    setZipPassword('');
    setZipPasswordError('');
    setNeedsZipPassword(false);
    setPreviewData(null);
    setImportTargetClientId(preselectedClientId || '__new__');
    setNewClientName('');
    setNewClientDomain('');
    setNewClientCompany('');
    setImportOpen(true);
  };

  const runArchivePreview = async (filesToParse: File[], pwd?: string) => {
    if (filesToParse.length === 0) return;
    setParsingArchive(true);
    setZipPasswordError('');
    try {
      const res = await api.previewClientArchive(filesToParse, pwd);
      setPreviewData(res);
      setNeedsZipPassword(false);
      setNewClientName(res.suggestedClientName);
      setNewClientDomain(res.detectedDomain);
      setSelectedCredIds(new Set(res.credentials.map((c) => c.tempId)));
      setSelectedNoteIds(new Set(res.notes.map((n) => n.tempId)));
      setSelectedFileIds(new Set(res.files.map((f) => f.tempId)));
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'ZIP_PASSWORD_REQUIRED' || err.code === 'ZIP_WRONG_PASSWORD')) {
        setNeedsZipPassword(true);
        setZipPasswordError(err.message);
      } else {
        notify(err instanceof Error ? err.message : 'Arşiv okunamadı.', 'error');
      }
    } finally {
      setParsingArchive(false);
    }
  };

  const handleArchiveDropOrSelect = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const arr = Array.from(filesList);
    setImportFiles(arr);
    setPreviewData(null);
    runArchivePreview(arr, zipPassword || undefined);
  };

  const handleCommitImport = async () => {
    if (!previewData) return;
    if (importTargetClientId === '__new__' && !newClientName.trim()) {
      notify('Lütfen yeni müşteri adını girin.', 'error');
      return;
    }
    setCommittingImport(true);
    try {
      const res = await api.commitClientArchive({
        stagingId: previewData.stagingId,
        targetClientId: importTargetClientId,
        newClient:
          importTargetClientId === '__new__'
            ? { name: newClientName.trim(), domain: newClientDomain.trim(), company: newClientCompany.trim() }
            : undefined,
        selectedCredentialIds: Array.from(selectedCredIds),
        selectedNoteIds: Array.from(selectedNoteIds),
        selectedFileIds: Array.from(selectedFileIds),
      });
      notify(
        `"${res.clientName}" kasasına ${res.importedCredentials} şifre, ${res.importedNotes} not ve ${res.importedFiles} şifreli dosya aktarıldı!`,
      );
      setImportOpen(false);
      await onRefresh();
      setActiveClientId(res.clientId);
      await loadClientDetail(res.clientId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'İçe aktarma başarısız.', 'error');
    } finally {
      setCommittingImport(false);
    }
  };

  const handleExportClientZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setExportingZip(true);
    try {
      const blob = await api.exportClientZip(detail.client.id, exportZipPassword || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${detail.client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-kasa.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setExportZipOpen(false);
      setExportZipPassword('');
      notify(
        exportZipPassword
          ? 'Müşteri kasası AES-256 parola korumalı ZIP olarak dışa aktarıldı.'
          : 'Müşteri kasası ZIP olarak indirildi.',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Dışa aktarılamadı.', 'error');
    } finally {
      setExportingZip(false);
    }
  };

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCredentials = useMemo(() => {
    if (!detail) return [];
    const q = credSearch.trim().toLowerCase();
    return detail.credentials.filter((c) => {
      if (credFilter !== 'all' && c.credentialType !== credFilter) return false;
      if (!q) return true;
      return [c.title, c.hostOrUrl, c.username, c.notes, c.tags.join(' ')].some((f) => f.toLowerCase().includes(q));
    });
  }, [detail, credFilter, credSearch]);

  // --- RENDER: CLIENT DETAIL VIEW ---
  if (activeClientId && detail) {
    const c = detail.client;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setActiveClientId(null)}
            className="inline-flex items-center gap-2 text-sm text-rose-200 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Tüm Müşteri Kasalarına Dön
          </button>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => openImportModal(c.id)} className="pv-btn-primary text-xs">
              <FileArchive className="w-4 h-4" />
              Bu Müşteriye ZIP / Arşiv Yükle
            </button>
            <button onClick={() => setExportZipOpen(true)} className="pv-btn-secondary text-xs">
              <Download className="w-4 h-4 text-rose-300" />
              Şifreli ZIP Dışa Aktar
            </button>
            <button onClick={() => openEditClient(c)} className="pv-btn-secondary text-xs">
              <Pencil className="w-3.5 h-3.5" />
              Düzenle
            </button>
            <button onClick={() => handleDeleteClient(c)} className="pv-btn-danger text-xs">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Client Hero Card */}
        <div className="pv-glass-crimson rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-white">{c.name}</h1>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/45 border border-rose-400/35 text-rose-100">
                {c.status === 'active' ? 'Aktif Proje' : c.status === 'maintenance' ? 'Bakımda' : 'Arşiv'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#E4D5DA]">
              {c.domain && (
                <a
                  href={/^https?:\/\//i.test(c.domain) ? c.domain : `https://${c.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-rose-200 hover:text-white"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {c.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {c.company && <span>{c.company}</span>}
              {c.contactEmail && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-rose-300" />
                  {c.contactEmail}
                </span>
              )}
            </div>
            {c.notes && <p className="text-xs text-[#D7C7CC] pt-1 max-w-2xl">{c.notes}</p>}
          </div>

          <div className="flex gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
              <div className="text-lg font-bold text-white">{detail.credentials.length}</div>
              <div className="text-[11px] text-[#C8B5BC]">Erişim</div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
              <div className="text-lg font-bold text-white">{detail.notes.length}</div>
              <div className="text-[11px] text-[#C8B5BC]">Not / .env</div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
              <div className="text-lg font-bold text-white">{detail.files.length}</div>
              <div className="text-[11px] text-[#C8B5BC]">Şifreli Dosya</div>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 p-1 rounded-xl pv-glass">
            {[
              { id: 'credentials', label: `Erişim Bilgileri (${detail.credentials.length})`, icon: <KeyRound className="w-4 h-4" /> },
              { id: 'notes', label: `Notlar & .env (${detail.notes.length})`, icon: <FileCode2 className="w-4 h-4" /> },
              { id: 'files', label: `Şifreli Dosyalar (${detail.files.length})`, icon: <FileKey2 className="w-4 h-4" /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as 'credentials' | 'notes' | 'files')}
                className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === t.id ? 'bg-[#9F1239] text-white' : 'text-[#D7C7CC] hover:text-white'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'credentials' && (
            <button onClick={openCreateCred} className="pv-btn-primary text-xs">
              <Plus className="w-4 h-4" />
              Erişim Bilgisi Ekle
            </button>
          )}
          {activeTab === 'notes' && (
            <button onClick={openCreateNote} className="pv-btn-primary text-xs">
              <Plus className="w-4 h-4" />
              Not / .env Ekle
            </button>
          )}
          {activeTab === 'files' && (
            <>
              <input
                ref={directFileInputRef}
                type="file"
                multiple
                onChange={handleDirectFileUpload}
                className="hidden"
              />
              <button onClick={() => directFileInputRef.current?.click()} className="pv-btn-primary text-xs">
                <Upload className="w-4 h-4" />
                Şifreli Dosya Yükle (.pem, .crt, .env...)
              </button>
            </>
          )}
        </div>

        {/* TAB 1: CREDENTIALS */}
        {activeTab === 'credentials' && (
          <div className="space-y-4">
            <div className="pv-glass rounded-2xl p-3.5 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-rose-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={credSearch}
                  onChange={(e) => setCredSearch(e.target.value)}
                  placeholder="Panel, sunucu, kullanıcı veya not içinde ara..."
                  className="pv-input pl-9 py-2 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCredFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                    credFilter === 'all' ? 'bg-[#9F1239] text-white' : 'bg-white/5 text-[#D7C7CC]'
                  }`}
                >
                  Tümü
                </button>
                {(Object.keys(CRED_TYPE_META) as ClientCredentialType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setCredFilter(type)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                      credFilter === type ? 'bg-[#9F1239] text-white' : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10'
                    }`}
                  >
                    {CRED_TYPE_META[type].label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCredentials.length === 0 ? (
              <div className="pv-glass rounded-2xl p-10 text-center space-y-3">
                <Server className="w-9 h-9 text-rose-400/60 mx-auto" />
                <div className="text-sm text-[#B8A2AA]">
                  Bu müşteriye ait erişim kaydı bulunmuyor. Manuel ekleyin veya ZIP arşivi yükleyin.
                </div>
                <div className="flex justify-center gap-2">
                  <button onClick={openCreateCred} className="pv-btn-secondary text-xs">
                    Manuel Ekle
                  </button>
                  <button onClick={() => openImportModal(c.id)} className="pv-btn-primary text-xs">
                    ZIP / CSV Yükle
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCredentials.map((cred) => {
                  const revealed = revealedIds.has(cred.id);
                  const meta = CRED_TYPE_META[cred.credentialType] || CRED_TYPE_META.other;
                  return (
                    <div key={cred.id} className="pv-glass rounded-2xl p-4 space-y-3 hover:border-rose-500/35 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${meta.badge}`}>
                              {meta.label}
                            </span>
                            <h3 className="font-semibold text-white text-sm truncate">{cred.title}</h3>
                          </div>
                          {cred.hostOrUrl && (
                            <div className="text-xs text-rose-200/85 font-mono-code truncate mt-1">
                              {cred.hostOrUrl}
                              {cred.port ? `:${cred.port}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => openEditCred(cred)}
                            className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCred(cred)}
                            className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/8">
                          <div className="min-w-0">
                            <div className="text-[10px] text-[#9C868E]">Kullanıcı</div>
                            <div className="text-xs text-white font-mono-code truncate">{cred.username || '—'}</div>
                          </div>
                          {cred.username && (
                            <button
                              onClick={() => copySecret(cred.username, 'Kullanıcı adı', 0)}
                              className="p-1 rounded bg-white/5 hover:bg-white/15 text-[#D7C7CC] cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/8">
                          <div className="min-w-0">
                            <div className="text-[10px] text-[#9C868E]">Parola / Anahtar</div>
                            <div className="text-xs text-white font-mono-code truncate">
                              {revealed ? cred.password || '—' : '••••••••••••'}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => toggleSet(setRevealedIds, cred.id)}
                              className="p-1 rounded bg-white/5 hover:bg-white/15 text-[#D7C7CC] cursor-pointer"
                            >
                              {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => copySecret(cred.password, `${cred.title} şifresi`, clipboardClearSeconds)}
                              className="p-1 rounded bg-[#9F1239]/60 hover:bg-[#BE123C] text-white cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {(cred.notes || cred.sourceFile) && (
                        <div className="text-[11px] text-[#B8A2AA] flex items-center justify-between gap-2 pt-1 border-t border-white/8">
                          <span className="truncate">{cred.notes}</span>
                          {cred.sourceFile && (
                            <span className="text-[10px] text-rose-300/80 shrink-0 font-mono-code">
                              {cred.sourceFile}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CLIENT NOTES & .ENV */}
        {activeTab === 'notes' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {detail.notes.length === 0 ? (
              <div className="lg:col-span-2 pv-glass rounded-2xl p-10 text-center text-sm text-[#A8929A]">
                Henüz bu müşteriye ait not veya `.env` dosyası eklenmedi.
              </div>
            ) : (
              detail.notes.map((n) => (
                <div key={n.id} className="pv-glass rounded-2xl p-4 space-y-3 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-[#9F1239]/35 border border-rose-500/35 text-rose-100 font-mono-code">
                          {n.noteType}
                        </span>
                        <h3 className="text-sm font-semibold text-white">{n.title}</h3>
                      </div>
                      {n.sourceFile && (
                        <div className="text-[11px] text-[#9C868E] mt-0.5 font-mono-code">{n.sourceFile}</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => copySecret(n.content, n.title, clipboardClearSeconds)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[#D7C7CC] cursor-pointer"
                        title="İçeriği kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditNote(n)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[#D7C7CC] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(n)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-950/60 text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <pre className="flex-1 max-h-60 overflow-auto rounded-xl bg-black/55 border border-white/8 p-3 text-xs font-mono-code text-[#F0E6E9] whitespace-pre-wrap break-all">
                    {n.content}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: ENCRYPTED FILES */}
        {activeTab === 'files' && (
          <div className="space-y-3">
            {detail.files.length === 0 ? (
              <div className="pv-glass rounded-2xl p-10 text-center space-y-3">
                <FileKey2 className="w-9 h-9 text-rose-400/60 mx-auto" />
                <div className="text-sm text-[#A8929A]">
                  SSH anahtarları (.pem/.ppk), SSL sertifikaları (.crt/.key), .env veya config dosyalarını AES-256-GCM ile şifreli saklayın.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {detail.files.map((f) => (
                  <div
                    key={f.id}
                    className="pv-glass rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-rose-500/35"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#9F1239]/25 border border-rose-500/35 flex items-center justify-center text-rose-200 shrink-0">
                        <FileKey2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate font-mono-code">{f.filename}</div>
                        <div className="text-xs text-[#B8A2AA] flex items-center gap-2 mt-0.5">
                          <span className="text-rose-200/90">
                            {FILE_CATEGORY_LABELS[f.category] || 'Şifreli Dosya'}
                          </span>
                          <span>·</span>
                          <span>{formatBytes(f.sizeBytes)}</span>
                          <span>· AES-256</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {f.isTextPreviewable && (
                        <button
                          onClick={() => handlePreviewFile(f)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-[#F8F4F5] cursor-pointer"
                          title="Şifresini Çözüp Önizle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <a
                        href={`/api/clients/${c.id}/files/${f.id}/download`}
                        className="p-2 rounded-lg bg-[#9F1239]/55 hover:bg-[#BE123C] text-white"
                        title="Şifresini Çözüp İndir"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteFile(f)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-rose-950/60 text-rose-300 cursor-pointer"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shared Modals inside detail view */}
        {renderModals()}
      </div>
    );
  }

  function renderModals() {
    return (
      <>
        {/* Client Create/Edit Modal */}
        <Modal
          open={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          title={editingClient ? 'Müşteri Kasasını Düzenle' : 'Yeni Müşteri Kasası Oluştur'}
          size="md"
        >
          <form onSubmit={handleSaveClient} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Müşteri / Proje Adı *</label>
                <input
                  value={clientForm.name || ''}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  placeholder="Örn: Aura E-Ticaret"
                  className="pv-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Şirket / Marka</label>
                <input
                  value={clientForm.company || ''}
                  onChange={(e) => setClientForm({ ...clientForm, company: e.target.value })}
                  placeholder="Firma ünvanı"
                  className="pv-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Ana Web Sitesi / Domain</label>
                <input
                  value={clientForm.domain || ''}
                  onChange={(e) => setClientForm({ ...clientForm, domain: e.target.value })}
                  placeholder="ornek-musteri.com"
                  className="pv-input"
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Durum</label>
                <select
                  value={clientForm.status || 'active'}
                  onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as ClientStatus })}
                  className="pv-select w-full"
                >
                  <option value="active">Aktif</option>
                  <option value="maintenance">Bakımda</option>
                  <option value="archived">Arşiv</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">İletişim E-posta</label>
                <input
                  value={clientForm.contactEmail || ''}
                  onChange={(e) => setClientForm({ ...clientForm, contactEmail: e.target.value })}
                  placeholder="info@musteri.com"
                  className="pv-input"
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Telefon</label>
                <input
                  value={clientForm.contactPhone || ''}
                  onChange={(e) => setClientForm({ ...clientForm, contactPhone: e.target.value })}
                  placeholder="+90 5xx ..."
                  className="pv-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Teknoloji / Etiketler (virgülle)</label>
              <input
                value={clientTagsText}
                onChange={(e) => setClientTagsText(e.target.value)}
                placeholder="nextjs, wordpress, hetzner, cloudflare"
                className="pv-input"
              />
            </div>

            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Genel Notlar</label>
              <textarea
                rows={3}
                value={clientForm.notes || ''}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                className="pv-input resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
              <button type="button" onClick={() => setClientModalOpen(false)} className="pv-btn-secondary">
                İptal
              </button>
              <button type="submit" className="pv-btn-primary">
                {editingClient ? 'Güncelle' : 'Kasa Oluştur'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Client Credential Modal */}
        <Modal
          open={credModalOpen}
          onClose={() => setCredModalOpen(false)}
          title={editingCred ? 'Erişim Bilgisini Düzenle' : 'Yeni Müşteri Erişimi Ekle'}
          size="md"
        >
          <form onSubmit={handleSaveCred} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Başlık *</label>
                <input
                  value={credForm.title || ''}
                  onChange={(e) => setCredForm({ ...credForm, title: e.target.value })}
                  placeholder="Örn: cPanel, WP-Admin, Production DB"
                  className="pv-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Erişim Türü</label>
                <select
                  value={credForm.credentialType || 'admin'}
                  onChange={(e) =>
                    setCredForm({ ...credForm, credentialType: e.target.value as ClientCredentialType })
                  }
                  className="pv-select w-full"
                >
                  {(Object.keys(CRED_TYPE_META) as ClientCredentialType[]).map((k) => (
                    <option key={k} value={k}>
                      {CRED_TYPE_META[k].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs text-[#D7C7CC] mb-1.5">URL / Sunucu IP / Host</label>
                <input
                  value={credForm.hostOrUrl || ''}
                  onChange={(e) => setCredForm({ ...credForm, hostOrUrl: e.target.value })}
                  placeholder="https://site.com/wp-admin veya 185.x.x.x"
                  className="pv-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Port</label>
                <input
                  value={credForm.port || ''}
                  onChange={(e) => setCredForm({ ...credForm, port: e.target.value })}
                  placeholder="22 / 3306"
                  className="pv-input font-mono-code"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Kullanıcı Adı / E-posta</label>
                <input
                  value={credForm.username || ''}
                  onChange={(e) => setCredForm({ ...credForm, username: e.target.value })}
                  className="pv-input font-mono-code"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#D7C7CC]">Parola / Token</label>
                  <button
                    type="button"
                    onClick={() => setGenOpen(true)}
                    className="text-[11px] text-rose-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Üret
                  </button>
                </div>
                <input
                  value={credForm.password || ''}
                  onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                  className="pv-input font-mono-code"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar</label>
              <textarea
                rows={2}
                value={credForm.notes || ''}
                onChange={(e) => setCredForm({ ...credForm, notes: e.target.value })}
                className="pv-input resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
              <button type="button" onClick={() => setCredModalOpen(false)} className="pv-btn-secondary">
                İptal
              </button>
              <button type="submit" className="pv-btn-primary">
                Kaydet
              </button>
            </div>
          </form>
        </Modal>

        {/* Client Note / .env Modal */}
        <Modal
          open={noteModalOpen}
          onClose={() => setNoteModalOpen(false)}
          title={editingNote ? 'Müşteri Notunu Düzenle' : 'Yeni Müşteri Notu / .env'}
          size="lg"
        >
          <form onSubmit={handleSaveNote} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Başlık</label>
                <input
                  value={noteForm.title || ''}
                  onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                  placeholder="Örn: .env.production veya Sunucu Kurulum Notları"
                  className="pv-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5">Tür</label>
                <select
                  value={noteForm.noteType || 'markdown'}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, noteType: e.target.value as 'markdown' | 'env' | 'text' })
                  }
                  className="pv-select w-full"
                >
                  <option value="markdown">Markdown</option>
                  <option value="env">.env Dosyası</option>
                  <option value="text">Düz Metin</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">İçerik</label>
              <textarea
                rows={10}
                value={noteForm.content || ''}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                className="pv-input font-mono-code text-xs"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
              <button type="button" onClick={() => setNoteModalOpen(false)} className="pv-btn-secondary">
                İptal
              </button>
              <button type="submit" className="pv-btn-primary">
                Şifrele & Kaydet
              </button>
            </div>
          </form>
        </Modal>

        {/* Encrypted File Text Preview Modal */}
        <Modal
          open={Boolean(previewModal)}
          onClose={() => setPreviewModal(null)}
          title={previewModal?.filename || 'Dosya Önizleme'}
          subtitle="Şifresi bellekte çözülerek görüntülendi"
          size="lg"
        >
          {previewModal && (
            <div className="space-y-4">
              <pre className="max-h-[55vh] overflow-auto rounded-xl bg-black/70 border border-white/10 p-4 text-xs font-mono-code text-[#F8F4F5] whitespace-pre-wrap break-all">
                {previewModal.text}
              </pre>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => copySecret(previewModal.text, previewModal.filename, clipboardClearSeconds)}
                  className="pv-btn-primary text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  İçeriği Kopyala
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Export Single Client as Password-Protected ZIP */}
        <Modal
          open={exportZipOpen}
          onClose={() => setExportZipOpen(false)}
          title="Müşteri Kasasını ZIP Olarak Dışa Aktar"
          subtitle="Tüm erişim bilgilerini, notları ve ek dosyaları tek ZIP arşivinde paketleyin"
          size="sm"
        >
          <form onSubmit={handleExportClientZip} className="space-y-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">
                ZIP Şifreleme Parolası (AES-256 — şiddetle önerilir)
              </label>
              <input
                type="password"
                value={exportZipPassword}
                onChange={(e) => setExportZipPassword(e.target.value)}
                placeholder="Boş bırakırsanız şifresiz ZIP oluşturulur"
                className="pv-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setExportZipOpen(false)} className="pv-btn-secondary">
                İptal
              </button>
              <button type="submit" disabled={exportingZip} className="pv-btn-primary">
                <Download className="w-4 h-4" />
                {exportingZip ? 'Hazırlanıyor...' : 'ZIP İndir'}
              </button>
            </div>
          </form>
        </Modal>

        {/* BULK ZIP / PASSWORD ARCHIVE IMPORTER MODAL */}
        <Modal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Toplu Müşteri Şifre Arşivi İçe Aktar (ZIP / CSV / .env / Anahtarlar)"
          subtitle="Parola korumalı ZIP dahil tüm arşivler bellekte çözülür, önizlenir ve hedef müşteri kasasına AES-256-GCM ile şifrelenerek kaydedilir."
          size="2xl"
        >
          <div className="space-y-5">
            {/* Step 1: Upload Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleArchiveDropOrSelect(e.dataTransfer.files);
              }}
              className="rounded-2xl border-2 border-dashed border-rose-500/40 bg-black/40 hover:bg-[#4C0519]/20 transition-colors p-6 text-center space-y-3"
            >
              <input
                ref={archiveInputRef}
                type="file"
                multiple
                accept=".zip,.csv,.json,.env,.txt,.md,.pem,.ppk,.key,.crt,.cer,.conf,.yml,.yaml,.ovpn"
                onChange={(e) => handleArchiveDropOrSelect(e.target.files)}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-[#9F1239]/30 border border-rose-400/35 flex items-center justify-center mx-auto text-rose-200">
                <FolderArchive className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">
                  Müşteri ZIP arşivini veya dosyalarını buraya sürükleyin
                </div>
                <p className="text-xs text-[#B8A2AA] mt-1">
                  Desteklenenler: Parolalı/Standart <code className="text-rose-200">.zip</code> · Chrome/Bitwarden/1Password{' '}
                  <code className="text-rose-200">.csv</code> & <code className="text-rose-200">.json</code> ·{' '}
                  <code className="text-rose-200">.env</code> · <code className="text-rose-200">.txt/.md</code> ·{' '}
                  <code className="text-rose-200">.pem/.ppk/.crt/.key</code>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => archiveInputRef.current?.click()}
                  disabled={parsingArchive}
                  className="pv-btn-primary text-xs"
                >
                  <Upload className="w-4 h-4" />
                  {parsingArchive ? 'Arşiv Ayrıştırılıyor...' : 'ZIP veya Dosya Seç'}
                </button>
                <a href="/api/clients/templates/csv" className="pv-btn-secondary text-xs">
                  <Download className="w-3.5 h-3.5 text-rose-300" />
                  Örnek CSV Şablonu İndir
                </a>
              </div>
              {importFiles.length > 0 && (
                <div className="text-xs text-rose-200 pt-1">
                  Seçilen: {importFiles.map((f) => f.name).join(', ')}
                </div>
              )}
            </div>

            {/* Password-Protected ZIP Unlock Prompt */}
            {needsZipPassword && (
              <div className="rounded-2xl bg-rose-950/60 border border-rose-500/50 p-4 space-y-3">
                <div className="flex items-start gap-2.5 text-sm text-rose-100">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Parola Korumalı ZIP Algılandı</div>
                    <p className="text-xs text-rose-200/85 mt-0.5">{zipPasswordError}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={zipPassword}
                    onChange={(e) => setZipPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runArchivePreview(importFiles, zipPassword);
                      }
                    }}
                    placeholder="ZIP arşiv parolasını girin..."
                    className="pv-input flex-1"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => runArchivePreview(importFiles, zipPassword)}
                    disabled={parsingArchive || !zipPassword}
                    className="pv-btn-primary shrink-0"
                  >
                    {parsingArchive ? 'Çözülüyor...' : 'Arşivi Çöz'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Interactive Preview & Destination */}
            {previewData && (
              <div className="space-y-5">
                {previewData.warnings.length > 0 && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 text-xs text-amber-200 space-y-1">
                    {previewData.warnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Target Client Vault Picker */}
                <div className="rounded-2xl bg-black/45 border border-white/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-rose-200">
                      Hedef Müşteri Kasası
                    </span>
                    {previewData.wasEncryptedZip && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                        Şifreli ZIP Başarıyla Çözüldü
                      </span>
                    )}
                  </div>

                  <select
                    value={importTargetClientId}
                    onChange={(e) => setImportTargetClientId(e.target.value)}
                    className="pv-select w-full"
                  >
                    <option value="__new__">+ Yeni Müşteri Kasası Oluştur</option>
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        Mevcut Kasa: {cl.name} {cl.domain ? `(${cl.domain})` : ''}
                      </option>
                    ))}
                  </select>

                  {importTargetClientId === '__new__' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] text-[#C8B5BC] mb-1">Yeni Müşteri Adı *</label>
                        <input
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          placeholder="Müşteri / Proje Adı"
                          className="pv-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#C8B5BC] mb-1">Domain (Otomatik Algılandı)</label>
                        <input
                          value={newClientDomain}
                          onChange={(e) => setNewClientDomain(e.target.value)}
                          placeholder="musteri.com"
                          className="pv-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#C8B5BC] mb-1">Şirket (Opsiyonel)</label>
                        <input
                          value={newClientCompany}
                          onChange={(e) => setNewClientCompany(e.target.value)}
                          placeholder="Şirket adı"
                          className="pv-input text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Extracted Credentials Preview */}
                {previewData.credentials.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">
                        Tespit Edilen Erişim Bilgileri ({selectedCredIds.size}/{previewData.credentials.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCredIds(
                            selectedCredIds.size === previewData.credentials.length
                              ? new Set()
                              : new Set(previewData.credentials.map((x) => x.tempId)),
                          )
                        }
                        className="text-rose-300 hover:text-white cursor-pointer"
                      >
                        Tümünü Seç / Kaldır
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/8 bg-black/35">
                      {previewData.credentials.map((cr) => (
                        <label
                          key={cr.tempId}
                          className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCredIds.has(cr.tempId)}
                            onChange={() => toggleSet(setSelectedCredIds, cr.tempId)}
                            className="accent-[#BE123C]"
                          />
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                              CRED_TYPE_META[cr.credentialType].badge
                            }`}
                          >
                            {CRED_TYPE_META[cr.credentialType].label}
                          </span>
                          <span className="font-medium text-white truncate flex-1">{cr.title}</span>
                          <span className="text-[#B8A2AA] font-mono-code truncate max-w-[160px]">
                            {cr.username || cr.hostOrUrl}
                          </span>
                          <span className="text-[10px] text-[#9C868E] font-mono-code hidden sm:inline">
                            {cr.sourceFile}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Notes / .env Preview */}
                {previewData.notes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-white">
                      Notlar & .env Belgeleri ({selectedNoteIds.size}/{previewData.notes.length})
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/8 bg-black/35">
                      {previewData.notes.map((nt) => (
                        <label
                          key={nt.tempId}
                          className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedNoteIds.has(nt.tempId)}
                            onChange={() => toggleSet(setSelectedNoteIds, nt.tempId)}
                            className="accent-[#BE123C]"
                          />
                          <FileText className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                          <span className="text-white font-medium truncate flex-1">{nt.title}</span>
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-white/8 text-[#D7C7CC]">
                            {nt.noteType}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Security / Config Files Preview */}
                {previewData.files.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-white">
                      Şifreli Dosyalar & Anahtarlar ({selectedFileIds.size}/{previewData.files.length})
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/8 bg-black/35">
                      {previewData.files.map((fl) => (
                        <label
                          key={fl.tempId}
                          className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFileIds.has(fl.tempId)}
                            onChange={() => toggleSet(setSelectedFileIds, fl.tempId)}
                            className="accent-[#BE123C]"
                          />
                          <FileKey2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span className="text-white font-mono-code truncate flex-1">{fl.filename}</span>
                          <span className="text-[#B8A2AA]">{FILE_CATEGORY_LABELS[fl.category] || fl.category}</span>
                          <span className="text-[#9C868E]">{formatBytes(fl.sizeBytes)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <span className="text-xs text-[#C8B5BC]">
                    Seçili toplam:{' '}
                    <strong className="text-white">
                      {selectedCredIds.size} erişim · {selectedNoteIds.size} not · {selectedFileIds.size} şifreli dosya
                    </strong>
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setImportOpen(false)} className="pv-btn-secondary">
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitImport}
                      disabled={
                        committingImport ||
                        selectedCredIds.size + selectedNoteIds.size + selectedFileIds.size === 0
                      }
                      className="pv-btn-primary"
                    >
                      <Check className="w-4 h-4" />
                      {committingImport ? 'Şifreleniyor...' : 'Müşteri Kasasına Şifreleyerek Aktar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>

        <PasswordGeneratorModal
          open={genOpen}
          onClose={() => setGenOpen(false)}
          clipboardClearSeconds={clipboardClearSeconds}
          onSelect={(pwd) => setCredForm((prev) => ({ ...prev, password: pwd }))}
        />
      </>
    );
  }

  // --- RENDER: CLIENT VAULTS OVERVIEW GRID ---
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Müşteri Kasaları & Toplu Arşivler</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Geliştirdiğiniz web sitelerine ait erişim bilgilerini, `.env` yapılandırmalarını ve SSH/SSL dosyalarını müşteri bazlı izole kasalarda saklayın.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button onClick={() => openImportModal()} className="pv-btn-primary">
            <FileArchive className="w-4 h-4" />
            Toplu ZIP / Arşiv İçe Aktar
          </button>
          <button onClick={openCreateClient} className="pv-btn-secondary">
            <Plus className="w-4 h-4" />
            Yeni Müşteri Kasası
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="pv-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Müşteri adı, şirket, domain veya teknoloji ara..."
            className="pv-input pl-10"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { id: 'all', label: `Tümü (${clients.length})` },
            { id: 'active', label: 'Aktif' },
            { id: 'maintenance', label: 'Bakımda' },
            { id: 'archived', label: 'Arşiv' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as 'all' | ClientStatus)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {detailLoading ? (
        <div className="pv-glass rounded-2xl p-12 text-center text-sm text-[#D7C7CC]">Müşteri kasası çözülüyor...</div>
      ) : filteredClients.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#9F1239]/25 border border-rose-500/35 flex items-center justify-center mx-auto text-rose-300">
            <Briefcase className="w-7 h-7" />
          </div>
          <div className="text-lg font-semibold text-white">Henüz müşteri kasası yok</div>
          <p className="text-sm text-[#B8A2AA] max-w-lg mx-auto">
            Bir müşteriye ait şifre CSV/JSON listesini, `.env` dosyasını ve SSH/SSL anahtarlarını içeren ZIP arşivini tek seferde yükleyin; PersonVault otomatik olarak ayrıştırıp o müşterinin kasasına şifrelesin.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <button onClick={() => openImportModal()} className="pv-btn-primary">
              <FileArchive className="w-4 h-4" />
              Toplu ZIP Arşivi Yükle
            </button>
            <button onClick={openCreateClient} className="pv-btn-secondary">
              <Plus className="w-4 h-4" />
              Boş Müşteri Kasası Oluştur
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((cl) => (
            <div
              key={cl.id}
              onClick={() => setActiveClientId(cl.id)}
              className="pv-glass rounded-2xl p-5 hover:border-rose-500/45 transition-all cursor-pointer flex flex-col justify-between gap-4 group"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#9F1239]/80 to-[#2B0711] border border-rose-400/30 flex items-center justify-center font-display font-bold text-white shrink-0">
                      {cl.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate group-hover:text-rose-200 transition-colors">
                        {cl.name}
                      </h3>
                      <div className="text-xs text-rose-300/85 truncate flex items-center gap-1">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span>{cl.domain || cl.company || 'Domain eklenmemiş'}</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                      cl.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                        : cl.status === 'maintenance'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                          : 'bg-white/10 text-[#B8A2AA]'
                    }`}
                  >
                    {cl.status === 'active' ? 'Aktif' : cl.status === 'maintenance' ? 'Bakımda' : 'Arşiv'}
                  </span>
                </div>

                {cl.notes && <p className="text-xs text-[#B8A2AA] line-clamp-2">{cl.notes}</p>}

                {cl.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cl.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 text-[#D7C7CC]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/8 text-center">
                <div className="rounded-lg bg-black/35 py-1.5">
                  <div className="text-sm font-bold text-white">{cl.credentialCount || 0}</div>
                  <div className="text-[10px] text-[#A8929A]">Erişim</div>
                </div>
                <div className="rounded-lg bg-black/35 py-1.5">
                  <div className="text-sm font-bold text-white">{cl.noteCount || 0}</div>
                  <div className="text-[10px] text-[#A8929A]">Not / .env</div>
                </div>
                <div className="rounded-lg bg-black/35 py-1.5">
                  <div className="text-sm font-bold text-white">{cl.fileCount || 0}</div>
                  <div className="text-[10px] text-[#A8929A]">Şifreli Dosya</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {renderModals()}
    </div>
  );
};

