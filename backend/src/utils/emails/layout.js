/**
 * Shared visual identity for every Taskora email.
 *
 * Templates own content only. This module owns the shell, the brand tokens and
 * the small building blocks (paragraph / codeBlock / notice / button), so a new
 * email kind cannot drift away from the existing ones.
 *
 * The palette mirrors the light-mode tokens in frontend/src/index.css. Email has
 * no theme switch and no CSS variables, so the values are inlined per element.
 */

const BRAND = {
  primary: "#6659e2",
  strong: "#4d3ec8",
  soft: "#eeedfc",
  faint: "#e4dfff",
  surface: "#f3f4f9",
  card: "#ffffff",
  ink: "#161d1f",
  inkSoft: "#474554",
  inkMuted: "#717b8a",
  border: "#e2e8f0",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

/** Web-safe stack. The app's Plus Jakarta Sans is not embedded in mail. */
const FONT_STACK = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK = "'Consolas','Menlo','Courier New',monospace";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function layout({ title, preheader, bodyHtml, footerText }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:${FONT_STACK};color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:32px 12px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
<tr>
<td style="background:${BRAND.primary};padding:24px 32px;">
<span style="display:inline-block;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Taskora</span>
<span style="display:inline-block;margin-left:8px;font-size:12px;color:${BRAND.faint};vertical-align:middle;">Personal Task Manager</span>
</td>
</tr>
<tr>
<td style="padding:32px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:600;color:${BRAND.ink};">${escapeHtml(title)}</h1>
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:20px 32px;background:${BRAND.surface};border-top:1px solid ${BRAND.border};font-size:12px;line-height:18px;color:${BRAND.inkMuted};">
${escapeHtml(footerText)}
</td>
</tr>
</table>
<p style="margin:16px 0 0;font-size:11px;line-height:17px;color:${BRAND.inkMuted};text-align:center;">
This is an automated message from Taskora. If you did not request this, you can safely ignore it.
</p>
</td>
</tr>
</table>
</body>
</html>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:${BRAND.inkSoft};">${escapeHtml(
    text
  )}</p>`;
}

function codeBlock(code) {
  return `<div style="margin:8px 0 24px;padding:20px 16px;background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:12px;text-align:center;">
<span style="font-family:${MONO_STACK};font-size:32px;font-weight:700;letter-spacing:0.4em;color:${BRAND.strong};">${escapeHtml(
    code
  )}</span>
</div>`;
}

function notice(text, tone = "neutral") {
  const accent =
    tone === "warning"
      ? BRAND.warning
      : tone === "danger"
        ? BRAND.danger
        : BRAND.primary;

  return `<p style="margin:0 0 16px;padding:12px 14px;background:${BRAND.surface};border-left:3px solid ${accent};border-radius:0 8px 8px 0;font-size:13px;line-height:20px;color:${BRAND.inkSoft};">${escapeHtml(
    text
  )}</p>`;
}

/**
 * Bulletproof button. Email clients strip <button>, so this is a table-based
 * link with a real href; the surrounding padding keeps the tap target usable on
 * touch clients.
 */
function actionButton({ url, label }) {
  if (!url) return "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
<tr>
<td align="center" bgcolor="${BRAND.primary}" style="border-radius:10px;">
<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(
    label
  )}</a>
</td>
</tr>
</table>`;
}

/** Small key/value list used for task/project detail on notification email. */
function detailList(details) {
  const rows = details
    .filter((detail) => detail && detail.value)
    .map(
      (detail) => `<tr>
<td style="padding:7px 0;font-size:13px;color:${BRAND.inkMuted};vertical-align:top;">${escapeHtml(
        detail.label
      )}</td>
<td style="padding:7px 0 7px 16px;font-size:13px;font-weight:600;color:${BRAND.ink};text-align:right;vertical-align:top;">${escapeHtml(
        detail.value
      )}</td>
</tr>`
    )
    .join("");

  if (!rows) return "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding:14px 16px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;">
${rows}
</table>`;
}

module.exports = {
  BRAND,
  escapeHtml,
  layout,
  paragraph,
  codeBlock,
  notice,
  actionButton,
  detailList,
};
