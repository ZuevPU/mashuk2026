import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Textarea, Button, ModalRoot, ModalPage, ModalPageHeader, Snackbar } from '@vkontakte/vkui';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { useAppModal } from '../App';
import { QuestionAnswerForm } from '../components/questions/QuestionAnswerForm';
import { EmptyState } from '../components/EmptyState';

const ExchangeReplyModal = ({ 
  replyTo, 
  onClose, 
  onSuccess,
  setSnackbar
}: { 
  replyTo: number | null; 
  onClose: () => void; 
  onSuccess: () => void;
  setSnackbar: (msg: string) => void;
}) => {
  const [replyText, setReplyText] = useState('');

  const submitExchangeAnswer = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      await apiPost(`/exchange/${replyTo}/answer`, { text: replyText });
      setSnackbar('Ответ опубликован');
      onSuccess();
      onClose();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
    }
  };

  return (
    <ModalPage id="exchange-reply" onClose={onClose}>
      <ModalPageHeader>Ответ на вопрос</ModalPageHeader>
      <Group>
        <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ваш ответ..." />
        <Button size="l" stretched onClick={submitExchangeAnswer} style={{ marginTop: 12 }}>Отправить</Button>
      </Group>
    </ModalPage>
  );
};

export const QuestionsPanel: React.FC<{ id: string; onActivity?: () => void }> = ({ id, onActivity }) => {
  const { setModal } = useAppModal();
  const [questions, setQuestions] = useState<any[]>([]);
  const [exchange, setExchange] = useState<any[]>([]);
  const [myQuestions, setMyQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [orgMessage, setOrgMessage] = useState('');
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [questionOptions, setQuestionOptions] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<any>('/questions'),
      apiGet<any>('/exchange'),
    ])
      .then(([q, ex]) => {
        setQuestions(q.questions || []);
        setExchange(ex.questions || []);
        setMyQuestions((ex.questions || []).filter((item: any) => item.isMine));
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
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось открыть вопрос');
    }
  }, []);

  useEffect(() => {
    const qId = getHashSearchParams().get('q');
    if (qId) openQuestion(Number(qId));
  }, [openQuestion]);

  const submitAnswer = async (answerData: unknown) => {
    try {
      await apiPost(`/questions/${activeQuestion.id}/answer`, { answerData });
      setActiveQuestion(null);
      setSnackbar('Ответ сохранён');
      loadAll();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    }
  };

  const submitExchange = async () => {
    if (!newQuestion.trim()) return;
    try {
      await apiPost('/exchange', { text: newQuestion, audience: 'all' });
      setNewQuestion('');
      setSnackbar('Вопрос отправлен на модерацию');
      loadAll();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
    }
  };

  const submitOrgMessage = async () => {
    if (!orgMessage.trim()) return;
    try {
      await apiPost('/piggybank/quick', { tag: 'организаторам', text: orgMessage, source: 'собственные размышления' });
      setOrgMessage('');
      setShowOrgForm(false);
      setSnackbar('Сообщение отправлено организаторам');
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
            <QuestionAnswerForm question={activeQuestion} options={questionOptions} onSubmit={submitAnswer} />
          </ModalPage>
        </ModalRoot>
      );
    } else if (replyTo) {
      setModal(
        <ModalRoot activeModal="exchange-reply" onClose={() => setReplyTo(null)}>
          <ExchangeReplyModal 
            replyTo={replyTo} 
            onClose={() => setReplyTo(null)} 
            onSuccess={loadAll}
            setSnackbar={setSnackbar}
          />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [activeQuestion, replyTo, questionOptions, setModal]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  const availableCount = questions.filter(q => q.status === 'available').length;

  return (
    <Panel id={id}>
      <PanelHeader>Общение</PanelHeader>
      <Group>
        {loading ? <Spinner /> : error ? (
          <>
            <div className="m-card" style={{ color: '#C53030' }}>{error}</div>
            <Button onClick={loadAll}>Повторить</Button>
          </>
        ) : (
          <>
            <div className="rq-hdr">
              <span className="rq-hdr-t">Рефлексивные вопросы</span>
              {availableCount > 0 && <span className="rq-badge">{availableCount}</span>}
            </div>
            {questions.length === 0 ? (
              <EmptyState icon="💬" title="Нет активных вопросов" subtitle="Рефлексивные вопросы появятся по расписанию форума" />
            ) : questions.map(q => (
              <div key={q.id} className={`rq-item m-card rq-done ${q.status === 'available' ? '' : 'rq-done'}`} style={{ marginBottom: 8, opacity: q.status === 'done' ? 0.55 : 1 }}>
                <div className="rq-tag">{q.block || q.type}</div>
                <div className="rq-q">{q.title}</div>
                <div className="rq-from">{q.status === 'done' ? '✓ Отвечено' : q.status}</div>
                {q.status === 'available' && (
                  <div className="rq-btn" onClick={() => openQuestion(q.id)}>Ответить →</div>
                )}
              </div>
            ))}

            <div className="rq-hdr" style={{ marginTop: 16 }}>
              <span className="rq-hdr-t">Обмен опытом</span>
            </div>
            <div className="ask-btn m-card">
              <Textarea value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Задайте вопрос участникам..." />
              <Button style={{ marginTop: 8 }} onClick={submitExchange}>Отправить</Button>
            </div>
            {exchange.filter(q => q.moderationStatus === 'approved' || !q.moderationStatus).map(q => (
              <div key={q.id} className="peer-item m-card" style={{ marginTop: 8 }}>
                <div className="peer-wrap">
                  <div className="peer-av">{(q.authorName || '?').slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div className="peer-dir">{q.audience === 'all' ? 'Всем участникам' : 'Моему направлению'}</div>
                    <div className="peer-q">{q.text}</div>
                    <div className="peer-meta">{q.authorName} · {q.answers?.length ?? 0} ответ(ов)</div>
                  </div>
                </div>
                {q.answers?.map((a: any) => (
                  <div key={a.id} className="peer-answer">
                    <div style={{ fontSize: 10, color: '#888' }}>{a.authorName}</div>
                    <div style={{ fontSize: 12 }}>{a.text}</div>
                  </div>
                ))}
                <Button size="s" style={{ marginTop: 8 }} onClick={() => setReplyTo(q.id)}>Ответить</Button>
              </div>
            ))}

            {myQuestions.length > 0 && (
              <>
                <div className="rq-hdr" style={{ marginTop: 16 }}>
                  <span className="rq-hdr-t">Мой вопрос</span>
                </div>
                {myQuestions.map(q => (
                  <div key={q.id} className="myq2 m-card">
                    <div>{q.text}</div>
                    <div className="peer-meta">{q.moderationStatus === 'pending' ? 'На модерации' : `${q.answers?.length ?? 0} ответ(ов)`}</div>
                  </div>
                ))}
              </>
            )}

            {!showOrgForm ? (
              <div className="org-btn" onClick={() => setShowOrgForm(true)}>✉️ Написать организаторам</div>
            ) : (
              <div className="m-card" style={{ marginTop: 12 }}>
                <Textarea value={orgMessage} onChange={e => setOrgMessage(e.target.value)} placeholder="Ваше сообщение организаторам..." />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button onClick={submitOrgMessage}>Отправить</Button>
                  <Button mode="secondary" onClick={() => setShowOrgForm(false)}>Отмена</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Group>

      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};
