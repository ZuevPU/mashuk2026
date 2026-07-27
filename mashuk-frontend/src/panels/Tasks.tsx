import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar, Input } from '@vkontakte/vkui';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { uploadTaskPhoto } from '../utils/uploadPhoto';
import { useAppModal } from '../App';
import { EmptyState } from '../components/EmptyState';

const STATUS_LABEL: Record<string, string> = {
  soon: '⚪ Скоро откроется',
  available: '🔵 Доступно',
  pending: '🟡 На проверке',
  done: '🟢 Выполнено',
  rejected: '🔴 Не принято',
};

const CONFIRM_HINT: Record<string, string> = {
  photo: 'Нужно фото',
  post_url: 'Нужна ссылка на пост',
  qr: 'QR на площадке',
  auto: 'Автоподтверждение',
  team: 'Командное задание',
  text_photo: 'Текст и/или фото',
};

function taskConfirmLabel(task: { confirmationType?: string; answerType?: string | null }): string {
  const ct = task.confirmationType || 'text_photo';
  if (ct === 'text_photo') {
    const at = task.answerType || 'text_and_photo';
    if (at === 'text') return 'Нужен текстовый ответ';
    if (at === 'photo') return 'Нужно фото';
    if (at === 'text_and_photo') return 'Текст и фото';
  }
  return CONFIRM_HINT[ct] || ct;
}

function isTaskAlreadySubmittedError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('already submitted')
    || m.includes('уже выполн')
    || m.includes('одноразовое')
    || m.includes('лимит выполнений');
}

