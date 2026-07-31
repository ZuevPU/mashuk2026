import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar, Input } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { uploadTaskPhoto } from '../utils/uploadPhoto';
import { openCodeReader } from '../utils/vkBridgeClient';
import { extractTaskQrToken, parseTaskQrScan } from '../utils/qrDeepLink';
import { useAppModal } from '../App';
import { EmptyState } from '../components/EmptyState';
import {
  AnswerSuccessOverlay,
  type SubmitSuccessPayload,
  type AnswerConfirmationConfig,
} from '../components/questions/AnswerSuccessOverlay';

const TASK_SUBMIT_CONFIRM: AnswerConfirmationConfig = {
  enabled: true,
  showPoints: true,
  titleTemplate: 'Задание отправлено',
};

const LIFECYCLE_LABEL: Record<string, string> = {
  created: 'Создана',
  awaiting_confirm: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  points_awarded: 'Баллы начислены',
  medal_awarded: 'Медаль получена',
  rejected: 'Отклонена',
  expired: 'Истекла',
};

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

function taskMethodsFromMeta(meta: { confirmationMethods?: string[]; confirmationType?: string } | null): string[] {
  if (meta?.confirmationMethods?.length) return meta.confirmationMethods;
  const ct = meta?.confirmationType || 'text_photo';
  if (ct === 'qr') return ['qr'];
  if (ct === 'photo') return ['photo'];
  if (ct === 'post_url') return ['link'];
  if (ct === 'team') return ['team'];
  if (ct === 'auto') return [];
  return ['photo'];
}

function taskConfirmLabel(task: { confirmationMethods?: string[]; confirmationType?: string; answerType?: string | null }): string {
  const methods = taskMethodsFromMeta(task);
  if (methods.length === 0) return CONFIRM_HINT.auto;
  const parts = methods.map(m => {
    if (m === 'photo') return 'Фото до 5 МБ';
    if (m === 'link') return 'Ссылка';
    if (m === 'qr') return 'QR';
    if (m === 'volunteer') return 'Волонтёр';
    if (m === 'team') return 'Команда';
    if (m === 'moderator') return 'на проверке у модератора';
    return m;
  });
  return parts.join(' · ');
}

function isTaskAlreadySubmittedError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('already submitted')
    || m.includes('уже выполн')
    || m.includes('одноразовое')
    || m.includes('лимит выполнений');
}

function repeatableProgressLabel(task: {
  executionType?: string;
  dailyRepeatLimit?: number;
  todayCompletedCount?: number;
  canSubmitAgain?: boolean;
  status?: string;
}): string | null {
  const exec = task.executionType || 'once';
  if (exec !== 'daily' && exec !== 'repeatable' && exec !== 'multiple') return null;
  const limit = task.dailyRepeatLimit ?? 1;
  const done = task.todayCompletedCount ?? 0;
  if (exec === 'daily') {
    if (task.status === 'done') return 'Выполнено сегодня';
    if (task.status === 'available' && done === 0) return 'Можно выполнить сегодня';
    return null;
  }
  if (done >= limit && task.status === 'done') return `Лимит ${limit}/день исчерпан`;
  if (done > 0) return `${done}/${limit} сегодня${task.canSubmitAgain ? ' · можно ещё' : ''}`;
  if (task.status === 'available') return `До ${limit} раз сегодня`;
  return null;
}

