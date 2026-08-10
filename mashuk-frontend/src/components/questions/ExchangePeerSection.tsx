import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Textarea } from '@vkontakte/vkui';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { EmptyState } from '../EmptyState';

export type ExchangeCategory = {
  id: number;
  slug: string;
  title: string;
  emoji?: string | null;
  hint?: string | null;
  sortOrder?: number;
  isSystem?: boolean;
};

type ExchangeLimits = {
  questionsLeft: number;
  questionsMax: number;
  answersForPointsLeft: number;
  answersForPointsMax: number;
  pointsPerQuestion?: number;
  pointsPerAnswer?: number;
};

type ExchangeQuestion = {
  id: number;
  text: string;
  audience?: string | null;
  moderationStatus?: string | null;
  moderatorComment?: string | null;
  authorName?: string;
  direction?: string | null;
  isMine?: boolean;
  answerCount?: number;
  reactions?: { likes?: number; discuss?: number; likedBy?: number[]; discussBy?: number[] } | null;
  category?: { id: number; slug: string; title: string; emoji?: string | null } | null;
  createdAt?: string | null;
};

type Props = {
  myParticipantId: number | null;
  limits: ExchangeLimits | null;
  onOpenThread: (id: number) => void;
  onSubmitted: (msg: string) => void;
  onError: (msg: string) => void;
  reloadKey?: number;
};

function questionsWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вопрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'вопроса';
  return 'вопросов';
}

function isDirectionAudience(audience?: string | null) {
  const a = (audience || '').toLowerCase();
  return a === 'direction' || a === 'my_direction';
}

function answerCountLabel(q: ExchangeQuestion) {
  const n = q.answerCount ?? 0;
  if (n === 0) return 'Пока нет ответов';
  if (n === 1) return '1 ответ';
  if (n >= 2 && n <= 4) return `${n} ответа`;
  return `${n} ответов`;
}

type ComposeStep = 'idle' | 'category' | 'text' | 'confirm';

