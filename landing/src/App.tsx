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
import LeadForm, { type FormFields, type FormState } from './components/LeadForm';
import FinalCta from './components/FinalCta';
import Footer from './components/Footer';
import MobileCta from './components/MobileCta';

const EMPTY_FORM: FormFields = { name: '', owner: '', phone: '', cat: 'Cafe', area: '', ig: '' };

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faq, setFaq] = useState(-1);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [formState, setFormState] = useState<FormState>('idle');

  useLandingEffects();

  const handleSubmit = () => {
    if (formState === 'submitting') return;
    setFormState('submitting');
    setTimeout(() => setFormState('success'), 1000);
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
        formState={formState}
        onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
        onSubmit={handleSubmit}
        onReset={() => {
          setFormState('idle');
          setForm(EMPTY_FORM);
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
