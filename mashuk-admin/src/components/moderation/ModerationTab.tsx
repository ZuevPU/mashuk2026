import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { OrgDirectorPanel } from '../questions/OrgDirectorPanel';
import { TaskModerationQueue } from './TaskModerationQueue';

type Segment = 'exchange' | 'org' | 'archive' | 'tasks';
type ArchiveFilter = 'approved' | 'rejected' | 'all';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

const MOD_NAV_EXCHANGE: HubNavItem[] = [
  { id: 'mod-hero', label: 'Обзор' },
  { id: 'mod-queue', label: 'Очередь' },
];
const MOD_NAV_TASKS: HubNavItem[] = [
  { id: 'mod-hero', label: 'Обзор' },
  { id: 'mod-tasks-queue', label: 'Очередь' },
  { id: 'mod-tasks-done', label: 'Проверено' },
];
const MOD_NAV_ORG: HubNavItem[] = [
  { id: 'mod-hero', label: 'Обзор' },
  { id: 'mod-org', label: 'Обращения' },
];
const MOD_NAV_ARCHIVE: HubNavItem[] = [
  { id: 'mod-hero', label: 'Обзор' },
  { id: 'mod-archive', label: 'Архив' },
];

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
    <div className="adm-mod-answers">
      <div className="adm-label">Ответы участников · {top.length}</div>
      {top.map(a => (
        <div key={a.id} className="adm-mod-answer">
          <div className="adm-mod-answer-head">
            <strong>
              {a.authorName || 'Участник'}
              {a.direction ? ` · ${a.direction}` : ''}
            </strong>
            <span className="adm-muted" style={{ fontSize: 11 }}>
              {formatWhen(a.createdAt)}
              {a.reactions ? ` · 👍 ${a.reactions.likes ?? 0}` : ''}
            </span>
          </div>
          <div className="adm-mod-answer-text">{a.text}</div>
          <div className="adm-mod-answer-actions">
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
                className="adm-btn adm-btn-danger adm-btn-sm"
                onClick={() => onDeleteAnswer(a.id)}
              >
                Удалить ответ
              </button>
            )}
          </div>
          {replies(a.id).map(r => (
            <div key={r.id} className="adm-mod-reply">
              <div className="adm-mod-answer-head">
                <strong style={{ fontSize: 12 }}>
                  {r.authorName || 'Участник'}
                  <span className="adm-muted" style={{ fontWeight: 400 }}>
                    {' · комментарий'}
                    {formatWhen(r.createdAt) ? ` · ${formatWhen(r.createdAt)}` : ''}
                  </span>
                </strong>
              </div>
              <div className="adm-mod-answer-text" style={{ fontSize: 12 }}>{r.text}</div>
              {onDeleteAnswer && (
                <button
                  type="button"
                  className="adm-btn adm-btn-danger adm-btn-sm"
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
    <article className="adm-mod-item">
      <div className="adm-mod-item-row1">
        <div className="adm-mod-item-main">
          <div className="adm-mod-item-title-line">
            <strong>{q.authorName || 'Участник'}</strong>
            <span className="adm-tasks-status">{label(q.moderationStatus || 'pending')}</span>
          </div>
          <p className="adm-kb-panel-sub" style={{ marginTop: 4 }}>
            {[q.direction, q.groupName, audienceLabel(q.audience), formatWhen(q.createdAt)].filter(Boolean).join(' · ')}
            {typeof q.answerCount === 'number' ? ` · ответов: ${q.answerCount}` : ''}
            {q.classifiedBy ? ` · ${q.classifiedBy}` : ''}
          </p>
        </div>
      </div>

      <p className="adm-mod-item-text">{q.text}</p>
      {q.moderationStatus === 'rejected' && q.moderatorComment && (
        <p className="adm-mod-reject-note">
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
          <div className="adm-mod-item-actions">
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={onApprove}>
              Одобрить
            </button>
            <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={onReject}>
              Отклонить
            </button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onDelete}>
              Удалить
            </button>
            {q.participantId != null && (
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onOpenCard(q.participantId!)}>
                Карточка автора
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'archive' && (
        <div className="adm-mod-item-actions">
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onToggleAnswers}>
            {answersOpen ? 'Скрыть ответы' : `Показать ответы (${q.answerCount ?? answers.length})`}
          </button>
          {q.moderationStatus === 'rejected' && (
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={onApprove}>
              Одобрить повторно
            </button>
          )}
          {q.moderationStatus === 'approved' && (
            <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={onReject}>
              Снять с публикации
            </button>
          )}
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onDelete}>
            Удалить
          </button>
          {q.participantId != null && (
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onOpenCard(q.participantId!)}>
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
    </article>
  );
}

export function ModerationTab({ adminFetch, act, reloadKey, onOpenCard }: ModerationTabProps) {
  const [segment, setSegment] = useState<Segment>('exchange');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('approved');
  const [loading, setLoading] = useState(true);
  const [pendingExchange, setPendingExchange] = useState<ExchangeQuestion[]>([]);
  const [exchangeArchive, setExchangeArchive] = useState<ExchangeQuestion[]>([]);
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
      const [pendingRes, archiveRes, catsRes] = await Promise.all([
        adminFetch('/exchange/pending'),
        adminFetch(archivePath),
        adminFetch('/exchange-categories'),
      ]);
      setPendingExchange((pendingRes as { questions?: ExchangeQuestion[] }).questions || []);
      setExchangeArchive((archiveRes as { questions?: ExchangeQuestion[] }).questions || []);
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
    { key: 'exchange', label: `Обмен${pendingExchange.length ? ` · ${pendingExchange.length}` : ''}` },
    { key: 'tasks', label: 'Задания' },
    { key: 'org', label: 'Организаторы' },
    { key: 'archive', label: 'Архив' },
  ];

  const navItems =
    segment === 'tasks' ? MOD_NAV_TASKS
      : segment === 'org' ? MOD_NAV_ORG
        : segment === 'archive' ? MOD_NAV_ARCHIVE
          : MOD_NAV_EXCHANGE;

  if (loading) return <p className="adm-muted">Загрузка модерации…</p>;

  return (
    <HubLensLayout className="adm-forum adm-kb" items={navItems} navLabel="Разделы модерации">
      <section id="mod-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Модерация"
          hint="Обмен опытом, задания на проверке и обращения к организаторам — в одном месте."
        >
          <div className="adm-forum-seg">
            {segments.map(s => (
              <button key={s.key} type="button" className={segment === s.key ? 'on' : ''} onClick={() => setSegment(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </AdminPageHero>
      </section>

      {segment === 'tasks' && (
        <TaskModerationQueue adminFetch={adminFetch} act={act} reloadKey={reloadKey} />
      )}

      {segment === 'exchange' && (
        <section id="mod-queue" className="adm-forum-anchor">
          <div className="card adm-forum-block adm-kb-panel">
            <div className="adm-kb-panel-head">
              <h3>Очередь обмена</h3>
              <p className="adm-kb-panel-sub">
                Выберите рубрику и одобрите — вопрос появится у участников. Сверху: «Другое» и авторазметка.
              </p>
            </div>
            {selectedIds.length > 0 && (
              <div className="adm-kb-bulk" style={{ marginTop: 0, marginBottom: 12 }}>
                <span className="adm-kb-bulk-count">Выбрано: {selectedIds.length}</span>
                <select
                  className="adm-input"
                  style={{ maxWidth: 240 }}
                  value={bulkCategoryId === '' ? '' : String(bulkCategoryId)}
                  onChange={e => setBulkCategoryId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Сменить рубрику…</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
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
            <div className="adm-mod-list">
              {pendingExchange.map(q => (
                <div key={q.id} className="adm-mod-list-item">
                  <label className="adm-tasks-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(q.id)}
                      onChange={e => setSelectedIds(prev => (
                        e.target.checked ? [...prev, q.id] : prev.filter(id => id !== q.id)
                      ))}
                    />
                    <span>Выбрать</span>
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
            </div>
          </div>
        </section>
      )}

      {segment === 'archive' && (
        <section id="mod-archive" className="adm-forum-anchor">
          <div className="card adm-forum-block adm-kb-panel">
            <div className="adm-kb-panel-head">
              <h3>Архив обмена</h3>
              <p className="adm-kb-panel-sub">Опубликованные и отклонённые вопросы, ответы участников.</p>
            </div>
            <div className="adm-forum-seg" style={{ marginBottom: 12 }}>
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
            <div className="adm-mod-list">
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
            </div>
          </div>
        </section>
      )}

      {segment === 'org' && (
        <section id="mod-org" className="adm-forum-anchor">
          <div className="card adm-forum-block adm-kb-panel">
            <div className="adm-kb-panel-head">
              <h3>Обращения к организаторам</h3>
              <p className="adm-kb-panel-sub">Ответ с уведомлением, удаление и карточка участника.</p>
            </div>
            <OrgDirectorPanel
              adminFetch={adminFetch}
              act={act}
              reloadKey={reloadKey}
              onOpenCard={onOpenCard}
            />
          </div>
        </section>
      )}
    </HubLensLayout>
  );
}
