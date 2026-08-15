import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Textarea, Button, ModalRoot, ModalPage, ModalPageHeader } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { useAppModal } from '../App';
import { QuestionAnswerForm } from '../components/questions/QuestionAnswerForm';
import { EveningDaySummaryFlow } from '../components/questions/EveningDaySummaryFlow';
import { ExchangePeerSection, type ExchangeQuestion } from '../components/questions/ExchangePeerSection';
import { PriorityAction } from '../components/home/DashboardCards';
import { EmptyState } from '../components/EmptyState';
import { AnswerSuccessOverlay, type SubmitSuccessPayload, type AnswerConfirmationConfig } from '../components/questions/AnswerSuccessOverlay';
import { RosmolCareServiceCard } from '../components/org/RosmolCareServiceCard';
import { isEveningDaySummaryQuestion } from '../utils/eveningSummaryQuestion';

type ChatTab = 'reflect' | 'peer' | 'org' | 'myAnswers';

const DEFAULT_CONFIRM: AnswerConfirmationConfig = {
  enabled: true,
  showPoints: true,
  titleTemplate: 'Ответ отправлен',
};

type ExchangeAnswerRow = {
  id: number;
  participantId?: number;
  text: string;
  parentAnswerId?: number | null;
  authorName?: string;
  createdAt?: string | null;
  reactions?: { likes?: number; discuss?: number; likedBy?: number[]; discussBy?: number[] };
};

function byCreatedAtAsc(a: ExchangeAnswerRow, b: ExchangeAnswerRow): number {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return a.id - b.id;
}

function exchangeTopLevelAnswers(answers: ExchangeAnswerRow[] | undefined): ExchangeAnswerRow[] {
  return (answers || []).filter(a => !a.parentAnswerId).sort(byCreatedAtAsc);
}

