import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import type {
  AppSettings,
  AuthStatus,
  CalendarEventEntry,
  ClientVault,
  NoteEntry,
  PasswordEntry,
  SubscriptionEntry,
  TrackedProduct,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import { ToastProvider, useToast } from './components/Toast';
import { LockScreen } from './components/LockScreen';
import { Layout, type NavPage } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal';
import { DashboardPage } from './pages/DashboardPage';
import { PasswordsPage } from './pages/PasswordsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { NotesPage } from './pages/NotesPage';
import { CalendarPage } from './pages/CalendarPage';
import { ClientsPage } from './pages/ClientsPage';
import { MarketsPage } from './pages/MarketsPage';
import { NewsPage } from './pages/NewsPage';
import { DealsPage } from './pages/DealsPage';
import { SettingsPage } from './pages/SettingsPage';
import { collectActiveReminders, type ActiveReminderAlert } from './utils/dateUtils';
import { formatCurrency } from './utils/currencyUtils';

const VaultAppInner: React.FC = () => {
  const { notify } = useToast();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [passwordFilterHint, setPasswordFilterHint] = useState<string | undefined>(undefined);
  const [clientFocusId, setClientFocusId] = useState<string | null>(null);

  // Vault state
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [events, setEvents] = useState<CalendarEventEntry[]>([]);
  const [clients, setClients] = useState<ClientVault[]>([]);
  const [deals, setDeals] = useState<TrackedProduct[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);

  // Modals
  const [searchOpen, setSearchOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      setAuth(status);
    } catch {
      notify('Yerel sunucuya bağlanılamadı.', 'error');
    }
  }, [notify]);

  const loadAllVaultData = useCallback(async () => {
    setLoadingVault(true);
    try {
      const [s, p, sub, n, ev, cl, dl] = await Promise.all([
        api.getSettings(),
        api.getPasswords(),
        api.getSubscriptions(),
        api.getNotes(),
        api.getEvents(),
        api.getClients(),
        api.getDeals(),
      ]);
      setSettings(s);
      setPasswords(p);
      setSubscriptions(sub);
      setNotes(n);
      setEvents(ev);
      setClients(cl);
      setDeals(dl);
    } catch {
      // handled by unauthorized handler
    } finally {
      setLoadingVault(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth((prev) => (prev ? { ...prev, unlocked: false } : prev));
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (auth?.unlocked) {
      loadAllVaultData();
    }
  }, [auth?.unlocked, loadAllVaultData]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    if (!auth?.unlocked) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth?.unlocked]);

  const reminders = useMemo<ActiveReminderAlert[]>(() => {
    const base = collectActiveReminders(events, subscriptions);
    const dealAlerts: ActiveReminderAlert[] = deals
      .filter((d) => d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice)
      .map((d) => ({
        id: `deal-${d.id}`,
        source: 'deal',
        title: `🎯 İndirim Alarmı: ${d.name}`,
        subtitle: `${d.store} · ${formatCurrency(d.currentPrice, d.currency)} (Hedef: ${formatCurrency(d.targetPrice, d.currency)})`,
        dateIso: d.updatedAt.slice(0, 10),
        daysUntil: 0,
        urgent: true,
      }));
    return [...dealAlerts, ...base];
  }, [events, subscriptions, deals]);

  // Fire daily browser notification for urgent reminders if granted
  useEffect(() => {
    if (!auth?.unlocked || !settings.browserNotifications || reminders.length === 0) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const todayKey = `pv_notif_${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(todayKey)) return;
    const urgent = reminders.filter((r) => r.daysUntil <= 1);
    if (urgent.length > 0) {
      new Notification('PersonVault Hatırlatma', {
        body: urgent.map((u) => `${u.title} (${u.subtitle})`).slice(0, 3).join('\n'),
      });
      localStorage.setItem(todayKey, '1');
    }
  }, [auth?.unlocked, settings.browserNotifications, reminders]);

  const handleLock = async () => {
    await api.lockVault();
    setPasswords([]);
    setSubscriptions([]);
    setNotes([]);
    setEvents([]);
    setClients([]);
    setDeals([]);
    setSearchOpen(false);
    await checkAuth();
    notify('Kasa kilitlendi ve bellekteki anahtar temizlendi.', 'info');
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    const saved = await api.updateSettings(patch);
    setSettings(saved);
  };

  const handleNavigate = (page: NavPage, opts?: { clientId?: string; filter?: string }) => {
    setPasswordFilterHint(opts?.filter);
    setClientFocusId(opts?.clientId || null);
    setActivePage(page);
  };

  if (!auth) {
    return (
      <div className="min-h-screen bg-[#0B0507] flex items-center justify-center text-[#D7C7CC] text-sm">
        PersonVault başlatılıyor...
      </div>
    );
  }

  if (!auth.unlocked) {
    const preview = auth.settingsPreview;
    const bgUrl = preview.hasCustomBackground
      ? `/api/settings/background/custom?v=${preview.customBackgroundVersion}`
      : '/bg-crimson-fantasy.jpg';
    return (
      <LockScreen
        initialized={auth.initialized}
        bgUrl={bgUrl}
        bgOpacity={preview.backgroundOpacity}
        bgBlur={preview.backgroundBlur}
        onUnlocked={async () => {
          await checkAuth();
        }}
      />
    );
  }

  return (
    <Layout
      activePage={activePage}
      onNavigate={(p) => handleNavigate(p)}
      settings={settings}
      counts={{
        passwords: passwords.length,
        subscriptions: subscriptions.filter((s) => s.status === 'active').length,
        notes: notes.length,
        events: events.length,
        clients: clients.length,
        deals: deals.length,
      }}
      reminders={reminders}
      onOpenSearch={() => setSearchOpen(true)}
      onOpenGenerator={() => setGenOpen(true)}
      onLock={handleLock}
    >
      {loadingVault && passwords.length === 0 && clients.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center text-sm text-[#D7C7CC]">
          Şifreli veritabanı çözülüyor...
        </div>
      ) : (
        <>
          {activePage === 'dashboard' && (
            <DashboardPage
              passwords={passwords}
              subscriptions={subscriptions}
              notes={notes}
              events={events}
              clients={clients}
              deals={deals}
              settings={settings}
              onNavigate={handleNavigate}
              onOpenGenerator={() => setGenOpen(true)}
            />
          )}

          {activePage === 'passwords' && (
            <PasswordsPage
              passwords={passwords}
              onRefresh={async () => setPasswords(await api.getPasswords())}
              clipboardClearSeconds={settings.clipboardClearSeconds}
              initialFilter={passwordFilterHint}
            />
          )}

          {activePage === 'subscriptions' && (
            <SubscriptionsPage
              subscriptions={subscriptions}
              settings={settings}
              onRefresh={async () => setSubscriptions(await api.getSubscriptions())}
            />
          )}

          {activePage === 'notes' && (
            <NotesPage
              notes={notes}
              onRefresh={async () => setNotes(await api.getNotes())}
            />
          )}

          {activePage === 'calendar' && (
            <CalendarPage
              events={events}
              subscriptions={subscriptions}
              settings={settings}
              onRefresh={async () => setEvents(await api.getEvents())}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          {activePage === 'clients' && (
            <ClientsPage
              clients={clients}
              onRefresh={async () => setClients(await api.getClients())}
              clipboardClearSeconds={settings.clipboardClearSeconds}
              initialClientId={clientFocusId}
            />
          )}

          {activePage === 'markets' && (
            <MarketsPage settings={settings} onUpdateSettings={handleUpdateSettings} />
          )}

          {activePage === 'news' && (
            <NewsPage settings={settings} onUpdateSettings={handleUpdateSettings} />
          )}

          {activePage === 'deals' && (
            <DealsPage deals={deals} onRefresh={async () => setDeals(await api.getDeals())} />
          )}

          {activePage === 'settings' && (
            <SettingsPage
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onSettingsReplaced={setSettings}
              onVaultRestored={loadAllVaultData}
            />
          )}
        </>
      )}

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(p, focus) => handleNavigate(p as NavPage, { clientId: focus?.clientId })}
        onOpenGenerator={() => setGenOpen(true)}
        onLock={handleLock}
      />

      <PasswordGeneratorModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        clipboardClearSeconds={settings.clipboardClearSeconds}
      />
    </Layout>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <VaultAppInner />
    </ToastProvider>
  );
}