const TaskSubmitModal = ({
  taskId,
  meta,
  onClose,
  onSuccess,
  onSubmitSuccess,
  setSnackbar,
}: {
  taskId: number | null;
  meta: any;
  onClose: () => void;
  onSuccess: () => void;
  onSubmitSuccess: (p: SubmitSuccessPayload) => void;
  setSnackbar: (msg: string) => void;
}) => {
  const [answerText, setAnswerText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamResults, setTeamResults] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [scannedQr, setScannedQr] = useState('');
  const methods = taskMethodsFromMeta(meta);
  const qrFromHash = getHashSearchParams().get('qr');
  const effectiveQr = scannedQr || qrFromHash || meta?._scannedQr || '';

  useEffect(() => {
    setScannedQr(meta?._scannedQr || '');
  }, [taskId, meta?._scannedQr]);

  const needsText = methods.includes('photo') && meta?.answerType !== 'photo';
  const needsPhoto = methods.includes('photo');
  const needsPostUrl = methods.includes('link');
  const needsTeam = methods.includes('team');
  const isQr = methods.includes('qr');
  const isAuto = methods.length === 0;

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
    if (isQr && !effectiveQr) {
      setSnackbar('Отсканируйте QR задания');
      return;
    }
    try {
      const teamIds = selectedTeam.map(p => p.id);
      const res = await apiPost<{ xpAwarded?: number; track?: 'path' | 'experience' }>(`/tasks/${taskId}/submit`, {
        answerText: answerText || (isAuto || isQr ? 'Готово' : undefined),
        photoUrl,
        postUrl: postUrl || undefined,
        teamMemberIds: teamIds.length ? teamIds : undefined,
        qrToken: effectiveQr || undefined,
      });
      const xp = res.xpAwarded ?? 0;
      const teamPending = methods.includes('team');
      onSubmitSuccess({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: teamPending ? 'Задание отправлено команде' : TASK_SUBMIT_CONFIRM.titleTemplate,
          showPoints: xp > 0,
        },
        xpAwarded: xp,
        track: res.track ?? 'experience',
      });
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
            {effectiveQr
              ? 'QR распознан — можно подтвердить выполнение.'
              : 'Отсканируйте QR задания камерой VK или откройте ссылку с площадки.'}
            <Button
              size="m"
              mode="secondary"
              stretched
              style={{ marginTop: 8 }}
              onClick={async () => {
                const raw = await openCodeReader();
                if (!raw) {
                  setSnackbar('Сканирование отменено');
                  return;
                }
                const token = extractTaskQrToken(raw);
                if (!token) {
                  setSnackbar('Не удалось прочитать QR');
                  return;
                }
                setScannedQr(token);
                setSnackbar('QR задания распознан');
              }}
            >
              Сканировать QR (VK)
            </Button>
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
          disabled={isQr && !effectiveQr}
        >
          {isAuto || (isQr && effectiveQr) ? 'Подтвердить' : 'Отправить на проверку'}
        </Button>
      </Group>
    </ModalPage>
  );
};

export const TasksPanel: React.FC<{ id: string }> = ({ id }) => {
  const { setModal } = useAppModal();
  const { panel: activePanel } = useActiveVkuiLocation();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitTaskId, setSubmitTaskId] = useState<number | null>(null);
  const [submitTaskMeta, setSubmitTaskMeta] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [successPayload, setSuccessPayload] = useState<SubmitSuccessPayload | null>(null);

  const openSubmit = useCallback((task: any) => {
    setSubmitTaskId(task.id);
    setSubmitTaskMeta(task);
  }, []);

  const scanTaskQr = useCallback(async () => {
    const raw = await openCodeReader();
    if (!raw) {
      setSnackbar('Сканирование отменено');
      return;
    }
    const parsed = parseTaskQrScan(raw);
    if (!parsed) {
      setSnackbar('QR не содержит задание — нужна ссылка #/tasks?task=…&qr=…');
      return;
    }
    const task = data?.tasks?.find((t: { id: number }) => t.id === parsed.taskId);
    if (task) {
      if (window.location.hash.split('?')[0] !== '#/tasks') {
        window.location.hash = `#/tasks?task=${parsed.taskId}&qr=${encodeURIComponent(parsed.qrToken)}`;
      }
      openSubmit({ ...task, _scannedQr: parsed.qrToken });
      setSnackbar('QR задания распознан');
      return;
    }
    window.location.hash = `#/tasks?task=${parsed.taskId}&qr=${encodeURIComponent(parsed.qrToken)}`;
    setSnackbar('Открываем задание…');
  }, [data?.tasks, openSubmit]);

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
    if (activePanel !== id) return;
    if (submitTaskId) {
      setModal(
        <ModalRoot activeModal="task-submit" onClose={() => setSubmitTaskId(null)}>
          <TaskSubmitModal
            taskId={submitTaskId}
            meta={submitTaskMeta}
            onClose={() => setSubmitTaskId(null)}
            onSuccess={load}
            onSubmitSuccess={setSuccessPayload}
            setSnackbar={setSnackbar}
          />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [submitTaskId, submitTaskMeta, load, setModal, activePanel, id]);

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
      <PanelHeader fixed>Задания</PanelHeader>
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
              <button type="button" className="time-btn" onClick={() => void scanTaskQr()}>
                Скан QR
              </button>
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
                  {repeatableProgressLabel(t) ? ` · ${repeatableProgressLabel(t)}` : ''}
                </div>
                {(t.status === 'available' || t.canResubmit) && (
                  <Button size="m" style={{ marginTop: 8 }} onClick={() => openSubmit(t)}>
                    {t.canResubmit ? 'Отправить снова' : t.canSubmitAgain && (t.todayCompletedCount ?? 0) > 0 ? 'Выполнить снова' : 'Выполнить'}
                  </Button>
                )}
                {(t.status === 'pending' || t.status === 'done') && t.submission?.lifecycleLabel && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                    {LIFECYCLE_LABEL[t.submission.lifecycleStage as string] || t.submission.lifecycleLabel}
                  </div>
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
      <AnswerSuccessOverlay payload={successPayload} onDone={() => setSuccessPayload(null)} />
    </Panel>
  );
};
