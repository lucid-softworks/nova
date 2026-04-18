import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Inbox,
  LineChart,
  Link2,
  Megaphone,
  Rss,
  Send,
  Sparkles,
  Users as UsersIcon,
  X as XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import { getSessionContext } from '~/server/auth-context'
import { listPublicPlans, type PublicPlan } from '~/server/marketing'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const ctx = await getSessionContext()
    if (ctx.user) {
      if (ctx.workspaces.length === 0) throw redirect({ to: '/onboarding' })
      const first = ctx.workspaces[0]!
      throw redirect({ to: '/$workspaceSlug/compose', params: { workspaceSlug: first.slug } })
    }
  },
  loader: async () => ({ plans: await listPublicPlans() }),
  component: Homepage,
})

function Homepage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <MarketingNav />
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  )
}

function MarketingNav() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/80 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
            N
          </span>
          Nova
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-neutral-600 md:flex dark:text-neutral-300">
          <a href="#features" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            {t('marketing.nav.features')}
          </a>
          <a href="#pricing" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            {t('marketing.nav.pricing')}
          </a>
          <a href="#faq" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            {t('marketing.nav.faq')}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:inline-block dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {t('marketing.nav.signIn')}
          </Link>
          <Link
            to="/login"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {t('marketing.nav.getStarted')}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md p-1.5 text-neutral-700 hover:bg-neutral-100 md:hidden dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Toggle menu"
          >
            {open ? <XIcon className="h-5 w-5" /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="flex flex-col gap-1 border-t border-neutral-200 bg-white px-4 py-2 text-sm md:hidden dark:border-neutral-800 dark:bg-neutral-950">
          <a
            href="#features"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('marketing.nav.features')}
          </a>
          <a
            href="#pricing"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('marketing.nav.pricing')}
          </a>
          <a
            href="#faq"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('marketing.nav.faq')}
          </a>
          <Link
            to="/login"
            className="rounded px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('marketing.nav.signIn')}
          </Link>
        </nav>
      ) : null}
    </header>
  )
}

function MenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  )
}

function Hero() {
  const t = useT()
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-950/30 dark:via-neutral-950 dark:to-neutral-950"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Sparkles className="h-3 w-3" />
            {t('marketing.hero.eyebrow')}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {t('marketing.hero.title')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-neutral-600 sm:text-lg dark:text-neutral-300">
            {t('marketing.hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              {t('marketing.hero.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              {t('marketing.hero.secondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { key: 'multi', icon: Send },
  { key: 'ai', icon: Sparkles },
  { key: 'calendar', icon: CalendarIcon },
  { key: 'approvals', icon: UsersIcon },
  { key: 'analytics', icon: LineChart },
  { key: 'bio', icon: Link2 },
  { key: 'rss', icon: Rss },
  { key: 'campaigns', icon: Megaphone },
  { key: 'inbox', icon: Inbox },
] as const

function Features() {
  const t = useT()
  return (
    <section id="features" className="border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('marketing.features.title')}
          </h2>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-300">
            {t('marketing.features.subtitle')}
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">
                {t(`marketing.feature.${key}.title` as never)}
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                {t(`marketing.feature.${key}.body` as never)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const t = useT()
  const { plans } = Route.useLoaderData()
  const visible = plans.filter((p) => p.priceDisplay && p.priceDisplay.trim() !== '')
  return (
    <section
      id="pricing"
      className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('marketing.pricing.title')}
          </h2>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-300">
            {t('marketing.pricing.subtitle')}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="mt-12 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
            {t('marketing.pricing.empty')}
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((plan) => (
              <PlanCard key={plan.key} plan={plan} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: PublicPlan }) {
  const t = useT()
  const members = plan.maxMembers === 1
    ? t('marketing.pricing.members', { count: plan.maxMembers })
    : t('marketing.pricing.membersPlural', { count: plan.maxMembers })
  const accounts = plan.maxConnectedAccounts === 1
    ? t('marketing.pricing.accounts', { count: plan.maxConnectedAccounts })
    : t('marketing.pricing.accountsPlural', { count: plan.maxConnectedAccounts })
  const posts = t('marketing.pricing.posts', {
    count: plan.maxScheduledPostsPerMonth.toLocaleString(),
  })
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-white p-6 dark:bg-neutral-900',
        plan.featured
          ? 'border-indigo-500 shadow-lg ring-1 ring-indigo-500'
          : 'border-neutral-200 dark:border-neutral-800',
      )}
    >
      {plan.featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          {t('marketing.pricing.popular')}
        </div>
      ) : null}
      <div>
        <h3 className="text-lg font-semibold">{plan.label}</h3>
        {plan.description ? (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{plan.description}</p>
        ) : null}
      </div>
      <div className="mt-4 text-4xl font-semibold tracking-tight">{plan.priceDisplay}</div>
      <ul className="mt-6 flex-1 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
        <Feature enabled>{members}</Feature>
        <Feature enabled>{accounts}</Feature>
        <Feature enabled>{posts}</Feature>
        <Feature enabled={plan.aiAssistEnabled}>
          {plan.aiAssistEnabled
            ? t('marketing.pricing.aiIncluded')
            : t('marketing.pricing.aiExcluded')}
        </Feature>
      </ul>
      <Link
        to="/login"
        className={cn(
          'mt-6 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold',
          plan.featured
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
        )}
      >
        {t('marketing.pricing.cta')}
      </Link>
    </div>
  )
}

function Feature({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {enabled ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
      ) : (
        <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
      )}
      <span className={enabled ? '' : 'text-neutral-400 line-through dark:text-neutral-500'}>
        {children}
      </span>
    </li>
  )
}

const FAQS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const

function FAQ() {
  const t = useT()
  return (
    <section id="faq" className="border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('marketing.faq.title')}
        </h2>
        <div className="mt-12 divide-y divide-neutral-200 dark:divide-neutral-800">
          {FAQS.map((id) => (
            <FAQItem
              key={id}
              question={t(`marketing.faq.${id}` as never)}
              answer={t(`marketing.faq.a${id.slice(1)}` as never)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 py-5 text-left"
      >
        <span className="text-base font-medium">{question}</span>
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-transform',
            open
              ? 'rotate-45 border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300'
              : 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
          )}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      {open ? (
        <p className="pb-5 text-sm text-neutral-600 dark:text-neutral-300">{answer}</p>
      ) : null}
    </div>
  )
}

function Footer() {
  const t = useT()
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
                N
              </span>
              Nova
            </div>
            <p className="mt-3 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">
              {t('marketing.footer.tagline')}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {t('marketing.footer.product')}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <li>
                <a href="#features" className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {t('marketing.nav.features')}
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {t('marketing.nav.pricing')}
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {t('marketing.nav.faq')}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {t('marketing.footer.legal')}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <li>
                <Link to="/login" className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {t('marketing.nav.signIn')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <div>© {year} Nova. {t('marketing.footer.rights')}</div>
          <div className="flex items-center gap-2">
            <Check className="h-3 w-3" />
            Built with care in the open.
          </div>
        </div>
      </div>
    </footer>
  )
}
