import { useState, useEffect, useCallback } from 'react';

import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar } from '@vkontakte/vkui';

import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';

import { uploadTaskPhoto } from '../utils/uploadPhoto';

import { EmptyState } from '../components/EmptyState';



const STATUS_LABEL: Record<string, string> = {

  soon: '⚪ Скоро',

  available: '🔵 Доступно',

  pending: '🟡 На проверке',

  done: '🟢 Выполнено',

  rejected: '🔴 Не принято',

};



export const TasksPanel: React.FC<{ id: string }> = ({ id }) => {

  const [categoryFilter, setCategoryFilter] = useState('');
  const [filter, setFilter] = useState('all');

  const [data, setData] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [submitTaskId, setSubmitTaskId] = useState<number | null>(null);

  const [submitTaskMeta, setSubmitTaskMeta] = useState<any>(null);

  const [answerText, setAnswerText] = useState('');

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [snackbar, setSnackbar] = useState<string | null>(null);



  const openSubmit = useCallback((task: any) => {

    setSubmitTaskId(task.id);

    setSubmitTaskMeta(task);

    setAnswerText('');

    setPhotoUrl(null);

  }, []);



  const load = useCallback(() => {

    setLoading(true);

    setError(null);

    apiGet<any>(`/tasks?filter=${filter}`)

      .then(setData)

      .catch((err) => {

        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить задания');

      })

      .finally(() => setLoading(false));

  }, [filter]);



  useEffect(() => { load(); }, [load]);



  useEffect(() => {

    const taskId = getHashSearchParams().get('task');

    if (!taskId || !data?.tasks) return;

    const task = data.tasks.find((t: { id: number }) => String(t.id) === taskId);

    if (task && (task.status === 'available' || task.canResubmit)) {

      openSubmit(task);

    }

  }, [data, openSubmit]);



  const handlePhoto = async () => {

    try {

      const url = await uploadTaskPhoto();

      if (url) setPhotoUrl(url);

    } catch {

      setSnackbar('Не удалось загрузить фото');

    }

  };



  const needsText = submitTaskMeta?.answerType !== 'photo';

  const needsPhoto = submitTaskMeta?.answerType === 'photo' || submitTaskMeta?.answerType === 'text_and_photo';



  const handleSubmit = async () => {

    if (!submitTaskId) return;

    if (needsText && !answerText.trim()) return;

    if (needsPhoto && submitTaskMeta?.answerType === 'photo' && !photoUrl) return;

    try {

      await apiPost(`/tasks/${submitTaskId}/submit`, { answerText, photoUrl });

      setSubmitTaskId(null);

      setSnackbar('Задание отправлено');

      load();

    } catch (err) {

      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');

    }

  };



  const categories = [...new Set((data?.tasks ?? []).map((t: { category?: string }) => t.category).filter(Boolean))] as string[];
  const filteredTasks = (data?.tasks ?? []).filter((t: { category?: string }) =>
    !categoryFilter || t.category === categoryFilter,
  );
  const doneCount = (data?.tasks ?? []).filter((t: { status: string }) => t.status === 'done').length;
  const totalCount = data?.tasks?.length ?? 0;

  return (
    <Panel id={id}>
      <PanelHeader>Задания</PanelHeader>
      <Group>
        {loading ? <Spinner /> : error ? (

          <>

            <div className="m-card" style={{ color: '#C53030' }}>{error}</div>

            <Button onClick={load}>Повторить</Button>

          </>

        ) : (

          <>
            <div className="tasks-hdr">
              <span className="tasks-hdr-t">День {data?.dayNumber ?? 1} · {doneCount} из {totalCount}</span>
              <span className="tasks-hdr-b">+{data?.progress?.pointsToday ?? 0}⚡ сегодня</span>
            </div>
            {data?.kbLocked && (
              <div className="kb-banner">🔓 Пройдите точки осмысления, чтобы открыть базу знаний</div>
            )}
            <div className="pb-w">

              <div className="pb-r">

                <span className="pb-t">Прогресс дня</span>

                <span className="pb-c">{data?.progress?.percent ?? 0}%</span>

              </div>

              <div className="pb-tr"><div className="pb-fi" style={{ width: `${data?.progress?.percent ?? 0}%` }} /></div>

            </div>
            {categories.length > 0 && (
              <div className="chips">
                <div className={`chip ${!categoryFilter ? 'on' : ''}`} onClick={() => setCategoryFilter('')}>Все категории</div>
                {categories.map(c => (
                  <div key={c} className={`chip ${categoryFilter === c ? 'on' : ''}`} onClick={() => setCategoryFilter(c)}>{c}</div>
                ))}
              </div>
            )}
            <div className="chips">

              {['all', 'active', 'done', 'pending'].map(f => (

                <div key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>

                  {{ all: 'Все', active: 'Актуальные', done: 'Выполненные', pending: 'На проверке' }[f]}

                </div>

              ))}

            </div>

            {filteredTasks.length === 0 ? (
              <EmptyState icon="📋" title="Заданий пока нет" subtitle="Проверьте фильтры или загляните позже — новые задания появятся в течение дня" />
            ) : filteredTasks.map((t: any) => (

              <div

                key={t.id}

                className={`tk ${t.status === 'available' || t.canResubmit ? 'hot' : ''}`}

                style={t.status === 'soon' ? { opacity: 0.55 } : undefined}

              >

                <div className="tk-b">

                  <div className={`tk-t ${t.status === 'done' ? 'dk' : ''}`}>{t.title}</div>

                  {t.description && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{t.description}</div>}

                  <div className="tk-c">

                    {t.category} · {STATUS_LABEL[t.status] || t.status}

                    {t.deadline && ` · до ${new Date(t.deadline).toLocaleDateString('ru-RU')}`}

                  </div>

                  {t.submission?.moderatorComment && t.status === 'rejected' && (

                    <div style={{ fontSize: 10, color: '#C53030', marginTop: 4 }}>{t.submission.moderatorComment}</div>

                  )}

                </div>

                <div className="tk-x">+{t.points}⚡</div>

                {(t.status === 'available' || t.canResubmit) && (

                  <Button size="s" onClick={() => openSubmit(t)} style={{ marginLeft: 8 }}>

                    {t.canResubmit ? 'Отправить снова' : 'Отправить'}

                  </Button>

                )}

              </div>

            ))}

          </>

        )}

      </Group>



      <ModalRoot activeModal={submitTaskId ? 'task-submit' : null} onClose={() => setSubmitTaskId(null)}>

        <ModalPage id="task-submit" onClose={() => setSubmitTaskId(null)}>

          <ModalPageHeader>Отправка задания</ModalPageHeader>

          <Group>

            {needsText && (

              <Textarea value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Ваш ответ..." />

            )}

            {needsPhoto && (

              <Button mode="secondary" onClick={handlePhoto} style={{ marginTop: 8 }}>

                {photoUrl ? '📷 Фото прикреплено' : '📷 Прикрепить фото'}

              </Button>

            )}

            <Button size="l" stretched onClick={handleSubmit} style={{ marginTop: 12 }}>

              Отправить на проверку

            </Button>

          </Group>

        </ModalPage>

      </ModalRoot>



      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}

    </Panel>

  );

};


