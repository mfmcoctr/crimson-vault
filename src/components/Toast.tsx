import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useI18n } from '../i18n';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  copySecret: (value: string, label: string, clearAfterSeconds?: number) => Promise<void>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const clearTimerRef = useRef<number | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      window.setTimeout(() => dismiss(id), 3600);
    },
    [dismiss],
  );

  const copySecret = useCallback(
    async (value: string, label: string, clearAfterSeconds = 0) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          // Fallback for plain HTTP local network access on mobile
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        if (clearAfterSeconds > 0) {
          notify(t('common.clipboardCopiedAuto', { label, seconds: clearAfterSeconds }), 'success');
          if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
          clearTimerRef.current = window.setTimeout(async () => {
            try {
              if (navigator.clipboard && window.isSecureContext) {
                const current = await navigator.clipboard.readText();
                if (current === value) {
                  await navigator.clipboard.writeText('');
                }
              }
            } catch {
              // ignore permission loss when unfocused
            }
          }, clearAfterSeconds * 1000);
        } else {
          notify(t('common.clipboardCopied', { label }), 'success');
        }
      } catch {
        notify(t('common.clipboardFailed'), 'error');
      }
    },
    [notify, t],
  );

  return (
    <ToastContext.Provider value={{ notify, copySecret }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto pv-glass-crimson rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-white shadow-2xl border border-rose-500/30 animate-[fadeIn_0.2s_ease]"
          >
            {item.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {item.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {item.type === 'info' && <Info className="w-4 h-4 text-rose-200 shrink-0 mt-0.5" />}
            <span className="flex-1 leading-snug text-[#F8F4F5]">{item.message}</span>
            <button
              onClick={() => dismiss(item.id)}
              className="text-rose-200/60 hover:text-white transition-colors cursor-pointer"
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
