export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type EventType = 'birthday' | 'anniversary' | 'important' | 'reminder';
export type RecurrenceType = 'none' | 'yearly' | 'monthly';
export type ClientStatus = 'active' | 'maintenance' | 'archived';
export type ClientCredentialType =
  | 'admin'
  | 'hosting'
  | 'ftp'
  | 'ssh'
  | 'database'
  | 'domain'
  | 'api'
  | 'smtp'
  | 'other';

export interface CustomField {
  label: string;
  value: string;
  secret?: boolean;
}

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  customFields: CustomField[];
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionEntry {
  id: string;
  name: string;
  price: number;
  currency: CurrencyCode;
  billingCycle: BillingCycle;
  nextBillingDate: string; // YYYY-MM-DD
  category: string;
  status: SubscriptionStatus;
  autoRenew: boolean;
  paymentMethod: string;
  url: string;
  notes: string;
  remindDaysBefore: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  pinned: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventEntry {
  id: string;
  title: string;
  eventType: EventType;
  date: string; // YYYY-MM-DD
  birthYear?: number | null;
  recurrence: RecurrenceType;
  remindDaysBefore: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientVault {
  id: string;
  name: string;
  company: string;
  domain: string;
  extraDomains: string[];
  contactEmail: string;
  contactPhone: string;
  status: ClientStatus;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  credentialCount?: number;
  noteCount?: number;
  fileCount?: number;
}

export interface ClientCredential {
  id: string;
  clientId: string;
  title: string;
  credentialType: ClientCredentialType;
  hostOrUrl: string;
  username: string;
  password: string;
  port: string;
  notes: string;
  tags: string[];
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientNote {
  id: string;
  clientId: string;
  title: string;
  content: string;
  noteType: 'markdown' | 'env' | 'text';
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFileMeta {
  id: string;
  clientId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  isTextPreviewable: boolean;
  notes: string;
  createdAt: string;
}

export type BackgroundMode = 'default' | 'custom' | 'folder';
export type BackgroundFit = 'cover' | 'contain';

export interface AppSettings {
  defaultCurrency: CurrencyCode;
  exchangeRates: Record<CurrencyCode, number>;
  backgroundMode: BackgroundMode;
  backgroundFolderPath: string;
  slideshowIntervalSeconds: number;
  slideshowShuffle: boolean;
  slideshowIncludeSubfolders: boolean;
  backgroundFit: BackgroundFit;
  backgroundOpacity: number;
  backgroundBlur: number;
  cardOpacity: number;
  hasCustomBackground: boolean;
  customBackgroundVersion: number;
  clipboardClearSeconds: number;
  autoLockMinutes: number;
  browserNotifications: boolean;
  showSubscriptionsOnCalendar: boolean;
}

export interface MobileAccessInfo {
  tailscaleInstalled: boolean;
  tailscaleRunning: boolean;
  tailscaleDnsName: string;
  tailscaleHttpsUrl: string;
  serveActive: boolean;
  lanUrls: string[];
  port: number;
  qrSvg: string;
}

export interface AuthStatus {
  initialized: boolean;
  unlocked: boolean;
  settingsPreview: {
    backgroundOpacity: number;
    backgroundBlur: number;
    cardOpacity: number;
    hasCustomBackground: boolean;
    customBackgroundVersion: number;
  };
}

export interface ParsedImportCredential {
  tempId: string;
  title: string;
  credentialType: ClientCredentialType;
  hostOrUrl: string;
  username: string;
  password: string;
  port: string;
  notes: string;
  tags: string[];
  sourceFile: string;
}

export interface ParsedImportNote {
  tempId: string;
  title: string;
  content: string;
  noteType: 'markdown' | 'env' | 'text';
  sourceFile: string;
}

export interface ParsedImportFileMeta {
  tempId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  isTextPreviewable: boolean;
  textPreview?: string;
}

export interface ArchivePreviewResponse {
  stagingId: string;
  suggestedClientName: string;
  detectedDomain: string;
  archiveFilename: string;
  wasEncryptedZip: boolean;
  credentials: ParsedImportCredential[];
  notes: ParsedImportNote[];
  files: ParsedImportFileMeta[];
  warnings: string[];
}

export interface GlobalSearchResult {
  id: string;
  kind: 'password' | 'subscription' | 'note' | 'event' | 'client' | 'client-credential' | 'client-note' | 'client-file';
  title: string;
  subtitle: string;
  parentId?: string;
  badge?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCurrency: 'TRY',
  exchangeRates: {
    TRY: 1,
    USD: 36.5,
    EUR: 39.5,
    GBP: 46.2,
  },
  backgroundMode: 'default',
  backgroundFolderPath: '',
  slideshowIntervalSeconds: 30,
  slideshowShuffle: true,
  slideshowIncludeSubfolders: true,
  backgroundFit: 'cover',
  backgroundOpacity: 0.44,
  backgroundBlur: 2,
  cardOpacity: 0.76,
  hasCustomBackground: false,
  customBackgroundVersion: 1,
  clipboardClearSeconds: 30,
  autoLockMinutes: 0, // Pratik kullanım: uygulama açıkken otomatik kilitleme kapalı
  browserNotifications: true,
  showSubscriptionsOnCalendar: true,
};

