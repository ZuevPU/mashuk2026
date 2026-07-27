import type { ReactNode } from 'react';

export type TaskSubmissionRow = {
  id: number;
  participantId: number;
  participantName?: string;
  taskId: number;
  taskTitle?: string;
  status: string;
  answerText?: string | null;
  photoUrl?: string | null;
  postUrl?: string | null;
  pointsAwarded?: number | null;
  submittedAt?: string | null;
  moderatorComment?: string | null;
  confirmationType?: string | null;
  participantDirection?: string | null;
  participantGroupName?: string | null;
  teamConfirmations?: { participantId: number; name: string; status: string }[];
};

export function taskSubmissionAnswerCell(row: TaskSubmissionRow): ReactNode {
  const parts: ReactNode[] = [];
  if (row.answerText?.trim()) {
    parts.push(<div key="t">{row.answerText}</div>);
  }
  if (row.postUrl) {
    parts.push(
      <div key="p">
        <a href={row.postUrl} target="_blank" rel="noreferrer">Ссылка на пост</a>
      </div>,
    );
  }
  if (row.photoUrl) {
    parts.push(
      <div key="ph">
        <a href={row.photoUrl} target="_blank" rel="noreferrer">Фото</a>
        {' · '}
        <img src={row.photoUrl} alt="" style={{ maxWidth: 80, maxHeight: 60, verticalAlign: 'middle', marginLeft: 4 }} />
      </div>,
    );
  }
  if (parts.length === 0) return <span className="adm-muted">—</span>;
  return <>{parts}</>;
}

export function teamBlocked(row: TaskSubmissionRow): boolean {
  return (row.teamConfirmations?.length ?? 0) > 0
    && !row.teamConfirmations!.every(c => c.status === 'confirmed');
}
