import { useI18n } from '../i18n/I18nContext';
import { APP_ROUTES } from '../config';

export default function MobileCta() {
  const { content: c } = useI18n();
  return (
    <div
      className="jq-mobile-cta"
      style={{
        display: 'none',
        position: 'fixed',
        left: 14,
        right: 14,
        bottom: 14,
        zIndex: 90,
        gap: 10,
      }}
    >
      <a
        href={APP_ROUTES.explore}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: 15,
          borderRadius: 15,
          background: '#fff',
          border: '1.5px solid var(--line)',
          color: 'var(--ink)',
          font: "700 15px 'Hanken Grotesk', sans-serif",
          textDecoration: 'none',
          boxShadow: '0 12px 30px -10px rgba(46,30,18,.4)',
        }}
      >
        {c.t.mobile.explore}
      </a>
      <a
        href="#register"
        style={{
          flex: 1,
          textAlign: 'center',
          padding: 15,
          borderRadius: 15,
          background: 'var(--accent)',
          color: '#fff',
          font: "700 15px 'Hanken Grotesk', sans-serif",
          textDecoration: 'none',
          boxShadow: '0 12px 30px -10px rgba(160,73,42,.6)',
        }}
      >
        {c.t.mobile.register}
      </a>
    </div>
  );
}