export function ExchangePeerSection({
  myParticipantId,
  limits,
  onOpenThread,
  onSubmitted,
  onError,
  reloadKey = 0,
}: Props) {
  const [categories, setCategories] = useState<ExchangeCategory[]>([]);
  const [minQuestionLen, setMinQuestionLen] = useState(60);
  const [feed, setFeed] = useState<'main' | 'smalltalk'>('main');
  const [themeIds, setThemeIds] = useState<number[]>([]);
  const [whoDirs, setWhoDirs] = useState<string[]>([]);
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'direction' | ''>('');
  const [sort, setSort] = useState<'new' | 'unanswered' | 'popular'>('new');
  const [questions, setQuestions] = useState<ExchangeQuestion[]>([]);
  const [myQuestions, setMyQuestions] = useState<ExchangeQuestion[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [composeStep, setComposeStep] = useState<ComposeStep>('idle');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<'all' | 'direction'>('all');

  const thematic = useMemo(
    () => categories.filter(c => c.slug !== 'smalltalk' && c.slug !== 'other'),
    [categories],
  );
  const smalltalkCat = categories.find(c => c.slug === 'smalltalk');
  const otherCat = categories.find(c => c.slug === 'other');
  const selectedCat = categories.find(c => c.id === categoryId) || null;

  const directionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const q of [...questions, ...myQuestions]) {
      if (q.direction) set.add(q.direction);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [questions, myQuestions]);

  const loadCategories = useCallback(async () => {
    const res = await apiGet<{ categories: ExchangeCategory[]; minQuestionLen?: number }>('/exchange/categories');
    setCategories(res.categories || []);
    if (res.minQuestionLen) setMinQuestionLen(res.minQuestionLen);
  }, []);

  const loadFeed = useCallback(async (cursor?: string | null) => {
    const params = new URLSearchParams();
    params.set('feed', feed);
    params.set('sort', sort);
    params.set('limit', '20');
    if (themeIds.length) params.set('category', themeIds.join(','));
    if (whoDirs.length) params.set('direction', whoDirs.join(','));
    if (audienceFilter) params.set('audience', audienceFilter);
    if (cursor) params.set('cursor', cursor);

    const res = await apiGet<{
      questions: ExchangeQuestion[];
      nextCursor?: string | null;
      myParticipantId?: number;
      minQuestionLen?: number;
    }>(`/exchange?${params.toString()}`);
    if (res.minQuestionLen) setMinQuestionLen(res.minQuestionLen);
    if (cursor) {
      setQuestions(prev => [...prev, ...(res.questions || [])]);
    } else {
      setQuestions(res.questions || []);
    }
    setNextCursor(res.nextCursor ?? null);
  }, [feed, sort, themeIds, whoDirs, audienceFilter]);

  const loadMine = useCallback(async () => {
    const res = await apiGet<{ questions: ExchangeQuestion[] }>('/exchange?feed=mine&limit=50');
    setMyQuestions(res.questions || []);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCategories(), loadFeed(null), loadMine()]);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Не удалось загрузить обмен опытом');
    } finally {
      setLoading(false);
    }
  }, [loadCategories, loadFeed, loadMine, onError]);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload, reloadKey]);

  const toggleTheme = (id: number) => {
    setThemeIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const toggleWho = (d: string) => {
    setWhoDirs(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  };

  const openCompose = async () => {
    if (categories.length === 0) {
      try {
        await loadCategories();
      } catch {
        onError('Не удалось загрузить темы. Обновите экран и попробуйте снова.');
        return;
      }
    }
    if (categories.length === 0) {
      onError('Темы ещё не настроены на сервере. Напишите организаторам или зайдите позже.');
      return;
    }
    setComposeStep('category');
  };

  const publish = async () => {
    if (!categoryId) {
      onError('Выберите тему вопроса — без рубрики опубликовать нельзя');
      setComposeStep('category');
      return;
    }
    if (text.trim().length < minQuestionLen) {
      onError(`Добавьте деталей. Сейчас ${text.trim().length} из ${minQuestionLen} символов.`);
      setComposeStep('text');
      return;
    }
    try {
      const res = await apiPost<{ category?: { title: string } }>('/exchange', {
        text: text.trim(),
        audience,
        categoryId: Number(categoryId),
      });
      const catTitle = res.category?.title || selectedCat?.title || 'тема';
      setComposeStep('idle');
      setCategoryId(null);
      setText('');
      setAudience('all');
      onSubmitted(`Вопрос отправлен на проверку. После публикации он появится в теме «${catTitle}».`);
      await reload();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Не удалось отправить вопрос');
    }
  };

  const reactQuestion = async (q: ExchangeQuestion, kind: 'like' | 'discuss') => {
    try {
      await apiPost(`/exchange/${q.id}/react`, { type: kind });
      await loadFeed(null);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Не удалось поставить реакцию');
    }
  };

  if (loading && !questions.length) {
    return <div className="m-card" style={{ fontSize: 13, color: '#666' }}>Загрузка…</div>;
  }

  return (
    <>
      <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
        О чём ваш вопрос? Выберите тему — так на него быстрее ответят коллеги, которые в ней разбираются.
      </div>

      <div className="time-sw" style={{ marginBottom: 10 }}>
        <button type="button" className={`time-btn ${feed === 'main' ? 'on' : ''}`} onClick={() => setFeed('main')}>
          Вопросы
        </button>
        <button type="button" className={`time-btn ${feed === 'smalltalk' ? 'on' : ''}`} onClick={() => setFeed('smalltalk')}>
          Знакомство и общение
        </button>
      </div>

      {composeStep === 'idle' && (
        <div className="ask-btn m-card" style={{ marginBottom: 10 }}>
          {limits && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
              Можно задать ещё {limits.questionsLeft} {questionsWord(limits.questionsLeft)}
              {' '}(из {limits.questionsMax}
              {limits.pointsPerQuestion != null ? `, +${limits.pointsPerQuestion} за вопрос` : ''}).
            </div>
          )}
          <div style={{ fontSize: 12, color: '#2D6A4F', marginBottom: 8, lineHeight: 1.4 }}>
            Сначала выберите тему (рубрику) — так коллегам проще ответить.
          </div>
          <Button
            stretched
            disabled={!!limits && limits.questionsLeft <= 0}
            onClick={() => { void openCompose(); }}
          >
            {limits && limits.questionsLeft <= 0 ? 'Лимит вопросов исчерпан' : '+ Задать вопрос · выбрать тему'}
          </Button>
        </div>
      )}

      {composeStep === 'category' && (
        <div className="m-card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Тема вопроса</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.45 }}>
            О чём ваш вопрос? Выберите рубрику — так на него быстрее ответят коллеги по теме.
          </div>
          {categories.length === 0 ? (
            <div style={{ fontSize: 13, color: '#C53030', marginBottom: 10 }}>
              Темы не загрузились. Нажмите «Обновить темы» или перезайдите во вкладку.
              <div style={{ marginTop: 8 }}>
                <Button mode="secondary" onClick={() => { void loadCategories().catch(() => onError('Не удалось загрузить темы')); }}>
                  Обновить темы
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {thematic.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="time-btn"
                    style={{ textAlign: 'left', padding: '10px 8px', whiteSpace: 'normal', height: 'auto' }}
                    onClick={() => { setCategoryId(Number(c.id)); setComposeStep('text'); }}
                  >
                    <div>{c.emoji} {c.title}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {smalltalkCat && (
                  <button type="button" className="time-btn" onClick={() => { setCategoryId(Number(smalltalkCat.id)); setComposeStep('text'); }}>
                    {smalltalkCat.emoji} {smalltalkCat.title}
                  </button>
                )}
                {otherCat && (
                  <button type="button" className="time-btn" onClick={() => { setCategoryId(Number(otherCat.id)); setComposeStep('text'); }}>
                    {otherCat.emoji} {otherCat.title}
                  </button>
                )}
              </div>
            </>
          )}
          <Button mode="secondary" style={{ marginTop: 10 }} onClick={() => setComposeStep('idle')}>Отмена</Button>
        </div>
      )}

      {(composeStep === 'text' || composeStep === 'confirm') && selectedCat && (
        <div className="m-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="time-btn on" style={{ pointerEvents: 'none' }}>
              {selectedCat.emoji} {selectedCat.title}
            </span>
            <button type="button" className="time-btn" onClick={() => setComposeStep('category')}>Сменить тему</button>
          </div>
          {selectedCat.hint && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.45 }}>{selectedCat.hint}</div>
          )}
          {selectedCat.slug === 'other' && (
            <div style={{ fontSize: 12, color: '#B8621A', marginTop: 6 }}>Модератор подберёт тему при проверке.</div>
          )}
          {composeStep === 'text' && (
            <>
              <Textarea
                style={{ marginTop: 10 }}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Опишите ситуацию…"
              />
              <div style={{ fontSize: 12, color: text.trim().length < minQuestionLen ? '#B8621A' : '#666', marginTop: 6 }}>
                {text.trim().length < minQuestionLen
                  ? `Добавьте деталей — так вам ответят по существу. Сейчас ${text.trim().length} из ${minQuestionLen} символов.`
                  : `${text.trim().length} / ${minQuestionLen}`}
              </div>
              <div className="time-sw" style={{ marginTop: 8 }}>
                <button type="button" className={`time-btn ${audience === 'all' ? 'on' : ''}`} onClick={() => setAudience('all')}>
                  Всем участникам
                </button>
                <button type="button" className={`time-btn ${audience === 'direction' ? 'on' : ''}`} onClick={() => setAudience('direction')}>
                  Своему направлению
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button mode="secondary" onClick={() => setComposeStep('idle')}>Назад</Button>
                <Button
                  disabled={text.trim().length < minQuestionLen}
                  onClick={() => setComposeStep('confirm')}
                >
                  Далее
                </Button>
              </div>
            </>
          )}
          {composeStep === 'confirm' && (
            <>
              <div style={{ marginTop: 10, fontSize: 13, whiteSpace: 'pre-wrap' }}>{text.trim()}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                Кому: {audience === 'direction' ? 'своему направлению' : 'всем участникам'}
                {audience === 'direction' ? ' — увидят коллеги вашего направления' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button mode="secondary" onClick={() => setComposeStep('text')}>Назад</Button>
                <Button onClick={() => { void publish(); }}>Опубликовать</Button>
              </div>
            </>
          )}
        </div>
      )}

      {myQuestions.length > 0 && feed === 'main' && (
        <>
          <div className="rq-hdr">
            <span className="rq-hdr-t">Мои вопросы · {myQuestions.length}</span>
          </div>
          {myQuestions.map(q => (
            <div key={q.id} className="myq2 m-card" style={{ marginBottom: 8 }}>
              {q.category && (
                <div className="peer-dir">{q.category.emoji} {q.category.title}</div>
              )}
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{q.text}</div>
              <div className="peer-meta">
                {q.moderationStatus === 'pending'
                  ? 'На модерации — появится после одобрения'
                  : q.moderationStatus === 'rejected'
                    ? (q.moderatorComment ? `Не прошёл модерацию: ${q.moderatorComment}` : 'Не прошёл модерацию')
                    : answerCountLabel(q)}
              </div>
              {(q.moderationStatus || '').toLowerCase() === 'approved' && (
                <Button size="s" mode="secondary" style={{ marginTop: 8 }} onClick={() => onOpenThread(q.id)}>
                  Показать ответы
                </Button>
              )}
            </div>
          ))}
        </>
      )}

      {feed === 'main' && (
        <>
          <div className="rq-hdr" style={{ marginTop: 12 }}>
            <span className="rq-hdr-t">Фильтры</span>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Тема</div>
          <div className="time-sw" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {thematic.map(c => (
              <button
                key={c.id}
                type="button"
                className={`time-btn ${themeIds.includes(c.id) ? 'on' : ''}`}
                onClick={() => toggleTheme(c.id)}
              >
                {c.emoji} {c.title}
              </button>
            ))}
          </div>
          {directionOptions.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Кто спрашивает</div>
              <div className="time-sw" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                {directionOptions.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`time-btn ${whoDirs.includes(d) ? 'on' : ''}`}
                    onClick={() => toggleWho(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Кому адресован</div>
          <div className="time-sw" style={{ marginBottom: 8 }}>
            <button type="button" className={`time-btn ${audienceFilter === '' ? 'on' : ''}`} onClick={() => setAudienceFilter('')}>Любой</button>
            <button type="button" className={`time-btn ${audienceFilter === 'all' ? 'on' : ''}`} onClick={() => setAudienceFilter('all')}>Всем</button>
            <button type="button" className={`time-btn ${audienceFilter === 'direction' ? 'on' : ''}`} onClick={() => setAudienceFilter('direction')}>Направлению</button>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Сортировка</div>
          <div className="time-sw" style={{ marginBottom: 10 }}>
            <button type="button" className={`time-btn ${sort === 'new' ? 'on' : ''}`} onClick={() => setSort('new')}>Новые</button>
            <button type="button" className={`time-btn ${sort === 'unanswered' ? 'on' : ''}`} onClick={() => setSort('unanswered')}>Без ответов</button>
            <button type="button" className={`time-btn ${sort === 'popular' ? 'on' : ''}`} onClick={() => setSort('popular')}>Популярные</button>
          </div>
        </>
      )}

      {questions.map(q => {
        const liked = !!(myParticipantId && q.reactions?.likedBy?.includes(myParticipantId));
        const discussed = !!(myParticipantId && q.reactions?.discussBy?.includes(myParticipantId));
        return (
          <div key={q.id} className="peer-item m-card" style={{ marginTop: 8 }}>
            <div className="peer-wrap">
              <div className="peer-av">{(q.authorName || '?').slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="peer-dir">
                  {q.category ? `${q.category.emoji || ''} ${q.category.title}` : 'Без темы'}
                  {q.direction ? ` · ${q.direction}` : ''}
                </div>
                <div className="peer-meta" style={{ marginTop: 2 }}>
                  {isDirectionAudience(q.audience) ? 'Кому: своему направлению' : 'Кому: всем участникам'}
                </div>
                <div className="peer-q peer-q--lg">{q.text}</div>
                <div className="peer-meta">{q.authorName} · {answerCountLabel(q)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`time-btn ${liked ? 'on' : ''}`} onClick={() => void reactQuestion(q, 'like')}>
                👍 {q.reactions?.likes || 0}
              </button>
              <button type="button" className={`time-btn ${discussed ? 'on' : ''}`} onClick={() => void reactQuestion(q, 'discuss')}>
                💬 {q.reactions?.discuss || 0}
              </button>
              <Button size="m" mode="secondary" onClick={() => onOpenThread(q.id)}>
                Показать ответы
              </Button>
            </div>
          </div>
        );
      })}

      {nextCursor && (
        <Button
          stretched
          mode="secondary"
          style={{ marginTop: 10 }}
          loading={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            loadFeed(nextCursor).finally(() => setLoadingMore(false));
          }}
        >
          Ещё вопросы
        </Button>
      )}

      {questions.length === 0 && myQuestions.length === 0 && (
        <EmptyState
          icon="🤝"
          title={feed === 'smalltalk' ? 'Пока тихо в знакомствах' : 'Пока нет вопросов'}
          subtitle={feed === 'smalltalk'
            ? 'Представьтесь коллегам — отдельная лента для лёгкого общения'
            : 'Задайте первый вопрос участникам или дождитесь публикации после модерации'}
        />
      )}
    </>
  );
}
