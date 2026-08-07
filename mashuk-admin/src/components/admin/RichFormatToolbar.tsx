import type { RefObject } from 'react';

type ToolbarProps = {
  editorRef: RefObject<HTMLElement | null>;
  onAfterCommand?: () => void;
};

function run(editor: HTMLElement | null, cmd: string, value?: string) {
  editor?.focus();
  document.execCommand(cmd, false, value);
  editor?.focus();
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
        className="adm-btn adm-btn-sm adm-btn-secondary adm-rich-btn"
        title="Заголовок"
        onMouseDown={e => { e.preventDefault(); exec('formatBlock', 'h3'); }}
      >
        З
      </button>
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
      <span className="adm-rich-toolbar-sep" aria-hidden />
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

export function htmlToPlain(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.innerText || d.textContent || '').trim();
}
