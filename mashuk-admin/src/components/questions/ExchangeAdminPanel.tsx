import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { label } from '../../labels/ru';

type ExchangeAnswer = {
  id: number;
  participantId?: number;
  text: string;
  parentAnswerId?: number | null;
  authorName?: string;
  direction?: string | null;
  reactions?: { likes?: number; discuss?: number } | null;
  createdAt?: string | null;
};

type ExchangeCategory = {
  id: number;
  slug: string;
  title: string;
  emoji?: string | null;
};

type ExchangeQuestion = {
  id: number;
  text: string;
  audience?: string | null;
  moderationStatus?: string | null;
  moderatorComment?: string | null;
  authorName?: string;
  direction?: string | null;
  groupName?: string | null;
  participantId?: number;
  answerCount?: number;
  answers?: ExchangeAnswer[];
  createdAt?: string | null;
  categoryId?: number | null;
  classifiedBy?: string | null;
  category?: ExchangeCategory | null;
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

type SortKey = 'id' | 'author' | 'text' | 'audience' | 'status' | 'likes' | 'answers' | 'createdAt';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  reloadKey: number;
  search?: string;
  onOpenModeration?: () => void;
  onOpenCard?: (id: number) => void;
};

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

function sortMark(sort: SortState, key: SortKey): string {
  if (sort.key !== key) return ' ↕';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

function formatWhen(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU');
}

function audienceLabel(audience?: string | null): string {
  const a = (audience || 'all').toLowerCase();
  if (a === 'direction' || a === 'my_direction') return 'Своему направлению';
  return 'Всем';
}

function likesSum(answers: ExchangeAnswer[] | undefined): number {
  if (!answers?.length) return 0;
  return answers.reduce((s, a) => s + (Number(a.reactions?.likes) || 0), 0);
}

function statusTone(status?: string | null): CSSProperties {
  if (status === 'approved') return { color: '#2F855A' };
  if (status === 'rejected') return { color: '#C53030' };
  if (status === 'pending') return { color: '#B8621A' };
  return {};
}

export function ExchangeAdminPanel({
  adminFetch,
  act,
  reloadKey,
  search = '',
  onOpenModeration,
  onOpenCard,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [questions, setQuestions] = useState<ExchangeQuestion[]>([]);
  const [categories, setCategories] = useState<ExchangeCategory[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<Record<number, number | ''>>({});
  const [rejectDraft, setRejectDraft] = useState<Record<number, string>>({});
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', dir: 'desc' });
  const [answersModal, setAnswersModal] = useState<{
    open: boolean;
    question: ExchangeQuestion | null;
  }>({ open: false, question: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path = statusFilter === 'all'
        ? '/exchange?limit=100'
        : `/exchange?status=${statusFilter}&limit=100`;
      const [res, cats] = await Promise.all([
        adminFetch(path),
        adminFetch('/exchange-categories').catch(() => ({ categories: [] })),
      ]);
      setQuestions((res.questions || []) as ExchangeQuestion[]);
      setCategories((cats.categories || []) as ExchangeCategory[]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, statusFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const toggleSort = (key: SortKey) => {
    setSort(prev => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'likes' || key === 'answers' || key === 'createdAt' || key === 'id' ? 'desc' : 'asc' }
    ));
  };

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? questions
      : questions.filter(item => {
        const hay = [
          item.text,
          item.authorName,
          item.direction,
          item.groupName,
          item.moderationStatus,
          String(item.id),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });

    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const likesA = likesSum(a.answers);
      const likesB = likesSum(b.answers);
      const answersA = a.answerCount ?? (a.answers || []).filter(x => !x.parentAnswerId).length;
      const answersB = b.answerCount ?? (b.answers || []).filter(x => !x.parentAnswerId).length;
      let cmp = 0;
      switch (sort.key) {
        case 'id':
          cmp = a.id - b.id;
          break;
        case 'author':
          cmp = (a.authorName || '').localeCompare(b.authorName || '', 'ru');
          break;
        case 'text':
          cmp = (a.text || '').localeCompare(b.text || '', 'ru');
          break;
        case 'audience':
          cmp = audienceLabel(a.audience).localeCompare(audienceLabel(b.audience), 'ru');
          break;
        case 'status': {
          const sa = a.moderationStatus || 'pending';
          const sb = b.moderationStatus || 'pending';
          cmp = (STATUS_ORDER[sa] ?? 9) - (STATUS_ORDER[sb] ?? 9)
            || sa.localeCompare(sb, 'ru');
          break;
        }
        case 'likes':
          cmp = likesA - likesB;
          break;
        case 'answers':
          cmp = answersA - answersB;
          break;
        case 'createdAt':
        default: {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = ta - tb || a.id - b.id;
          break;
        }
      }
      if (cmp !== 0) return cmp * mul;
      return (b.id - a.id);
    });
  }, [questions, search, sort]);

  const moderate = (id: number, moderationStatus: 'approved' | 'rejected', comment?: string) =>
    act(async () => {
      const categoryId = categoryDraft[id];
      await adminFetch(`/exchange/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          moderationStatus,
          moderatorComment: comment || undefined,
          categoryId: categoryId === '' || categoryId == null ? undefined : categoryId,
          categoryConfirmed: true,
        }),
      });
      setRejectDraft(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
      setAnswersModal(m => {
        if (!m.open || !m.question || m.question.id !== id) return m;
        const updated = questions.find(x => x.id === id);
        return updated ? { ...m, question: { ...m.question, moderationStatus } } : m;
      });
    }, moderationStatus === 'approved' ? 'Вопрос одобрен' : 'Вопрос отклонён');

  const removeQuestion = (id: number) => {
    if (!window.confirm('Удалить вопрос обмена вместе со всеми ответами?')) return;
    act(async () => {
      await adminFetch(`/exchange/${id}`, { method: 'DELETE' });
      setAnswersModal(m => (m.question?.id === id ? { open: false, question: null } : m));
      await load();
    }, 'Вопрос удалён');
  };

  const removeAnswer = (answerId: number) => {
    if (!window.confirm('Удалить этот ответ (и вложенные комментарии)?')) return;
    act(async () => {
      await adminFetch(`/exchange/answers/${answerId}`, { method: 'DELETE' });
      await load();
      setAnswersModal(m => {
        if (!m.open || !m.question) return m;
        const nextAnswers = (m.question.answers || []).filter(
          a => a.id !== answerId && a.parentAnswerId !== answerId,
        );
        return {
          open: true,
          question: {
            ...m.question,
            answers: nextAnswers,
            answerCount: nextAnswers.filter(a => !a.parentAnswerId).length,
          },
        };
      });
    }, 'Ответ удалён');
  };

  const openAnswers = (q: ExchangeQuestion) => {
    setAnswersModal({ open: true, question: q });
  };

  // Keep modal answers in sync after reload
  useEffect(() => {
    if (!answersModal.open || !answersModal.question) return;
    const fresh = questions.find(q => q.id === answersModal.question!.id);
    if (fresh) setAnswersModal({ open: true, question: fresh });
  }, [questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const modalAnswers = answersModal.question?.answers || [];
  const topAnswers = modalAnswers.filter(a => !a.parentAnswerId);
  const repliesOf = (parentId: number) => modalAnswers.filter(a => a.parentAnswerId === parentId);

  return (
    <div>
      <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div className="adm-seg" style={{ flexWrap: 'wrap' }}>
          {([
            { key: 'all' as const, label: 'Все' },
            { key: 'pending' as const, label: 'На модерации' },
            { key: 'approved' as const, label: 'Одобренные' },
            { key: 'rejected' as const, label: 'Отклонённые' },
          ]).map(f => (
            <button
              key={f.key}
              type="button"
              className={statusFilter === f.key ? 'on' : ''}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {onOpenModeration && (
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onOpenModeration}>
            Модерация
          </button>
        )}
      </div>

      <p className="adm-muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>
        Вопросы участников с рубриками. Перед одобрением можно сменить тему в колонке «Рубрика».
        Полный разбор очереди — во вкладке <strong>Модерация → Обмен</strong>.
      </p>
      {categories.length === 0 && !loading && (
        <p className="adm-insights-warn" style={{ marginBottom: 12 }}>
          Справочник рубрик не загрузился (миграция 0061?). Перезапустите backend или проверьте /admin/exchange-categories.
        </p>
      )}

      {loading && <p className="adm-muted">Загрузка вопросов обмена…</p>}
      {!loading && sorted.length === 0 && (
        <p className="adm-muted">
          Нет вопросов обмена.
          {onOpenModeration && (
            <>
              {' '}
              <button type="button" className="adm-link-btn" onClick={onOpenModeration}>Открыть модерацию</button>
            </>
          )}
        </p>
      )}

      {!loading && sorted.length > 0 && (
        <table className="adm-table">
          <thead>
            <tr>
              {([
                { key: 'id' as const, label: '№' },
                { key: 'author' as const, label: 'Участник' },
                { key: 'text' as const, label: 'Вопрос' },
                { key: 'audience' as const, label: 'Аудитория' },
                { key: 'status' as const, label: 'Статус' },
                { key: 'likes' as const, label: 'Лайки' },
                { key: 'answers' as const, label: 'Ответы' },
                { key: 'createdAt' as const, label: 'Дата' },
              ]).map(col => (
                <th key={col.key}>
                  <button
                    type="button"
                    className="adm-link-btn"
                    onClick={() => toggleSort(col.key)}
                    style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                    title="Сортировать"
                  >
                    {col.label}{sortMark(sort, col.key)}
                  </button>
                </th>
              ))}
              <th>Рубрика</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(q => {
              const likes = likesSum(q.answers);
              const answersCount = q.answerCount ?? (q.answers || []).filter(a => !a.parentAnswerId).length;
              const status = q.moderationStatus || 'pending';
              const catVal = categoryDraft[q.id] ?? q.categoryId ?? q.category?.id ?? '';
              return (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>
                    {q.participantId != null && onOpenCard ? (
                      <button type="button" className="adm-link-btn" onClick={() => onOpenCard(q.participantId!)}>
                        {q.authorName || `Участник #${q.participantId}`}
                      </button>
                    ) : (
                      q.authorName || '—'
                    )}
                    <div className="adm-muted" style={{ fontSize: 11 }}>
                      {[q.direction, q.groupName].filter(Boolean).join(' · ') || '—'}
                      {q.classifiedBy ? ` · ${q.classifiedBy}` : ''}
                    </div>
                  </td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{q.text}</td>
                  <td>{audienceLabel(q.audience)}</td>
                  <td style={statusTone(status)}>{label(status)}</td>
                  <td>{likes}</td>
                  <td>{answersCount}</td>
                  <td className="adm-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatWhen(q.createdAt) || '—'}
                  </td>
                  <td>
                    <select
                      className="adm-input"
                      style={{ minWidth: 160, fontSize: 12 }}
                      value={catVal === '' ? '' : String(catVal)}
                      onChange={e => setCategoryDraft(prev => ({
                        ...prev,
                        [q.id]: e.target.value ? Number(e.target.value) : '',
                      }))}
                    >
                      <option value="">{q.category ? `${q.category.emoji || ''} ${q.category.title}` : 'Без рубрики'}</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.title}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => openAnswers(q)}
                      >
                        Посмотреть ответы
                      </button>
                      {status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="adm-btn adm-btn-primary adm-btn-sm"
                            onClick={() => moderate(q.id, 'approved')}
                          >
                            Одобрить
                          </button>
                          <input
                            className="adm-input"
                            style={{ width: 180, fontSize: 12 }}
                            placeholder="Причина отклонения"
                            value={rejectDraft[q.id] || ''}
                            onChange={e => setRejectDraft(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="adm-btn btn-danger adm-btn-sm"
                            onClick={() => moderate(q.id, 'rejected', rejectDraft[q.id])}
                          >
                            Отклонить
                          </button>
                        </>
                      )}
                      {status === 'approved' && (
                        <button
                          type="button"
                          className="adm-btn btn-danger adm-btn-sm"
                          onClick={() => moderate(q.id, 'rejected', 'Снято с публикации')}
                        >
                          Снять с публикации
                        </button>
                      )}
                      {status === 'rejected' && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm"
                          onClick={() => moderate(q.id, 'approved')}
                        >
                          Одобрить повторно
                        </button>
                      )}
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        onClick={() => removeQuestion(q.id)}
                      >
                        Удалить вопрос
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {answersModal.open && answersModal.question && (
        <div className="adm-modal-backdrop" onClick={() => setAnswersModal({ open: false, question: null })}>
          <div
            className="card"
            style={{ maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Ответы на вопрос #{answersModal.question.id}</h3>
                <p className="adm-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                  {answersModal.question.authorName || 'Участник'}
                  {answersModal.question.direction ? ` · ${answersModal.question.direction}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => setAnswersModal({ open: false, question: null })}
              >
                Закрыть
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: '#F7F5F1',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                fontSize: 14,
              }}
            >
              {answersModal.question.text}
            </div>

            <p className="adm-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              Проверьте ответы на спам. Удаление ответа снимает и вложенные комментарии.
            </p>

            {topAnswers.length === 0 ? (
              <p className="adm-muted" style={{ marginTop: 12 }}>Ответов пока нет</p>
            ) : (
              topAnswers.map(a => (
                <div key={a.id} style={{ marginTop: 12, padding: 12, border: '1px solid #E8E2D8', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>
                      {a.participantId != null && onOpenCard ? (
                        <button type="button" className="adm-link-btn" onClick={() => onOpenCard(a.participantId!)}>
                          {a.authorName || `Участник #${a.participantId}`}
                        </button>
                      ) : (
                        a.authorName || 'Участник'
                      )}
                      {a.direction ? ` · ${a.direction}` : ''}
                    </strong>
                    <span className="adm-muted" style={{ fontSize: 11 }}>
                      {formatWhen(a.createdAt)}
                      {` · 👍 ${a.reactions?.likes ?? 0}`}
                      {a.reactions?.discuss != null ? ` · обсудить ${a.reactions.discuss}` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.text}</div>
                  <button
                    type="button"
                    className="adm-btn btn-danger adm-btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => removeAnswer(a.id)}
                  >
                    Удалить ответ
                  </button>

                  {repliesOf(a.id).map(r => (
                    <div
                      key={r.id}
                      style={{
                        marginTop: 10,
                        marginLeft: 12,
                        padding: 10,
                        background: '#Faf8f4',
                        borderRadius: 6,
                        borderLeft: '3px solid #D8D0C4',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {r.authorName || 'Участник'}
                        <span className="adm-muted" style={{ fontWeight: 400 }}>
                          {' · комментарий'}
                          {formatWhen(r.createdAt) ? ` · ${formatWhen(r.createdAt)}` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.text}</div>
                      <button
                        type="button"
                        className="adm-btn btn-danger adm-btn-sm"
                        style={{ marginTop: 6 }}
                        onClick={() => removeAnswer(r.id)}
                      >
                        Удалить комментарий
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
