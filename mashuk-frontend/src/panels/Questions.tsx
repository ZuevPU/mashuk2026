import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Textarea, Button, ModalRoot, ModalPage, ModalPageHeader, Snackbar } from '@vkontakte/vkui';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { useAppModal } from '../App';
import { QuestionAnswerForm } from '../components/questions/QuestionAnswerForm';
import { EmptyState } from '../components/EmptyState';

type ChatTab = 'reflect' | 'peer' | 'org';

const ExchangeReplyModal = ({
  replyTo,
  parentAnswerId,
  onClose,
  onSuccess,
  setSnackbar,
}: {
  replyTo: number | null;
  parentAnswerId: number | null;
  onClose: () => void;
  onSuccess: () => void;
  setSnackbar: (msg: string) => void;
}) => {
  const [replyText, setReplyText] = useState('');

  const submitExchangeAnswer = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      const res = await apiPost<{ xpAwarded?: number }>(`/exchange/${replyTo}/answer`, {
        text: replyText,
        parentAnswerId: parentAnswerId || undefined,
      });
      setSnackbar(res.xpAwarded ? `Ответ опубликован · +${res.xpAwarded} Опыт` : 'Ответ опубликован');
      onSuccess();
      onClose();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
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

export const QuestionsPanel: React.FC<{ id: string; onActivity?: () => void }> = ({ id, onActivity }) => {
  const { setModal } = useAppModal();
  const [tab, setTab] = useState<ChatTab>('reflect');
  const [questions, setQuestions] = useState<any[]>([]);
  const [exchange, setExchange] = useState<any[]>([]);
  const [myQuestions, setMyQuestions] = useState<any[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [exchangeAudience, setExchangeAudience] = useState<'all' | 'direction'>('all');
  const [orgMessage, setOrgMessage] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [questionOptions, setQuestionOptions] = useState<any[]>([]);
  const [dayEvents, setDayEvents] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

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
        setExchange(ex.questions || []);
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
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось открыть вопрос');
    }
  }, []);

  useEffect(() => {
    const qId = getHashSearchParams().get('q');
    if (qId) {
      setTab('reflect');
      openQuestion(Number(qId));
    }
  }, [openQuestion]);

  const submitAnswer = async (answerData: unknown) => {
    try {
      const res = await apiPost<{ xpAwarded?: number; track?: string }>(`/questions/${activeQuestion.id}/answer`, { answerData });
      setActiveQuestion(null);
      const xp = res.xpAwarded;
      setSnackbar(xp ? `Ответ сохранён · +${xp} ${res.track === 'experience' ? 'Опыт' : 'Путь'}` : 'Ответ сохранён');
      loadAll();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    }
  };

  const submitExchange = async () => {
    if (!newQuestion.trim()) return;
    try {
      await apiPost('/exchange', { text: newQuestion, audience: exchangeAudience });
      setNewQuestion('');
      setExchangeAudience('all');
      setSnackbar('Вопрос отправлен на модерацию');
      loadAll();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
    }
  };

  const submitOrgMessage = async () => {
    if (!orgMessage.trim()) return;
    try {
      await apiPost('/org/threads', { subject: 'Обращение', text: orgMessage });
      setOrgMessage('');
      setSnackbar('Сообщение отправлено организаторам');
      loadAll();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
    }
  };

  useEffect(() => {
    if (activeQuestion) {
      setModal(
        <ModalRoot activeModal="answer" onClose={() => setActiveQuestion(null)}>
          <ModalPage id="answer" onClose={() => setActiveQuestion(null)}>
            <ModalPageHeader>{activeQuestion.title}</ModalPageHeader>
            <QuestionAnswerForm
              question={activeQuestion}
              options={questionOptions}
              dayEvents={dayEvents}
              onSubmit={submitAnswer}
            />
          </ModalPage>
        </ModalRoot>
      );
    } else if (replyTo) {
      setModal(
        <ModalRoot activeModal="exchange-reply" onClose={() => { setReplyTo(null); setReplyParentId(null); }}>
          <ExchangeReplyModal
            replyTo={replyTo}
            parentAnswerId={replyParentId}
            onClose={() => { setReplyTo(null); setReplyParentId(null); }}
            onSuccess={loadAll}
            setSnackbar={setSnackbar}
          />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [activeQuestion, replyTo, replyParentId, questionOptions, setModal, loadAll]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  const unanswered = questions.filter(q => q.status === 'available' || q.status === 'overdue');
  const answered = questions.filter(q => q.status === 'done' || q.status === 'answered');
  const locked = questions.filter(q => q.status === 'locked');
  const peerApproved = exchange.filter(q => q.moderationStatus === 'approved' || !q.moderationStatus);

  return (
    <Panel id={id}>
      <PanelHeader>Общение</PanelHeader>
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
              Рефлексивные вопросы форума. Ответы влияют на точки осмысления и базу знаний.
            </div>
            {unanswered.length > 0 && (
              <>
                <div className="rq-hdr"><span className="rq-hdr-t">Не отвечено</span></div>
                {unanswered.map(q => (
                  <div key={q.id} className="rq-item m-card" style={{ marginBottom: 8 }}>
                    <div className="rq-tag">{q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    <div className="rq-from" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{q.status === 'overdue' ? 'Пропущена — ещё можно' : 'Доступно'}</span>
                      {typeof q.points === 'number' && <span>+{q.points} 📍</span>}
                    </div>
                    {q.closeTime && (
                      <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                        До {new Date(q.closeTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    <div className="rq-btn" onClick={() => openQuestion(q.id)}>Ответить →</div>
                  </div>
                ))}
              </>
            )}
            {locked.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 12 }}><span className="rq-hdr-t">Заморожено</span></div>
                {locked.map(q => (
                  <div key={q.id} className="rq-item m-card" style={{ marginBottom: 8, opacity: 0.5 }}>
                    <div className="rq-tag">{q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    <div className="rq-from">🔒 День закончился</div>
                  </div>
                ))}
              </>
            )}
            {answered.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 12 }}><span className="rq-hdr-t">Отвечено</span></div>
                {answered.map(q => (
                  <div key={q.id} className="rq-item m-card rq-done" style={{ marginBottom: 8, opacity: 0.55 }}>
                    <div className="rq-tag">{q.block || q.type}</div>
                    <div className="rq-q">{q.title}</div>
                    <div className="rq-from">✓ Отвечено</div>
                  </div>
                ))}
              </>
            )}
            {questions.length === 0 && (
              <EmptyState icon="💬" title="Нет активных вопросов" subtitle="Рефлексивные вопросы появятся по расписанию форума" />
            )}
          </>
        ) : tab === 'peer' ? (
          <>
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Обмен опытом между участниками. Отвечай на вопросы других и задавай свои.
            </div>
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
                    <div className="peer-meta">{q.authorName} · {q.answers?.length ?? 0} ответ(ов)</div>
                  </div>
                </div>
                {q.answers?.map((a: any) => (
                  <div key={a.id} className="peer-answer" style={{ marginLeft: a.parentAnswerId ? 16 : 0 }}>
                    <div style={{ fontSize: 10, color: '#888' }}>
                      {a.authorName}{a.parentAnswerId ? ' · ответ на комментарий' : ''}
                    </div>
                    <div style={{ fontSize: 12 }}>{a.text}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        size="s"
                        mode="secondary"
                        onClick={async () => {
                          try {
                            await apiPost(`/exchange/answers/${a.id}/react`, { type: 'like' });
                            setSnackbar('👍');
                            loadAll();
                          } catch (err) {
                            setSnackbar(err instanceof ApiError ? err.message : 'Ошибка');
                          }
                        }}
                      >
                        👍 {a.reactions?.likes ?? 0}
                      </Button>
                      <Button
                        size="s"
                        mode="secondary"
                        onClick={async () => {
                          try {
                            await apiPost(`/exchange/answers/${a.id}/react`, { type: 'discuss' });
                            setSnackbar('Хочу обсудить');
                            loadAll();
                          } catch (err) {
                            setSnackbar(err instanceof ApiError ? err.message : 'Ошибка');
                          }
                        }}
                      >
                        Хочу обсудить · {a.reactions?.discuss ?? 0}
                      </Button>
                      <Button size="s" mode="tertiary" onClick={() => {
                        if (a.parentAnswerId) {
                          setSnackbar('Можно ответить только на ответ первого уровня');
                          return;
                        }
                        setReplyParentId(a.id);
                        setReplyTo(q.id);
                      }}>Ответить</Button>
                    </div>
                  </div>
                ))}
                <Button size="s" style={{ marginTop: 8 }} onClick={() => { setReplyParentId(null); setReplyTo(q.id); }}>Ответить на вопрос</Button>
              </div>
            ))}
            {myQuestions.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 16 }}>
                  <span className="rq-hdr-t">Мои вопросы</span>
                </div>
                {myQuestions.map(q => (
                  <div key={q.id} className="myq2 m-card">
                    <div>{q.text}</div>
                    <div className="peer-meta">{q.moderationStatus === 'pending' ? 'На модерации' : `${q.answers?.length ?? 0} ответ(ов)`}</div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <div className="m-card" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Напиши организаторам — диалог сохранится в переписке.
            </div>
            <div className="m-card">
              <Textarea value={orgMessage} onChange={e => setOrgMessage(e.target.value)} placeholder="Ваше сообщение организаторам..." />
              <Button style={{ marginTop: 8 }} onClick={submitOrgMessage}>Отправить</Button>
            </div>
            {orgThreads.length > 0 ? orgThreads.map(thread => (
              <div key={thread.id} className="m-card" style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: thread.status === 'answered' ? '#2F855A' : '#B8621A' }}>
                  {thread.subject || 'Обращение'} · {thread.status === 'answered' ? 'есть ответ' : 'ожидает ответа'}
                </div>
                {(thread.messages || []).map((m: any) => (
                  <div key={m.id} style={{ marginTop: 8, padding: 8, background: m.senderType === 'admin' ? '#F0FFF4' : '#F7F7F7', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#888' }}>
                      {m.senderType === 'admin' ? 'Организаторы' : 'Вы'} · {m.createdAt ? new Date(m.createdAt).toLocaleString('ru-RU') : ''}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{m.text}</div>
                  </div>
                ))}
              </div>
            )) : (
              <EmptyState icon="✉️" title="Пока нет обращений" subtitle="Напишите, если нужна помощь организаторов" />
            )}
          </>
        )}
      </Group>

      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};
