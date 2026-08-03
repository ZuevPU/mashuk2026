import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Textarea, Button, ModalRoot, ModalPage, ModalPageHeader } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { useAppModal } from '../App';
import { QuestionAnswerForm } from '../components/questions/QuestionAnswerForm';
import { EveningDaySummaryFlow } from '../components/questions/EveningDaySummaryFlow';
import { EmptyState } from '../components/EmptyState';
import { AnswerSuccessOverlay, type SubmitSuccessPayload, type AnswerConfirmationConfig } from '../components/questions/AnswerSuccessOverlay';
import { RosmolCareServiceCard } from '../components/org/RosmolCareServiceCard';
import { isEveningDaySummaryQuestion } from '../utils/eveningSummaryQuestion';

type ChatTab = 'reflect' | 'peer' | 'org';

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

function exchangeAnswerCountLabel(q: { answerCount?: number; answers?: ExchangeAnswerRow[] }): string {
  const top = q.answerCount ?? exchangeTopLevelAnswers(q.answers).length;
  const replies = (q.answers || []).filter(a => a.parentAnswerId).length;
  if (top === 0 && replies === 0) return '0 ответов';
  let s = `${top} ${top === 1 ? 'ответ' : top < 5 ? 'ответа' : 'ответов'}`;
  if (replies > 0) s += ` · ${replies} в обсуждении`;
  return s;
}

function userLiked(reactions: ExchangeAnswerRow['reactions'], myId: number | null): boolean {
  if (!myId || !reactions?.likedBy) return false;
  return reactions.likedBy.includes(myId);
}

function userDiscussed(reactions: ExchangeAnswerRow['reactions'], myId: number | null): boolean {
  if (!myId || !reactions?.discussBy) return false;
  return reactions.discussBy.includes(myId);
}

