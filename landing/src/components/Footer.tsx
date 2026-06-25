import { useI18n } from '../i18n/I18nContext';

export default function Footer() {
  const { content: c } = useI18n();
  return (
    <footer style={{ background: 'var(--ink)', color: '#fff', padding: '56px 26px 40px' }}>
      <div
        className="jq-footer"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
          gap: 40,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
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
                font: "800 20px 'Bricolage Grotesque', sans-serif",
              }}
            >
              J
            </div>
            <div style={{ font: "700 21px 'Bricolage Grotesque', sans-serif" }}>Jaqyn</div>
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,.55)', margin: '16px 0 0', maxWidth: 280 }}>
            {c.t.footer.tagline}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <a href="https://instagram.com/jaqyn.kg" target="_blank" rel="noreferrer" className="jq-social" aria-label="Instagram" style={socialStyle}>
              IG
            </a>
            <a href="https://t.me/jaqyn_kg" target="_blank" rel="noreferrer" className="jq-social" aria-label="Telegram" style={socialStyle}>
              TG
            </a>
          </div>
        </div>
        {c.footerCols.map((col) => (
          <div key={col.title}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                color: 'rgba(255,255,255,.45)',
              }}
            >
              {col.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
              {col.links.map((lk) => (
                <a key={lk.label} href={lk.href} className="jq-footlink" style={{ fontSize: 14.5, textDecoration: 'none' }}>
                  {lk.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          maxWidth: 1180,
          margin: '36px auto 0',
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,.1)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 13,
          color: 'rgba(255,255,255,.45)',
        }}
      >
        <span>{c.t.footer.legal}</span>
        <span style={{ display: 'flex', gap: 18 }}>
          <a href="/privacy.html" className="jq-legal" style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>
            {c.t.footer.privacy}
          </a>
          <a href="/terms.html" className="jq-legal" style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>
            {c.t.footer.terms}
          </a>
        </span>
      </div>
    </footer>
  );
}

const socialStyle = {
  width: 40,
  height: 40,
  borderRadius: 11,
  background: 'rgba(255,255,255,.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
} as const;
