import type { RefObject } from 'react';

type ToolbarProps = {
  editorRef: RefObject<HTMLElement | null>;
  onAfterCommand?: () => void;
};

function run(editor: HTMLElement | null, cmd: string, value?: string) {
  editor?.focus();
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, value);
  editor?.focus();
}

const FONT_SIZES = [
  { value: '12', label: '12' },
  { value: '14', label: '14' },
  { value: '16', label: '16' },
  { value: '18', label: '18' },
  { value: '22', label: '22' },
  { value: '28', label: '28' },
];

function applyFontSize(editor: HTMLElement | null, px: string) {
  if (!editor) return;
  editor.focus();
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand('fontSize', false, '7');
  const candidates = editor.querySelectorAll(
    'font[size="7"], span[style*="xxx-large"], span[style*="xx-large"]',
  );
  candidates.forEach((el) => {
    if (el instanceof HTMLFontElement) {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      if (el.color) span.style.color = el.color;
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
      return;
    }
    if (el instanceof HTMLElement) {
      el.style.fontSize = `${px}px`;
    }
  });
  editor.focus();
}

export function RichFormatToolbar({ editorRef, onAfterCommand }: ToolbarProps) {
  const exec = (cmd: string, value?: string) => {
    run(editorRef.current, cmd, value);
    onAfterCommand?.();
  };

  return (
    <div className="adm-rich-toolbar" role="toolbar" aria-label="Форматирование">
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn adm-rich-btn-b"
        title="Жирный"
        onMouseDown={e => { e.preventDefault(); exec('bold'); }}
      >
        Ж
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn adm-rich-btn-i"
        title="Курсив"
        onMouseDown={e => { e.preventDefault(); exec('italic'); }}
      >
        К
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn adm-rich-btn-u"
        title="Подчёркнутый"
        onMouseDown={e => { e.preventDefault(); exec('underline'); }}
      >
        П
      </button>
      <label className="adm-rich-color-wrap" title="Цвет текста">
        <span className="adm-muted" style={{ fontSize: 11 }}>Цвет</span>
        <input
          type="color"
          className="adm-rich-color"
          defaultValue="#1d1d1f"
          onMouseDown={e => e.preventDefault()}
          onChange={e => exec('foreColor', e.target.value)}
        />
      </label>
      <select
        className="adm-input adm-rich-size"
        title="Размер шрифта"
        defaultValue=""
        onMouseDown={e => e.preventDefault()}
        onChange={e => {
          const px = e.target.value;
          if (!px) return;
          applyFontSize(editorRef.current, px);
          onAfterCommand?.();
          e.currentTarget.value = '';
        }}
      >
        <option value="">Размер</option>
        {FONT_SIZES.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <span className="adm-rich-toolbar-sep" aria-hidden />
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="Заголовок"
        onMouseDown={e => { e.preventDefault(); exec('formatBlock', 'h3'); }}
      >
        З
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="Маркированный список"
        onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}
      >
        • Список
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="Нумерованный список"
        onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}
      >
        1. Список
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="Обычный абзац"
        onMouseDown={e => { e.preventDefault(); exec('formatBlock', 'p'); }}
      >
        Абзац
      </button>
      <span className="adm-rich-toolbar-sep" aria-hidden />
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="По левому краю"
        onMouseDown={e => { e.preventDefault(); exec('justifyLeft'); }}
      >
        ⟸
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="По центру"
        onMouseDown={e => { e.preventDefault(); exec('justifyCenter'); }}
      >
        ≡
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="По правому краю"
        onMouseDown={e => { e.preventDefault(); exec('justifyRight'); }}
      >
        ⟹
      </button>
    </div>
  );
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TR']);

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizePlain(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Keep line breaks from <br> / block tags so words do not glue together. */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return normalizePlain(decodeEntities(
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    ));
  }
  const root = document.createElement('div');
  root.innerHTML = html;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    if (el.tagName === 'BR') return '\n';
    const inner = Array.from(el.childNodes).map(walk).join('');
    return BLOCK_TAGS.has(el.tagName) ? `${inner}\n` : inner;
  };
  return normalizePlain(walk(root));
}
