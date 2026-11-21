import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, ShieldCheck, Check } from 'lucide-react';
import { Modal } from './Modal';
import {
  DEFAULT_GENERATOR_OPTIONS,
  evaluatePasswordStrength,
  generatePassword,
  type GeneratorOptions,
} from '../utils/passwordUtils';
import { useToast } from './Toast';

interface PasswordGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (password: string) => void;
  clipboardClearSeconds?: number;
}

export const PasswordGeneratorModal: React.FC<PasswordGeneratorModalProps> = ({
  open,
  onClose,
  onSelect,
  clipboardClearSeconds = 30,
}) => {
  const { copySecret } = useToast();
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [generated, setGenerated] = useState(() => generatePassword(DEFAULT_GENERATOR_OPTIONS));

  const regenerate = (nextOpts: GeneratorOptions = opts) => {
    setGenerated(generatePassword(nextOpts));
  };

  useEffect(() => {
    if (open) {
      setGenerated(generatePassword(opts));
    }
  }, [open]);

  const updateOpts = (patch: Partial<GeneratorOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    regenerate(next);
  };

  const strength = evaluatePasswordStrength(generated);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Güçlü Şifre Üretici"
      subtitle="Kriptografik olarak güvenli rastgele parola veya akılda kalıcı parola cümlesi üretin"
      size="md"
    >
      <div className="space-y-5">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/45 border border-white/10">
          <button
            type="button"
            onClick={() => updateOpts({ mode: 'random' })}
            className={`py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              opts.mode === 'random'
                ? 'bg-[#9F1239] text-white shadow'
                : 'text-[#C8B5BC] hover:text-white'
            }`}
          >
            Rastgele Karakter
          </button>
          <button
            type="button"
            onClick={() => updateOpts({ mode: 'passphrase' })}
            className={`py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              opts.mode === 'passphrase'
                ? 'bg-[#9F1239] text-white shadow'
                : 'text-[#C8B5BC] hover:text-white'
            }`}
          >
            Kelime Bazlı (Passphrase)
          </button>
        </div>

        {/* Preview Output */}
        <div className="rounded-2xl bg-black/60 border border-rose-500/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <code className="font-mono-code text-lg sm:text-xl text-white break-all flex-1 select-all">
              {generated}
            </code>
            <button
              type="button"
              onClick={() => regenerate()}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-rose-200 hover:text-white transition-colors cursor-pointer"
              title="Yeniden Üret"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => copySecret(generated, 'Üretilen şifre', clipboardClearSeconds)}
              className="p-2.5 rounded-xl bg-[#9F1239]/60 hover:bg-[#BE123C] text-white transition-colors cursor-pointer"
              title="Kopyala"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#B8A2AA] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                Güvenlik Seviyesi
              </span>
              <span className={`font-medium ${strength.textColor}`}>
                {strength.label} ({strength.score}/100)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.barColor}`}
                style={{ width: `${strength.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Options */}
        {opts.mode === 'random' ? (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-[#D7C7CC]">Uzunluk</span>
                <span className="font-mono-code text-white font-semibold">{opts.length} karakter</span>
              </div>
              <input
                type="range"
                min={8}
                max={64}
                value={opts.length}
                onChange={(e) => updateOpts({ length: Number(e.target.value) })}
                className="w-full pv-slider"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-sm">
              {[
                { key: 'uppercase', label: 'Büyük Harf (A-Z)' },
                { key: 'lowercase', label: 'Küçük Harf (a-z)' },
                { key: 'numbers', label: 'Rakamlar (0-9)' },
                { key: 'symbols', label: 'Semboller (!@#$%)' },
                { key: 'excludeAmbiguous', label: 'Karışanları Hariç Tut (0,O,1,l)' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:border-rose-500/40"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(opts[item.key as keyof GeneratorOptions])}
                    onChange={(e) => updateOpts({ [item.key]: e.target.checked })}
                    className="accent-[#BE123C] w-4 h-4"
                  />
                  <span className="text-[#F8F4F5] text-xs sm:text-sm">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-[#D7C7CC]">Kelime Sayısı</span>
                <span className="font-mono-code text-white font-semibold">{opts.wordCount} kelime</span>
              </div>
              <input
                type="range"
                min={3}
                max={7}
                value={opts.wordCount}
                onChange={(e) => updateOpts({ wordCount: Number(e.target.value) })}
                className="w-full pv-slider"
              />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-[#C8B5BC] mb-1">Ayırıcı</label>
                <select
                  value={opts.separator}
                  onChange={(e) => updateOpts({ separator: e.target.value })}
                  className="pv-select w-full"
                >
                  <option value="-">Tire (-)</option>
                  <option value="_">Alt Çizgi (_)</option>
                  <option value=".">Nokta (.)</option>
                  <option value="!">Ünlem (!)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={opts.capitalizeWords}
                  onChange={(e) => updateOpts({ capitalizeWords: e.target.checked })}
                  className="accent-[#BE123C]"
                />
                <span className="text-xs text-white">Baş Harf Büyük</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={opts.includeNumber}
                  onChange={(e) => updateOpts({ includeNumber: e.target.checked })}
                  className="accent-[#BE123C]"
                />
                <span className="text-xs text-white">Rakam Ekle</span>
              </label>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
          <button type="button" onClick={onClose} className="pv-btn-secondary">
            Kapat
          </button>
          {onSelect && (
            <button
              type="button"
              onClick={() => {
                onSelect(generated);
                onClose();
              }}
              className="pv-btn-primary"
            >
              <Check className="w-4 h-4" />
              Bu Şifreyi Kullan
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

