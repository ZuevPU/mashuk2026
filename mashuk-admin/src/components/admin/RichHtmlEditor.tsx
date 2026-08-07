import { useEffect, useRef } from 'react';
import { RichFormatToolbar } from './RichFormatToolbar';

type Props = {
  value: string;
  onChange: (html: string) => void;
  resetKey?: string | number;
  minHeight?: number;
  label?: string;
};

export function RichHtmlEditor({ value, onChange, resetKey, minHeight = 100, label }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
  }, [resetKey]);

  const persist = () => onChange(editorRef.current?.innerHTML || '');

  return (
    <div className="adm-field">
      {label && <span className="adm-label">{label}</span>}
      <RichFormatToolbar editorRef={editorRef} onAfterCommand={persist} />
      <div
        ref={editorRef}
        className="adm-input adm-rich-editor"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Текст с абзацами, жирным, курсивом…"
        onInput={persist}
      />
    </div>
  );
}
