import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { en } from './en'
import { fr } from './fr'
import { zh } from './zh'

export type Locale = 'en' | 'fr' | 'zh'

export type Translations = Record<string, string>

const DICTIONARIES: Record<Locale, Translations> = { en, fr, zh }

const SUPPORTED: Record<string, Locale> = { en: 'en', fr: 'fr', zh: 'zh' }

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const lang = (navigator.language ?? 'en').slice(0, 2)
  return SUPPORTED[lang] ?? 'en'
}

type I18nCtx = {
  locale: Locale
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nCtx>({
  locale: 'en',
  t: (key) => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR always returns 'en' (no document/navigator). The client
  // immediately corrects via the effect below. The pre-hydrate
  // inline script hides the page until this effect fires so the
  // user never sees the SSR English.
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const detected = detectLocale()
    if (detected !== locale) setLocale(detected)
    document.documentElement.lang = detected
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let str = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replaceAll(`{${k}}`, String(v))
        }
      }
      return str
    },
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useLocale() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}
