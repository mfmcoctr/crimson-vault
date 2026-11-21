import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Columns2,
  Copy,
  Edit3,
  Eye,
  Pin,
  Plus,
  Save,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type { NoteEntry } from '../types';
import { useToast } from '../components/Toast';

const NOTE_CATEGORIES = ['Genel', 'Kişisel', 'İş', 'Finans', 'Teknik', 'Fikirler', 'Kurtarma Bilgileri'];

interface NotesPageProps {
  notes: NoteEntry[];
  onRefresh: () => Promise<void>;
}

export const NotesPage: React.FC<NotesPageProps> = ({ notes, onRefresh }) => {
  const { notify, copySecret } = useToast();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id || null);
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Genel');
  const [tagsText, setTagsText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortedNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...notes]
      .filter((n) => {
        if (!q) return true;
        return [n.title, n.content, n.category, n.tags.join(' ')].some((f) => f.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, search]);

  const activeNote = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);

  useEffect(() => {
    if (!selectedId && sortedNotes.length > 0) {
      setSelectedId(sortedNotes[0].id);
    }
  }, [sortedNotes, selectedId]);

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setContent(activeNote.content);
      setCategory(activeNote.category);
      setTagsText(activeNote.tags.join(', '));
      setPinned(activeNote.pinned);
      setDirty(false);
    }
  }, [activeNote?.id]);

  const handleCreateNote = async () => {
    const created = await api.createNote({
      title: 'Yeni Güvenli Not',
      content: '# Yeni Not\n\nMarkdown ile düzenli notlarınızı güvenle saklayın.\n\n- [ ] Yapılacak madde\n',
      category: 'Genel',
      tags: [],
      pinned: false,
    });
    await onRefresh();
    setSelectedId(created.id);
    notify('Yeni güvenli not oluşturuldu.');
  };

  const handleSave = async () => {
    if (!activeNote) return;
    setSaving(true);
    try {
      await api.updateNote(activeNote.id, {
        title: title.trim() || 'Başlıksız Not',
        content,
        category,
        pinned,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setDirty(false);
      notify('Not şifrelenerek kaydedildi.');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Not kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && activeNote) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleTogglePin = async () => {
    if (!activeNote) return;
    const nextPinned = !pinned;
    setPinned(nextPinned);
    await api.updateNote(activeNote.id, { pinned: nextPinned });
    await onRefresh();
    notify(nextPinned ? 'Not sabitlendi.' : 'Sabitleme kaldırıldı.');
  };

  const handleDelete = async () => {
    if (!activeNote) return;
    if (!window.confirm(`"${activeNote.title}" notunu silmek istediğinize emin misiniz?`)) return;
    await api.deleteNote(activeNote.id);
    setSelectedId(null);
    notify('Not silindi.');
    await onRefresh();
  };

  const renderedHtml = useMemo(() => {
    const raw = marked.parse(content || '', { breaks: true, gfm: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Güvenli Notlar</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Markdown destekli, yerel veritabanında AES-256-GCM ile şifrelenmiş özel not defteriniz.
          </p>
        </div>
        <button onClick={handleCreateNote} className="pv-btn-primary">
          <Plus className="w-4 h-4" />
          Yeni Not
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
        {/* Note List Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 pv-glass rounded-2xl p-3 flex flex-col gap-3 max-h-[76vh]">
          <div className="relative">
            <Search className="w-4 h-4 text-rose-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Notlarda ara..."
              className="pv-input pl-9 py-2 text-xs"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {sortedNotes.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#9C868E]">Not bulunamadı.</div>
            ) : (
              sortedNotes.map((n) => {
                const active = n.id === activeNote?.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`w-full p-3 rounded-xl text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#9F1239]/35 border border-rose-500/45'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border border-white/8'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">{n.title}</span>
                      {n.pinned && <Pin className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-[#B8A2AA] line-clamp-2 mt-1">
                      {n.content.replace(/[#*_`>]/g, '') || 'İçerik boş'}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-[#9C868E]">
                      <span>{n.category}</span>
                      <span>{new Date(n.updatedAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editor & Markdown Preview */}
        <div className="lg:col-span-8 xl:col-span-9 pv-glass rounded-2xl flex flex-col overflow-hidden min-h-[68vh]">
          {!activeNote ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <StickyNote className="w-10 h-10 text-rose-400/70" />
              <div className="text-base font-medium text-white">Henüz bir not seçilmedi</div>
              <p className="text-sm text-[#A8929A]">
                Soldan bir not seçin veya yeni bir şifreli Markdown notu oluşturun.
              </p>
              <button onClick={handleCreateNote} className="pv-btn-primary">
                <Plus className="w-4 h-4" />
                İlk Notu Oluştur
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="px-4 py-3 border-b border-white/10 bg-black/35 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Not başlığı..."
                    className="bg-transparent text-white font-semibold text-base sm:text-lg outline-none flex-1 min-w-0"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex rounded-lg bg-black/50 border border-white/10 p-0.5">
                    {[
                      { id: 'edit', icon: <Edit3 className="w-3.5 h-3.5" />, label: 'Yaz' },
                      { id: 'split', icon: <Columns2 className="w-3.5 h-3.5" />, label: 'Bölünmüş' },
                      { id: 'preview', icon: <Eye className="w-3.5 h-3.5" />, label: 'Önizle' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setViewMode(m.id as 'edit' | 'split' | 'preview')}
                        className={`px-2.5 py-1 rounded-md text-xs inline-flex items-center gap-1 cursor-pointer transition-colors ${
                          viewMode === m.id ? 'bg-[#9F1239] text-white' : 'text-[#C8B5BC] hover:text-white'
                        }`}
                      >
                        {m.icon}
                        <span className="hidden sm:inline">{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleTogglePin}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                      pinned
                        ? 'bg-[#9F1239]/40 border-rose-500/40 text-rose-200'
                        : 'bg-white/5 border-white/10 text-[#C8B5BC] hover:text-white'
                    }`}
                    title={pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => copySecret(content, 'Not içeriği', 0)}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-[#C8B5BC] hover:text-white cursor-pointer"
                    title="Markdown kopyala"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-[#C8B5BC] hover:text-rose-300 cursor-pointer"
                    title="Notu sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="pv-btn-primary py-1.5 px-3 text-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Kaydediliyor...' : dirty ? 'Kaydet *' : 'Kaydedildi'}
                  </button>
                </div>
              </div>

              {/* Meta bar */}
              <div className="px-4 py-2 border-b border-white/8 bg-black/20 flex flex-wrap items-center gap-3 text-xs">
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setDirty(true);
                  }}
                  className="pv-select py-1 px-2.5 text-xs"
                >
                  {NOTE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Etiketler (virgülle: banka, önemli, yedek)"
                  className="bg-transparent text-[#D7C7CC] placeholder-[#8B747C] outline-none flex-1 min-w-[180px]"
                />
                <span className="text-[#9C868E]">
                  {content.trim() ? content.trim().split(/\s+/).length : 0} kelime · Ctrl+S
                </span>
              </div>

              {/* Split Editor / Preview Body */}
              <div
                className={`flex-1 grid ${
                  viewMode === 'split' ? 'grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10' : 'grid-cols-1'
                } min-h-[480px]`}
              >
                {viewMode !== 'preview' && (
                  <textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Markdown formatında yazın (# Başlık, **kalın**, `kod`, - liste)..."
                    className="w-full h-full min-h-[420px] p-5 bg-transparent text-[#F8F4F5] font-mono-code text-sm leading-relaxed outline-none resize-none"
                  />
                )}
                {viewMode !== 'edit' && (
                  <div
                    className="p-5 overflow-y-auto pv-markdown bg-black/20"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

