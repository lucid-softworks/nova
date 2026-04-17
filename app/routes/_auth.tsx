import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Nova</div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
