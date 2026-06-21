import { useI18n } from '../i18n/I18nContext';

export default function QrLoyalty() {
  const { content: c } = useI18n();
  return (
    <section id="qr" style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div
        className="jq-split"
        style={{
          background: 'var(--cream)',
          border: '1px solid var(--line)',
          borderRadius: 30,
          padding: '46px 40px',
          display: 'grid',
          gridTemplateColumns: '.9fr 1.1fr',
          gap: 46,
          alignItems: 'center',
        }}
      >
        <div data-reveal>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            {c.t.qr.eyebrow}
          </div>
          <h2
            style={{
              font: "800 clamp(28px,3.6vw,42px)/1.1 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.02em',
              margin: '12px 0 0',
            }}
          >
            {c.t.qr.heading}
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--soft)', margin: '14px 0 22px' }}>
            {c.t.qr.para}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            {c.t.qr.bullets.map((q) => (
              <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--sage)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    flex: 'none',
                  }}
                >
                  ✓
                </span>
                {q}
              </div>
            ))}
          </div>
        </div>
        <div
          data-reveal
          data-delay="100"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          {c.qrSteps.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 118,
                  background: '#fff',
                  border: '1px solid var(--line)',
                  borderRadius: 18,
                  padding: '16px 12px',
                  textAlign: 'center',
                  boxShadow: '0 8px 24px -16px rgba(46,36,29,.3)',
                }}
              >
                <div style={s.box}>{s.glyph}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 11, lineHeight: 1.25 }}>{s.label}</div>
              </div>
              {s.arrow && (
                <span className="jq-qr-arrow" style={{ color: 'var(--soft)', fontSize: 18 }}>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
