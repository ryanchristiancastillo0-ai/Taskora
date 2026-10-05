import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import { formatDate, formatTime, timeAgo } from '@/utils/format'

// One row per completed AI request. Deliberately not a success/failure column:
// AIMessage stores no outcome, so any such column would read "100% success"
// forever and be worse than absent.
//
// The row carries no conversation title and no ids. A title is not a label the
// user picked — AIConversation sets it from their own first message — so showing
// it here meant an admin could read what people had typed into the assistant.
// There is no hash here on purpose: a deterministic digest of a short prompt is
// identical for everyone who typed the same words, which makes it a fingerprint
// rather than privacy, and a 60-character message is trivially brute-forced
// against common phrases. Not sending the content is the only version of this
// that is actually irreversible.
export default function AiUsageTable({ items }) {
  const columns = [
    {
      key: 'user',
      label: 'User',
      render: (item) => (
        <div className="flex items-center gap-3">
          <Avatar name={item.user.name} size="sm" />
          <span className="whitespace-nowrap text-ink-soft">{item.user.name}</span>
        </div>
      ),
    },
    {
      key: 'conversation',
      label: 'Conversation',
      render: () => (
        <span className="text-ink-faint">Private chat</span>
      ),
    },
    {
      key: 'provider',
      label: 'Provider',
      render: (item) => (
        <Badge tone={item.provider === 'GEMINI' ? 'indigo' : 'slate'}>
          {item.provider === 'GEMINI' ? 'Gemini' : 'OpenRouter'}
        </Badge>
      ),
    },
    {
      key: 'at',
      label: 'Requested',
      render: (item) => (
        <span className="whitespace-nowrap text-ink-muted">
          {formatDate(item.at)} · {formatTime(item.at)}
        </span>
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

  // No id on the row to key it by, so the index is folded in — it is unique by
  // definition, and the other two parts keep keys stable across a re-render.
  return (
    <DataTable
      columns={columns}
      items={items}
      getRowId={(item, index) =>
        `${item.user.id}-${new Date(item.at).getTime()}-${index}`
      }
    />
  )
}
