import { useI18n, languages } from '../i18n/I18nContext';

interface Props {
  variant?: 'header' | 'menu';
}

export default function LanguageSwitcher({ variant = 'header' }: Props) {
  const { lang, setLang } = useI18n();
  const full = variant === 'menu';

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: 11,
        border: '1.5px solid var(--line)',
        background: '#fff',
        width: full ? '100%' : undefined,
      }}
    >
      {languages.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            title={l.name}
            style={{
              flex: full ? 1 : undefined,
              padding: full ? '10px 0' : '6px 9px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              font: "700 13px 'Hanken Grotesk', sans-serif",
              letterSpacing: '.02em',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--soft)',
              transition: 'background .2s, color .2s',
            }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
