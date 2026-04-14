import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/team')({
  component: () => <Placeholder title="Team" stage={13} />,
})
