import { cx } from '@/utils/format'

/**
 * Minimal table renderer for the "table" list view.
 *
 * Columns are described as data rather than markup so each page owns its own
 * cells without this component knowing anything about notes or goals. A column
 * may also pass `header` instead of `label` when the heading needs to be
 * interactive, which is how the admin users table gets sortable columns. The
 * wrapper scrolls horizontally on narrow screens, because a seven-column table
 * cannot be squeezed into a phone and silently hiding columns would be worse
 * than a scroll.
 */
export default function DataTable({ columns, getRowId, items }) {
  // `rows` is normalised rather than trusting the caller. A table is almost
  // always rendered inside a loading/empty wrapper, and the children of such a
  // wrapper are still evaluated before the wrapper decides what to show - so
  // passing `items={data?.items}` (undefined on the first render) reaches
  // items.map with nothing to iterate. Callers that already pass an array are
  // unaffected.
  const rows = Array.isArray(items) ? items : []

  return (
    <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface-card shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  'whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint',
                  column.headerClassName
                )}
              >
                {column.header ?? column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr
              // The index is passed through so a table whose rows carry no id of
              // their own can still produce a unique key. Existing callers ignore
              // the extra argument.
              key={getRowId(item, index)}
              className="border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-soft/50"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    'px-4 py-3 align-middle text-[13px] text-ink-soft',
                    column.className
                  )}
                >
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
