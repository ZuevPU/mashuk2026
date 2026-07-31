import { useEffect, useRef, useState } from 'react';

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
  minHeight = 100,
}: Props) {
  const [mode, setMode] = useState<'plain' | 'rich'>(() =>
    (descriptionHtml && descriptionHtml.replace(/<[^>]+>/g, '').trim()) ? 'rich' : 'plain',
  );
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = descriptionHtml || '';
    }
  }, [editingKey]);

  const exec = (cmd: string) => {
    document.execCommand(cmd);
    editorRef.current?.focus();
  };

  return (
    <div className="adm-field">
      <div className="adm-forum-toolbar" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
        <span className="adm-label" style={{ margin: 0 }}>{label}</span>
        <div className="adm-seg adm-seg-sm">
          <button type="button" className={mode === 'plain' ? 'on' : ''} onClick={() => setMode('plain')}>
            Текст
          </button>
          <button type="button" className={mode === 'rich' ? 'on' : ''} onClick={() => setMode('rich')}>
            Форматирование
          </button>
        </div>
      </div>
      {mode === 'plain' ? (
        <textarea
          className="adm-input"
          rows={4}
          value={description}
          onChange={e => onChange({ description: e.target.value })}
          style={{ minHeight }}
        />
      ) : (
        <>
          <div className="adm-rich-toolbar">
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onMouseDown={e => { e.preventDefault(); exec('bold'); }}>B</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}>•</button>
          </div>
          <div
            ref={editorRef}
            className="adm-input adm-rich-editor"
            style={{ minHeight }}
            contentEditable
            suppressContentEditableWarning
            onInput={() => onChange({ descriptionHtml: editorRef.current?.innerHTML || '' })}
          />
        </>
      )}
    </div>
  );
}
