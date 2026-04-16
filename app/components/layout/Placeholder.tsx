import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { useT } from '~/lib/i18n'

export function Placeholder({ title, stage }: { title: string; stage: number }) {
  const t = useT()
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{t('placeholder.comingSoon', { title, stage: String(stage) })}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('placeholder.builtInStage', { stage: String(stage) })}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
