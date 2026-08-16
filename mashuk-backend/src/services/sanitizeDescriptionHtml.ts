/** Strip scripts and handlers; keep ordinary rich-text tags from the admin editor. */
export function sanitizeDescriptionHtml(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let html = String(raw);
  if (!html) return html;
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');
  return html;
}
