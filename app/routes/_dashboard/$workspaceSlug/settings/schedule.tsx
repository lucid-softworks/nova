import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/schedule')({
  component: () => <Placeholder title="Posting Schedule" stage={16} />,
})
