import type {
  AppSettings,
  ArchivePreviewResponse,
  AuthStatus,
  CalendarEventEntry,
  ClientCredential,
  ClientFileMeta,
  ClientNote,
  ClientVault,
  GlobalSearchResult,
  LocalNewsSnapshot,
  MarketsSnapshot,
  MobileAccessInfo,
  NoteEntry,
  PasswordEntry,
  StoreName,
  SubscriptionEntry,
  TrackedProduct,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? { ...(options.headers as Record<string, string>) }
    : { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    unauthorizedHandler?.();
  }

  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    let code: string | undefined;
    try {
      const errData = await res.json();
      if (errData?.error) message = errData.error;
      if (errData?.code) code = errData.code;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(message, res.status, code);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // --- Auth ---
  getAuthStatus: () => request<AuthStatus>('/api/auth/status'),
  setupVault: (masterPassword: string) =>
    request<{ ok: boolean; unlocked: boolean }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ masterPassword }),
    }),
  unlockVault: (masterPassword: string) =>
    request<{ ok: boolean; unlocked: boolean }>('/api/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ masterPassword }),
    }),
  lockVault: () => request<{ ok: boolean; unlocked: boolean }>('/api/auth/lock', { method: 'POST' }),
  changeMasterPassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // --- Passwords ---
  getPasswords: () => request<PasswordEntry[]>('/api/vault/passwords'),
  createPassword: (data: Partial<PasswordEntry>) =>
    request<PasswordEntry>('/api/vault/passwords', { method: 'POST', body: JSON.stringify(data) }),
  updatePassword: (id: string, data: Partial<PasswordEntry>) =>
    request<PasswordEntry>(`/api/vault/passwords/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePassword: (id: string) => request<{ ok: boolean }>(`/api/vault/passwords/${id}`, { method: 'DELETE' }),

  // --- Subscriptions ---
  getSubscriptions: () => request<SubscriptionEntry[]>('/api/vault/subscriptions'),
  createSubscription: (data: Partial<SubscriptionEntry>) =>
    request<SubscriptionEntry>('/api/vault/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (id: string, data: Partial<SubscriptionEntry>) =>
    request<SubscriptionEntry>(`/api/vault/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubscription: (id: string) =>
    request<{ ok: boolean }>(`/api/vault/subscriptions/${id}`, { method: 'DELETE' }),

  // --- Notes ---
  getNotes: () => request<NoteEntry[]>('/api/vault/notes'),
  createNote: (data: Partial<NoteEntry>) =>
    request<NoteEntry>('/api/vault/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id: string, data: Partial<NoteEntry>) =>
    request<NoteEntry>(`/api/vault/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) => request<{ ok: boolean }>(`/api/vault/notes/${id}`, { method: 'DELETE' }),

  // --- Calendar Events ---
  getEvents: () => request<CalendarEventEntry[]>('/api/vault/events'),
  createEvent: (data: Partial<CalendarEventEntry>) =>
    request<CalendarEventEntry>('/api/vault/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: Partial<CalendarEventEntry>) =>
    request<CalendarEventEntry>(`/api/vault/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: string) => request<{ ok: boolean }>(`/api/vault/events/${id}`, { method: 'DELETE' }),

  // --- Global Search ---
  searchGlobal: (q: string) => request<GlobalSearchResult[]>(`/api/vault/search?q=${encodeURIComponent(q)}`),

  // --- Client Vaults ---
  getClients: () => request<ClientVault[]>('/api/clients'),
  createClient: (data: Partial<ClientVault>) =>
    request<ClientVault>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: string, data: Partial<ClientVault>) =>
    request<ClientVault>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id: string) => request<{ ok: boolean }>(`/api/clients/${id}`, { method: 'DELETE' }),
  getClientDetail: (id: string) =>
    request<{
      client: ClientVault;
      credentials: ClientCredential[];
      notes: ClientNote[];
      files: ClientFileMeta[];
    }>(`/api/clients/${id}/detail`),

  createClientCredential: (clientId: string, data: Partial<ClientCredential>) =>
    request<ClientCredential>(`/api/clients/${clientId}/credentials`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateClientCredential: (clientId: string, credId: string, data: Partial<ClientCredential>) =>
    request<ClientCredential>(`/api/clients/${clientId}/credentials/${credId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteClientCredential: (clientId: string, credId: string) =>
    request<{ ok: boolean }>(`/api/clients/${clientId}/credentials/${credId}`, { method: 'DELETE' }),

  createClientNote: (clientId: string, data: Partial<ClientNote>) =>
    request<ClientNote>(`/api/clients/${clientId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateClientNote: (clientId: string, noteId: string, data: Partial<ClientNote>) =>
    request<ClientNote>(`/api/clients/${clientId}/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteClientNote: (clientId: string, noteId: string) =>
    request<{ ok: boolean }>(`/api/clients/${clientId}/notes/${noteId}`, { method: 'DELETE' }),

  uploadClientFiles: (clientId: string, files: File[], notes = '') => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (notes) fd.append('notes', notes);
    return request<ClientFileMeta[]>(`/api/clients/${clientId}/files`, { method: 'POST', body: fd });
  },
  previewClientFile: (clientId: string, fileId: string) =>
    request<{ meta: ClientFileMeta; text: string }>(`/api/clients/${clientId}/files/${fileId}/preview`),
  deleteClientFile: (clientId: string, fileId: string) =>
    request<{ ok: boolean }>(`/api/clients/${clientId}/files/${fileId}`, { method: 'DELETE' }),

  previewClientArchive: (files: File[], zipPassword?: string) => {
    const fd = new FormData();
    for (const f of files) fd.append('archive', f);
    if (zipPassword) fd.append('zipPassword', zipPassword);
    return request<ArchivePreviewResponse>('/api/clients/import/preview', { method: 'POST', body: fd });
  },
  commitClientArchive: (payload: {
    stagingId: string;
    targetClientId?: string;
    newClient?: { name: string; company?: string; domain?: string; tags?: string[] };
    selectedCredentialIds: string[];
    selectedNoteIds: string[];
    selectedFileIds: string[];
  }) =>
    request<{
      ok: boolean;
      clientId: string;
      clientName: string;
      importedCredentials: number;
      importedNotes: number;
      importedFiles: number;
    }>('/api/clients/import/commit', { method: 'POST', body: JSON.stringify(payload) }),

  exportClientZip: async (clientId: string, zipPassword?: string): Promise<Blob> => {
    const res = await fetch(`/api/clients/${clientId}/export-zip`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error || 'ZIP dışa aktarımı başarısız.', res.status);
    }
    return res.blob();
  },

  // --- Settings & Encrypted Backup ---
  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (data: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  uploadCustomBackground: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return request<AppSettings>('/api/settings/background', { method: 'POST', body: fd });
  },
  resetBackground: () => request<AppSettings>('/api/settings/background', { method: 'DELETE' }),
  testBackgroundFolder: (folderPath: string, includeSubfolders: boolean) =>
    request<{ ok: boolean; resolvedPath: string; count: number }>('/api/settings/background/folder/test', {
      method: 'POST',
      body: JSON.stringify({ folderPath, includeSubfolders }),
    }),
  listBackgroundFolderImages: () =>
    request<{ count: number; items: { id: string; name: string }[] }>('/api/settings/background/folder/list'),
  getMobileAccessInfo: () => request<MobileAccessInfo>('/api/settings/mobile-access'),
  enableTailscaleServe: () => request<MobileAccessInfo>('/api/settings/mobile-access/enable-serve', { method: 'POST' }),

  exportBackup: async (backupPassword: string): Promise<Blob> => {
    const res = await fetch('/api/settings/backup/export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error || 'Yedek oluşturulamadı.', res.status);
    }
    return res.blob();
  },

  importBackup: (file: File, backupPassword: string, mode: 'merge' | 'replace') => {
    const fd = new FormData();
    fd.append('backup', file);
    fd.append('backupPassword', backupPassword);
    fd.append('mode', mode);
    return request<{
      ok: boolean;
      restored: Record<string, number>;
    }>('/api/settings/backup/import', { method: 'POST', body: fd });
  },

  // --- Markets, Fuel, Hallein/Salzburg News & Deals ---
  getMarkets: (city?: 'hallein' | 'salzburg', refresh = false) =>
    request<MarketsSnapshot>(
      `/api/feeds/markets?${new URLSearchParams({
        ...(city ? { city } : {}),
        ...(refresh ? { refresh: '1' } : {}),
      }).toString()}`,
    ),
  getLocalNews: (refresh = false) =>
    request<LocalNewsSnapshot>(`/api/feeds/news${refresh ? '?refresh=1' : ''}`),
  getDeals: () => request<TrackedProduct[]>('/api/feeds/deals'),
  inspectDealUrl: (url: string) =>
    request<{
      store: StoreName;
      title: string;
      imageUrl: string;
      price: number | null;
      currency: 'TRY' | 'USD' | 'EUR' | 'GBP';
      blocked: boolean;
      message: string;
    }>('/api/feeds/deals/inspect', { method: 'POST', body: JSON.stringify({ url }) }),
  createDeal: (data: Partial<TrackedProduct>) =>
    request<TrackedProduct>('/api/feeds/deals', { method: 'POST', body: JSON.stringify(data) }),
  updateDeal: (id: string, data: Partial<TrackedProduct>) =>
    request<TrackedProduct>(`/api/feeds/deals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  checkDealPrice: (id: string) =>
    request<TrackedProduct>(`/api/feeds/deals/${id}/check`, { method: 'POST' }),
  deleteDeal: (id: string) => request<{ ok: boolean }>(`/api/feeds/deals/${id}`, { method: 'DELETE' }),
};

