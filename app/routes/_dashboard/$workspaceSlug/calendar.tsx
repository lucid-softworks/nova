import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/calendar')({
  component: () => <Placeholder title="Calendar" stage={11} />,
})
