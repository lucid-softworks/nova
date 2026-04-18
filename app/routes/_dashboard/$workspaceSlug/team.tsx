import { createFileRoute } from '@tanstack/react-router'
import { toast } from '~/components/ui/toast'
import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useConfirm } from '~/components/ui/confirm'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  listMembers,
  listInvitations,
  updateMemberRole,
  removeMember,
  addMemberByEmail,
  cancelInvitation,
  getWorkspaceApproval,
  setRequireApproval,
  setApprovers,
  type MemberRow,
  type InvitationRow,
} from '~/server/team'
import type { WorkspaceRole } from '~/server/types'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

type Role = WorkspaceRole

const ROLE_I18N_KEYS = {
  admin: 'team.admin',
  manager: 'team.manager',
  editor: 'team.editor',
  viewer: 'team.viewer',
} as const
const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
  manager: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  editor: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
  viewer: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200',
}

export const Route = createFileRoute('/_dashboard/$workspaceSlug/team')({
  loader: async ({ params }) => {
    const [members, invitations, approval] = await Promise.all([
      listMembers({ data: { workspaceSlug: params.workspaceSlug } }),
      listInvitations({ data: { workspaceSlug: params.workspaceSlug } }).catch(
        () => [] as InvitationRow[],
      ),
      getWorkspaceApproval({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { members, invitations, approval }
  },
  component: TeamPage,
})

function TeamPage() {
  const t = useT()
  const confirm = useConfirm()
  const { workspaceSlug } = Route.useParams()
  const { session, workspace } = Route.useRouteContext()
  const initial = Route.useLoaderData()
  const [members, setMembers] = useState<MemberRow[]>(initial.members)
  const [invitations, setInvitations] = useState<InvitationRow[]>(initial.invitations)
  const [requireApproval, setRequireApprovalState] = useState(initial.approval.requireApproval)
  const [approverUserIds, setApproverUserIds] = useState<string[]>(initial.approval.approverUserIds)
  const [inviteOpen, setInviteOpen] = useState(false)

  const myRole = workspace.role
  const canManage = myRole === 'admin' || myRole === 'manager'
  const isAdmin = myRole === 'admin'

  const approverCandidates = useMemo(
    () => members.filter((m) => m.role === 'admin' || m.role === 'manager'),
    [members],
  )

  const reload = async () => {
    const [m, i, a] = await Promise.all([
      listMembers({ data: { workspaceSlug } }),
      listInvitations({ data: { workspaceSlug } }).catch(() => [] as InvitationRow[]),
      getWorkspaceApproval({ data: { workspaceSlug } }),
    ])
    setMembers(m)
    setInvitations(i)
    setRequireApprovalState(a.requireApproval)
    setApproverUserIds(a.approverUserIds)
  }

  const handleCancelInvitation = async (inv: InvitationRow) => {
    const ok = await confirm({
      message: t('team.cancelInvitationConfirm'),
      destructive: true,
    })
    if (!ok) return
    try {
      await cancelInvitation({ data: { workspaceSlug, invitationId: inv.id } })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleRoleChange = async (member: MemberRow, newRole: Role) => {
    try {
      await updateMemberRole({ data: { workspaceSlug, memberId: member.id, role: newRole } })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleRemove = async (member: MemberRow) => {
    const ok = await confirm({
      message: t('team.removeMemberConfirm'),
      destructive: true,
    })
    if (!ok) return
    try {
      await removeMember({ data: { workspaceSlug, memberId: member.id } })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleToggleApproval = async (v: boolean) => {
    setRequireApprovalState(v)
    try {
      await setRequireApproval({ data: { workspaceSlug, value: v } })
    } catch (e) {
      setRequireApprovalState(!v)
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleToggleApprover = async (userId: string) => {
    const next = approverUserIds.includes(userId)
      ? approverUserIds.filter((id) => id !== userId)
      : [...approverUserIds, userId]
    setApproverUserIds(next)
    try {
      await setApprovers({ data: { workspaceSlug, userIds: next } })
    } catch (e) {
      setApproverUserIds(approverUserIds)
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  void session
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('team.title')}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('team.manageDescription')}</p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> {t('team.inviteMember')}
          </Button>
        ) : null}
      </div>

      <Card>
        <div className="overflow-hidden rounded-md">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-4 py-2">{t('team.member')}</th>
                <th className="px-4 py-2">{t('team.role')}</th>
                <th className="px-4 py-2">{t('team.joined')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.image ? (
                        <img src={m.image} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {m.name}
                          {m.isSelf ? <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">({t('team.you')})</span> : null}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && !m.isSelf ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value as Role)}
                        className={cn(
                          'rounded-full border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 text-xs font-medium',
                          ROLE_COLORS[m.role],
                        )}
                      >
                        {(['admin', 'manager', 'editor', 'viewer'] as Role[]).map((r) => (
                          <option key={r} value={r} disabled={r === 'admin' && !isAdmin}>
                            {t(ROLE_I18N_KEYS[r])}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_COLORS[m.role])}>
                        {t(ROLE_I18N_KEYS[m.role])}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                    {m.joinedAt
                      ? new Date(m.joinedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Invited'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !m.isSelf ? (
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(m)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && invitations.length > 0 ? (
        <Card>
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('team.pendingInvitations')}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="py-1">{t('team.email')}</th>
                  <th className="py-1">{t('team.role')}</th>
                  <th className="py-1">{t('team.invitedBy')}</th>
                  <th className="py-1">{t('team.expires')}</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1.5">{inv.email}</td>
                    <td className="py-1.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', ROLE_COLORS[inv.role])}>
                        {t(ROLE_I18N_KEYS[inv.role])}
                      </span>
                    </td>
                    <td className="py-1.5 text-xs text-neutral-500 dark:text-neutral-400">{inv.inviterName ?? '—'}</td>
                    <td className="py-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleCancelInvitation(inv)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <div className="space-y-3 p-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('team.approvalWorkflow')}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('team.approvalDescription2')}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => handleToggleApproval(e.target.checked)}
              />
              {t('team.requireApprovalLabel')}
            </label>
            {requireApproval ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{t('team.approvers')}</div>
                {approverCandidates.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t('team.promoteForApproval')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {approverCandidates.map((m) => {
                      const selected = approverUserIds.includes(m.userId)
                      return (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => handleToggleApprover(m.userId)}
                          className={cn(
                            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                            selected
                              ? 'border-indigo-500 bg-indigo-500 text-white'
                              : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                          )}
                        >
                          {m.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceSlug={workspaceSlug}
        onAdded={reload}
      />
    </div>
  )
}

function InviteModal({
  open,
  onOpenChange,
  workspaceSlug,
  onAdded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceSlug: string
  onAdded: () => Promise<void>
}) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await addMemberByEmail({
        data: { workspaceSlug, email, role },
      })
      if (res.kind === 'already_member') {
        setError(t('team.alreadyInWorkspace'))
        return
      }
      if (res.kind === 'invited') {
        setError(null)
        // Fall through; UI reload shows the pending invitation.
      }
      onOpenChange(false)
      setEmail('')
      setRole('editor')
      await onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('team.inviteAMember')}</DialogTitle>
          <DialogDescription>
            {t('team.inviteDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <Field label={t('team.email')} htmlFor="inv-email">
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          </Field>
          <Field label={t('team.role')} htmlFor="inv-role">
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-10 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('team.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? <Spinner /> : null}
              {t('team.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
