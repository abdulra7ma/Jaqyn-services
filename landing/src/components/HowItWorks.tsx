import { useI18n } from '../i18n/I18nContext';

export default function HowItWorks() {
  const { content: c } = useI18n();
  return (
    <section id="how" style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div data-reveal style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {c.t.how.eyebrow}
        </div>
        <h2
          style={{
            font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.02em',
            margin: '12px 0 0',
          }}
        >
          {c.t.how.heading}
        </h2>
      </div>
      <div
        className="jq-steps"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 44 }}
      >
        {c.howSteps.map((s) => (
          <div
            key={s.n}
            data-reveal
            data-delay={s.delay}
            style={{
              position: 'relative',
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 22,
              padding: 24,
              boxShadow: '0 8px 24px -16px rgba(46,36,29,.3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 46,
                height: 46,
                borderRadius: 14,
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                font: "800 19px 'Bricolage Grotesque', sans-serif",
                color: 'var(--accent)',
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                font: "700 17.5px 'Bricolage Grotesque', sans-serif",
                marginTop: 18,
                letterSpacing: '-.01em',
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 14, color: 'var(--soft)', marginTop: 8, lineHeight: 1.5 }}>{s.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
