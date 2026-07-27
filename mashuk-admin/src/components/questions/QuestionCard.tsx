import { useEffect, useState } from 'react';
import { translateApiError } from '../../admin/errors';
import { EnumOptions } from '../admin/EnumOptions';

export type QuestionRow = {
  id: number;
  title: string;
  text?: string | null;
  status?: string;
  block?: string | null;
  reflectionKind?: string | null;
  dayNumber?: number;
  points?: number;
  pushOnPublish?: boolean;
  timePoint?: string | null;
  publishTime?: string | null;
  closeTime?: string | null;
};

export type QuestionDraft = {
  title: string;
  text: string;
  status: string;
  block: string;
  reflectionKind: string;
  dayNumber: number;
  points: number;
  pushOnPublish: boolean;
};

type QuestionOption = { id: number; label: string; value?: string };

type Props = {
  question: QuestionRow;
  options: QuestionOption[];
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  onSaved: (notice?: string) => void;
  onDeleteOption: (optionId: number) => void;
};

function draftFromQuestion(q: QuestionRow): QuestionDraft {
  return {
    title: q.title || '',
    text: q.text || '',
    status: q.status || 'draft',
    block: q.block || '',
    reflectionKind: q.reflectionKind || '',
    dayNumber: q.dayNumber ?? 1,
    points: q.points ?? 10,
    pushOnPublish: !!q.pushOnPublish,
  };
}

export function QuestionCard({ question, options, adminFetch, act, onSaved, onDeleteOption }: Props) {
  const [draft, setDraft] = useState(() => draftFromQuestion(question));

  useEffect(() => {
    setDraft(draftFromQuestion(question));
  }, [question]);

  const set = (patch: Partial<QuestionDraft>) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    try {
      const res = await adminFetch(`/questions/${question.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          text: draft.text,
          status: draft.status,
          block: draft.block,
          reflectionKind: draft.reflectionKind || null,
          dayNumber: Number(draft.dayNumber),
          points: Number(draft.points),
          pushOnPublish: draft.pushOnPublish,
        }),
      });
      if (res?.versioned) {
        onSaved(`⚠ Создана новая версия (было ${res.previousAnswerCount} ответов). Старые ответы сохранили прежнюю формулировку.`);
      } else {
        onSaved('Сохранено');
      }
    } catch (e) {
      onSaved(translateApiError(String(e)));
    }
  };

  return (
    <div className="card adm-question-card">
      <div className="form-row">
        <strong>{question.id}.</strong>
        <input className="adm-input" value={draft.title} onChange={e => set({ title: e.target.value })} style={{ flex: 1 }} />
        <select className="adm-input" value={draft.status} onChange={e => set({ status: e.target.value })}>
          <EnumOptions values={['draft', 'published']} />
        </select>
      </div>
      <textarea
        className="adm-input"
        value={draft.text}
        onChange={e => set({ text: e.target.value })}
        placeholder="Текст"
        rows={2}
        style={{ width: '100%', marginTop: 8 }}
      />
      <div className="form-row" style={{ marginTop: 8, fontSize: 12 }}>
        <input className="adm-input" value={draft.block} onChange={e => set({ block: e.target.value })} placeholder="Блок" />
        <select className="adm-input" value={draft.reflectionKind} onChange={e => set({ reflectionKind: e.target.value })}>
          <option value="">— метка —</option>
          <option value="state_check">Проверка состояния</option>
          <option value="after_event">После события</option>
          <option value="evening_summary">Итоги дня</option>
          <option value="point_a">Точка А</option>
          <option value="point_b">Точка Б</option>
        </select>
        <input
          type="number"
          className="adm-input"
          value={draft.dayNumber}
          onChange={e => set({ dayNumber: Number(e.target.value) })}
          style={{ width: 60 }}
          placeholder="День"
        />
        <input
          type="number"
          className="adm-input"
          value={draft.points}
          onChange={e => set({ points: Number(e.target.value) })}
          style={{ width: 60 }}
          placeholder="Баллы"
        />
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.pushOnPublish} onChange={e => set({ pushOnPublish: e.target.checked })} />
          Уведомление при публикации
        </label>
      </div>
      <div className="form-row" style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
        Д{question.dayNumber || '—'} · {question.timePoint || '—'} · окно:{' '}
        {question.publishTime ? new Date(question.publishTime).toLocaleString('ru-RU') : '—'} →{' '}
        {question.closeTime ? new Date(question.closeTime).toLocaleString('ru-RU') : '—'}
      </div>
      {options.length > 0 && (
        <div style={{ fontSize: 11, marginTop: 8 }}>
          <strong>Варианты:</strong>
          {options.map(opt => (
            <span key={opt.id} className="tag-chip" style={{ marginLeft: 4 }}>
              {opt.label}
              <button
                type="button"
                style={{ marginLeft: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#C53030' }}
                onClick={() => act(async () => {
                  await adminFetch(`/questions/${question.id}/options/${opt.id}`, { method: 'DELETE' });
                  onDeleteOption(opt.id);
                }, 'Удалено')}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="form-row" style={{ marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={save}>Сохранить</button>
        <button
          type="button"
          className="adm-btn btn-danger"
          onClick={() => {
            if (confirm('Удалить вопрос?')) act(() => adminFetch(`/questions/${question.id}`, { method: 'DELETE' }));
          }}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