function exchangeRepliesTo(parentId: number, answers: ExchangeAnswerRow[] | undefined): ExchangeAnswerRow[] {
  return (answers || []).filter(a => a.parentAnswerId === parentId).sort(byCreatedAtAsc);
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function answersWord(n: number): string {
  return ruPlural(n, 'ответ', 'ответа', 'ответов');
}

function exchangeAnswerCountLabel(q: { answerCount?: number; answers?: ExchangeAnswerRow[] }): string {
  const top = q.answerCount ?? exchangeTopLevelAnswers(q.answers).length;
  const replies = (q.answers || []).filter(a => a.parentAnswerId).length;
  if (top === 0 && replies === 0) return 'Пока нет ответов';
  let s = `${top} ${top === 1 ? 'ответ' : top < 5 ? 'ответа' : 'ответов'}`;
  if (replies > 0) s += ` · ${replies} в обсуждении`;
  return s;
}

function isDirectionAudience(audience?: string | null): boolean {
  const a = (audience || '').toLowerCase();
  return a === 'direction' || a === 'my_direction' || a === 'своему направлению';
}

function userLiked(reactions: ExchangeAnswerRow['reactions'], myId: number | null): boolean {
  if (!myId || !reactions?.likedBy) return false;
  return reactions.likedBy.includes(myId);
}

function userDiscussed(reactions: ExchangeAnswerRow['reactions'], myId: number | null): boolean {
  if (!myId || !reactions?.discussBy) return false;
  return reactions.discussBy.includes(myId);
}

type ExchangeLimits = {
  questionsMax: number;
  questionsUsed: number;
  questionsLeft: number;
  pointsPerQuestion?: number;
  answersForPointsMax: number;
  answersForPointsUsed: number;
  answersForPointsLeft: number;
  pointsPerAnswer?: number;
  /** @deprecated aliases from API */
  answersPerDayMax?: number;
  answersTodayUsed?: number;
  answersTodayLeft?: number;
};

function normalizeExchangeLimits(raw: Partial<ExchangeLimits> | null | undefined): ExchangeLimits | null {
  if (!raw || typeof raw !== 'object') return null;
  const answersForPointsMax = Number(raw.answersForPointsMax ?? raw.answersPerDayMax ?? 0);
  const answersForPointsUsed = Number(raw.answersForPointsUsed ?? raw.answersTodayUsed ?? 0);
  const answersForPointsLeft = Number(
    raw.answersForPointsLeft ?? raw.answersTodayLeft ?? Math.max(0, answersForPointsMax - answersForPointsUsed),
  );
  return {
    questionsMax: Number(raw.questionsMax ?? 0),
    questionsUsed: Number(raw.questionsUsed ?? 0),
    questionsLeft: Number(raw.questionsLeft ?? 0),
    pointsPerQuestion: raw.pointsPerQuestion != null ? Number(raw.pointsPerQuestion) : undefined,
    answersForPointsMax,
    answersForPointsUsed,
    answersForPointsLeft,
    pointsPerAnswer: raw.pointsPerAnswer != null ? Number(raw.pointsPerAnswer) : undefined,
    answersPerDayMax: answersForPointsMax,
    answersTodayUsed: answersForPointsUsed,
    answersTodayLeft: answersForPointsLeft,
  };
}

const ExchangeThreadModal = ({
  question,
  myParticipantId,
  limits,
  onClose,
  onRefresh,
  onSubmitSuccess,
}: {
  question: any;
  myParticipantId: number | null;
  limits: ExchangeLimits | null;
  onClose: () => void;
  onRefresh: () => void;
  onSubmitSuccess: (p: SubmitSuccessPayload) => void;
}) => {
  const [replyText, setReplyText] = useState('');
  const [parentAnswerId, setParentAnswerId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const topAnswers = exchangeTopLevelAnswers(question?.answers);
  const parentPreview = parentAnswerId
    ? (question?.answers as ExchangeAnswerRow[] | undefined)?.find(a => a.id === parentAnswerId)
    : null;
  const answersForPointsLeft = limits?.answersForPointsLeft ?? 0;
  const pointsPerAnswer = limits?.pointsPerAnswer;

  const react = async (answerId: number, type: 'like' | 'discuss') => {
    try {
      await apiPost(`/exchange/answers/${answerId}/react`, { type });
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    if (!question?.id || !replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost<SubmitSuccessPayload>(`/exchange/${question.id}/answer`, {
        text: replyText.trim(),
        parentAnswerId: parentAnswerId || undefined,
      });
      setReplyText('');
      setParentAnswerId(null);
      onSubmitSuccess({
        xpAwarded: res.xpAwarded,
        track: res.track,
        newMedals: res.newMedals,
        confirm: res.confirm ?? DEFAULT_CONFIRM,
      });
      onRefresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка отправки';
      const hint = msg === 'ANSWER_TOO_SHORT' || /корот|TOO_SHORT/i.test(msg)
        ? 'Похоже, это реакция, а не ответ. Нажмите 👍 под вопросом — автор увидит.'
        : msg;
      onSubmitSuccess({
        xpAwarded: 0,
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: hint },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reactQuestion = async (kind: 'like' | 'discuss') => {
    if (!question?.id) return;
    try {
      await apiPost(`/exchange/${question.id}/react`, { type: kind });
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <ModalPage id="exchange-thread" settlingHeight={100} onClose={onClose}>
      <ModalPageHeader>Обсуждение</ModalPageHeader>
      <Group>
        <div className="peer-thread-q m-card">
          <div className="peer-dir">
            {question?.category
              ? `${question.category.emoji || ''} ${question.category.title}`
              : (isDirectionAudience(question?.audience) ? 'Своему направлению' : 'Всем участникам')}
          </div>
          <div className="peer-q peer-q--lg">{question?.text}</div>
          <div className="peer-meta">{question?.authorName} · {exchangeAnswerCountLabel(question || {})}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button size="s" mode="secondary" onClick={() => { void reactQuestion('like'); }}>
              👍 {question?.reactions?.likes ?? 0}
            </Button>
            <Button size="s" mode="secondary" onClick={() => { void reactQuestion('discuss'); }}>
              💬 {question?.reactions?.discuss ?? 0}
            </Button>
          </div>
        </div>

        {topAnswers.length === 0 ? (
          <div className="m-card" style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
            Ответов пока нет — будьте первым.
          </div>
        ) : (
          topAnswers.map((a: ExchangeAnswerRow) => (
            <div key={a.id} className="peer-answer peer-answer--thread">
              <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>{a.authorName}</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{a.text}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  size="s"
                  mode={userLiked(a.reactions, myParticipantId) ? 'primary' : 'secondary'}
                  disabled={userLiked(a.reactions, myParticipantId)}
                  onClick={() => { void react(a.id, 'like'); }}
                >
                  👍 {a.reactions?.likes ?? 0}
                </Button>
                <Button
                  size="s"
                  mode={userDiscussed(a.reactions, myParticipantId) ? 'primary' : 'secondary'}
                  disabled={userDiscussed(a.reactions, myParticipantId)}
                  onClick={() => { void react(a.id, 'discuss'); }}
                >
                  Интересно обсудить · {a.reactions?.discuss ?? 0}
                </Button>
                <Button size="s" mode="tertiary" onClick={() => setParentAnswerId(a.id)}>
                  Ответить
                </Button>
              </div>
              {exchangeRepliesTo(a.id, question?.answers).map((r: ExchangeAnswerRow) => (
                <div key={r.id} className="peer-answer peer-answer--reply">
                  <div style={{ fontSize: 10, color: '#888' }}>{r.authorName} · уточнение</div>
                  <div style={{ fontSize: 13, lineHeight: 1.4, marginTop: 2 }}>{r.text}</div>
                </div>
              ))}
            </div>
          ))
        )}

        <div className="peer-thread-compose m-card" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {parentAnswerId ? 'Ваш комментарий к ответу' : 'Добавить свой ответ'}
          </div>
          {limits && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>
              {answersForPointsLeft > 0
                ? (
                  <>
                    Ещё {answersForPointsLeft} {answersWord(answersForPointsLeft)} с баллами
                    {pointsPerAnswer != null ? ` (+${pointsPerAnswer} за ответ)` : ''}
                    {' '}из {limits.answersForPointsMax}. Дальше отвечать можно без баллов.
                  </>
                )
                : 'Лимит ответов с баллами исчерпан — отвечать можно, но без начисления баллов.'}
            </div>
          )}
          {parentPreview && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8, padding: '8px 10px', background: 'var(--m-surface)', borderRadius: 8 }}>
              В ответ на: {parentPreview.authorName} — «{parentPreview.text.slice(0, 80)}{parentPreview.text.length > 80 ? '…' : ''}»
              <button
                type="button"
                style={{ marginLeft: 8, border: 'none', background: 'none', color: 'var(--m-accent)', cursor: 'pointer', fontSize: 12 }}
                onClick={() => setParentAnswerId(null)}
              >
                Отменить
              </button>
            </div>
          )}
          <Textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={parentAnswerId ? 'Напишите уточнение...' : 'Поделитесь своим опытом...'}
          />
          <Button size="l" stretched loading={submitting} style={{ marginTop: 10 }} onClick={() => { void submit(); }}>
            Отправить
          </Button>
        </div>
      </Group>
    </ModalPage>
  );
};

const OrgThreadMessenger = ({
  threadId,
  onClose,
  onRefreshList,
}: {
  threadId: number;
  onClose: () => void;
  onRefreshList: () => void;
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<any>(`/org/threads/${threadId}`)
      .then(res => {
        setMessages(res.messages || []);
        setSubject(res.thread?.subject || 'Обращение');
      })
      .finally(() => setLoading(false));
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await apiPost(`/org/threads/${threadId}/reply`, { text });
      setText('');
      load();
      onRefreshList();
    } catch {
      /* ignore */
    }
  };

  return (
    <ModalPage id="org-thread" onClose={onClose}>
      <ModalPageHeader>{subject}</ModalPageHeader>
      <Group>
        {loading ? <Spinner /> : messages.map(m => (
          <div
            key={m.id}
            style={{
              marginBottom: 8,
              padding: 10,
              borderRadius: 10,
              background: m.senderType === 'admin' ? '#F0FFF4' : '#F3F4F6',
              alignSelf: m.senderType === 'admin' ? 'flex-start' : 'flex-end',
            }}
          >
            <div style={{ fontSize: 10, color: '#888' }}>
              {m.senderType === 'admin' ? 'Дирекция' : 'Вы'}
              {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString('ru-RU')}` : ''}
            </div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{m.text}</div>
          </div>
        ))}
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ваше сообщение..." />
        <Button style={{ marginTop: 8 }} stretched onClick={send}>Отправить</Button>
      </Group>
    </ModalPage>
  );
};

const OrgComposeModal = ({
  onClose,
  onCreated,
  onSent,
}: {
  onClose: () => void;
  onCreated: () => void;
  onSent?: () => void;
}) => {
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await apiPost('/org/threads', { subject: subject.trim() || 'Обращение', text });
      onCreated();
      onSent?.();
      onClose();
    } catch {
      /* ignore */
    }
  };

  return (
    <ModalPage id="org-compose" onClose={onClose}>
      <ModalPageHeader>Написать в дирекцию</ModalPageHeader>
      <Group>
        <Textarea value={subject} onChange={e => setSubject(e.target.value)} placeholder="Тема переписки (необязательно)" />
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ваше сообщение..." style={{ marginTop: 8 }} />
        <Button size="l" stretched style={{ marginTop: 12 }} onClick={submit}>Отправить</Button>
      </Group>
    </ModalPage>
  );
};

export const QuestionsPanel: React.FC<{ id: string; onActivity?: () => void }> = ({ id, onActivity }) => {
  const { setModal } = useAppModal();
  const { panel: activePanel } = useActiveVkuiLocation();
  const [tab, setTab] = useState<ChatTab>('reflect');
  const [questions, setQuestions] = useState<any[]>([]);
  const [exchange, setExchange] = useState<any[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [answerConfirmDefaults, setAnswerConfirmDefaults] = useState<AnswerConfirmationConfig>(DEFAULT_CONFIRM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchangeThread, setExchangeThread] = useState<ExchangeQuestion | null>(null);
  const [exchangeLimits, setExchangeLimits] = useState<ExchangeLimits | null>(null);
  const [exchangeReloadKey, setExchangeReloadKey] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [questionOptions, setQuestionOptions] = useState<any[]>([]);
  const [dayEvents, setDayEvents] = useState<any[]>([]);
  const [afterBlocksEvents, setAfterBlocksEvents] = useState<any[]>([]);
  const [lessonPickMeta, setLessonPickMeta] = useState<{
    programThemeCount?: number;
    emptyReason?: 'none' | 'none_in_program' | 'none_conducted_yet';
  } | null>(null);
  const [myAnswer, setMyAnswer] = useState<{
    preview?: string;
    createdAt?: string | null;
    answerData?: unknown;
  } | null>(null);
  const [successPayload, setSuccessPayload] = useState<SubmitSuccessPayload | null>(null);
  const [orgThreadId, setOrgThreadId] = useState<number | null>(null);
  const [orgComposeOpen, setOrgComposeOpen] = useState(false);
  const [myParticipantId, setMyParticipantId] = useState<number | null>(null);
  const [eveningCard, setEveningCard] = useState<{ title: string; subtitle: string } | null>(null);
  const [showEveningFlow, setShowEveningFlow] = useState(false);

  const loadAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<any>('/questions'),
      apiGet<any>('/exchange'),
      apiGet<any>('/org/threads').catch(() => ({ threads: [] })),
      apiGet<any>('/home').catch(() => null),
    ])
      .then(([q, ex, org, home]) => {
        setQuestions(q.questions || []);
        if (q.answerConfirm) setAnswerConfirmDefaults(q.answerConfirm);
        setExchange(ex.questions || []);
        if (typeof ex.myParticipantId === 'number') setMyParticipantId(ex.myParticipantId);
        if (ex.limits && typeof ex.limits === 'object') setExchangeLimits(normalizeExchangeLimits(ex.limits));
        setExchangeReloadKey(k => k + 1);
        setOrgThreads(org.threads || []);
        const card = home?.eveningCard;
        const showCard = !!card && (home?.timeSlot === 'evening' || home?.eveningWrap);
        setEveningCard(showCard ? card : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось загрузить'))
      .finally(() => {
        setLoading(false);
        onActivity?.();
      });
  }, [onActivity]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openQuestion = useCallback(async (qId: number) => {
    try {
      const detail = await apiGet<any>(`/questions/${qId}`);
      setActiveQuestion(detail.question);
      setQuestionOptions(detail.options || []);
      setDayEvents(detail.dayEvents || []);
      setAfterBlocksEvents(detail.afterBlocksEvents || []);
      setLessonPickMeta(detail.lessonPickMeta ?? null);
      setMyAnswer(detail.myAnswer ?? null);
    } catch (err) {
      setSuccessPayload({
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: err instanceof ApiError ? err.message : 'Не удалось открыть вопрос' },
      });
    }
  }, []);

  useEffect(() => {
    const params = getHashSearchParams();
    const tabParam = (params.get('tab') || '').toLowerCase();
    if (tabParam === 'my' || tabParam === 'myanswers' || tabParam === 'answers') {
      setTab('myAnswers');
    } else if (tabParam === 'peer' || tabParam === 'org' || tabParam === 'reflect') {
      setTab(tabParam as ChatTab);
    }
    const qId = params.get('q');
    if (qId) {
      if (!tabParam) setTab('reflect');
      openQuestion(Number(qId));
    }
  }, [openQuestion]);

  const showSubmitSuccess = (p: SubmitSuccessPayload) => {
    setSuccessPayload({
      ...p,
      confirm: p.confirm ?? answerConfirmDefaults,
    });
  };

  const submitAnswer = async (answerData: unknown) => {
    try {
      const res = await apiPost<SubmitSuccessPayload>(`/questions/${activeQuestion.id}/answer`, { answerData });
      setActiveQuestion(null);
      showSubmitSuccess(res);
      loadAll();
    } catch (err) {
      showSubmitSuccess({
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: err instanceof ApiError ? err.message : 'Ошибка сохранения' },
      });
    }
  };

  const refreshExchangeThread = useCallback(async () => {
    if (!exchangeThread?.id) return;
    try {
      const res = await apiGet<{ question: ExchangeQuestion; limits?: Partial<ExchangeLimits> }>(
        `/exchange/${exchangeThread.id}`,
      );
      if (res.question) setExchangeThread(res.question);
      if (res.limits) setExchangeLimits(normalizeExchangeLimits(res.limits));
    } catch {
      /* keep previous thread snapshot */
    }
    setExchangeReloadKey(k => k + 1);
  }, [exchangeThread?.id]);

  useEffect(() => {
    if (activePanel !== id) {
      if (exchangeThread != null) setExchangeThread(null);
      setModal(null);
      return;
    }
    if (orgComposeOpen) {
      setModal(
        <ModalRoot activeModal="org-compose" onClose={() => setOrgComposeOpen(false)}>
          <OrgComposeModal
            onClose={() => setOrgComposeOpen(false)}
            onCreated={loadAll}
            onSent={() => showSubmitSuccess({ confirm: { ...DEFAULT_CONFIRM, titleTemplate: 'Сообщение отправлено' } })}
          />
        </ModalRoot>,
      );
      return;
    }
    if (orgThreadId) {
      setModal(
        <ModalRoot activeModal="org-thread" onClose={() => setOrgThreadId(null)}>
          <OrgThreadMessenger threadId={orgThreadId} onClose={() => setOrgThreadId(null)} onRefreshList={loadAll} />
        </ModalRoot>,
      );
      return;
    }
    if (showEveningFlow) {
      setModal(
        <ModalRoot activeModal="evening" onClose={() => setShowEveningFlow(false)}>
          <ModalPage id="evening" settlingHeight={100} onClose={() => setShowEveningFlow(false)}>
            <ModalPageHeader>Итоговая анкета</ModalPageHeader>
            <EveningDaySummaryFlow
              onClose={() => setShowEveningFlow(false)}
              onSubmitted={() => {
                setShowEveningFlow(false);
                setEveningCard(null);
                showSubmitSuccess({
                  confirm: {
                    ...DEFAULT_CONFIRM,
                    titleTemplate: 'Итоговая анкета сохранена',
                  },
                  xpAwarded: 15,
                  track: 'path',
                });
                loadAll();
              }}
            />
          </ModalPage>
        </ModalRoot>,
      );
    } else if (activeQuestion) {
      const isEveningSummary = isEveningDaySummaryQuestion(activeQuestion);
      const viewingOwnAnswer = !!myAnswer;
      setModal(
        <ModalRoot activeModal="answer" onClose={() => setActiveQuestion(null)}>
          <ModalPage id="answer" settlingHeight={100} onClose={() => setActiveQuestion(null)}>
            <ModalPageHeader>
              {viewingOwnAnswer
                ? 'Мой ответ'
                : (isEveningSummary ? 'Итоговая анкета' : activeQuestion.title)}
            </ModalPageHeader>
            {isEveningSummary && !viewingOwnAnswer ? (
              <EveningDaySummaryFlow
                onClose={() => setActiveQuestion(null)}
                onSubmitted={() => {
                  setActiveQuestion(null);
                  showSubmitSuccess({
                    confirm: {
                      ...DEFAULT_CONFIRM,
                      titleTemplate: 'Итоговая анкета сохранена',
                    },
                    xpAwarded: 15,
                    track: 'path',
                  });
                  loadAll();
                }}
              />
            ) : (
              <QuestionAnswerForm
                question={activeQuestion}
                options={questionOptions}
                dayEvents={dayEvents}
                afterBlocksEvents={afterBlocksEvents}
                lessonPickMeta={lessonPickMeta}
                myAnswer={myAnswer}
                onSubmit={submitAnswer}
              />
            )}
          </ModalPage>
        </ModalRoot>,
      );
    } else if (exchangeThread) {
      setModal(
        <ModalRoot activeModal="exchange-thread" onClose={() => setExchangeThread(null)}>
          <ExchangeThreadModal
            question={exchangeThread}
            myParticipantId={myParticipantId}
            limits={exchangeLimits}
            onClose={() => setExchangeThread(null)}
            onRefresh={() => { void refreshExchangeThread(); }}
            onSubmitSuccess={showSubmitSuccess}
          />
        </ModalRoot>,
      );
    } else {
      setModal(null);
    }
  }, [activeQuestion, exchangeThread, exchangeLimits, myParticipantId, questionOptions, myAnswer, setModal, loadAll, refreshExchangeThread, orgThreadId, orgComposeOpen, dayEvents, afterBlocksEvents, lessonPickMeta, activePanel, id, showEveningFlow]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  const unanswered = questions.filter(q => {
    if (q.publishStatus && q.publishStatus !== 'published') return false;
    if (!(q.status === 'active' || q.status === 'overdue')) return false;
    // Stub «Итоговая анкета по дню» never in the list: until 22:00 it must be
    // invisible; when open it appears only as the top PriorityAction (eveningCard).
    if (isEveningDaySummaryQuestion(q)) return false;
    return true;
  });
  const canAnswer = (status: string) => status === 'active' || status === 'overdue';
  const answeredToday = questions.filter(q => q.status === 'done' && q.answeredToday);
  const answeredEarlier = questions.filter(q => q.status === 'done' && !q.answeredToday);
  const myAnswers = questions.filter(q => q.status === 'done');
  // Previous-day / closed windows are not listed — new day does not show «Заморожено».
  const locked: typeof questions = [];
  const peerApprovedCount = exchange
    .filter(q => (q.moderationStatus || '').toLowerCase() === 'approved').length;

  const orgStatusLabel = (status: string) => {
    if (status === 'answered') return 'Отвечено';
    return 'Ждёт ответа';
  };

  const renderAnsweredCard = (q: any) => (
    <div
      key={q.id}
      className="rq-item m-card rq-done"
      style={{ marginBottom: 8, cursor: 'pointer' }}
      onClick={() => openQuestion(q.id)}
    >
      <div className="rq-tag">{q.reflectionLabel || q.block || q.type}</div>
      <div className="rq-q">{q.title}</div>
      {q.dayNumber != null && (
        <div className="rq-from">День {q.dayNumber}</div>
      )}
      {q.answerPreview && (
        <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4 }}>{q.answerPreview}</div>
      )}
      <div className="rq-btn" style={{ marginTop: 8 }}>Смотреть ответ</div>
    </div>
  );

  return (
    <Panel id={id}>
      <PanelHeader fixed>Вопросы</PanelHeader>
      <Group>
        <div className="time-sw" style={{ marginBottom: 12 }}>
          <button type="button" className={`time-btn ${tab === 'reflect' ? 'on' : ''}`} onClick={() => setTab('reflect')}>
            Рефлексия{unanswered.length > 0 ? ` · ${unanswered.length}` : ''}
          </button>
          <button type="button" className={`time-btn ${tab === 'myAnswers' ? 'on' : ''}`} onClick={() => setTab('myAnswers')}>
            Мои ответы{myAnswers.length > 0 ? ` · ${myAnswers.length}` : ''}
          </button>
          <button type="button" className={`time-btn ${tab === 'peer' ? 'on' : ''}`} onClick={() => setTab('peer')}>
            Обмен опытом{peerApprovedCount > 0 ? ` · ${peerApprovedCount}` : ''}
          </button>
          <button type="button" className={`time-btn ${tab === 'org' ? 'on' : ''}`} onClick={() => setTab('org')}>
            Организаторам
          </button>
        </div>

        {loading ? <Spinner /> : error ? (
          <>
            <div className="m-card" style={{ color: '#C53030' }}>{error}</div>
            <Button onClick={loadAll}>Повторить</Button>
          </>
        ) : tab === 'reflect' ? (
          <>
            {eveningCard && !showEveningFlow && (
              <PriorityAction
                tag={eveningCard.title || '✦ Завершение дня'}
                title="Итоговая анкета"
                subtitle={eveningCard.subtitle}
                buttonText="Заполнить →"
                onClick={() => setShowEveningFlow(true)}
              />
            )}
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
              Вопросы для размышления и фиксации своих находок. Архив ответов — во вкладке «Мои ответы».
            </div>
            {unanswered.length > 0 && (
              <>
                <div className="rq-hdr"><span className="rq-hdr-t">Не отвечено · {unanswered.length}</span></div>
                {unanswered.map(q => (
                  <div key={q.id} className="rq-item m-card" style={{ marginBottom: 8 }}>
                    <div className="rq-tag">{q.reflectionLabel || q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    <div className="rq-from" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                      <span>
                        {q.timeWindowLabel || (q.status === 'overdue'
                          ? 'Пропущена — ещё можно'
                          : q.status === 'pending'
                            ? 'Скоро откроется'
                            : 'Доступно')}
                      </span>
                      {(q.pathPointsPreview ?? q.points ?? 0) > 0 && (
                        <span>+{q.pathPointsPreview ?? q.points} 📍 Путь</span>
                      )}
                    </div>
                    {canAnswer(q.status) && (
                      <div className="rq-btn" onClick={() => openQuestion(q.id)}>Ответить</div>
                    )}
                  </div>
                ))}
              </>
            )}
            {locked.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 12 }}><span className="rq-hdr-t">Заморожено</span></div>
                {locked.map(q => (
                  <div key={q.id} className="rq-item m-card" style={{ marginBottom: 8, opacity: 0.5 }}>
                    <div className="rq-tag">{q.reflectionLabel || q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    <div className="rq-from">🔒 День закончился</div>
                  </div>
                ))}
              </>
            )}
            {unanswered.length === 0 && locked.length === 0 && (
              <EmptyState
                icon="💬"
                title={myAnswers.length > 0 ? 'Сейчас нет новых вопросов' : 'Нет активных вопросов'}
                subtitle={myAnswers.length > 0
                  ? 'Открытые вопросы появятся по расписанию. Перечитать ответы — во вкладке «Мои ответы».'
                  : 'Рефлексивные вопросы появятся по расписанию форума'}
              />
            )}
          </>
        ) : tab === 'myAnswers' ? (
          <>
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
              Архив ваших ответов на вопросы рефлексии. Откройте карточку, чтобы перечитать полный ответ.
            </div>
            {answeredToday.length > 0 && (
              <>
                <div className="rq-hdr"><span className="rq-hdr-t">Сегодня · {answeredToday.length}</span></div>
                {answeredToday.map(renderAnsweredCard)}
              </>
            )}
            {answeredEarlier.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: answeredToday.length > 0 ? 12 : 0 }}>
                  <span className="rq-hdr-t">Ранее · {answeredEarlier.length}</span>
                </div>
                {answeredEarlier.map(renderAnsweredCard)}
              </>
            )}
            {myAnswers.length === 0 && (
              <EmptyState
                icon="📝"
                title="Пока нет ответов"
                subtitle="Когда ответите на вопросы во вкладке «Рефлексия», они появятся здесь"
              />
            )}
          </>
        ) : tab === 'peer' ? (
          <ExchangePeerSection
            myParticipantId={myParticipantId}
            limits={exchangeLimits}
            reloadKey={exchangeReloadKey}
            onOpenThread={(q) => {
              setExchangeThread(q);
              void apiGet<{ question: ExchangeQuestion }>(`/exchange/${q.id}`)
                .then(res => { if (res.question) setExchangeThread(res.question); })
                .catch(() => { /* keep list snapshot */ });
            }}
            onSubmitted={(msg) => showSubmitSuccess({ confirm: { ...DEFAULT_CONFIRM, titleTemplate: msg }, xpAwarded: 0 })}
            onError={(msg) => showSubmitSuccess({ confirm: { ...DEFAULT_CONFIRM, titleTemplate: msg }, xpAwarded: 0 })}
          />
        ) : (
          <>
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
              Напишите нашим организаторам: вопрос по программе, предложение или обратная связь — дирекция ответит лично.
            </div>
            {orgThreads.length > 0 ? (
              <>
                <div className="rq-hdr"><span className="rq-hdr-t">Твои переписки · {orgThreads.length}</span></div>
                {orgThreads.map(thread => (
                  <div
                    key={thread.id}
                    className="m-card"
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => setOrgThreadId(thread.id)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{thread.subject || 'Обращение'}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{thread.lastMessagePreview || '—'}</div>
                    <div style={{ fontSize: 11, marginTop: 6, color: thread.status === 'answered' ? '#2F855A' : '#B8621A' }}>
                      {orgStatusLabel(thread.status)}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <EmptyState icon="✉️" title="Пока нет обращений" subtitle="Напишите, если нужна помощь организаторов" />
            )}
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <Button size="l" stretched onClick={() => setOrgComposeOpen(true)}>+ Написать организаторам</Button>
            </div>
            <RosmolCareServiceCard />
          </>
        )}
      </Group>

      <AnswerSuccessOverlay payload={successPayload} onDone={() => setSuccessPayload(null)} />
    </Panel>
  );
};
