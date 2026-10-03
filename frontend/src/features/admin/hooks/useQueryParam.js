import { useSearchParams } from 'react-router-dom'

/**
 * A table's text filter, held in the URL as `?q=`.
 *
 * The admin header's search lands here: choosing "coffee" under Tasks navigates
 * to `/admin/tasks?q=coffee`, and the table comes up with the term in its search
 * box and the list already filtered. Keeping the term in the URL rather than in
 * component state is what makes that work, and it buys three things for free:
 * the result is linkable and survives a reload, Back undoes a filter the way a
 * person expects, and the console can be reloaded at the exact page you were
 * looking at.
 *
 * The one deviation from normal navigation is `replace`. Typing a filter is not
 * a place to visit, so each keystroke replaces the entry instead of pushing one;
 * without it, Back would walk through every prefix of the word that was typed.
 */
export default function useQueryParam() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''

  const setQuery = (next) => {
    const updated = new URLSearchParams(params)
    if (next) updated.set('q', next)
    else updated.delete('q')
    setParams(updated, { replace: true })
  }

  return [query, setQuery]
}
