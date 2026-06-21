import { useI18n } from '../i18n/I18nContext';

export default function CustomerBenefits() {
  const { content: c } = useI18n();
  return (
    <section id="customers" style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div data-reveal style={{ maxWidth: 560 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {c.t.customers.eyebrow}
        </div>
        <h2
          style={{
            font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.02em',
            margin: '12px 0 0',
          }}
        >
          {c.t.customers.heading}
        </h2>
      </div>
      <div
        className="jq-split"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 30,
          marginTop: 40,
          alignItems: 'center',
        }}
      >
        <div className="jq-bcards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {c.custBenefits.map((b) => (
            <div
              key={b.title}
              data-reveal
              data-delay={b.delay}
              style={{
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 20,
                padding: 22,
                boxShadow: '0 8px 24px -16px rgba(46,36,29,.3)',
              }}
            >
              <div style={b.icon}>{b.glyph}</div>
              <div
                style={{
                  font: "700 16.5px 'Bricolage Grotesque', sans-serif",
                  marginTop: 16,
                  letterSpacing: '-.01em',
                }}
              >
                {b.title}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--soft)', marginTop: 7, lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>

        {/* mini phone */}
        <div data-reveal data-delay="120" style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 262,
              background: '#211a14',
              borderRadius: 40,
              padding: 9,
              boxShadow: '0 40px 80px -28px rgba(46,30,18,.6), 0 0 0 2px #322820',
            }}
          >
            <div
              style={{
                background: 'var(--cream)',
                borderRadius: 32,
                overflow: 'hidden',
                padding: '20px 18px 24px',
              }}
            >
              <div
                style={{
                  font: "700 12px 'Hanken Grotesk', sans-serif",
                  color: 'var(--soft)',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                }}
              >
                {c.t.customers.nearby}
              </div>
              {c.miniDeals.map((d) => (
                <div
                  key={d.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    background: '#fff',
                    border: '1px solid var(--line)',
                    borderRadius: 15,
                    padding: 12,
                    marginTop: 11,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: d.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      font: "800 16px 'Bricolage Grotesque', sans-serif",
                    }}
                  >
                    {d.ch}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13.5,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--soft)' }}>{d.deal}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--sage)',
                      background: 'rgba(94,139,106,.12)',
                      padding: '4px 8px',
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.tag}
                  </div>
                </div>
              ))}
              <div
                style={{
                  marginTop: 14,
                  padding: 13,
                  borderRadius: 13,
                  background: 'var(--accent)',
                  color: '#fff',
                  textAlign: 'center',
                  font: "700 14px 'Hanken Grotesk', sans-serif",
                }}
              >
                {c.t.customers.find}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
