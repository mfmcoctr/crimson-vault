import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type { CustomField, PasswordEntry } from '../types';
import { auditPasswords, evaluatePasswordStrength } from '../utils/passwordUtils';
import { Modal } from '../components/Modal';
import { PasswordGeneratorModal } from '../components/PasswordGeneratorModal';
import { useToast } from '../components/Toast';

const CATEGORIES = ['Genel', 'Finans', 'Sosyal', 'İş', 'Geliştirme', 'E-posta', 'Alışveriş', 'Diğer'];

interface PasswordsPageProps {
  passwords: PasswordEntry[];
  onRefresh: () => Promise<void>;
  clipboardClearSeconds: number;
  initialFilter?: string;
}

const emptyForm = (): Partial<PasswordEntry> => ({
  title: '',
  username: '',
  password: '',
  url: '',
  category: 'Genel',
  tags: [],
  notes: '',
  favorite: false,
  customFields: [],
});

export const PasswordsPage: React.FC<PasswordsPageProps> = ({
  passwords,
  onRefresh,
  clipboardClearSeconds,
  initialFilter,
}) => {
  const { notify, copySecret } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(initialFilter || 'all');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordEntry | null>(null);
  const [form, setForm] = useState<Partial<PasswordEntry>>(emptyForm());
  const [tagsText, setTagsText] = useState('');
  const [showFormPass, setShowFormPass] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const audit = useMemo(() => auditPasswords(passwords), [passwords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return passwords
      .filter((p) => {
        if (categoryFilter === 'favorites' && !p.favorite) return false;
        if (categoryFilter === 'weak' && !audit.weakIds.has(p.id)) return false;
        if (categoryFilter === 'reused' && !audit.reusedIds.has(p.id)) return false;
        if (
          categoryFilter !== 'all' &&
          categoryFilter !== 'favorites' &&
          categoryFilter !== 'weak' &&
          categoryFilter !== 'reused' &&
          p.category !== categoryFilter
        ) {
          return false;
        }
        if (!q) return true;
        return [p.title, p.username, p.url, p.category, p.notes, p.tags.join(' ')].some((f) =>
          f.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }, [passwords, search, categoryFilter, audit]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setTagsText('');
    setShowFormPass(false);
    setModalOpen(true);
  };

  const openEdit = (p: PasswordEntry) => {
    setEditing(p);
    setForm({ ...p, customFields: p.customFields ? [...p.customFields] : [] });
    setTagsText(p.tags.join(', '));
    setShowFormPass(false);
    setModalOpen(true);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleFavorite = async (p: PasswordEntry) => {
    await api.updatePassword(p.id, { favorite: !p.favorite });
    await onRefresh();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim()) {
      notify('Lütfen bir başlık girin.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        customFields: (form.customFields || []).filter((cf) => cf.label.trim() || cf.value.trim()),
      };
      if (editing) {
        await api.updatePassword(editing.id, payload);
        notify('Şifre kaydı güncellendi.');
      } else {
        await api.createPassword(payload);
        notify('Yeni şifre güvenle şifrelenip kaydedildi.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: PasswordEntry) => {
    if (!window.confirm(`"${p.title}" şifre kaydını silmek istediğinize emin misiniz?`)) return;
    await api.deletePassword(p.id);
    notify('Şifre kaydı silindi.');
    await onRefresh();
  };

  const addCustomField = () => {
    setForm((prev) => ({
      ...prev,
      customFields: [...(prev.customFields || []), { label: '', value: '', secret: false }],
    }));
  };

  const updateCustomField = (idx: number, patch: Partial<CustomField>) => {
    setForm((prev) => {
      const arr = [...(prev.customFields || [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...prev, customFields: arr };
    });
  };

  const removeCustomField = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).filter((_, i) => i !== idx),
    }));
  };

  const formStrength = evaluatePasswordStrength(form.password || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Şifre Kasası</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Tüm parolalarınız AES-256-GCM ile şifrelenir · Güvenlik Skoru:{' '}
            <span className="text-white font-semibold">%{audit.healthScore}</span>
          </p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => setGenOpen(true)} className="pv-btn-secondary">
            <Sparkles className="w-4 h-4 text-rose-300" />
            Şifre Üret
          </button>
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            Yeni Şifre
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="pv-glass rounded-2xl p-4 space-y-3.5">
        <div className="relative">
          <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Başlık, kullanıcı adı, URL veya etiket ara..."
            className="pv-input pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: `Tümü (${passwords.length})` },
            { id: 'favorites', label: `Favoriler (${passwords.filter((p) => p.favorite).length})` },
            ...(audit.weakIds.size > 0
              ? [{ id: 'weak', label: `Zayıf (${audit.weakIds.size})`, warn: true }]
              : []),
            ...(audit.reusedIds.size > 0
              ? [{ id: 'reused', label: `Tekrarlanan (${audit.reusedIds.size})`, warn: true }]
              : []),
            ...CATEGORIES.map((c) => ({ id: c, label: c })),
          ].map((pill) => {
            const active = categoryFilter === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setCategoryFilter(pill.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-[#9F1239] text-white border border-rose-400/40'
                    : (pill as { warn?: boolean }).warn
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25'
                      : 'bg-white/5 text-[#D7C7CC] border border-white/10 hover:bg-white/10'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Password List */}
      {filtered.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <KeyRound className="w-10 h-10 text-rose-400/70 mx-auto" />
          <div className="text-base font-medium text-white">Kayıtlı şifre bulunamadı</div>
          <p className="text-sm text-[#A8929A]">
            İlk şifre kaydınızı ekleyerek yerel şifreli kasanızı kullanmaya başlayın.
          </p>
          <button onClick={openCreate} className="pv-btn-primary mt-2">
            <Plus className="w-4 h-4" />
            Yeni Şifre Ekle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const revealed = revealedIds.has(p.id);
            const strength = evaluatePasswordStrength(p.password);
            const isWeak = audit.weakIds.has(p.id);
            const isReused = audit.reusedIds.has(p.id);

            return (
              <div
                key={p.id}
                className="pv-glass rounded-2xl p-5 hover:border-rose-500/35 transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9F1239]/70 to-[#2B0711] border border-rose-400/25 flex items-center justify-center font-display text-white font-bold shrink-0">
                        {p.title.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white truncate">{p.title}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-[#D7C7CC]">
                            {p.category}
                          </span>
                        </div>
                        {p.url && (
                          <a
                            href={/^https?:\/\//i.test(p.url) ? p.url : `https://${p.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-rose-300/90 hover:text-rose-200 inline-flex items-center gap-1 truncate max-w-full mt-0.5"
                          >
                            <span className="truncate">{p.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleFavorite(p)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          p.favorite ? 'text-amber-400' : 'text-[#9C868E] hover:text-white'
                        }`}
                        title="Favori"
                      >
                        <Star className="w-4 h-4" fill={p.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10 cursor-pointer"
                        title="Düzenle"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-rose-300 hover:bg-rose-950/60 cursor-pointer"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Username & Password Fields */}
                  <div className="space-y-2">
                    {p.username && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/8">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[#9C868E]">Kullanıcı / E-posta</div>
                          <div className="text-sm text-[#F8F4F5] truncate font-mono-code">{p.username}</div>
                        </div>
                        <button
                          onClick={() => copySecret(p.username, 'Kullanıcı adı', 0)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/12 text-[#D7C7CC] hover:text-white cursor-pointer"
                          title="Kullanıcı adını kopyala"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/8">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-[#9C868E] flex items-center gap-2">
                          <span>Parola</span>
                          <span className={strength.textColor}>· {strength.label}</span>
                        </div>
                        <div className="text-sm text-white truncate font-mono-code">
                          {revealed ? p.password || '—' : '••••••••••••••••'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleReveal(p.id)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/12 text-[#D7C7CC] hover:text-white cursor-pointer"
                          title={revealed ? 'Gizle' : 'Göster'}
                        >
                          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => copySecret(p.password, `${p.title} parolası`, clipboardClearSeconds)}
                          className="p-1.5 rounded-lg bg-[#9F1239]/55 hover:bg-[#BE123C] text-white cursor-pointer"
                          title="Parolayı kopyala"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {p.customFields?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.customFields.map((cf, i) => (
                        <button
                          key={i}
                          onClick={() => copySecret(cf.value, cf.label || 'Özel alan', cf.secret ? clipboardClearSeconds : 0)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/12 border border-white/10 text-[#E4D5DA] cursor-pointer"
                          title="Kopyalamak için tıklayın"
                        >
                          <span className="text-[#9C868E]">{cf.label}:</span> {cf.secret ? '••••••' : cf.value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/8">
                  <div className="flex flex-wrap gap-1.5">
                    {isWeak && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30">
                        <AlertTriangle className="w-3 h-3" /> Zayıf
                      </span>
                    )}
                    {isReused && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-500/40">
                        <ShieldAlert className="w-3 h-3" /> Tekrarlanan
                      </span>
                    )}
                    {p.tags.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-white/6 text-[#C8B5BC]">
                        #{t}
                      </span>
                    ))}
                  </div>
                  {p.notes && <span className="text-[11px] text-[#9C868E] truncate max-w-[160px]">{p.notes}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Şifre Kaydını Düzenle' : 'Yeni Şifre Ekle'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Başlık *</label>
              <input
                value={form.title || ''}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Örn: GitHub, Garanti BBVA, Gmail"
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kategori</label>
              <select
                value={form.category || 'Genel'}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="pv-select w-full"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kullanıcı Adı / E-posta</label>
              <input
                value={form.username || ''}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="kullanici@ornek.com"
                className="pv-input"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Web Sitesi URL</label>
              <input
                value={form.url || ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://github.com"
                className="pv-input"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[#D7C7CC]">Parola</label>
              <button
                type="button"
                onClick={() => setGenOpen(true)}
                className="text-xs text-rose-300 hover:text-rose-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Güçlü Şifre Üret
              </button>
            </div>
            <div className="relative">
              <input
                type={showFormPass ? 'text' : 'password'}
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Parolanızı girin veya üretin"
                className="pv-input pr-10 font-mono-code"
              />
              <button
                type="button"
                onClick={() => setShowFormPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C868E] hover:text-white cursor-pointer"
              >
                {showFormPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.password && (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${formStrength.barColor}`}
                    style={{ width: `${formStrength.score}%` }}
                  />
                </div>
                <span className={`text-xs ${formStrength.textColor}`}>{formStrength.label}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Etiketler (virgülle ayırın)</label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="2fa, kişisel, önemli"
                className="pv-input"
              />
            </div>
            <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer mt-5">
              <input
                type="checkbox"
                checked={Boolean(form.favorite)}
                onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
                className="accent-[#BE123C] w-4 h-4"
              />
              <span className="text-sm text-white">Favorilere ekle</span>
            </label>
          </div>

          {/* Custom Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#D7C7CC]">Özel Alanlar (Kurtarma Kodu, PIN, Güvenlik Sorusu vb.)</label>
              <button
                type="button"
                onClick={addCustomField}
                className="text-xs text-rose-300 hover:text-white cursor-pointer"
              >
                + Alan Ekle
              </button>
            </div>
            {(form.customFields || []).map((cf, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  value={cf.label}
                  onChange={(e) => updateCustomField(idx, { label: e.target.value })}
                  placeholder="Alan adı"
                  className="pv-input col-span-4 text-xs"
                />
                <input
                  value={cf.value}
                  onChange={(e) => updateCustomField(idx, { value: e.target.value })}
                  placeholder="Değer"
                  className="pv-input col-span-5 text-xs font-mono-code"
                />
                <label className="col-span-2 flex items-center gap-1 text-xs text-[#D7C7CC] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(cf.secret)}
                    onChange={(e) => updateCustomField(idx, { secret: e.target.checked })}
                    className="accent-[#BE123C]"
                  />
                  Gizli
                </label>
                <button
                  type="button"
                  onClick={() => removeCustomField(idx)}
                  className="col-span-1 text-[#9C868E] hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar</label>
            <textarea
              rows={3}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ek açıklamalar, 2FA bilgileri..."
              className="pv-input resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setModalOpen(false)} className="pv-btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={saving} className="pv-btn-primary">
              {saving ? 'Şifreleniyor...' : editing ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>

      <PasswordGeneratorModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        clipboardClearSeconds={clipboardClearSeconds}
        onSelect={modalOpen ? (pwd) => setForm((prev) => ({ ...prev, password: pwd })) : undefined}
      />
    </div>
  );
};

