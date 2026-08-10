import type { ReactNode } from 'react';

export type LifecycleChainStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
};

export type TaskSubmissionRow = {
  id: number;
  participantId: number;
  participantName?: string;
  taskId: number;
  taskTitle?: string;
  taskDay?: number | null;
  taskDayNumbers?: number[] | null;
  status: string;
  answerText?: string | null;
  photoUrl?: string | null;
  postUrl?: string | null;
  pointsAwarded?: number | null;
  submittedAt?: string | null;
  checkedAt?: string | null;
  moderatorComment?: string | null;
  confirmationType?: string | null;
  participantDirection?: string | null;
  participantGroupName?: string | null;
  teamConfirmations?: { participantId: number; name: string; status: string }[];
  proofType?: string | null;
  proofTypeLabel?: string | null;
  verificationType?: string | null;
  verificationTypeLabel?: string | null;
  lifecycleStage?: string | null;
  lifecycleLabel?: string | null;
  lifecycleChain?: LifecycleChainStep[];
  pointsLogId?: number | null;
  userMedalId?: number | null;
  verifiedAt?: string | null;
  verifiedByAdminId?: number | null;
};

export function taskDayLabel(row: Pick<TaskSubmissionRow, 'taskDay' | 'taskDayNumbers'>): string {
  const days = row.taskDayNumbers?.length
    ? row.taskDayNumbers
    : (row.taskDay != null ? [row.taskDay] : []);
  if (!days.length) return '—';
  return days.map(d => `Д${d}`).join(', ');
}

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

export function submissionLifecycleCell(row: TaskSubmissionRow): ReactNode {
  if (row.lifecycleStage === 'rejected' || row.lifecycleStage === 'expired') {
    return (
      <span style={{ color: '#C53030', fontSize: 11 }}>
        {row.lifecycleLabel || row.lifecycleStage}
      </span>
    );
  }
  const chain = row.lifecycleChain;
  if (!chain?.length) {
    return <span className="adm-muted">{row.lifecycleLabel || '—'}</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 10, maxWidth: 260 }}>
      {chain.map(step => (
        <span
          key={step.key}
          title={step.label}
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: step.current ? '#EBF8FF' : step.done ? '#F0FFF4' : '#F7FAFC',
            color: step.current ? '#2B6CB0' : step.done ? '#276749' : '#A0AEC0',
            border: step.current ? '1px solid #90CDF4' : '1px solid transparent',
          }}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

export function submissionMetaCell(row: TaskSubmissionRow): ReactNode {
  const parts: string[] = [];
  if (row.proofTypeLabel) parts.push(`Доказательство: ${row.proofTypeLabel}`);
  if (row.verificationTypeLabel) parts.push(`Проверка: ${row.verificationTypeLabel}`);
  if (row.pointsLogId) parts.push(`points_log #${row.pointsLogId}`);
  if (row.userMedalId) parts.push(`медаль #${row.userMedalId}`);
  if (parts.length === 0) return <span className="adm-muted">—</span>;
  return <div style={{ fontSize: 10, lineHeight: 1.4 }}>{parts.map(p => <div key={p}>{p}</div>)}</div>;
}

export function teamBlocked(row: TaskSubmissionRow): boolean {
  return (row.teamConfirmations?.length ?? 0) > 0
    && !row.teamConfirmations!.every(c => c.status === 'confirmed');
}
