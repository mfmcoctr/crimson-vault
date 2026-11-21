import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Calendar,
  CreditCard,
  FileKey2,
  FileText,
  KeyRound,
  Lock,
  Search,
  ShoppingBag,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { api } from '../api';
import type { GlobalSearchResult } from '../types';
import { useI18n, type TranslationKey } from '../i18n';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: string, focus?: { id?: string; clientId?: string }) => void;
  onOpenGenerator: () => void;
  onLock: () => void;
}

const KIND_META: Record<GlobalSearchResult['kind'], { labelKey: TranslationKey; icon: React.ReactNode }> = {
  password: { labelKey: 'cmd.kind.password', icon: <KeyRound className="w-4 h-4 text-rose-400" /> },
  subscription: { labelKey: 'cmd.kind.subscription', icon: <CreditCard className="w-4 h-4 text-amber-300" /> },
  note: { labelKey: 'cmd.kind.note', icon: <StickyNote className="w-4 h-4 text-emerald-300" /> },
  event: { labelKey: 'cmd.kind.event', icon: <Calendar className="w-4 h-4 text-sky-300" /> },
  client: { labelKey: 'cmd.kind.client', icon: <Briefcase className="w-4 h-4 text-rose-300" /> },
  'client-credential': { labelKey: 'cmd.kind.client-credential', icon: <KeyRound className="w-4 h-4 text-rose-400" /> },
  'client-note': { labelKey: 'cmd.kind.client-note', icon: <FileText className="w-4 h-4 text-purple-300" /> },
  'client-file': { labelKey: 'cmd.kind.client-file', icon: <FileKey2 className="w-4 h-4 text-amber-300" /> },
  deal: { labelKey: 'cmd.kind.deal', icon: <ShoppingBag className="w-4 h-4 text-emerald-300" /> },
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
  onOpenGenerator,
  onLock,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.searchGlobal(query);
        if (!cancelled) {
          setResults(res);
          setActiveIdx(0);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 110);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  const quickActions = [
    {
      id: 'act-gen',
      title: t('cmd.openGenerator'),
      subtitle: t('cmd.openGeneratorSub'),
      icon: <Sparkles className="w-4 h-4 text-rose-300" />,
      run: () => {
        onClose();
        onOpenGenerator();
      },
    },
    {
      id: 'act-clients',
      title: t('cmd.clientZip'),
      subtitle: t('cmd.clientZipSub'),
      icon: <Briefcase className="w-4 h-4 text-rose-300" />,
      run: () => {
        onClose();
        onNavigate('clients');
      },
    },
    {
      id: 'act-lock',
      title: t('cmd.lockNow'),
      subtitle: t('cmd.lockNowSub'),
      icon: <Lock className="w-4 h-4 text-rose-400" />,
      run: () => {
        onClose();
        onLock();
      },
    },
  ];

  const handleSelectResult = (r: GlobalSearchResult) => {
    onClose();
    if (r.kind === 'password') onNavigate('passwords', { id: r.id });
    else if (r.kind === 'subscription') onNavigate('subscriptions', { id: r.id });
    else if (r.kind === 'note') onNavigate('notes', { id: r.id });
    else if (r.kind === 'event') onNavigate('calendar', { id: r.id });
    else if (r.kind === 'deal') onNavigate('deals', { id: r.id });
    else if (r.kind === 'client') onNavigate('clients', { clientId: r.id });
    else if (r.parentId) onNavigate('clients', { clientId: r.parentId, id: r.id });
  };

  const totalItems = results.length;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[11vh] px-4 bg-black/75 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl pv-glass rounded-2xl border border-rose-500/35 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-black/40">
          <Search className="w-5 h-5 text-rose-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(Math.max(totalItems - 1, 0), i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && results[activeIdx]) {
                e.preventDefault();
                handleSelectResult(results[activeIdx]);
              }
            }}
            placeholder={t('cmd.placeholder')}
            className="flex-1 bg-transparent text-white placeholder-[#9C868E] outline-none text-sm sm:text-base"
          />
          <kbd className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-[#D7C7CC] border border-white/10">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {!query && (
            <div>
              <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-[#9C868E] font-medium">
                {t('cmd.quickActions')}
              </div>
              {quickActions.map((act) => (
                <button
                  key={act.id}
                  onClick={act.run}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#9F1239]/25 text-left transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    {act.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{act.title}</div>
                    <div className="text-xs text-[#B8A2AA] truncate">{act.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-[#9C868E] font-medium flex items-center justify-between">
              <span>{query ? t('cmd.searchResults') : t('cmd.recentItems')}</span>
              {loading && <span className="text-rose-300">{t('cmd.searching')}</span>}
            </div>
            {results.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#9C868E]">
                {loading ? t('cmd.scanning') : t('cmd.noResults')}
              </div>
            ) : (
              results.map((r, idx) => {
                const meta = KIND_META[r.kind];
                return (
                  <button
                    key={`${r.kind}-${r.id}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => handleSelectResult(r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      idx === activeIdx ? 'bg-[#9F1239]/35 border border-rose-500/30' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{r.title}</div>
                      <div className="text-xs text-[#B8A2AA] truncate">{r.subtitle}</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-[#F8F4F5] border border-white/10 shrink-0">
                      {r.badge || t(meta.labelKey)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