const TaskSubmitModal = ({
  taskId,
  meta,
  onClose,
  onSuccess,
  setSnackbar,
}: {
  taskId: number | null;
  meta: any;
  onClose: () => void;
  onSuccess: () => void;
  setSnackbar: (msg: string) => void;
}) => {
  const [answerText, setAnswerText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamResults, setTeamResults] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const confirmationType = meta?.confirmationType || 'text_photo';
  const qrFromHash = getHashSearchParams().get('qr');

  const needsText = confirmationType === 'text_photo' && meta?.answerType !== 'photo';
  const needsPhoto = confirmationType === 'photo'
    || (confirmationType === 'text_photo' && (meta?.answerType === 'photo' || meta?.answerType === 'text_and_photo'));
  const needsPostUrl = confirmationType === 'post_url';
  const needsTeam = confirmationType === 'team';
  const isQr = confirmationType === 'qr';
  const isAuto = confirmationType === 'auto';

  useEffect(() => {
    if (!needsTeam || teamSearch.trim().length < 2) {
      setTeamResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiGet<{ participants: { id: number; firstName: string; lastName: string }[] }>(
        `/participants/teammates-search?q=${encodeURIComponent(teamSearch.trim())}`,
      ).then(r => setTeamResults(r.participants || [])).catch(() => setTeamResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [teamSearch, needsTeam]);

  const addTeammate = (p: { id: number; firstName: string; lastName: string }) => {
    if (selectedTeam.some(x => x.id === p.id)) return;
    setSelectedTeam(prev => [...prev, p]);
    setTeamSearch('');
    setTeamResults([]);
  };

  const handlePhoto = async () => {
    try {
      const url = await uploadTaskPhoto();
      if (url) setPhotoUrl(url);
    } catch {
      setSnackbar('Не удалось загрузить фото');
    }
  };

  const handleSubmit = async () => {
    if (!taskId) return;
    if (needsText && !answerText.trim()) {
      setSnackbar('Введите текст ответа');
      return;
    }
    if (needsPhoto && !photoUrl) {
      setSnackbar('Прикрепите фото');
      return;
    }
    if (needsPostUrl && !postUrl.trim()) {
      setSnackbar('Укажите ссылку на пост');
      return;
    }
    if (needsTeam && selectedTeam.length < 1) {
      setSnackbar('Добавьте участников команды');
      return;
    }
    if (isQr && !qrFromHash) {
      setSnackbar('Отсканируйте QR задания');
      return;
    }
    try {
      const teamIds = selectedTeam.map(p => p.id);
      const res = await apiPost<{ xpAwarded?: number }>(`/tasks/${taskId}/submit`, {
        answerText: answerText || (isAuto || isQr ? 'Готово' : undefined),
        photoUrl,
        postUrl: postUrl || undefined,
        teamMemberIds: teamIds.length ? teamIds : undefined,
        qrToken: qrFromHash || undefined,
      });
      const xp = res.xpAwarded;
      setSnackbar(xp ? `Задание отправлено · +${xp} Опыт` : 'Задание отправлено');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка отправки';
      setSnackbar(msg);
      if (err instanceof ApiError && isTaskAlreadySubmittedError(msg)) {
        onSuccess();
        onClose();
      }
    }
  };

  return (
    <ModalPage id="task-submit" onClose={onClose}>
      <ModalPageHeader>Отправка задания</ModalPageHeader>
      <Group>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          {taskConfirmLabel(meta || {})}
        </div>
        {isAuto && (
          <div style={{ fontSize: 13, marginBottom: 8 }}>Нажмите «Отправить» — задание подтвердится автоматически.</div>
        )}
        {isQr && (
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            {qrFromHash
              ? 'QR распознан — можно подтвердить выполнение.'
              : 'Отсканируйте QR задания или попросите волонтёра подтвердить ваш участнический QR.'}
          </div>
        )}
        {needsText && (
          <Textarea value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Ваш ответ..." />
        )}
        {needsPhoto && (
          <Button mode="secondary" onClick={handlePhoto} style={{ marginTop: 8 }}>
            {photoUrl ? '📷 Фото прикреплено' : '📷 Прикрепить фото'}
          </Button>
        )}
        {needsPostUrl && (
          <Input
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            placeholder="https://vk.com/wall..."
            style={{ marginTop: 8 }}
          />
        )}
        {needsTeam && (
          <div style={{ marginTop: 8 }}>
            <Input
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
              placeholder="Поиск по ФИО..."
            />
            {teamResults.length > 0 && (
              <div style={{ marginTop: 6, background: '#fff', borderRadius: 10, border: '1px solid #E0DAD0' }}>
                {teamResults.map(p => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => addTeammate(p)}
                    style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #F5F0E8', cursor: 'pointer' }}
                  >
                    {p.firstName} {p.lastName} · #{p.id}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {selectedTeam.map(p => (
                <span key={p.id} style={{ fontSize: 11, background: '#FFF0E6', padding: '4px 8px', borderRadius: 8 }}>
                  {p.firstName} {p.lastName}
                  <button type="button" style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setSelectedTeam(prev => prev.filter(x => x.id !== p.id))}>×</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <Button
          size="l"
          stretched
          onClick={handleSubmit}
          style={{ marginTop: 12 }}
          disabled={isQr && !qrFromHash}
        >
          {isAuto || (isQr && qrFromHash) ? 'Подтвердить' : 'Отправить на проверку'}
        </Button>
      </Group>
    </ModalPage>
  );
};

export const TasksPanel: React.FC<{ id: string }> = ({ id }) => {
  const { setModal } = useAppModal();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitTaskId, setSubmitTaskId] = useState<number | null>(null);
  const [submitTaskMeta, setSubmitTaskMeta] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const openSubmit = useCallback((task: any) => {
    setSubmitTaskId(task.id);
    setSubmitTaskMeta(task);
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

  useEffect(() => {
    const teamConfirm = getHashSearchParams().get('teamConfirm');
    if (!teamConfirm) return;
    apiPost(`/tasks/submissions/${teamConfirm}/team-confirm`, { accept: true })
      .then(() => { setSnackbar('Участие в команде подтверждено'); load(); })
      .catch(err => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось подтвердить'));
  }, [load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const taskId = getHashSearchParams().get('task');
    if (!taskId || !data?.tasks) return;
    const task = data.tasks.find((t: { id: number }) => String(t.id) === taskId);
    if (task && (task.status === 'available' || task.canResubmit)) {
      openSubmit(task);
    }
  }, [data, openSubmit]);

  useEffect(() => {
    if (submitTaskId) {
      setModal(
        <ModalRoot activeModal="task-submit" onClose={() => setSubmitTaskId(null)}>
          <TaskSubmitModal
            taskId={submitTaskId}
            meta={submitTaskMeta}
            onClose={() => setSubmitTaskId(null)}
            onSuccess={load}
            setSnackbar={setSnackbar}
          />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [submitTaskId, submitTaskMeta, load, setModal]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  const categories = [...new Set((data?.tasks ?? []).map((t: { category?: string }) => t.category).filter(Boolean))] as string[];
  const filteredTasks = (data?.tasks ?? []).filter((t: { category?: string }) =>
    !categoryFilter || t.category === categoryFilter,
  );
  const doneCount = data?.progress?.done ?? (data?.tasks ?? []).filter((t: { status: string }) => t.status === 'done').length;
  const totalCount = data?.progress?.total ?? data?.tasks?.length ?? 0;
  const progressPercent = data?.progress?.percent ?? (totalCount ? Math.round((doneCount / totalCount) * 100) : 0);

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
            <div className="tasks-xp-banner">
              <div className="tasks-xp-col">
                <div className="tasks-xp-val">⚡ {data?.progress?.experienceTotal ?? 0}</div>
                <div className="tasks-xp-lbl">всего опыт</div>
              </div>
              <div className="tasks-xp-div" />
              <div className="tasks-xp-col">
                <div className="tasks-xp-val">+{data?.progress?.pointsToday ?? 0}</div>
                <div className="tasks-xp-lbl">сегодня</div>
              </div>
            </div>
            <div className="tasks-hdr">
              <span className="tasks-hdr-t">{doneCount} из {totalCount} выполнено · День {data?.dayNumber ?? 1}</span>
            </div>
            {(data?.pendingTeamInvites?.length ?? 0) > 0 && (
              <div className="m-card" style={{ marginBottom: 10, background: '#FFF8F0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Подтвердите команду</div>
                {data.pendingTeamInvites.map((inv: { submissionId: number; taskTitle: string }) => (
                  <Button
                    key={inv.submissionId}
                    size="s"
                    mode="secondary"
                    style={{ marginRight: 8, marginBottom: 6 }}
                    onClick={() => apiPost(`/tasks/submissions/${inv.submissionId}/team-confirm`, { accept: true }).then(() => { setSnackbar('Подтверждено'); load(); })}
                  >
                    {inv.taskTitle} → Да
                  </Button>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
                <span>Прогресс дня · {progressPercent}%</span>
                {data?.kbLocked && (
                  <button type="button" className="time-btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => window.location.hash = '#/program'}>
                    База знаний
                  </button>
                )}
              </div>
              <div style={{ height: 8, background: '#E8E0D4', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--m-accent, #B8621A)', borderRadius: 8 }} />
              </div>
            </div>
            <div className="time-sw" style={{ marginBottom: 8 }}>
              {(['all', 'active', 'done', 'pending'] as const).map(f => (
                <button key={f} type="button" className={`time-btn ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                  {{ all: 'Все', active: 'Активные', done: 'Готово', pending: 'На проверке' }[f]}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <div className="time-sw" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <button type="button" className={`time-btn ${!categoryFilter ? 'on' : ''}`} onClick={() => setCategoryFilter('')}>Все категории</button>
                {categories.map(c => (
                  <button key={c} type="button" className={`time-btn ${categoryFilter === c ? 'on' : ''}`} onClick={() => setCategoryFilter(c)}>{c}</button>
                ))}
              </div>
            )}
            {filteredTasks.length === 0 ? (
              <EmptyState icon="📋" title="Нет заданий" subtitle="Задания появятся по ходу дня" />
            ) : filteredTasks.map((t: any) => (
              <div
                key={t.id}
                className="m-card"
                style={{
                  marginBottom: 10,
                  border: (t.status === 'available' || t.canResubmit) ? '2px solid var(--m-accent, #B8621A)' : undefined,
                  opacity: t.status === 'soon' ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{t.title}</strong>
                  <span style={{ fontSize: 12 }}>{STATUS_LABEL[t.status] || t.status}</span>
                </div>
                {t.description && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                  +{t.points ?? 0} · {taskConfirmLabel(t)}
                </div>
                {(t.status === 'available' || t.canResubmit) && (
                  <Button size="m" style={{ marginTop: 8 }} onClick={() => openSubmit(t)}>
                    {t.canResubmit ? 'Отправить снова' : 'Выполнить'}
                  </Button>
                )}
                {t.submission?.moderatorComment && (
                  <div style={{ fontSize: 12, color: '#C53030', marginTop: 6 }}>{t.submission.moderatorComment}</div>
                )}
              </div>
            ))}
          </>
        )}
      </Group>
      {snackbar && (
        <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>
          {snackbar}
        </Snackbar>
      )}
    </Panel>
  );
};
