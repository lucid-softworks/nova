import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export function Placeholder({ title, stage }: { title: string; stage: number }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Coming soon — {title} (Stage {stage})</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            This page is a placeholder. It will be built out in Stage {stage}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
