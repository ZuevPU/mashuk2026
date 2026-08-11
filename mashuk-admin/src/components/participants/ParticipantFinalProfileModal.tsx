import React, { useEffect, useRef, useState } from 'react';
import { adminFetchHtml } from '../../admin/client';

type Props = {
  participantId: number;
  participantName?: string;
  open: boolean;
  onClose: () => void;
};

export function ParticipantFinalProfileModal({
  participantId,
  participantName,
  open,
  onClose,
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);
    adminFetchHtml(`/participants/${participantId}/profile`)
      .then((doc) => {
        if (cancelled) return;
        setHtml(doc);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, participantId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = participantName
    ? `Профиль участника · ${participantName}`
    : 'Профиль участника';

  const printProfile = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  return (
    <div
      className="adm-modal-backdrop adm-final-profile-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card adm-modal adm-final-profile-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="adm-final-profile-topbar">
          <div>
            <div className="adm-final-profile-title">{title}</div>
            <div className="adm-muted" style={{ fontSize: 12, marginTop: 2 }}>
              HTML-профиль для печати · только штаб
            </div>
          </div>
          <div className="adm-final-profile-actions">
            <button
              type="button"
              className="adm-btn adm-btn-sm adm-btn-secondary"
              disabled={!html || loading}
              onClick={printProfile}
            >
              Печать / PDF
            </button>
            <button type="button" className="adm-btn adm-btn-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <div className="adm-final-profile-body">
          {loading && <div className="adm-muted" style={{ padding: 24 }}>Собираем профиль…</div>}
          {error && (
            <div style={{ padding: 24, color: '#9B2C2C' }}>
              {error}
            </div>
          )}
          {html && !loading && (
            <iframe
              ref={iframeRef}
              title={title}
              className="adm-final-profile-frame"
              srcDoc={html}
              sandbox="allow-same-origin allow-modals allow-scripts"
            />
          )}
        </div>
      </div>
    </div>
  );
}
