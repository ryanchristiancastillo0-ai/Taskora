import DataTable from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { NOTIFICATION_TYPES } from '@/constants'
import { formatDate, timeAgo } from '@/utils/format'

// Every notification the platform has generated, for inspection. Read-only:
// the labels reuse NOTIFICATION_TYPES from the shared constants, so a type can
// never read one way in the user notification centre and another way here.
export default function NotificationsTable({ items }) {
  const columns = [
    {
      key: 'title',
      label: 'Notification',
      render: (item) => (
        <div className="min-w-0 max-w-[300px]">
          <p className="truncate font-medium text-ink">{item.title}</p>
          <p className="truncate text-xs text-ink-muted">{item.message}</p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (item) => {
        const meta = NOTIFICATION_TYPES[item.type] || { label: item.type, tone: 'slate' }
        return <Badge tone={meta.tone}>{meta.label}</Badge>
      },
    },
    {
      key: 'recipient',
      label: 'Recipient',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={item.recipient.name} src={item.recipient.avatarUrl} size="sm" />
          <span className="whitespace-nowrap text-ink-soft">{item.recipient.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Badge tone={item.read ? 'muted' : 'amber'} dot>
          {item.read ? 'Read' : 'Unread'}
        </Badge>
      ),
    },
    {
      key: 'at',
      label: 'Sent',
      render: (item) => (
        <span className="whitespace-nowrap text-ink-muted">{formatDate(item.at)}</span>
      ),
    },
    {
      key: 'ago',
      label: 'Age',
      render: (item) => (
        <span className="whitespace-nowrap text-ink-faint">{timeAgo(item.at)}</span>
      ),
    },
  ]

  return <DataTable columns={columns} items={items} getRowId={(item) => item.id} />
}
