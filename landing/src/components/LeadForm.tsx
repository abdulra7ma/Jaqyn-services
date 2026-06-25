import { useI18n } from '../i18n/I18nContext';

export interface FormFields {
  name: string;
  owner: string;
  phone: string;
  email: string;
  cat: string;
  area: string;
  ig: string;
}

export type FormState = 'idle' | 'submitting' | 'success' | 'error';

// null = no validation error; 'fields' = missing/short field; 'email' = bad format;
// 'consent' = privacy/terms checkbox not ticked
export type ValidationError = null | 'fields' | 'email' | 'consent';

interface Props {
  form: FormFields;
  consent: boolean;
  formState: FormState;
  validationError: ValidationError;
  onChange: (key: keyof FormFields, value: string) => void;
  onConsentChange: (value: boolean) => void;
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

export default function LeadForm({ form, consent, formState, validationError, onChange, onConsentChange, onSubmit, onReset }: Props) {
  const { content: c } = useI18n();
  const f = c.t.form;
  const submitting = formState === 'submitting';
  const success = formState === 'success';
  const serverError = formState === 'error';
  const hasValidationError = validationError !== null;
  const submitLabel = submitting ? f.submitting : f.submit;

  // Which fields are invalid (for aria-invalid marking)
  const phoneDigits = form.phone.replace(/^\+?996/, '').replace(/\D/g, '');
  const phoneInvalid = hasValidationError && (form.phone.trim() === '' || phoneDigits.length < 9);
  const emailInvalid = hasValidationError && (form.email.trim() === '' || validationError === 'email');
  const nameInvalid = hasValidationError && form.name.trim() === '';
  const ownerInvalid = hasValidationError && form.owner.trim() === '';
  const areaInvalid = hasValidationError && form.area.trim() === '';
  const consentInvalid = validationError === 'consent';

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
              {/* H11: wrap fields + submit in <form> so the submit button type="submit" works
                  and the form is semantically correct for AT. e.preventDefault stops page reload. */}
              <form
                onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
                noValidate
                style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 18 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="jq-field-business" style={labelStyle}>{f.labels.business}</label>
                    <input
                      id="jq-field-business"
                      className="jq-input"
                      value={form.name}
                      onChange={(e) => onChange('name', e.target.value)}
                      placeholder={f.placeholders.business}
                      aria-invalid={nameInvalid || undefined}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="jq-field-owner" style={labelStyle}>{f.labels.owner}</label>
                    <input
                      id="jq-field-owner"
                      className="jq-input"
                      value={form.owner}
                      onChange={(e) => onChange('owner', e.target.value)}
                      placeholder={f.placeholders.owner}
                      aria-invalid={ownerInvalid || undefined}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="jq-field-phone" style={labelStyle}>{f.labels.phone}</label>
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
                        id="jq-field-phone"
                        value={form.phone}
                        onChange={(e) => onChange('phone', e.target.value)}
                        inputMode="numeric"
                        placeholder={f.placeholders.phone}
                        aria-label="Phone number (+996)"
                        aria-invalid={phoneInvalid || undefined}
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
                  <div>
                    <label htmlFor="jq-field-email" style={labelStyle}>{f.labels.email}</label>
                    <input
                      id="jq-field-email"
                      className="jq-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => onChange('email', e.target.value)}
                      placeholder={f.placeholders.email}
                      aria-invalid={emailInvalid || undefined}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="jq-field-category" style={labelStyle}>{f.labels.category}</label>
                    <select
                      id="jq-field-category"
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
                    <label htmlFor="jq-field-area" style={labelStyle}>{f.labels.area}</label>
                    <input
                      id="jq-field-area"
                      className="jq-input"
                      value={form.area}
                      onChange={(e) => onChange('area', e.target.value)}
                      placeholder={f.placeholders.area}
                      aria-invalid={areaInvalid || undefined}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="jq-field-instagram" style={labelStyle}>
                    {f.labels.instagram} <span style={{ fontWeight: 500, opacity: 0.7 }}>{f.labels.optional}</span>
                  </label>
                  <input
                    id="jq-field-instagram"
                    className="jq-input"
                    value={form.ig}
                    onChange={(e) => onChange('ig', e.target.value)}
                    placeholder={f.placeholders.instagram}
                    style={inputStyle}
                  />
                </div>
                {/* Consent — required before any personal data is submitted (KG personal-data law).
                    The sentence is a plain span (not a <label>) so the inline Privacy/Terms links
                    navigate without also toggling the checkbox; the input carries its own aria-label.
                    Links open in a new tab so the form state is preserved. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--soft)' }}>
                  <input
                    id="jq-field-consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => onConsentChange(e.target.checked)}
                    aria-invalid={consentInvalid || undefined}
                    aria-label={`${f.consent.pre}${f.consent.privacy}${f.consent.mid}${f.consent.terms}${f.consent.post}`}
                    style={{ width: 18, height: 18, marginTop: 1, flex: 'none', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span>
                    {f.consent.pre}
                    <a href="/privacy.html" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {f.consent.privacy}
                    </a>
                    {f.consent.mid}
                    <a href="/terms.html" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {f.consent.terms}
                    </a>
                    {f.consent.post}
                  </span>
                </div>
                {/* M10: always-rendered alert region so AT announces messages without a remount.
                    Shows validation copy (specific) or server-error copy (generic). */}
                <div
                  role="alert"
                  aria-live="assertive"
                  style={{
                    padding: hasValidationError || serverError ? '10px 14px' : undefined,
                    borderRadius: hasValidationError || serverError ? 10 : undefined,
                    background: hasValidationError || serverError ? 'rgba(194,60,60,.1)' : undefined,
                    color: '#a02020',
                    fontSize: 13.5,
                    fontWeight: 600,
                    minHeight: 0,
                  }}
                >
                  {validationError === 'consent'
                    ? f.consent.error
                    : hasValidationError
                      ? f.validationErrorText
                      : serverError
                        ? f.errorText
                        : null}
                </div>
                <button
                  type="submit"
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
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
