import { useI18n } from '../i18n/I18nContext';

export default function DealsCarousel() {
  const { content: c } = useI18n();
  const scrollBy = (dx: number) => {
    const c = document.getElementById('jq-deals');
    if (c) c.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    <section id="deals" style={{ padding: '64px 0', maxWidth: 1180, margin: '0 auto' }}>
      <div
        style={{
          padding: '0 26px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div data-reveal style={{ maxWidth: 620 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            {c.t.deals.eyebrow}
          </div>
          <h2
            style={{
              font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.02em',
              margin: '12px 0 0',
            }}
          >
            {c.t.deals.heading}
          </h2>
          <p style={{ fontSize: 16.5, lineHeight: 1.55, color: 'var(--soft)', margin: '14px 0 0' }}>
            {c.t.deals.para}
          </p>
        </div>
        <div data-reveal style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={() => scrollBy(-340)}
            aria-label="Previous"
            className="jq-arrowbtn"
            style={arrowBtn}
          >
            ‹
          </button>
          <button onClick={() => scrollBy(340)} aria-label="Next" className="jq-arrowbtn" style={arrowBtn}>
            ›
          </button>
        </div>
      </div>
      <div
        id="jq-deals"
        data-reveal
        data-delay="80"
        style={{
          display: 'flex',
          gap: 18,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          padding: '26px 26px 10px',
          marginTop: 6,
        }}
      >
        {c.dealOffers.map((d) => (
          <div
            key={d.name}
            className="jq-deal-card"
            style={{
              scrollSnapAlign: 'start',
              flex: '0 0 320px',
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 24,
              padding: 24,
              boxShadow: '0 10px 30px -18px rgba(46,36,29,.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    background: d.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    font: "800 19px 'Bricolage Grotesque', sans-serif",
                  }}
                >
                  {d.ch}
                </div>
                <div>
                  <div style={{ font: "700 15.5px 'Bricolage Grotesque', sans-serif" }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--soft)' }}>{d.cat}</div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  background: 'rgba(194,94,60,.1)',
                  padding: '5px 10px',
                  borderRadius: 9,
                }}
              >
                {d.badge}
              </span>
            </div>
            <div
              style={{
                font: "700 19px/1.25 'Bricolage Grotesque', sans-serif",
                marginTop: 18,
                letterSpacing: '-.01em',
              }}
            >
              {d.offer}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {d.avatars.map((a, i) => (
                  <span key={i} style={a.style}>
                    {a.ch}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--soft)' }}>{d.window}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const arrowBtn = {
  width: 46,
  height: 46,
  borderRadius: 13,
  border: '1.5px solid var(--line)',
  background: '#fff',
  fontSize: 20,
  color: 'var(--ink)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;
