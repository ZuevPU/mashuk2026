import { useEffect, useRef } from 'react';

type Props = {
  value: string;
  onChange: (html: string) => void;
  resetKey?: string | number;
  minHeight?: number;
  label?: string;
};

export function RichHtmlEditor({ value, onChange, resetKey, minHeight = 80, label }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
  }, [resetKey]);

  const exec = (cmd: string) => {
    document.execCommand(cmd);
    editorRef.current?.focus();
  };

  return (
    <label className="adm-field">
      {label && <span className="adm-label">{label}</span>}
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
        onInput={() => onChange(editorRef.current?.innerHTML || '')}
      />
    </label>
  );
}
