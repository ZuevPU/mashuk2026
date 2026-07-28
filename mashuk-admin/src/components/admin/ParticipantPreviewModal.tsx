import type { ReactNode } from 'react';

/** Общая оболочка превью «как участник». */
export function ParticipantPreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="card adm-participant-preview"
      style={{ marginBottom: 16, background: '#FAFAF8', border: '1px dashed #C4B5A0' }}
    >
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Превью для участника</div>
      {children}
    </div>
  );
}

export function ParticipantPreviewHtml({
  title,
  subtitle,
  html,
}: {
  title: string;
  subtitle?: string;
  html: string;
}) {
  return (
    <ParticipantPreviewFrame>
      {subtitle && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{subtitle}</div>}
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title || '—'}</div>
      <div
        className="adm-kb-preview-body"
        style={{ marginTop: 10, fontSize: 14 }}
        dangerouslySetInnerHTML={{ __html: html || '<p class="adm-muted">Нет описания</p>' }}
      />
    </ParticipantPreviewFrame>
  );
}

export function ParticipantPreviewModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="adm-modal-backdrop" onClick={onClose} role="presentation">
      <div className="card adm-modal" style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 12 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
