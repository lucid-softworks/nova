import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/accounts')({
  component: () => <Placeholder title="Accounts" stage={2} />,
})
