import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Lock,
  Menu,
  Newspaper,
  Pause,
  Play,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  StickyNote,
  TrendingUp,
  X,
} from 'lucide-react';
import type { AppLanguage, AppSettings } from '../types';
import type { ActiveReminderAlert } from '../utils/dateUtils';
import { useI18n } from '../i18n';
import { BackgroundSlideshow, type SlideshowControlsState } from './BackgroundSlideshow';
import { LanguageSwitcher } from './LanguageSwitcher';

export type NavPage =
  | 'dashboard'
  | 'passwords'
  | 'subscriptions'
  | 'notes'
  | 'calendar'
  | 'clients'
  | 'markets'
  | 'news'
  | 'deals'
  | 'settings';

interface LayoutProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  settings: AppSettings;
  counts: {
    passwords: number;
    subscriptions: number;
    notes: number;
    events: number;
    clients: number;
    deals: number;
  };
  reminders: ActiveReminderAlert[];
  onOpenSearch: () => void;
  onOpenGenerator: () => void;
  onLock: () => void;
  onChangeLanguage: (lang: AppLanguage) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  settings,
  counts,
  reminders,
  onOpenSearch,
  onOpenGenerator,
  onLock,
  onChangeLanguage,
  children,
}) => {
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [slideCtrl, setSlideCtrl] = useState<SlideshowControlsState | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const handleControlsReady = useCallback((ctrl: SlideshowControlsState) => {
    setSlideCtrl(ctrl);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const navItems: {
    id: NavPage;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    accent?: boolean;
  }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'passwords', label: t('nav.passwords'), icon: <KeyRound className="w-4 h-4" />, badge: counts.passwords },
    { id: 'subscriptions', label: t('nav.subscriptions'), icon: <CreditCard className="w-4 h-4" />, badge: counts.subscriptions },
    { id: 'notes', label: t('nav.notes'), icon: <StickyNote className="w-4 h-4" />, badge: counts.notes },
    { id: 'calendar', label: t('nav.calendar'), icon: <Calendar className="w-4 h-4" />, badge: counts.events },
    {
      id: 'clients',
      label: t('nav.clients'),
      icon: <Briefcase className="w-4 h-4" />,
      badge: counts.clients,
      accent: true,
    },
    {
      id: 'markets',
      label: t('nav.markets'),
      icon: <TrendingUp className="w-4 h-4" />,
      accent: true,
    },
    {
      id: 'news',
      label: t('nav.news'),
      icon: <Newspaper className="w-4 h-4" />,
    },
    {
      id: 'deals',
      label: t('nav.deals'),
      icon: <ShoppingBag className="w-4 h-4" />,
      badge: counts.deals,
    },
    { id: 'settings', label: t('nav.settings'), icon: <Settings className="w-4 h-4" /> },
  ];

  const handleNav = (id: NavPage) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div
      className="relative min-h-screen w-full flex text-[#F8F4F5] overflow-x-hidden bg-[#0B0507]"
      style={
        {
          '--pv-card-opacity': settings.cardOpacity,
          '--pv-bg-opacity': settings.backgroundOpacity,
          '--pv-bg-blur': `${settings.backgroundBlur}px`,
        } as React.CSSProperties
      }
    >
      {/* Fullscreen Ambient Background / Local Folder Slideshow */}
      <BackgroundSlideshow settings={settings} onControlsReady={handleControlsReady} />

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-68 shrink-0 pv-glass border-r border-white/10 flex flex-col transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 flex items-center justify-between border-b border-white/10">
          <button onClick={() => handleNav('dashboard')} className="flex items-center gap-3 text-left cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9F1239] via-[#7F1D1D] to-[#2B0711] border border-white/20 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(225,29,72,0.8)]">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display text-base font-bold text-white tracking-widest leading-none">
                PERSONVAULT
              </div>
              <div className="text-[11px] text-rose-200/75 mt-1">Crimson Sanctum</div>
            </div>
          </button>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-[#D7C7CC] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#9F1239]/85 to-[#7F1D1D]/55 text-white border border-rose-400/35 shadow-[0_6px_20px_-8px_rgba(225,29,72,0.75)]'
                    : 'text-[#D7C7CC] hover:text-white hover:bg-white/7 border border-transparent'
                }`}
              >
                <span className={active ? 'text-white' : item.accent ? 'text-rose-400' : 'text-[#A8929A]'}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      active ? 'bg-black/30 text-white' : 'bg-white/8 text-[#D7C7CC]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={onOpenGenerator}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-[#9F1239]/25 border border-white/10 hover:border-rose-500/35 text-xs font-medium text-[#F8F4F5] transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-rose-400" />
            <span>{t('nav.generator')}</span>
          </button>
          <button
            onClick={onLock}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/25 text-xs font-medium text-rose-100 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-rose-300" />
            <span>{t('nav.lockVault')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-7 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0B0507]/65 backdrop-blur-xl">
          <div className="flex items-center gap-3 flex-1 max-w-xl min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white cursor-pointer"
              aria-label={t('nav.menu')}
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              onClick={onOpenSearch}
              className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-white/12 hover:border-rose-500/40 text-sm text-[#B8A2AA] transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2.5 truncate">
                <Search className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{t('nav.quickSearch')}</span>
              </span>
              <kbd className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded bg-white/8 text-[#D7C7CC] border border-white/10 font-mono-code">
                Ctrl+K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Compact Slideshow Mini-Controls (only when Folder Slideshow is active) */}
            {slideCtrl?.active && (
              <div
                className="hidden md:flex items-center gap-1 px-2 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-[#E4D5DA]"
                title={slideCtrl.currentName}
              >
                <button
                  onClick={slideCtrl.prev}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#D7C7CC] hover:text-white cursor-pointer"
                  title={t('nav.prevSlide')}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={slideCtrl.togglePause}
                  className="p-1 rounded-lg hover:bg-white/10 text-rose-300 hover:text-white cursor-pointer"
                  title={slideCtrl.paused ? t('nav.resumeSlide') : t('nav.pauseSlide')}
                >
                  {slideCtrl.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={slideCtrl.next}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#D7C7CC] hover:text-white cursor-pointer"
                  title={t('nav.nextSlide')}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 font-mono-code text-[11px] text-[#B8A2AA]">
                  {slideCtrl.currentIndex + 1}/{slideCtrl.total}
                </span>
              </div>
            )}

            {/* Quick Language Switcher (TR | EN | DE) */}
            <LanguageSwitcher variant="compact" onSelect={onChangeLanguage} />

            {/* Notifications Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#F8F4F5] transition-colors cursor-pointer"
                title={t('nav.upcomingReminders')}
              >
                <Bell className="w-4 h-4" />
                {reminders.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E11D48] text-[10px] font-bold text-white flex items-center justify-center shadow">
                    {reminders.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 pv-glass rounded-2xl border border-rose-500/30 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#4C0519]/40">
                    <span className="text-sm font-semibold text-white">{t('nav.remindersHeader')}</span>
                    <span className="text-[11px] text-rose-200">
                      {t('nav.activeCount', { count: reminders.length })}
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/8">
                    {reminders.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#A8929A]">{t('nav.noReminders')}</div>
                    ) : (
                      reminders.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setNotifOpen(false);
                            onNavigate(
                              r.source === 'subscription'
                                ? 'subscriptions'
                                : r.source === 'deal'
                                  ? 'deals'
                                  : 'calendar',
                            );
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-white/6 transition-colors flex items-start gap-3 cursor-pointer"
                        >
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              r.urgent ? 'bg-rose-500 shadow-[0_0_8px_#e11d48]' : 'bg-amber-400'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-white truncate">{r.title}</div>
                            <div className="text-xs text-[#C8B5BC] mt-0.5">{r.subtitle}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-4 sm:p-7 pb-24 lg:pb-7 max-w-[1440px] w-full mx-auto">{children}</main>

        {/* Mobile Bottom Navigation Bar (PWA Native App Feel) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pv-glass border-t border-white/12 px-2 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] flex items-center justify-around">
          {[
            { id: 'dashboard' as NavPage, label: t('nav.mobile.dashboard'), icon: <LayoutDashboard className="w-5 h-5" /> },
            { id: 'passwords' as NavPage, label: t('nav.mobile.passwords'), icon: <KeyRound className="w-5 h-5" /> },
            { id: 'clients' as NavPage, label: t('nav.mobile.clients'), icon: <Briefcase className="w-5 h-5" /> },
            { id: 'calendar' as NavPage, label: t('nav.mobile.calendar'), icon: <Calendar className="w-5 h-5" /> },
            { id: 'settings' as NavPage, label: t('nav.mobile.settings'), icon: <Settings className="w-5 h-5" /> },
          ].map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
                  active ? 'text-rose-300 bg-[#9F1239]/25' : 'text-[#B8A2AA] hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
