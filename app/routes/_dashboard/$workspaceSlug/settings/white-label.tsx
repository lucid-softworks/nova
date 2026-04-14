import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/white-label')({
  component: () => <Placeholder title="White Label" stage={16} />,
})
