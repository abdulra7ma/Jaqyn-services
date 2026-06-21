import { useI18n } from '../i18n/I18nContext';

export default function BusinessBenefits() {
  const { content: c } = useI18n();
  return (
    <section id="business" style={{ background: 'var(--ink)', color: '#fff', padding: '70px 26px', marginTop: 30 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div data-reveal style={{ maxWidth: 600 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
            }}
          >
            {c.t.business.eyebrow}
          </div>
          <h2
            style={{
              font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.02em',
              margin: '12px 0 0',
              color: '#fff',
            }}
          >
            {c.t.business.heading}
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(255,255,255,.66)', margin: '16px 0 0' }}>
            {c.t.business.para}
          </p>
        </div>
        <div
          className="jq-steps"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 42 }}
        >
          {c.bizBenefits.map((b) => (
            <div
              key={b.title}
              data-reveal
              data-delay={b.delay}
              style={{
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 20,
                padding: 22,
              }}
            >
              <div style={b.icon}>{b.glyph}</div>
              <div
                style={{
                  font: "700 16.5px 'Bricolage Grotesque', sans-serif",
                  marginTop: 16,
                  color: '#fff',
                  letterSpacing: '-.01em',
                }}
              >
                {b.title}
              </div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.6)', marginTop: 7, lineHeight: 1.5 }}>
                {b.text}
              </div>
            </div>
          ))}
        </div>
        <div data-reveal style={{ marginTop: 34 }}>
          <a
            href="#register"
            className="jq-lift2"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              padding: '16px 26px',
              borderRadius: 14,
              background: 'var(--amber)',
              color: 'var(--ink)',
              font: "700 16px 'Hanken Grotesk', sans-serif",
              textDecoration: 'none',
              boxShadow: '0 14px 30px -10px rgba(231,162,62,.5)',
              transition: 'transform .2s',
            }}
          >
            {c.t.business.cta}
          </a>
        </div>
      </div>
    </section>
  );
}
