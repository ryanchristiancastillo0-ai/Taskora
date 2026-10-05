import { useState } from 'react'
import { Search, Users } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useApp } from '@/app/providers/AppContext'
import useAdminData from '@/features/admin/hooks/useAdminData'
import useQueryParam from '@/features/admin/hooks/useQueryParam'
import { getUser, getUsers, updateUser } from '@/features/admin/services/adminApi'
import Pagination from '@/features/admin/components/Pagination'
import SectionState from '@/features/admin/components/SectionState'
import TableToolbar from '@/features/admin/components/TableToolbar'
import UserDetailModal from '@/features/admin/components/UserDetailModal'
import UsersTable from '@/features/admin/components/UsersTable'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
]

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All roles' },
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
]

const SORT_OPTIONS = [
  { value: 'joinedAt_desc', label: 'Newest first' },
  { value: 'joinedAt_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'tasks_desc', label: 'Most tasks' },
]

/**
 * User management.
 *
 * Actions here go through PATCH /api/admin/users/:id, so a demotion or a
 * suspension is real and immediate. The handler enforces the two rules that
 * matter — an admin cannot remove their own admin access, and cannot suspend
 * their own account — and revokes the target's refresh tokens on suspension, so
 * a suspended account is signed out everywhere rather than merely hidden. A
 * refusal comes back as an error and is surfaced as a toast instead of being
 * applied locally and then disagreeing with the server.
 *
 * Destructive and privilege-changing actions both go through ConfirmDialog. That
 * is not fussiness: a row menu sits one mis-click from "Suspend account" and from
 * "Promote to Admin", and neither should be undoable only by an admin remembering
 * what they did.
 */
export default function AdminUsers() {
  const { pushToast } = useApp()

  const [query, setQuery] = useQueryParam()
  const [status, setStatus] = useState('ALL')
  const [role, setRole] = useState('ALL')
  const [sort, setSort] = useState('joinedAt_desc')
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const users = useAdminData(
    () => getUsers({ page, limit: PAGE_SIZE, q: query, status, role, sort }),
    [page, query, status, role, sort]
  )

  // Filtering can shrink the result set under the current page, which would
  // otherwise leave the table blank on page 3 of 1.
  const pagination = users.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const runUpdate = async (user, patch, successMessage) => {
    setBusy(true)
    try {
      await updateUser(user.id, patch)
      pushToast(successMessage)
      setConfirm(null)
      // Both the table and the open detail modal hold a copy of this row, so
      // refetching is what keeps them from disagreeing.
      users.reload()
      if (detail?.id === user.id) {
        setDetail(await getUser(user.id))
      }
    } catch (error) {
      pushToast(error.message, 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every account on Taskora, with role and access controls."
      />

      <TableToolbar
        search={{
          icon: Search,
          value: query,
          onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
          placeholder: 'Search name or email…',
        }}
        filters={[
          {
            id: 'status',
            label: 'Filter by status',
            value: status,
            options: STATUS_OPTIONS,
            onChange: (event) => resetToFirstPage(setStatus)(event.target.value),
          },
          {
            id: 'role',
            label: 'Filter by role',
            value: role,
            options: ROLE_OPTIONS,
            onChange: (event) => resetToFirstPage(setRole)(event.target.value),
          },
          {
            id: 'sort',
            label: 'Sort users',
            value: sort,
            options: SORT_OPTIONS,
            onChange: (event) => resetToFirstPage(setSort)(event.target.value),
          },
        ]}
        resultCount={pagination?.total}
        noun="users"
      />

      <SectionState
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        isEmpty={(users.data?.items?.length ?? 0) === 0}
        emptyIcon={Users}
        emptyTitle="No users match"
        emptyDescription="Try a different search term, status or role filter."
        minHeight={280}
      >
        {users.data && (
          <UsersTable
            items={users.data.items}
            onView={setDetail}
            onToggleRole={(user) =>
              setConfirm({
                user,
                patch: { role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' },
                title:
                  user.role === 'ADMIN'
                    ? `Demote ${user.name}?`
                    : `Promote ${user.name} to Admin?`,
                message:
                  user.role === 'ADMIN'
                    ? `${user.name} will lose access to the admin console. Their tasks and projects are not affected.`
                    : `${user.name} will be able to view, edit and suspend every account on Taskora.`,
                confirmLabel: user.role === 'ADMIN' ? 'Demote' : 'Promote',
                tone: user.role === 'ADMIN' ? 'danger' : 'primary',
                success: user.role === 'ADMIN' ? 'Admin access removed' : 'Promoted to Admin',
              })
            }
            onToggleStatus={(user) =>
              setConfirm({
                user,
                patch: { status: user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' },
                title: user.status === 'SUSPENDED' ? `Reactivate ${user.name}?` : `Suspend ${user.name}?`,
                message:
                  user.status === 'SUSPENDED'
                    ? `${user.name} will be able to sign in and use Taskora again.`
                    : `${user.name} will be signed out everywhere and blocked from signing in again until reactivated. Their data is kept.`,
                confirmLabel: user.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend',
                tone: user.status === 'SUSPENDED' ? 'primary' : 'danger',
                success: user.status === 'SUSPENDED' ? 'Account reactivated' : 'Account suspended',
              })
            }
          />
        )}
      </SectionState>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="users"
          onPage={setPage}
        />
      )}

      {detail && <UserDetailModal user={detail} onClose={() => setDetail(null)} />}

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel="Cancel"
          tone={confirm.tone}
          loading={busy}
          onConfirm={() => runUpdate(confirm.user, confirm.patch, confirm.success)}
        />
      )}
    </>
  )
}
