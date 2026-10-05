import { Fragment } from 'react'

/**
 * Renders the small subset of markdown the assistant actually emits: bold,
 * italics and inline code. Deliberately not a markdown parser.
 *
 * A full parser (react-markdown + rehype-raw) would mean a new dependency plus
 * HTML sanitising, which is a lot of attack surface for three inline styles.
 * Splitting on the delimiters and returning React elements means user- or
 * model-supplied text is never interpreted as HTML at all.
 *
 * Order matters: code spans are extracted first so that a literal `**` inside
 * backticks is not treated as bold.
 */
const TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g

export default function InlineRichText({ text, className = '' }) {
  if (text == null) return null

  const source = String(text)

  // Preserve paragraph breaks, and drop the trailing newline so a reply does
  // not render with a phantom empty line at the bottom.
  const paragraphs = source.replace(/\s+$/, '').split(/\n{2,}/)

  return (
    <div className={className}>
      {paragraphs.map((paragraph, pIndex) => (
        <p key={pIndex} className="whitespace-pre-wrap">
          {renderInline(paragraph)}
        </p>
      ))}
    </div>
  )
}

function renderInline(paragraph) {
  const parts = paragraph.split(TOKEN)

  return parts.map((part, index) => {
    if (!part) return null

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-surface-container px-1 py-0.5 font-mono text-[0.9em] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }

    return <Fragment key={index}>{part}</Fragment>
  })
}
