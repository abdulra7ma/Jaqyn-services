import { useI18n } from '../i18n/I18nContext';

export default function ExampleCampaign() {
  const { content } = useI18n();
  const e = content.t.example;
  return (
    <section style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div
        className="jq-split"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}
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
            {e.eyebrow}
          </div>
          <h2
            style={{
              font: "800 clamp(28px,3.6vw,42px)/1.1 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.02em',
              margin: '12px 0 0',
            }}
          >
            {e.heading}
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--soft)', margin: '14px 0 22px' }}>
            {e.para}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 15,
                padding: 15,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: 'rgba(231,162,62,.16)',
                  color: 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flex: 'none',
                }}
              >
                B
              </span>
              <div style={{ fontSize: 14, lineHeight: 1.45 }}>
                <b>{e.bizLabel}</b>{' '}
                <span style={{ color: 'var(--soft)' }}>{e.bizText}</span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 15,
                padding: 15,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: 'rgba(94,139,106,.16)',
                  color: 'var(--sage)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flex: 'none',
                }}
              >
                C
              </span>
              <div style={{ fontSize: 14, lineHeight: 1.45 }}>
                <b>{e.custLabel}</b>{' '}
                <span style={{ color: 'var(--soft)' }}>{e.custText}</span>
              </div>
            </div>
          </div>
        </div>
        <div
          data-reveal
          data-delay="100"
          style={{
            background: 'var(--ink)',
            borderRadius: 26,
            padding: 28,
            color: '#fff',
            boxShadow: '0 30px 60px -28px rgba(46,30,18,.6)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -60,
              right: -40,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(231,162,62,.3),transparent 70%)',
            }}
          />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: 'rgba(255,255,255,.1)',
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--amber)',
                animation: 'jqDot 1.6s infinite',
              }}
            />
            {e.live}
          </div>
          <div style={{ font: "700 24px 'Bricolage Grotesque', sans-serif", marginTop: 16, letterSpacing: '-.01em' }}>
            {e.cardTitle}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
            <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 14 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  fontWeight: 700,
                }}
              >
                {e.cafes}
              </div>
              <div style={{ font: "800 26px 'Bricolage Grotesque', sans-serif", marginTop: 4 }} data-count="10">
                10
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 14 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  fontWeight: 700,
                }}
              >
                {e.mission}
              </div>
              <div style={{ font: "800 26px 'Bricolage Grotesque', sans-serif", marginTop: 4 }}>{e.missionValue}</div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700 }}>
              <span style={{ color: 'rgba(255,255,255,.6)' }}>{e.progress}</span>
              <span style={{ color: 'var(--amber)' }}>{e.joined}</span>
            </div>
            <div
              style={{
                height: 9,
                background: 'rgba(255,255,255,.12)',
                borderRadius: 99,
                marginTop: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '60%',
                  height: '100%',
                  background: 'linear-gradient(90deg,var(--amber),var(--accent))',
                  borderRadius: 99,
                }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 12 }}>
              <b style={{ color: '#fff' }}>{e.rewardLabel}</b> {e.rewardText}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
