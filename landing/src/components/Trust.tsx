import { useI18n } from '../i18n/I18nContext';

export default function Trust() {
  const { content: c } = useI18n();
  return (
    <section style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div data-reveal style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {c.t.trust.eyebrow}
        </div>
        <h2
          style={{
            font: "800 clamp(28px,3.6vw,42px)/1.1 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.02em',
            margin: '12px 0 0',
          }}
        >
          {c.t.trust.heading}
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--soft)', margin: '14px 0 0' }}>
          {c.t.trust.para}
        </p>
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 34 }}
      >
        {c.trustCards.map((t) => (
          <div
            key={t.label}
            data-reveal
            data-delay={t.delay}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '13px 18px',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 6px 18px -14px rgba(46,36,29,.3)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--sage)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                flex: 'none',
              }}
            >
              ✓
            </span>
            {t.label}
          </div>
        ))}
      </div>
    </section>
  );
}
