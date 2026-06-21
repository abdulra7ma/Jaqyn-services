import { useI18n } from '../i18n/I18nContext';

export default function Hero() {
  const { content: c } = useI18n();
  const h = c.t.hero;
  return (
    <section id="top" style={{ position: 'relative', padding: '118px 26px 70px', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: -120,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(231,162,62,.22), transparent 68%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -160,
          left: -140,
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(94,139,106,.16), transparent 68%)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="jq-hero-grid"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.05fr .95fr',
          gap: 50,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            data-reveal
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              border: '1px solid var(--line)',
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--soft)',
              boxShadow: '0 3px 10px -5px rgba(46,36,29,.2)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sage)' }} />
            {h.badge}
          </div>
          <h1
            data-reveal
            data-delay="60"
            style={{
              font: "800 clamp(40px,5.6vw,68px)/1.04 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.025em',
              margin: '22px 0 0',
            }}
          >
            {h.title.lead}
            <span style={{ color: 'var(--accent)' }}>{h.title.highlight}</span>
            {h.title.trail}
          </h1>
          <p
            data-reveal
            data-delay="120"
            style={{
              fontSize: 'clamp(16px,2vw,19px)',
              lineHeight: 1.55,
              color: 'var(--soft)',
              margin: '22px 0 0',
              maxWidth: 520,
            }}
          >
            {h.subtitle}
          </p>
          <div data-reveal data-delay="180" style={{ display: 'flex', flexWrap: 'wrap', gap: 13, marginTop: 34 }}>
            <a
              href="#deals"
              className="jq-lift2"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '17px 26px',
                borderRadius: 15,
                background: 'var(--accent)',
                color: '#fff',
                font: "700 16.5px 'Hanken Grotesk', sans-serif",
                textDecoration: 'none',
                boxShadow: '0 14px 30px -10px rgba(160,73,42,.6)',
                transition: 'transform .2s',
              }}
            >
              {h.ctaPrimary}
            </a>
            <a
              href="#register"
              className="jq-ghost-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '17px 26px',
                borderRadius: 15,
                background: '#fff',
                border: '1.5px solid var(--line)',
                color: 'var(--ink)',
                font: "700 16.5px 'Hanken Grotesk', sans-serif",
                textDecoration: 'none',
                transition: 'border-color .2s',
              }}
            >
              {h.ctaSecondary}
            </a>
          </div>
          <div
            data-reveal
            data-delay="240"
            style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 34, flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {c.heroAvatars.map((a, i) => (
                <span key={i} style={a.style}>
                  {a.ch}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 14, color: 'var(--soft)', lineHeight: 1.4 }}>
              <b style={{ color: 'var(--ink)' }}>{h.betterTitle}</b>
              <br />
              {h.betterSub}
            </div>
          </div>
        </div>

        {/* phone mockup + floating cards */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }} data-reveal data-delay="120">
          <div style={{ position: 'relative', width: 312 }}>
            <div
              style={{
                width: 312,
                height: 636,
                background: '#211a14',
                borderRadius: 46,
                padding: 11,
                boxShadow: '0 50px 90px -30px rgba(46,30,18,.7), 0 0 0 2px #322820',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 22,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 100,
                  height: 26,
                  background: '#211a14',
                  borderRadius: 14,
                  zIndex: 40,
                }}
              />
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'var(--cream)',
                  borderRadius: 36,
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 42,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    padding: '0 24px 6px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  <span>9:41</span>
                  <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1.5, height: 10 }}>
                      <i style={{ width: 3, height: 4, background: 'var(--ink)', borderRadius: 1 }} />
                      <i style={{ width: 3, height: 6, background: 'var(--ink)', borderRadius: 1 }} />
                      <i style={{ width: 3, height: 8, background: 'var(--ink)', borderRadius: 1 }} />
                      <i style={{ width: 3, height: 10, background: 'var(--ink)', borderRadius: 1 }} />
                    </span>
                    <span
                      style={{
                        width: 20,
                        height: 10,
                        border: '1.5px solid var(--ink)',
                        borderRadius: 3,
                        position: 'relative',
                        display: 'inline-block',
                      }}
                    >
                      <i style={{ position: 'absolute', inset: 1.5, right: 5, background: 'var(--ink)', borderRadius: 1 }} />
                    </span>
                  </span>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', padding: '6px 18px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: 'linear-gradient(150deg,var(--accent),var(--accent-deep))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        font: "800 20px/1 'Bricolage Grotesque', sans-serif",
                      }}
                    >
                      M
                    </div>
                    <div>
                      <div style={{ font: "700 15px 'Bricolage Grotesque', sans-serif" }}>Manas Coffee</div>
                      <div style={{ fontSize: 11.5, color: 'var(--soft)' }}>{h.phone.tag}</div>
                    </div>
                  </div>
                  <div
                    style={{
                      font: "700 21px/1.15 'Bricolage Grotesque', sans-serif",
                      marginTop: 18,
                      letterSpacing: '-.01em',
                    }}
                  >
                    {h.phone.offer}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--soft)', marginTop: 7, lineHeight: 1.45 }}>
                    {h.phone.sub}
                  </div>
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid var(--line)',
                      borderRadius: 18,
                      padding: 15,
                      marginTop: 16,
                      boxShadow: '0 6px 18px -12px rgba(46,36,29,.25)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'var(--soft)',
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                      }}
                    >
                      <span>{h.phone.forming}</span>
                      <span style={{ color: 'var(--accent)' }}>4 / 5</span>
                    </div>
                    <div
                      style={{
                        height: 9,
                        background: 'var(--cream)',
                        borderRadius: 99,
                        marginTop: 9,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: '80%',
                          height: '100%',
                          background: 'linear-gradient(90deg,var(--amber),var(--accent))',
                          borderRadius: 99,
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 13 }}>
                      <span style={pAvatar('#D9B98F', '#5a4326')}>A</span>
                      <span style={pAvatar('#A9C0A0', '#3a4d33')}>B</span>
                      <span style={pAvatar('#E0A9A0', '#6b3b33')}>N</span>
                      <span style={pAvatar('#B8A9D8', '#3f3360')}>T</span>
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '2px dashed #DCC9AE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          color: '#C7B193',
                        }}
                      >
                        +
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 16,
                      padding: 15,
                      borderRadius: 15,
                      background: 'var(--accent)',
                      color: '#fff',
                      textAlign: 'center',
                      font: "700 15px 'Hanken Grotesk', sans-serif",
                      boxShadow: '0 12px 24px -10px rgba(160,73,42,.6)',
                    }}
                  >
                    {h.phone.invite}
                  </div>
                </div>
              </div>
            </div>

            {/* floating: QR card */}
            <div
              style={{
                position: 'absolute',
                top: 64,
                left: -58,
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 18,
                padding: 13,
                boxShadow: '0 22px 44px -16px rgba(46,30,18,.4)',
                animation: 'jqFloatA 5s ease-in-out infinite',
                zIndex: 5,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4,9px)',
                  gridTemplateRows: 'repeat(4,9px)',
                  gap: 3,
                }}
              >
                {[1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1].map((on, i) => (
                  <i key={i} style={{ background: on ? 'var(--ink)' : 'transparent', borderRadius: on ? 2 : 0 }} />
                ))}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--soft)', textAlign: 'center', marginTop: 8 }}>
                {h.phone.scan}
              </div>
            </div>

            {/* floating: reward unlocked */}
            <div
              style={{
                position: 'absolute',
                top: 300,
                right: -50,
                background: 'var(--sage)',
                color: '#fff',
                borderRadius: 16,
                padding: '13px 16px',
                boxShadow: '0 22px 44px -16px rgba(46,67,51,.55)',
                animation: 'jqFloatB 6s ease-in-out infinite',
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,.22)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                }}
              >
                ✓
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ font: "700 13.5px 'Bricolage Grotesque', sans-serif" }}>{h.phone.rewardUnlocked}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>{h.phone.rewardReady}</div>
              </div>
            </div>

            {/* floating: progress chip */}
            <div
              style={{
                position: 'absolute',
                bottom: 48,
                left: -46,
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 14,
                padding: '11px 14px',
                boxShadow: '0 18px 38px -16px rgba(46,30,18,.38)',
                animation: 'jqFloatA 5.5s ease-in-out .4s infinite',
                zIndex: 5,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--soft)', fontWeight: 600 }}>{h.phone.friendsJoined}</div>
              <div style={{ font: "800 19px 'Bricolage Grotesque', sans-serif", color: 'var(--accent)' }}>4 / 5</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function pAvatar(bg: string, fg: string) {
  return {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: bg,
    border: '2px solid #fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: fg,
  } as const;
}
