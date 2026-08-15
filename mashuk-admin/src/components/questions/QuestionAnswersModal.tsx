import { useMemo, useState } from 'react';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import { formatAnswerPreview } from '../../utils/formatAnswerPreview';
import type { AdminActOptions } from '../admin/types';

type SortKey = 'points' | 'name' | 'time';

function answerPoints(a: AnswerRow): number {
  if (a.awards?.length) return a.awards.reduce((s, x) => s + x.points, 0);
  return Number(a.pointsAwarded || 0);
}

function answerName(a: AnswerRow): string {
  return (a.participantName || '').trim() || `Участник #${a.participantId ?? a.id}`;
}

type Award = {
  logId: number;
  actionType: string;
  points: number;
  label: string;
  kind: 'primary' | 'bonus' | 'other';
};

type AnswerRow = {
  id: number;
  participantId?: number;
  participantName?: string;
  answerData: unknown;
  questionTextSnapshot?: string | null;
  pointsAwarded?: number | null;
  createdAt?: string;
  awards?: Award[];
};

type Props = {
  questionId: number;
  questionTitle: string;
  open: boolean;
  loading: boolean;
  answers: AnswerRow[];
  adminFetch: (path: string, init?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string, opts?: AdminActOptions) => void;
  onReload: () => void;
  onClose: () => void;
};

export function QuestionAnswersModal({
  questionId,
  questionTitle,
  open,
  loading,
  answers,
  adminFetch,
  act,
  onReload,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const rows = [...answers];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'points') {
        const d = answerPoints(a) - answerPoints(b);
        if (d !== 0) return d * dir;
        return answerName(a).localeCompare(answerName(b), 'ru');
      }
      if (sortKey === 'name') {
        const d = answerName(a).localeCompare(answerName(b), 'ru');
        if (d !== 0) return d * dir;
        return answerPoints(b) - answerPoints(a);
      }
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return (ta - tb) * dir;
      return answerName(a).localeCompare(answerName(b), 'ru');
    });
    return rows;
  }, [answers, sortKey, sortDir]);

  const pickSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  if (!open) return null;

  const run = (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    act(
      async () => {
        try {
          await fn();
          onReload();
          return ok;
        } finally {
          setBusy(false);
        }
      },
      ok,
      { reload: false },
    );
  };

  const revoke = (answerId: number, body: Record<string, unknown>, ok: string) => {
    run(
      () => adminFetch(`/questions/${questionId}/answers/${answerId}/revoke-points`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      ok,
    );
  };

  return (
    <div className="adm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="card adm-modal" style={{ maxWidth: 720, width: '94%', maxHeight: '84vh', overflow: 'auto' }}>
        <div className="adm-forum-toolbar">
          <h3 style={{ margin: 0 }}>Ответы · {questionTitle}</h3>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="adm-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Нажмите × на балле, чтобы снять только его. Ответ при этом останется.
        </p>
        <div className="adm-answer-sort">
          <span className="adm-muted" style={{ fontSize: 12 }}>
            {loading ? 'Загрузка…' : `ответов: ${answers.length}`}
          </span>
          <div className="adm-seg adm-seg-sm" style={{ margin: 0, padding: 4, border: 'none', background: '#f2f2f4' }}>
            <button type="button" className={sortKey === 'points' ? 'on' : ''} onClick={() => pickSort('points')}>
              Баллы{sortMark('points')}
            </button>
            <button type="button" className={sortKey === 'name' ? 'on' : ''} onClick={() => pickSort('name')}>
              ФИО{sortMark('name')}
            </button>
            <button type="button" className={sortKey === 'time' ? 'on' : ''} onClick={() => pickSort('time')}>
              Время{sortMark('time')}
            </button>
          </div>
        </div>
        {loading && <p className="adm-muted">Загрузка…</p>}
        {!loading && answers.length === 0 && <p className="adm-muted">Пока нет ответов</p>}
        {!loading && sorted.map(a => {
          const awards = a.awards || [];
          const total = answerPoints(a);
          const hasBonus = awards.some(x => x.kind === 'bonus');
          return (
            <div key={a.id} className="adm-answer-card">
              <div className="adm-answer-card-head">
                <div>
                  <strong>{answerName(a)}</strong>
                  <span className="adm-answer-points-badge">{total > 0 ? `+${total}` : '0'}</span>
                  <span className="adm-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}
                  </span>
                </div>
                <RowActionsMenu
                  actions={[
                    ...(hasBonus
                      ? [{
                          label: 'Снять баллы за развёрнутый ответ',
                          onClick: () => revoke(a.id, {
                            kind: 'bonus',
                            reason: 'Сняты баллы за развёрнутый ответ',
                          }, 'Баллы за развёрнутый ответ сняты'),
                        }]
                      : []),
                    ...(awards.length
                      ? [{
                          label: 'Снять все баллы, ответ оставить',
                          onClick: () => revoke(a.id, {
                            kind: 'all',
                            reason: 'Сняты баллы, ответ сохранён',
                          }, 'Баллы сняты'),
                        }]
                      : []),
                    {
                      label: 'Удалить ответ',
                      danger: true,
                      confirmMessage: 'Удалить ответ? Участник его больше не увидит, баллы снимутся, вопрос снова будет открыт.',
                      onClick: () => {
                        run(
                          () => adminFetch(`/questions/${questionId}/answers/${a.id}`, {
                            method: 'DELETE',
                            body: JSON.stringify({ reason: 'Админ удалил ответ' }),
                          }),
                          'Ответ удалён',
                        );
                      },
                    },
                  ]}
                />
              </div>
              <div className="adm-answer-awards">
                {awards.length === 0 ? (
                  <span className="adm-muted">Баллы не начислены</span>
                ) : (
                  <>
                    {awards.map(award => (
                      <span
                        key={award.logId}
                        className={`adm-award-chip${award.kind === 'bonus' ? ' is-bonus' : ''}`}
                      >
                        +{award.points} · {award.label}
                        <button
                          type="button"
                          className="adm-award-chip-x"
                          title={`Снять +${award.points} · ${award.label}`}
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`Снять +${award.points} «${award.label}»? Ответ останется.`)) return;
                            revoke(a.id, {
                              logIds: [award.logId],
                              reason: `Снято: ${award.label}`,
                            }, `Снято +${award.points}`);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {awards.length > 1 && (
                      <span className="adm-muted" style={{ fontSize: 12 }}>итого {total}</span>
                    )}
                  </>
                )}
              </div>
              <div className="adm-answer-card-body">
                {formatAnswerPreview(a.answerData)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
