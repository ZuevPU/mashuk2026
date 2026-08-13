export function plainToFocusHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/** Map editor inline text-align to CSS classes (more reliable in VK WebView). */
export function prepareFocusHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll<HTMLElement>('[style*="text-align"], [align]').forEach((el) => {
    const styleAlign = el.style?.textAlign?.toLowerCase();
    const attrAlign = (el.getAttribute('align') || '').toLowerCase();
    const align = styleAlign || attrAlign;
    if (!align || !['center', 'right', 'left', 'justify'].includes(align)) return;
    el.classList.add(`m-hdr-align-${align}`);
    el.style.textAlign = '';
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    el.removeAttribute('align');
  });
  return root.innerHTML;
}

export function focusBodyHtml(textHtml?: string | null, text?: string | null): string {
  const raw = (textHtml && textHtml.trim())
    ? textHtml
    : (text ? plainToFocusHtml(text) : '');
  return raw ? prepareFocusHtml(raw) : '';
}
