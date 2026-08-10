import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { TaskModerationQueue } from './TaskModerationQueue';

type Segment = 'exchange' | 'org' | 'archive' | 'tasks';
type ArchiveFilter = 'approved' | 'rejected' | 'all';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

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
  categoryConfirmed?: boolean;
  category?: ExchangeCategory | null;
};

export type ModerationTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

function audienceLabel(audience?: string | null): string {
  const a = (audience || 'all').toLowerCase();
  if (a === 'direction' || a === 'my_direction') return 'Своему направлению';
  return 'Всем участникам';
}

function formatWhen(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU');
}

function ExchangeAnswersBlock({
  answers,
  onOpenCard,
  onDeleteAnswer,
}: {
  answers: ExchangeAnswer[];
  onOpenCard: (id: number) => void;
  onDeleteAnswer?: (answerId: number) => void;
}) {
  const top = answers.filter(a => !a.parentAnswerId);
  const replies = (parentId: number) => answers.filter(a => a.parentAnswerId === parentId);

  if (answers.length === 0) {
    return <p className="adm-muted" style={{ marginTop: 8, marginBottom: 0 }}>Ответов пока нет</p>;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="adm-label">Ответы участников · {top.length}</div>
      {top.map(a => (
        <div key={a.id} style={{ marginTop: 8, padding: 10, background: '#F7F5F1', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>
              {a.authorName || 'Участник'}
              {a.direction ? ` · ${a.direction}` : ''}
            </strong>
            <span className="adm-muted" style={{ fontSize: 11 }}>
              {formatWhen(a.createdAt)}
              {a.reactions ? ` · 👍 ${a.reactions.likes ?? 0}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.text}</div>
          <div className="form-row" style={{ marginTop: 6, gap: 6 }}>
            {a.participantId != null && (
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => onOpenCard(a.participantId!)}
              >
                Карточка автора ответа
              </button>
            )}
            {onDeleteAnswer && (
              <button
                type="button"
                className="adm-btn btn-danger adm-btn-sm"
                onClick={() => onDeleteAnswer(a.id)}
              >
                Удалить ответ
              </button>
            )}
          </div>
          {replies(a.id).map(r => (
            <div
              key={r.id}
              style={{
                marginTop: 8,
                marginLeft: 12,
                padding: 8,
                background: '#fff',
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
              {onDeleteAnswer && (
                <button
                  type="button"
                  className="adm-btn btn-danger adm-btn-sm"
                  style={{ marginTop: 6 }}
                  onClick={() => onDeleteAnswer(r.id)}
                >
                  Удалить комментарий
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ExchangeQuestionCard({
  q,
  mode,
  rejectDraft,
  onRejectDraftChange,
  onApprove,
  onReject,
  onDelete,
  onOpenCard,
  onToggleAnswers,
  answersOpen,
  onDeleteAnswer,
  categories,
  categoryDraft,
  onCategoryDraftChange,
}: {
  q: ExchangeQuestion;
  mode: 'pending' | 'archive';
  rejectDraft?: string;
  onRejectDraftChange?: (value: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete: () => void;
  onOpenCard: (id: number) => void;
  onToggleAnswers?: () => void;
  answersOpen?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  categories: ExchangeCategory[];
  categoryDraft?: number | '';
  onCategoryDraftChange?: (value: number | '') => void;
}) {
  const answers = q.answers || [];
  const showAnswers = mode === 'archive' ? !!answersOpen : answers.length > 0;
  const catValue = categoryDraft !== undefined && categoryDraft !== ''
    ? categoryDraft
    : (q.categoryId ?? q.category?.id ?? '');

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong>{q.authorName || 'Участник'}</strong>
          <span className="adm-muted" style={{ fontSize: 12 }}>
            {q.direction ? ` · ${q.direction}` : ''}
            {q.groupName ? ` · ${q.groupName}` : ''}
            {` · ${audienceLabel(q.audience)}`}
            {q.createdAt ? ` · ${formatWhen(q.createdAt)}` : ''}
          </span>
        </div>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          {label(q.moderationStatus || 'pending')}
          {typeof q.answerCount === 'number' ? ` · ответов: ${q.answerCount}` : ''}
          {q.classifiedBy ? ` · ${q.classifiedBy}` : ''}
        </span>
      </div>
      <p style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{q.text}</p>
      {q.moderationStatus === 'rejected' && q.moderatorComment && (
        <p className="adm-insights-warn" style={{ marginTop: 8, marginBottom: 0 }}>
          Причина отклонения: {q.moderatorComment}
        </p>
      )}

      <label className="adm-label" style={{ marginTop: 10 }}>Рубрика</label>
      <select
        className="adm-input"
        value={catValue === '' ? '' : String(catValue)}
        onChange={e => onCategoryDraftChange?.(e.target.value ? Number(e.target.value) : '')}
      >
        <option value="">Выберите рубрику</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.title}</option>
        ))}
      </select>

      {mode === 'pending' && (
        <>
          <label className="adm-label" style={{ marginTop: 10 }}>Комментарий при отклонении (опционально)</label>
          <input
            className="adm-input"
            value={rejectDraft || ''}
            onChange={e => onRejectDraftChange?.(e.target.value)}
            placeholder="Почему вопрос не публикуем…"
          />
          <div className="form-row" style={{ marginTop: 8 }}>
            <button type="button" className="adm-btn adm-btn-primary" onClick={onApprove}>
              Одобрить
            </button>
            <button type="button" className="adm-btn btn-danger" onClick={onReject}>
              Отклонить
            </button>
            <button type="button" className="adm-btn adm-btn-ghost" onClick={onDelete}>
              Удалить
            </button>
            {q.participantId != null && (
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => onOpenCard(q.participantId!)}>
                Карточка автора
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'archive' && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={onToggleAnswers}>
            {answersOpen ? 'Скрыть ответы' : `Показать ответы (${q.answerCount ?? answers.length})`}
          </button>
          {q.moderationStatus === 'rejected' && (
            <button type="button" className="adm-btn" onClick={onApprove}>
              Одобрить повторно
            </button>
          )}
          {q.moderationStatus === 'approved' && (
            <button type="button" className="adm-btn btn-danger" onClick={onReject}>
              Снять с публикации
            </button>
          )}
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onDelete}>
            Удалить
          </button>
          {q.participantId != null && (
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => onOpenCard(q.participantId!)}>
              Карточка автора
            </button>
          )}
        </div>
      )}

      {showAnswers && (
        <ExchangeAnswersBlock
          answers={answers}
          onOpenCard={onOpenCard}
          onDeleteAnswer={onDeleteAnswer}
        />
      )}
    </div>
  );
}

export function ModerationTab({ adminFetch, act, reloadKey, onOpenCard }: ModerationTabProps) {
  const [segment, setSegment] = useState<Segment>('exchange');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('approved');
  const [loading, setLoading] = useState(true);
  const [pendingExchange, setPendingExchange] = useState<ExchangeQuestion[]>([]);
  const [exchangeArchive, setExchangeArchive] = useState<ExchangeQuestion[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [orgReplyDraft, setOrgReplyDraft] = useState<Record<number, string>>({});
  const [rejectDraft, setRejectDraft] = useState<Record<number, string>>({});
  const [categoryDraft, setCategoryDraft] = useState<Record<number, number | ''>>({});
  const [categories, setCategories] = useState<ExchangeCategory[]>([]);
  const [openAnswers, setOpenAnswers] = useState<Record<number, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const archivePath = archiveFilter === 'all'
        ? '/exchange?limit=100'
        : `/exchange?status=${archiveFilter}&limit=100`;
      const [pendingRes, archiveRes, orgRes, catsRes] = await Promise.all([
        adminFetch('/exchange/pending'),
        adminFetch(archivePath),
        adminFetch('/org/threads'),
        adminFetch('/exchange-categories'),
      ]);
      setPendingExchange((pendingRes as { questions?: ExchangeQuestion[] }).questions || []);
      setExchangeArchive((archiveRes as { questions?: ExchangeQuestion[] }).questions || []);
      setOrgThreads((orgRes as { threads?: unknown[] }).threads || []);
      setCategories((catsRes as { categories?: ExchangeCategory[] }).categories || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, archiveFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const reload = () => load().catch(() => {});

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
      await reload();
    }, moderationStatus === 'approved' ? 'Вопрос одобрен' : 'Вопрос отклонён');

  const removeQuestion = (id: number) => {
    if (!window.confirm('Удалить вопрос обмена опытом вместе со всеми ответами?')) return;
    act(async () => {
      await adminFetch(`/exchange/${id}`, { method: 'DELETE' });
      await reload();
    }, 'Вопрос удалён');
  };

  const removeAnswer = (answerId: number) => {
    if (!window.confirm('Удалить этот ответ (и вложенные комментарии)?')) return;
    act(async () => {
      await adminFetch(`/exchange/answers/${answerId}`, { method: 'DELETE' });
      await reload();
    }, 'Ответ удалён');
  };

  const segments: { key: Segment; label: string }[] = [
    { key: 'exchange', label: `Обмен (ожидает${pendingExchange.length ? ` · ${pendingExchange.length}` : ''})` },
    { key: 'tasks', label: 'Задания на проверке' },
    { key: 'org', label: 'Организаторы' },
    { key: 'archive', label: 'Архив обмена' },
  ];

  if (loading) return <p className="adm-muted">Загрузка модерации…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Модерация"
        hint="Вопросы обмена опытом сначала попадают сюда. После одобрения их видят другие участники и могут отвечать."
      />

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        {segments.map(s => (
          <button key={s.key} type="button" className={segment === s.key ? 'on' : ''} onClick={() => setSegment(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {segment === 'tasks' && (
        <TaskModerationQueue adminFetch={adminFetch} act={act} reloadKey={reloadKey} />
      )}

      {segment === 'exchange' && (
        <>
          <p className="adm-forum-hint">
            Пользователь отправил вопрос → статус «на модерации». Выберите рубрику и одобрите — вопрос появится у остальных.
            В очереди сверху: «Другое» и авторазметка.
          </p>
          {selectedIds.length > 0 && (
            <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Выбрано: {selectedIds.length}</span>
              <select className="adm-input" style={{ maxWidth: 240 }} value={bulkCategoryId === '' ? '' : String(bulkCategoryId)} onChange={e => setBulkCategoryId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Сменить рубрику…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.title}</option>)}
              </select>
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                disabled={!bulkCategoryId}
                onClick={() => act(async () => {
                  await adminFetch('/exchange/bulk-category', {
                    method: 'POST',
                    body: JSON.stringify({ ids: selectedIds, categoryId: bulkCategoryId }),
                  });
                  setSelectedIds([]);
                  await reload();
                }, 'Рубрика обновлена')}
              >
                Применить
              </button>
            </div>
          )}
          {pendingExchange.length === 0 && <p className="adm-muted">Нет вопросов на модерации</p>}
          {pendingExchange.map(q => (
            <div key={q.id}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(q.id)}
                  onChange={e => setSelectedIds(prev => (
                    e.target.checked ? [...prev, q.id] : prev.filter(id => id !== q.id)
                  ))}
                />
                Выбрать для массовой смены рубрики
              </label>
              <ExchangeQuestionCard
                q={q}
                mode="pending"
                categories={categories}
                categoryDraft={categoryDraft[q.id] ?? q.categoryId ?? q.category?.id ?? ''}
                onCategoryDraftChange={value => setCategoryDraft(prev => ({ ...prev, [q.id]: value }))}
                rejectDraft={rejectDraft[q.id] || ''}
                onRejectDraftChange={value => setRejectDraft(prev => ({ ...prev, [q.id]: value }))}
                onApprove={() => moderate(q.id, 'approved')}
                onReject={() => moderate(q.id, 'rejected', rejectDraft[q.id])}
                onDelete={() => removeQuestion(q.id)}
                onOpenCard={id => onOpenCard(id)}
                onDeleteAnswer={removeAnswer}
              />
            </div>
          ))}
        </>
      )}

      {segment === 'archive' && (
        <>
          <div className="adm-seg" style={{ marginBottom: 12 }}>
            {([
              { key: 'approved' as const, label: 'Опубликованные' },
              { key: 'rejected' as const, label: 'Отклонённые' },
              { key: 'all' as const, label: 'Все' },
            ]).map(f => (
              <button
                key={f.key}
                type="button"
                className={archiveFilter === f.key ? 'on' : ''}
                onClick={() => setArchiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {exchangeArchive.length === 0 && <p className="adm-muted">Нет вопросов в архиве</p>}
          {exchangeArchive.map(q => (
            <ExchangeQuestionCard
              key={q.id}
              q={q}
              mode="archive"
              categories={categories}
              categoryDraft={categoryDraft[q.id] ?? q.categoryId ?? q.category?.id ?? ''}
              onCategoryDraftChange={value => setCategoryDraft(prev => ({ ...prev, [q.id]: value }))}
              answersOpen={!!openAnswers[q.id]}
              onToggleAnswers={() => setOpenAnswers(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
              onApprove={() => moderate(q.id, 'approved')}
              onReject={() => moderate(q.id, 'rejected', 'Снято с публикации модератором')}
              onDelete={() => removeQuestion(q.id)}
              onOpenCard={id => onOpenCard(id)}
              onDeleteAnswer={removeAnswer}
            />
          ))}
        </>
      )}

      {segment === 'org' && (
        <>
          {orgThreads.length === 0 && <p className="adm-muted">Нет обращений</p>}
          {orgThreads.map(t => (
            <div key={t.id} className="card">
              <p>
                <strong>{t.participantName || 'Участник'}</strong>
                {t.groupName ? ` · ${t.groupName}` : ''}
                {t.direction ? ` · ${t.direction}` : ''}
                {' · '}
                <span style={{ color: t.status === 'answered' ? '#2F855A' : '#B8621A' }}>
                  {t.status === 'answered' ? 'отвечено' : 'ожидает'}
                </span>
              </p>
              <p style={{ fontSize: 12, color: '#666' }}>{t.subject}</p>
              {(t.messages || []).map((m: any) => (
                <div key={m.id} style={{
                  marginTop: 6, padding: 8, borderRadius: 6, fontSize: 12,
                  background: m.senderType === 'admin' ? '#F0FFF4' : '#F7F7F7',
                }}>
                  <div style={{ color: '#888', fontSize: 10 }}>
                    {m.senderType === 'admin' ? 'Организаторы' : 'Участник'}
                    {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString('ru-RU')}` : ''}
                  </div>
                  {m.text}
                </div>
              ))}
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="adm-input"
                  value={orgReplyDraft[t.id] || ''}
                  onChange={e => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: e.target.value })}
                  placeholder="Ответ организатора…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="adm-btn"
                  onClick={() => act(() => adminFetch(`/org/threads/${t.id}/reply`, {
                    method: 'POST',
                    body: JSON.stringify({ text: orgReplyDraft[t.id], sendPush: true }),
                  }).then(() => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: '' })), 'Ответ отправлен')}
                >
                  Ответить и уведомить
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
