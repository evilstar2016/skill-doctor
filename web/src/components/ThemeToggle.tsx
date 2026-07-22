import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '../theme-manager';
import { useTranslation } from '../i18n';

/**
 * Segmented light / dark / system theme control (replaces the single
 * flip button). The "system" option removes `data-theme` so the
 * prefers-color-scheme media query in theme-system.css takes over.
 */
export function ThemeToggle({ value, onChange }: { value: Theme; onChange: (next: Theme) => void }) {
  const { t } = useTranslation();
  return (
    <div className="theme-toggle" role="radiogroup" aria-label={t('topbar.theme.label')}>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'light'}
        className={`theme-toggle-option ${value === 'light' ? 'active' : ''}`}
        onClick={() => onChange('light')}
      >
        <Sun size={15} />
        <span>{t('topbar.theme.light')}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'dark'}
        className={`theme-toggle-option ${value === 'dark' ? 'active' : ''}`}
        onClick={() => onChange('dark')}
      >
        <Moon size={15} />
        <span>{t('topbar.theme.dark')}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'system'}
        className={`theme-toggle-option ${value === 'system' ? 'active' : ''}`}
        onClick={() => onChange('system')}
      >
        <Monitor size={15} />
        <span>{t('topbar.theme.system')}</span>
      </button>
    </div>
  );
}
