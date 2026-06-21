import { useI18n } from '../i18n/I18nContext';

export interface FormFields {
  name: string;
  owner: string;
  phone: string;
  cat: string;
  area: string;
  ig: string;
}

export type FormState = 'idle' | 'submitting' | 'success';

interface Props {
  form: FormFields;
  formState: FormState;
  onChange: (key: keyof FormFields, value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const inputStyle = {
  width: '100%',
  border: '1.5px solid var(--line)',
  borderRadius: 13,
  padding: 13,
  marginTop: 6,
  font: "600 14.5px 'Hanken Grotesk', sans-serif",
  color: 'var(--ink)',
  outline: 'none',
  background: '#fff',
} as const;

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--soft)' } as const;

export default function LeadForm({ form, formState, onChange, onSubmit, onReset }: Props) {
  const { content: c } = useI18n();
  const f = c.t.form;
  const submitting = formState === 'submitting';
  const success = formState === 'success';
  const submitLabel = submitting ? f.submitting : f.submit;

  return (
    <section id="register" style={{ padding: '54px 26px', maxWidth: 1180, margin: '0 auto' }}>
      <div
        data-reveal
        className="jq-split"
        style={{
          background: 'var(--ink)',
          borderRadius: 30,
          padding: 48,
          color: '#fff',
          display: 'grid',
          gridTemplateColumns: '1fr 1.05fr',
          gap: 46,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle,rgba(231,162,62,.2),transparent 70%)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
            }}
          >
            {f.eyebrow}
          </div>
          <h2
            style={{
              font: "800 clamp(28px,3.6vw,40px)/1.1 'Bricolage Grotesque', sans-serif",
              letterSpacing: '-.02em',
              margin: '12px 0 0',
              color: '#fff',
            }}
          >
            {f.heading}
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: 'rgba(255,255,255,.66)', margin: '16px 0 24px' }}>
            {f.para}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {f.perks.map((p) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14.5, color: 'rgba(255,255,255,.85)' }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    color: 'var(--ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                    flex: 'none',
                  }}
                >
                  ✓
                </span>
                {p}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            background: '#fff',
            borderRadius: 22,
            padding: 28,
            boxShadow: '0 30px 60px -24px rgba(46,30,18,.5)',
          }}
        >
          {success ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', animation: 'jqSlideUp .4s ease' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'var(--sage)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 34,
                  margin: '0 auto',
                  animation: 'jqPop .5s ease both',
                }}
              >
                ✓
              </div>
              <div
                style={{
                  font: "700 23px 'Bricolage Grotesque', sans-serif",
                  color: 'var(--ink)',
                  marginTop: 20,
                  letterSpacing: '-.01em',
                }}
              >
                {f.successTitle}
              </div>
              <div style={{ fontSize: 15, color: 'var(--soft)', marginTop: 10, lineHeight: 1.5 }}>
                {f.successText}
              </div>
              <button
                onClick={onReset}
                style={{
                  marginTop: 22,
                  padding: '13px 22px',
                  borderRadius: 13,
                  border: '1.5px solid var(--line)',
                  background: '#fff',
                  font: "700 14.5px 'Hanken Grotesk', sans-serif",
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                {f.submitAnother}
              </button>
            </div>
          ) : (
            <>
              <div style={{ font: "700 19px 'Bricolage Grotesque', sans-serif", color: 'var(--ink)', letterSpacing: '-.01em' }}>
                {f.requestTitle}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>{f.labels.business}</label>
                    <input
                      className="jq-input"
                      value={form.name}
                      onChange={(e) => onChange('name', e.target.value)}
                      placeholder={f.placeholders.business}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{f.labels.owner}</label>
                    <input
                      className="jq-input"
                      value={form.owner}
                      onChange={(e) => onChange('owner', e.target.value)}
                      placeholder={f.placeholders.owner}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{f.labels.phone}</label>
                  <div
                    className="jq-phonewrap"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      border: '1.5px solid var(--line)',
                      borderRadius: 13,
                      padding: '0 13px',
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>+996</span>
                    <input
                      value={form.phone}
                      onChange={(e) => onChange('phone', e.target.value)}
                      inputMode="numeric"
                      placeholder={f.placeholders.phone}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        padding: '13px 0',
                        font: "600 14.5px 'Hanken Grotesk', sans-serif",
                        color: 'var(--ink)',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>{f.labels.category}</label>
                    <select
                      value={form.cat}
                      onChange={(e) => onChange('cat', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {c.categoryValues.map((value, i) => (
                        <option key={value} value={value}>
                          {f.categories[i]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{f.labels.area}</label>
                    <input
                      className="jq-input"
                      value={form.area}
                      onChange={(e) => onChange('area', e.target.value)}
                      placeholder={f.placeholders.area}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    {f.labels.instagram} <span style={{ fontWeight: 500, opacity: 0.7 }}>{f.labels.optional}</span>
                  </label>
                  <input
                    className="jq-input"
                    value={form.ig}
                    onChange={(e) => onChange('ig', e.target.value)}
                    placeholder={f.placeholders.instagram}
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={onSubmit}
                  className="jq-lift"
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: 16,
                    border: 'none',
                    borderRadius: 14,
                    background: 'var(--accent)',
                    color: '#fff',
                    font: "700 16px 'Hanken Grotesk', sans-serif",
                    cursor: 'pointer',
                    boxShadow: '0 12px 24px -8px rgba(160,73,42,.55)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 9,
                    transition: 'transform .2s',
                  }}
                >
                  {submitting && (
                    <span
                      style={{
                        width: 17,
                        height: 17,
                        border: '2.5px solid rgba(255,255,255,.4)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'jqRing .7s linear infinite',
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {submitLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