const ExchangeReplyModal = ({
  replyTo,
  parentAnswerId,
  onClose,
  onSuccess,
  onSubmitSuccess,
}: {
  replyTo: number | null;
  parentAnswerId: number | null;
  onClose: () => void;
  onSuccess: () => void;
  onSubmitSuccess: (p: SubmitSuccessPayload) => void;
}) => {
  const [replyText, setReplyText] = useState('');

  const submitExchangeAnswer = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      const res = await apiPost<SubmitSuccessPayload>(`/exchange/${replyTo}/answer`, {
        text: replyText,
        parentAnswerId: parentAnswerId || undefined,
      });
      onSubmitSuccess({
        xpAwarded: res.xpAwarded,
        track: res.track,
        newMedals: res.newMedals,
        confirm: res.confirm ?? DEFAULT_CONFIRM,
      });
      onSuccess();
      onClose();
    } catch (err) {
      onSubmitSuccess({
        xpAwarded: 0,
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: err instanceof ApiError ? err.message : 'Ошибка отправки' },
      });
    }
  };

  return (
    <ModalPage id="exchange-reply" onClose={onClose}>
      <ModalPageHeader>{parentAnswerId ? 'Ответ на комментарий' : 'Ответ на вопрос'}</ModalPageHeader>
      <Group>
        <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ваш ответ..." />
        <Button size="l" stretched onClick={submitExchangeAnswer} style={{ marginTop: 12 }}>Отправить</Button>
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
  const [myQuestions, setMyQuestions] = useState<any[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [answerConfirmDefaults, setAnswerConfirmDefaults] = useState<AnswerConfirmationConfig>(DEFAULT_CONFIRM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [exchangeAudience, setExchangeAudience] = useState<'all' | 'direction'>('all');
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [questionOptions, setQuestionOptions] = useState<any[]>([]);
  const [dayEvents, setDayEvents] = useState<any[]>([]);
  const [myAnswer, setMyAnswer] = useState<{ preview?: string; createdAt?: string | null } | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [successPayload, setSuccessPayload] = useState<SubmitSuccessPayload | null>(null);
  const [orgThreadId, setOrgThreadId] = useState<number | null>(null);
  const [orgComposeOpen, setOrgComposeOpen] = useState(false);
  const [myParticipantId, setMyParticipantId] = useState<number | null>(null);

  const loadAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<any>('/questions'),
      apiGet<any>('/exchange'),
      apiGet<any>('/org/threads').catch(() => ({ threads: [] })),
    ])
      .then(([q, ex, org]) => {
        setQuestions(q.questions || []);
        if (q.answerConfirm) setAnswerConfirmDefaults(q.answerConfirm);
        setExchange(ex.questions || []);
        if (typeof ex.myParticipantId === 'number') setMyParticipantId(ex.myParticipantId);
        setMyQuestions((ex.questions || []).filter((item: any) => item.isMine));
        setOrgThreads(org.threads || []);
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
      setMyAnswer(detail.myAnswer ?? null);
    } catch (err) {
      setSuccessPayload({
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: err instanceof ApiError ? err.message : 'Не удалось открыть вопрос' },
      });
    }
  }, []);

  useEffect(() => {
    const qId = getHashSearchParams().get('q');
    if (qId) {
      setTab('reflect');
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

  const submitExchange = async () => {
    if (!newQuestion.trim()) return;
    try {
      await apiPost('/exchange', { text: newQuestion, audience: exchangeAudience });
      setNewQuestion('');
      setExchangeAudience('all');
      showSubmitSuccess({ confirm: { ...DEFAULT_CONFIRM, titleTemplate: 'Вопрос отправлен на модерацию' }, xpAwarded: 0 });
      loadAll();
    } catch (err) {
      showSubmitSuccess({
        confirm: { ...DEFAULT_CONFIRM, titleTemplate: err instanceof ApiError ? err.message : 'Ошибка отправки' },
      });
    }
  };

  useEffect(() => {
    if (activePanel !== id) return;
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
    if (activeQuestion) {
      const isEveningSummary = isEveningDaySummaryQuestion(activeQuestion);
      setModal(
        <ModalRoot activeModal="answer" onClose={() => setActiveQuestion(null)}>
          <ModalPage id="answer" settlingHeight={100} onClose={() => setActiveQuestion(null)}>
            <ModalPageHeader>
              {isEveningSummary ? 'Итоговая анкета' : activeQuestion.title}
            </ModalPageHeader>
            {isEveningSummary ? (
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
                myAnswer={myAnswer}
                onSubmit={submitAnswer}
              />
            )}
          </ModalPage>
        </ModalRoot>,
      );
    } else if (replyTo) {
      setModal(
        <ModalRoot activeModal="exchange-reply" onClose={() => { setReplyTo(null); setReplyParentId(null); }}>
          <ExchangeReplyModal
            replyTo={replyTo}
            parentAnswerId={replyParentId}
            onClose={() => { setReplyTo(null); setReplyParentId(null); }}
            onSuccess={loadAll}
            onSubmitSuccess={showSubmitSuccess}
          />
        </ModalRoot>,
      );
    } else {
      setModal(null);
    }
  }, [activeQuestion, replyTo, replyParentId, questionOptions, myAnswer, setModal, loadAll, orgThreadId, orgComposeOpen, dayEvents, activePanel, id]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  const unanswered = questions.filter(q =>
    q.status === 'active' || q.status === 'overdue',
  );
  const canAnswer = (status: string) => status === 'active' || status === 'overdue';
  const answeredToday = questions.filter(q => q.status === 'done' && q.answeredToday);
  const answeredEarlier = questions.filter(q => q.status === 'done' && !q.answeredToday);
  const locked = questions.filter(q => q.status === 'locked');
  const peerApproved = exchange.filter(q => (q.moderationStatus || '').toLowerCase() === 'approved');

  const orgStatusLabel = (status: string) => {
    if (status === 'answered') return 'Отвечено';
    return 'Ждёт ответа';
  };

  return (
    <Panel id={id}>
      <PanelHeader fixed>Вопросы</PanelHeader>
      <Group>
        <div className="time-sw" style={{ marginBottom: 12 }}>
          <button type="button" className={`time-btn ${tab === 'reflect' ? 'on' : ''}`} onClick={() => setTab('reflect')}>
            Рефлексия{unanswered.length > 0 ? ` · ${unanswered.length}` : ''}
          </button>
          <button type="button" className={`time-btn ${tab === 'peer' ? 'on' : ''}`} onClick={() => setTab('peer')}>
            Обмен опытом{peerApproved.length > 0 ? ` · ${peerApproved.length}` : ''}
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
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Вопросы для размышления и фиксации своих находок. Каждый ответ — ещё один шаг в вашем Пути
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
                      <span>+{q.pathPointsPreview ?? q.points ?? 5} 📍 Путь</span>
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
            {answeredToday.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 12 }}><span className="rq-hdr-t">Отвечено сегодня · {answeredToday.length}</span></div>
                {answeredToday.map(q => (
                  <div
                    key={q.id}
                    className="rq-item m-card rq-done"
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => openQuestion(q.id)}
                  >
                    <div className="rq-tag">{q.reflectionLabel || q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    {q.answerPreview && (
                      <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4 }}>{q.answerPreview}</div>
                    )}
                  </div>
                ))}
              </>
            )}
            {answeredEarlier.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 12 }}><span className="rq-hdr-t">Мои ответы · {answeredEarlier.length}</span></div>
                {answeredEarlier.map(q => (
                  <div
                    key={q.id}
                    className="rq-item m-card rq-done"
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => openQuestion(q.id)}
                  >
                    <div className="rq-tag">{q.reflectionLabel || q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    {q.answerPreview && (
                      <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4 }}>{q.answerPreview}</div>
                    )}
                  </div>
                ))}
              </>
            )}
            {questions.filter(q => q.status === 'done').length === 0 && unanswered.length === 0 && locked.length === 0 && (
              <EmptyState icon="💬" title="Нет активных вопросов" subtitle="Рефлексивные вопросы появятся по расписанию форума" />
            )}
          </>
        ) : tab === 'peer' ? (
          <>
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.45 }}>
              Делитесь своим опытом, читайте ответы других участников и продолжайте обсуждение.
              <br />
              👍 и «Интересно обсудить» — это реакции, а для комментария используйте кнопку «Ответить».
            </div>
            {myQuestions.length > 0 && (
              <>
                <div className="rq-hdr">
                  <span className="rq-hdr-t">Мои вопросы · {myQuestions.length}</span>
                </div>
                {myQuestions.map(q => (
                  <div key={q.id} className="myq2 m-card" style={{ marginBottom: 8 }}>
                    <div>{q.text}</div>
                    <div className="peer-meta">
                      {q.moderationStatus === 'pending'
                        ? 'На модерации — появится после одобления'
                        : q.moderationStatus === 'rejected'
                          ? 'Не прошёл модерацию'
                          : exchangeAnswerCountLabel(q)}
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="ask-btn m-card">
              <Textarea value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Задайте вопрос участникам..." />
              <div className="time-sw" style={{ marginTop: 8, marginBottom: 0 }}>
                <button
                  type="button"
                  className={`time-btn ${exchangeAudience === 'all' ? 'on' : ''}`}
                  onClick={() => setExchangeAudience('all')}
                >
                  Всем участникам
                </button>
                <button
                  type="button"
                  className={`time-btn ${exchangeAudience === 'direction' ? 'on' : ''}`}
                  onClick={() => setExchangeAudience('direction')}
                >
                  Своему направлению
                </button>
              </div>
              <Button style={{ marginTop: 8 }} onClick={submitExchange}>+ Задать новый вопрос</Button>
            </div>
            {peerApproved.length > 0 && (
              <div className="rq-hdr" style={{ marginTop: 12 }}>
                <span className="rq-hdr-t">Вопросы участников · {peerApproved.length}</span>
              </div>
            )}
            {peerApproved.map(q => (
              <div key={q.id} className="peer-item m-card" style={{ marginTop: 8 }}>
                <div className="peer-wrap">
                  <div className="peer-av">{(q.authorName || '?').slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div className="peer-dir">
                      {q.audience === 'direction' || q.audience === 'my_direction'
                        ? 'Своему направлению'
                        : 'Всем участникам'}
                    </div>
                    <div className="peer-q">{q.text}</div>
                    <div className="peer-meta">{q.authorName} · {exchangeAnswerCountLabel(q)}</div>
                  </div>
                </div>
                {exchangeTopLevelAnswers(q.answers).map((a: ExchangeAnswerRow) => (
                  <div key={a.id}>
                    <div className="peer-answer">
                      <div style={{ fontSize: 10, color: '#888' }}>{a.authorName}</div>
                      <div style={{ fontSize: 12 }}>{a.text}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button
                          size="s"
                          mode={userLiked(a.reactions, myParticipantId) ? 'primary' : 'secondary'}
                          disabled={userLiked(a.reactions, myParticipantId)}
                          onClick={async () => {
                            try {
                              await apiPost(`/exchange/answers/${a.id}/react`, { type: 'like' });
                              loadAll();
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          👍 {a.reactions?.likes ?? 0}
                        </Button>
                        <Button
                          size="s"
                          mode={userDiscussed(a.reactions, myParticipantId) ? 'primary' : 'secondary'}
                          disabled={userDiscussed(a.reactions, myParticipantId)}
                          onClick={async () => {
                            try {
                              await apiPost(`/exchange/answers/${a.id}/react`, { type: 'discuss' });
                              loadAll();
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          Интересно обсудить · {a.reactions?.discuss ?? 0}
                        </Button>
                        <Button size="s" mode="tertiary" onClick={() => {
                          setReplyParentId(a.id);
                          setReplyTo(q.id);
                        }}>Ответить</Button>
                      </div>
                    </div>
                    {exchangeRepliesTo(a.id, q.answers).map((r: ExchangeAnswerRow) => (
                      <div key={r.id} className="peer-answer" style={{ marginLeft: 16, marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: '#888' }}>{r.authorName} · уточнение</div>
                        <div style={{ fontSize: 12 }}>{r.text}</div>
                      </div>
                    ))}
                  </div>
                ))}
                <Button size="s" style={{ marginTop: 8 }} onClick={() => { setReplyParentId(null); setReplyTo(q.id); }}>Ответить на вопрос</Button>
              </div>
            ))}
            {peerApproved.length === 0 && myQuestions.length === 0 && (
              <EmptyState icon="🤝" title="Пока нет вопросов" subtitle="Задайте первый вопрос участникам или дождитесь публикации после модерации" />
            )}
          </>
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
