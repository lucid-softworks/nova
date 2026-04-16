import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { en } from './en'
import { fr } from './fr'

export type Locale = 'en' | 'fr'

export type Translations = Record<string, string>

const DICTIONARIES: Record<Locale, Translations> = { en, fr }

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language ?? (navigator as { userLanguage?: string }).userLanguage ?? 'en'
  if (lang.startsWith('fr')) return 'fr'
  return 'en'
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
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const detected = detectLocale()
    setLocale(detected)
    document.documentElement.lang = detected
  }, [])

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
