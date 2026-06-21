import { useI18n } from '../i18n/I18nContext';

interface Props {
  openIndex: number;
  onToggle: (i: number) => void;
}

export default function Faq({ openIndex, onToggle }: Props) {
  const { content: c } = useI18n();
  return (
    <section id="faq" style={{ padding: '54px 26px', maxWidth: 780, margin: '0 auto' }}>
      <div data-reveal style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {c.t.faq.eyebrow}
        </div>
        <h2
          style={{
            font: "800 clamp(30px,4vw,46px)/1.08 'Bricolage Grotesque', sans-serif",
            letterSpacing: '-.02em',
            margin: '12px 0 0',
          }}
        >
          {c.t.faq.heading}
        </h2>
      </div>
      <div
        data-reveal
        data-delay="60"
        style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 11 }}
      >
        {c.t.faq.items.map((f, i) => {
          const open = openIndex === i;
          return (
            <div
              key={f.q}
              style={{
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 18,
                overflow: 'hidden',
                boxShadow: '0 6px 18px -16px rgba(46,36,29,.3)',
              }}
            >
              <button
                onClick={() => onToggle(i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '19px 22px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: "700 16.5px 'Bricolage Grotesque', sans-serif",
                  color: 'var(--ink)',
                  letterSpacing: '-.01em',
                }}
              >
                {f.q}
                <span
                  style={{
                    flex: 'none',
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: open ? 'var(--accent)' : 'var(--cream)',
                    color: open ? '#fff' : 'var(--soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 400,
                    transition: 'all .25s',
                    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}
                >
                  +
                </span>
              </button>
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: open ? '1fr' : '0fr',
                  transition: 'grid-template-rows .3s ease',
                  overflow: 'hidden',
                }}
              >
                <div style={{ minHeight: 0 }}>
                  <div style={{ padding: '0 22px 20px', fontSize: 14.5, lineHeight: 1.6, color: 'var(--soft)' }}>
                    {f.a}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
