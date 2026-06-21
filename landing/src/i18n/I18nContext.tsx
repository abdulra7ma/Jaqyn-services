import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, languages, DEFAULT_LANG, type LangCode } from './translations';
import { buildContent, type Content } from './content';

const STORAGE_KEY = 'jaqyn.lang';

function readInitialLang(): LangCode {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && saved in dictionaries) return saved;
  }
  return DEFAULT_LANG;
}

interface I18nValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  content: Content;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(readInitialLang);

  const setLang = (next: LangCode) => {
    setLangState(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const content = useMemo(() => buildContent(dictionaries[lang]), [lang]);

  return <I18nContext.Provider value={{ lang, setLang, content }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export { languages };
export type { LangCode };
