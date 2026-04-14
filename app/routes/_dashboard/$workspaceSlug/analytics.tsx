import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/analytics')({
  component: () => <Placeholder title="Analytics" stage={15} />,
})
