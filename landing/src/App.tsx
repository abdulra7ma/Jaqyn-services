import { useState } from 'react';
import { I18nProvider } from './i18n/I18nContext';
import { useLandingEffects } from './hooks/useLandingEffects';
import Header from './components/Header';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import CustomerBenefits from './components/CustomerBenefits';
import BusinessBenefits from './components/BusinessBenefits';
import DealsCarousel from './components/DealsCarousel';
import QrLoyalty from './components/QrLoyalty';
import ExampleCampaign from './components/ExampleCampaign';
import DashboardPreview from './components/DashboardPreview';
import Trust from './components/Trust';
import Faq from './components/Faq';
import LeadForm, { type FormFields, type FormState, type ValidationError } from './components/LeadForm';
import FinalCta from './components/FinalCta';
import Footer from './components/Footer';
import MobileCta from './components/MobileCta';
import { submitLead } from './api';

const EMPTY_FORM: FormFields = { name: '', owner: '', phone: '', email: '', cat: 'Cafe', area: '', ig: '' };

// Basic email format check — full RFC validation happens server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faq, setFaq] = useState(-1);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [consent, setConsent] = useState(false);
  const [formState, setFormState] = useState<FormState>('idle');
  const [validationError, setValidationError] = useState<ValidationError>(null);

  useLandingEffects();

  const handleSubmit = async () => {
    if (formState === 'submitting') return;

    // Client-side required-field + email-format + phone-length validation.
    // Strip any leading +996 / country code from phone before digit-count check,
    // mirroring what submitLead does before sending to the API.
    const phoneDigits = form.phone.replace(/^\+?996/, '').replace(/\D/g, '');
    if (!form.name.trim() || !form.owner.trim() || !form.phone.trim() || !form.email.trim() || !form.area.trim() || phoneDigits.length < 9) {
      setValidationError('fields');
      return;
    }
    if (!EMAIL_RE.test(form.email)) {
      setValidationError('email');
      return;
    }
    // Explicit consent is required before any personal data is submitted (KG personal-data law).
    if (!consent) {
      setValidationError('consent');
      return;
    }

    setValidationError(null);
    setFormState('submitting');
    try {
      await submitLead(form);
      setFormState('success');
    } catch {
      setFormState('error');
    }
  };

  return (
    <div className="jq-root">
      <Header
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
        onCloseMenu={() => setMenuOpen(false)}
      />
      <Hero />
      <HowItWorks />
      <CustomerBenefits />
      <BusinessBenefits />
      <DealsCarousel />
      <QrLoyalty />
      <ExampleCampaign />
      <DashboardPreview />
      <Trust />
      <Faq openIndex={faq} onToggle={(i) => setFaq((cur) => (cur === i ? -1 : i))} />
      <LeadForm
        form={form}
        consent={consent}
        formState={formState}
        validationError={validationError}
        onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
        onConsentChange={setConsent}
        onSubmit={handleSubmit}
        onReset={() => {
          setFormState('idle');
          setValidationError(null);
          setForm(EMPTY_FORM);
          setConsent(false);
        }}
      />
      <FinalCta />
      <Footer />
      <MobileCta />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Landing />
    </I18nProvider>
  );
}
