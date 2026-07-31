import { useEffect, useRef, useState } from 'react';
import { RichFormatToolbar, htmlToPlain } from './RichFormatToolbar';

type Props = {
  description: string;
  descriptionHtml: string;
  onChange: (patch: { description?: string; descriptionHtml?: string }) => void;
  editingKey: string | number;
  label?: string;
  minHeight?: number;
};

export function DescriptionEditor({
  description,
  descriptionHtml,
  onChange,
  editingKey,
  label = 'Описание',
  minHeight = 120,
}: Props) {
  const [mode, setMode] = useState<'plain' | 'rich'>('rich');
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = descriptionHtml || description || '';
    }
  }, [editingKey]);

  const persistRich = () => {
    const html = editorRef.current?.innerHTML || '';
    onChange({ descriptionHtml: html, description: htmlToPlain(html) });
  };

  const switchToRich = () => {
    setMode('rich');
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      if (!editorRef.current.innerHTML.trim() && description.trim()) {
        editorRef.current.innerHTML = description
          .split(/\n+/)
          .map(line => `<p>${line.replace(/</g, '&lt;')}</p>`)
          .join('');
        persistRich();
      }
    });
  };

  return (
    <div className="adm-field">
      <div className="adm-forum-toolbar" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
        <span className="adm-label" style={{ margin: 0 }}>{label}</span>
        <div className="adm-seg adm-seg-sm">
          <button type="button" className={mode === 'plain' ? 'on' : ''} onClick={() => setMode('plain')}>
            Текст
          </button>
          <button type="button" className={mode === 'rich' ? 'on' : ''} onClick={switchToRich}>
            Форматирование
          </button>
        </div>
      </div>
      {mode === 'plain' ? (
        <textarea
          className="adm-input"
          rows={5}
          value={description}
          onChange={e => onChange({ description: e.target.value })}
          style={{ minHeight }}
          placeholder="Описание события…"
        />
      ) : (
        <>
          <RichFormatToolbar editorRef={editorRef} onAfterCommand={persistRich} />
          <div
            ref={editorRef}
            className="adm-input adm-rich-editor"
            style={{ minHeight }}
            contentEditable
            suppressContentEditableWarning
            onInput={persistRich}
            data-placeholder="Описание события…"
          />
        </>
      )}
    </div>
  );
}
