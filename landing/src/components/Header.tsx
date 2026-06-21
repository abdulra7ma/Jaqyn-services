import { useI18n } from '../i18n/I18nContext';
import LanguageSwitcher from './LanguageSwitcher';

interface Props {
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

export default function Header({ menuOpen, onToggleMenu, onCloseMenu }: Props) {
  const { content: c } = useI18n();

  return (
    <>
      <header
        id="jq-header"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          borderBottom: '1px solid transparent',
          transition: 'background .3s ease, box-shadow .3s ease, border-color .3s ease',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            padding: '15px 26px',
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', color: 'inherit' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                font: "800 20px/1 'Bricolage Grotesque', sans-serif",
                boxShadow: '0 6px 16px -5px rgba(160,73,42,.6)',
              }}
            >
              J
            </div>
            <div style={{ font: "700 21px/1 'Bricolage Grotesque', sans-serif", letterSpacing: '-.02em' }}>Jaqyn</div>
          </a>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {c.navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="jq-navlink"
                style={{
                  display: 'none',
                  padding: '9px 13px',
                  borderRadius: 10,
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: 'var(--soft)',
                  textDecoration: 'none',
                  transition: 'color .2s, background .2s',
                }}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="jq-desk-cta" style={{ display: 'none' }}>
              <LanguageSwitcher />
            </span>
            <a
              href="#deals"
              className="jq-desk-cta jq-desk-cta--ghost"
              style={{
                display: 'none',
                alignItems: 'center',
                padding: '11px 17px',
                borderRadius: 12,
                border: '1.5px solid var(--line)',
                background: '#fff',
                font: "700 14.5px 'Hanken Grotesk', sans-serif",
                color: 'var(--ink)',
                textDecoration: 'none',
                transition: 'border-color .2s',
              }}
            >
              {c.t.header.explore}
            </a>
            <a
              href="#register"
              className="jq-desk-cta jq-lift"
              style={{
                display: 'none',
                alignItems: 'center',
                padding: '11px 17px',
                borderRadius: 12,
                background: 'var(--accent)',
                font: "700 14.5px 'Hanken Grotesk', sans-serif",
                color: '#fff',
                textDecoration: 'none',
                boxShadow: '0 8px 18px -7px rgba(160,73,42,.6)',
                transition: 'transform .2s',
              }}
            >
              {c.t.header.register}
            </a>
            <button
              onClick={onToggleMenu}
              className="jq-burger"
              aria-label="Open menu"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                width: 42,
                height: 42,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                border: '1.5px solid var(--line)',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <i style={{ width: 18, height: 2, background: 'var(--ink)', borderRadius: 2, display: 'block' }} />
              <i style={{ width: 18, height: 2, background: 'var(--ink)', borderRadius: 2, display: 'block' }} />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
            background: 'rgba(46,36,29,.4)',
            backdropFilter: 'blur(4px)',
            animation: 'jqSlideUp .25s ease',
          }}
          onClick={onCloseMenu}
        >
          <div
            style={{
              position: 'absolute',
              top: 74,
              left: 14,
              right: 14,
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 22,
              padding: 14,
              boxShadow: '0 30px 60px -20px rgba(46,30,18,.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {c.navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={onCloseMenu}
                className="jq-menu-link"
                style={{
                  display: 'block',
                  padding: '14px 12px',
                  borderRadius: 13,
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                {l.label}
              </a>
            ))}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                marginTop: 8,
                paddingTop: 12,
                borderTop: '1px solid var(--line)',
              }}
            >
              <LanguageSwitcher variant="menu" />
              <a
                href="#deals"
                onClick={onCloseMenu}
                style={{
                  textAlign: 'center',
                  padding: 14,
                  borderRadius: 13,
                  border: '1.5px solid var(--line)',
                  font: "700 15px 'Hanken Grotesk', sans-serif",
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                {c.t.header.explore}
              </a>
              <a
                href="#register"
                onClick={onCloseMenu}
                style={{
                  textAlign: 'center',
                  padding: 14,
                  borderRadius: 13,
                  background: 'var(--accent)',
                  font: "700 15px 'Hanken Grotesk', sans-serif",
                  color: '#fff',
                  textDecoration: 'none',
                }}
              >
                {c.t.header.register}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
