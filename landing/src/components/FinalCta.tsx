import { useI18n } from '../i18n/I18nContext';

export default function FinalCta() {
  const { content } = useI18n();
  const cta = content.t.finalCta;
  return (
    <section style={{ padding: '30px 26px 70px', maxWidth: 1180, margin: '0 auto' }}>
      <div
        data-reveal
        style={{
          background: 'linear-gradient(150deg,var(--accent),var(--accent-deep))',
          borderRadius: 30,
          padding: '60px 40px',
          textAlign: 'center',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.1)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -90,
            left: -50,
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.08)',
          }}
        />
        <h2
          style={{
            font: "800 clamp(30px,4.4vw,52px)/1.08 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.025em',
            maxWidth: 680,
            margin: '0 auto',
            position: 'relative',
          }}
        >
          {cta.heading}
        </h2>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: 'rgba(255,255,255,.85)',
            margin: '18px auto 0',
            maxWidth: 520,
            position: 'relative',
          }}
        >
          {cta.para}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 13,
            marginTop: 32,
            position: 'relative',
          }}
        >
          <a
            href="#register"
            className="jq-cta-white"
            style={{
              padding: '17px 28px',
              borderRadius: 15,
              background: '#fff',
              color: 'var(--accent)',
              font: "700 16.5px 'Hanken Grotesk', sans-serif",
              textDecoration: 'none',
              boxShadow: '0 14px 30px -10px rgba(46,30,18,.4)',
              transition: 'transform .2s',
            }}
          >
            {cta.register}
          </a>
          <a
            href="#deals"
            className="jq-cta-trans"
            style={{
              padding: '17px 28px',
              borderRadius: 15,
              background: 'rgba(255,255,255,.15)',
              border: '1.5px solid rgba(255,255,255,.4)',
              color: '#fff',
              font: "700 16.5px 'Hanken Grotesk', sans-serif",
              textDecoration: 'none',
              transition: 'background .2s',
            }}
          >
            {cta.explore}
          </a>
        </div>
      </div>
    </section>
  );
}
