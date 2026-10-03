import Input from '@/shared/components/ui/Input'
import Select from '@/shared/components/ui/Select'
import { cx } from '@/shared/utils/format'

/**
 * The search-plus-filters row that sits above every admin table.
 *
 * `filters` is a list of `{ id, label, value, options, onChange }`. Rendering
 * them from data rather than accepting arbitrary children is what keeps five
 * different admin tables from ending up with five different filter widths, and
 * it means a page adds a filter by adding one object. The control is the shared
 * Select rather than a bare <select>, so the chevron, focus ring and dark-mode
 * field styling stay identical to the rest of the app.
 *
 * The pages pass two, three or four filters, and that variance is what this
 * layout has to absorb:
 *
 * - The search field and the result count share one row. The count is short
 *   enough ("2 tasks") to ride beside the field instead of claiming a line of
 *   its own underneath four filters, which is what pushed the table below the
 *   fold on /admin/tasks.
 * - `xl:contents` dissolves that pair at desktop, so search, filters and count
 *   become three direct children of the row and lay out on one line. Below `xl`
 *   the console sidebar already takes 16rem of the viewport, so a single line
 *   would only ever wrap.
 * - Under `xl` the filters are a grid sized by `auto-fit` rather than a fixed
 *   column count. A fixed `sm:grid-cols-3` left the fourth select stranded in
 *   the first column of its own row with two empty cells beside it — the "box
 *   forced into the second column" that made /admin/tasks look broken at 640px.
 *   `auto-fit` also collapses tracks a shorter list does not need, so two
 *   filters share the row instead of sitting in two quarters of it.
 * - The minimum track width tightens at four filters, which is exactly what
 *   keeps all four on one line at `sm`; at the roomier minimum a fourth select
 *   drops to the next row.
 * - A single filter is capped at `lg:w-40`. `auto-fit` stretches whatever it is
 *   given to the full row, which would turn the lone select on /admin/ai-usage
 *   into a 700px-wide control.
 * - At `xl` the selects stop growing and take a fixed compact width, so the
 *   search field — the identifying control — is the one that takes the slack.
 */
export default function TableToolbar({ search, filters = [], resultCount, noun = 'results' }) {
  const trackWidth = filters.length >= 4 ? '7.5rem' : '9rem'

  const count =
    resultCount === undefined ? null : (
      <p className="shrink-0 whitespace-nowrap text-[13px] text-ink-muted xl:ml-auto">
        {resultCount} {resultCount === 1 ? noun.replace(/s$/, '') : noun}
      </p>
    )

  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
      {search && (
        <div className="flex items-center gap-3 xl:contents">
          <Input
            icon={search.icon}
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            className="min-w-0 flex-1 xl:min-w-[200px]"
          />
          {count}
        </div>
      )}

      {filters.length > 0 && (
        <div
          className={cx(
            'grid gap-2 xl:flex xl:flex-nowrap xl:items-center xl:gap-3',
            filters.length === 1 && 'lg:w-40 xl:w-auto'
          )}
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${trackWidth}, 1fr))` }}
        >
          {filters.map((filter) => (
            <Select
              key={filter.id}
              value={filter.value}
              onChange={filter.onChange}
              aria-label={filter.label}
              className="min-w-0 xl:w-36 xl:shrink-0 2xl:w-40"
              selectClassName="truncate"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
      )}

      {!search && count}
    </div>
  )
}
