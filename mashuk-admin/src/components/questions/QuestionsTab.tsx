import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import { EnumOptions } from '../admin/EnumOptions';
import type { AdminTabProps } from '../admin/types';
import { AnswerConfirmationSettings, type AnswerConfirmForm } from './AnswerConfirmationSettings';
import { QuestionCard, type QuestionRow } from './QuestionCard';

type Segment = 'questions' | 'confirm' | 'org' | 'templates';

type OrgThread = {
  id: number;
  participantId?: number;
  participantName?: string;
  subject?: string;
  status?: string;
  messages?: { id: number; text: string; senderType: string }[];
};

const emptyQuestion = () => ({
  title: '',
  text: '',
  type: 'open',
  block: 'Целеполагание',
  reflectionKind: '' as string,
  status: 'published',
  timePoint: '',
  dayNumber: 1,
  points: 10,
  allowRetry: false,
  pushOnPublish: false,
  publishTime: '',
  closeTime: '',
});

export function QuestionsTab({ adminFetch, act, reloadKey, setTab }: AdminTabProps) {
  const [segment, setSegment] = useState<Segment>('questions');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [questionOptionsMap, setQuestionOptionsMap] = useState<Record<number, { id: number; label: string }[]>>({});
  const [answerConfirmForm, setAnswerConfirmForm] = useState<AnswerConfirmForm>({
    enabled: true,
    showPoints: true,
    titleTemplate: 'Ответ отправлен',
  });
  const [orgThreads, setOrgThreads] = useState<OrgThread[]>([]);
  const [orgReplyDraft, setOrgReplyDraft] = useState<Record<number, string>>({});
  const [copyDayForm, setCopyDayForm] = useState({ fromDay: 1, toDay: 2, overwrite: false });
  const [newQuestion, setNewQuestion] = useState(emptyQuestion);
  const [optionForm, setOptionForm] = useState({ questionId: '', label: '', value: '' });

  const loadOptionsForQuestions = async (qs: QuestionRow[]) => {
    const needOpts = qs.filter(q => ['choice', 'multi', 'dependent'].includes(q.type || ''));
    const optsEntries: [number, { id: number; label: string }[]][] = [];
    for (const q of needOpts) {
      try {
        const r = await adminFetch(`/questions/${q.id}/options`) as { options: { id: number; label: string }[] };
        optsEntries.push([q.id, r.options || []]);
      } catch {
        optsEntries.push([q.id, []]);
      }
    }
    setQuestionOptionsMap(Object.fromEntries(optsEntries));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = (await adminFetch('/questions')).questions as QuestionRow[];
      setQuestions(qs);
      const fs = (await adminFetch('/forum-settings')).settings;
      if (fs?.answerConfirmation) {
        const ac = fs.answerConfirmation as AnswerConfirmForm & { enabled?: boolean; showPoints?: boolean };
        setAnswerConfirmForm({
          enabled: ac.enabled !== false,
          showPoints: ac.showPoints !== false,
          titleTemplate: ac.titleTemplate || 'Ответ отправлен',
        });
      }
      setOrgThreads((await adminFetch('/org/threads')).threads || []);
      await loadOptionsForQuestions(qs);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const refreshOptions = (questionId: number) => {
    adminFetch(`/questions/${questionId}/options`)
      .then((r: { options: { id: number; label: string }[] }) => {
        setQuestionOptionsMap(m => ({ ...m, [questionId]: r.options || [] }));
      })
      .catch(() => {});
  };

  const createQuestion = () =>
    act(async () => {
      const title = newQuestion.title.trim();
      if (!title) {
        setNotice('⚠ Укажите заголовок вопроса');
        throw new Error('title required');
      }
      const text = (newQuestion.text.trim() || title);
      const body: Record<string, unknown> = {
        ...newQuestion,
        title,
        text,
        dayNumber: Number(newQuestion.dayNumber),
      };
      if (newQuestion.publishTime) body.publishTime = new Date(newQuestion.publishTime).toISOString();
      else delete body.publishTime;
      if (newQuestion.closeTime) body.closeTime = new Date(newQuestion.closeTime).toISOString();
      else delete body.closeTime;
      if (!newQuestion.reflectionKind) delete body.reflectionKind;
      await adminFetch('/questions', { method: 'POST', body: JSON.stringify(body) });
      setNewQuestion(emptyQuestion());
    }, 'Вопрос создан');

  const addOption = () =>
    act(async () => {
      if (!optionForm.questionId || !optionForm.label) return;
      const qid = Number(optionForm.questionId);
      await adminFetch(`/questions/${qid}/options`, {
        method: 'POST',
        body: JSON.stringify({ label: optionForm.label, value: optionForm.value || optionForm.label }),
      });
      setOptionForm({ questionId: '', label: '', value: '' });
      refreshOptions(qid);
    });

  const segments: { key: Segment; label: string }[] = [
    { key: 'questions', label: 'Вопросы' },
    { key: 'confirm', label: 'Подтверждение' },
    { key: 'org', label: 'Организаторы' },
    { key: 'templates', label: 'Шаблоны' },
  ];

  if (loading) return <p className="adm-muted">Загрузка вопросов…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero title="Вопросы и touchpoints" hint="Рефлексия по дням, варианты ответов и настройки подтверждения для участников." />

      {notice && (
        <p className="card" style={{ fontSize: 13, marginBottom: 8, background: notice.startsWith('⚠') ? '#FFFAF0' : '#F0FFF4' }}>
          {notice}
        </p>
      )}

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        {segments.map(s => (
          <button key={s.key} type="button" className={segment === s.key ? 'on' : ''} onClick={() => setSegment(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {segment === 'confirm' && (
        <AnswerConfirmationSettings
          form={answerConfirmForm}
          onChange={patch => setAnswerConfirmForm(f => ({ ...f, ...patch }))}
          onSave={() => act(() => adminFetch('/forum-settings', {
            method: 'PATCH',
            body: JSON.stringify({ answerConfirmation: answerConfirmForm }),
          }), 'Сохранено')}
        />
      )}

      {segment === 'org' && (
        <div className="card adm-forum-block">
          <h3>Обмен с организаторами</h3>
          <p className="adm-muted" style={{ fontSize: 12 }}>Прямая линия участников. Полный список также в «Модерация».</p>
          {orgThreads.length === 0 && <p className="adm-muted">Нет обращений</p>}
          {orgThreads.map(t => (
            <div key={t.id} className="card" style={{ marginTop: 8 }}>
              <strong>{t.participantName || `Участник #${t.participantId}`}</strong>
              <span style={{ marginLeft: 8, fontSize: 12 }}>{t.subject || 'Обращение'} · {t.status}</span>
              {(t.messages || []).slice(-2).map(m => (
                <p key={m.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  {m.senderType === 'admin' ? 'Дирекция' : 'Участник'}: {m.text}
                </p>
              ))}
              <textarea
                className="adm-input"
                rows={2}
                style={{ width: '100%', marginTop: 6 }}
                value={orgReplyDraft[t.id] || ''}
                onChange={e => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: e.target.value })}
                placeholder="Ответ дирекции..."
              />
              <button
                type="button"
                className="adm-btn"
                onClick={() => act(() => adminFetch(`/org/threads/${t.id}/reply`, {
                  method: 'POST',
                  body: JSON.stringify({ text: orgReplyDraft[t.id], sendPush: true }),
                }).then(() => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: '' })), 'Ответ отправлен')}
              >
                Ответить
              </button>
            </div>
          ))}
        </div>
      )}

      {segment === 'templates' && (
        <div className="card adm-forum-block">
          <h3>Шаблон 7 точек × дни</h3>
          <div className="form-row">
            <button
              type="button"
              className="adm-btn"
              onClick={() => act(() => adminFetch('/questions/seed-touchpoints', {
                method: 'POST', body: JSON.stringify({ overwrite: false }),
              }), 'Шаблон развёрнут')}
            >
              Развернуть шаблон 7×7
            </button>
            <input
              type="number"
              className="adm-input"
              value={copyDayForm.fromDay}
              onChange={e => setCopyDayForm({ ...copyDayForm, fromDay: Number(e.target.value) })}
              placeholder="С дня"
              style={{ width: 70 }}
            />
            <span>→</span>
            <input
              type="number"
              className="adm-input"
              value={copyDayForm.toDay}
              onChange={e => setCopyDayForm({ ...copyDayForm, toDay: Number(e.target.value) })}
              placeholder="На день"
              style={{ width: 70 }}
            />
            <label className="adm-forum-check">
              <input type="checkbox" checked={copyDayForm.overwrite} onChange={e => setCopyDayForm({ ...copyDayForm, overwrite: e.target.checked })} />
              overwrite
            </label>
            <button
              type="button"
              className="adm-btn"
              onClick={() => act(() => adminFetch('/questions/copy-day', {
                method: 'POST', body: JSON.stringify(copyDayForm),
              }), 'Скопировано')}
            >
              Скопировать день
            </button>
          </div>
        </div>
      )}

      {segment === 'questions' && (
        <>
          <div className="card adm-forum-block">
            <h3>Новый вопрос</h3>
            <div className="form-row">
              <input className="adm-input" value={newQuestion.title} onChange={e => setNewQuestion({ ...newQuestion, title: e.target.value })} placeholder="Заголовок" />
              <select className="adm-input" value={newQuestion.type} onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value })}>
                <EnumOptions values={['open', 'checkin', 'choice', 'multi', 'dependent']} />
              </select>
              <input className="adm-input" value={newQuestion.block} onChange={e => setNewQuestion({ ...newQuestion, block: e.target.value })} placeholder="Блок" />
              <select className="adm-input" value={newQuestion.reflectionKind} onChange={e => setNewQuestion({ ...newQuestion, reflectionKind: e.target.value })}>
                <option value="">— метка для участника —</option>
                <option value="state_check">Проверка состояния</option>
                <option value="after_event">После события</option>
                <option value="evening_summary">Итоги дня</option>
                <option value="point_a">Точка А</option>
                <option value="point_b">Точка Б</option>
              </select>
              <select className="adm-input" value={newQuestion.timePoint} onChange={e => setNewQuestion({ ...newQuestion, timePoint: e.target.value })}>
                <option value="">—</option>
                <option value="утро">утро</option>
                <option value="день">день</option>
                <option value="вечер">вечер</option>
              </select>
              <input type="number" className="adm-input" value={newQuestion.dayNumber} onChange={e => setNewQuestion({ ...newQuestion, dayNumber: Number(e.target.value) })} placeholder="День" style={{ width: 70 }} />
              <button type="button" className="adm-btn" onClick={createQuestion}>Создать</button>
            </div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <label>Открытие <input type="datetime-local" value={newQuestion.publishTime} onChange={e => setNewQuestion({ ...newQuestion, publishTime: e.target.value })} /></label>
              <label>Закрытие <input type="datetime-local" value={newQuestion.closeTime} onChange={e => setNewQuestion({ ...newQuestion, closeTime: e.target.value })} /></label>
            </div>
            <input className="adm-input" value={newQuestion.text} onChange={e => setNewQuestion({ ...newQuestion, text: e.target.value })} placeholder="Текст вопроса" style={{ width: '100%', padding: 8, marginTop: 8 }} />
          </div>
          <div className="card adm-forum-block">
            <h3>Добавить вариант ответа</h3>
            <div className="form-row">
              <select className="adm-input" value={optionForm.questionId} onChange={e => setOptionForm({ ...optionForm, questionId: e.target.value })}>
                <option value="">Вопрос</option>
                {questions.map(q => <option key={q.id} value={q.id}>{q.id}: {q.title}</option>)}
              </select>
              <input className="adm-input" value={optionForm.label} onChange={e => setOptionForm({ ...optionForm, label: e.target.value })} placeholder="Подпись варианта" />
              <input className="adm-input" value={optionForm.value} onChange={e => setOptionForm({ ...optionForm, value: e.target.value })} placeholder="Значение варианта" />
              <button type="button" className="adm-btn" onClick={addOption}>Добавить</button>
            </div>
          </div>
          {questions.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              options={questionOptionsMap[q.id] || []}
              adminFetch={adminFetch}
              act={act}
              onSaved={msg => {
                setNotice(msg || null);
                load().catch(() => {});
              }}
              onDeleteOption={() => refreshOptions(q.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}
