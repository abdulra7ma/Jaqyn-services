import { useI18n } from '../i18n/I18nContext';

export default function DashboardPreview() {
  const { content: c } = useI18n();
  const d = c.t.dashboard;
  return (
    <section style={{ padding: '54px 26px 60px', maxWidth: 1180, margin: '0 auto' }}>
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
          {d.eyebrow}
        </div>
        <h2
          style={{
            font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.02em',
            margin: '12px 0 0',
          }}
        >
          {d.heading}
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--soft)', margin: '14px 0 0' }}>
          {d.para}
        </p>
      </div>
      <div
        data-reveal
        data-delay="80"
        style={{
          background: '#fff',
          border: '1px solid var(--line)',
          borderRadius: 26,
          padding: 26,
          marginTop: 40,
          boxShadow: '0 20px 50px -28px rgba(46,36,29,.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            paddingBottom: 20,
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: 'linear-gradient(150deg,var(--accent),var(--accent-deep))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                font: "800 18px 'Bricolage Grotesque', sans-serif",
              }}
            >
              M
            </div>
            <div>
              <div style={{ font: "700 16px 'Bricolage Grotesque', sans-serif" }}>Manas Coffee</div>
              <div style={{ fontSize: 12, color: 'var(--soft)' }}>{d.ownerSub}</div>
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--sage)',
              background: 'rgba(94,139,106,.12)',
              padding: '7px 13px',
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--sage)',
                animation: 'jqDot 1.6s infinite',
              }}
            />
            {d.arriving}
          </div>
        </div>

        <div
          className="jq-dash"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 22 }}
        >
          {c.dashWidgets.map((w) => (
            <div
              key={w.label}
              style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 16, padding: 17 }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--soft)',
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                }}
              >
                {w.label}
              </div>
              <div
                style={{
                  font: "800 27px 'Bricolage Grotesque', sans-serif",
                  marginTop: 8,
                  letterSpacing: '-.01em',
                }}
                data-count={w.value}
                data-prefix={w.prefix}
                data-suffix={w.suffix}
              >
                {w.display}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sage)', marginTop: 4 }}>{w.delta}</div>
            </div>
          ))}
        </div>

        <div
          className="jq-split"
          style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginTop: 14 }}
        >
          <div style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{d.weekly}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 120 }}>
              {c.chartBars.map((b) => (
                <div
                  key={b.day}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 7,
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div style={{ width: '100%', borderRadius: '7px 7px 3px 3px', background: b.fill, height: b.h }} />
                  <span style={{ fontSize: 10.5, color: 'var(--soft)', fontWeight: 600 }}>{b.day}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{d.active}</div>
            {c.groupRows.map((g) => (
              <div
                key={g.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--soft)' }}>{g.when}</div>
                </div>
                <span
                  style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, ...g.tagStyle }}
                >
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
