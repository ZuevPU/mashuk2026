import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar, Input, Radio, Checkbox } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { uploadTaskPhoto } from '../utils/uploadPhoto';
import { extractTaskQrToken } from '../utils/qrDeepLink';
import { getDeviceKey } from '../utils/deviceKey';
import { clearPendingTaskQr, peekPendingTaskQr, setPendingTaskQr } from '../utils/launchParams';
import { useAppModal } from '../App';
import { EmptyState } from '../components/EmptyState';
import {
  AnswerSuccessOverlay,
  type SubmitSuccessPayload,
  type AnswerConfirmationConfig,
} from '../components/questions/AnswerSuccessOverlay';

/** Strip ?qr= from hash so the code is not visible in the address bar. */
function stripQrFromHash(): void {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const qIdx = hash.indexOf('?');
    if (qIdx < 0) return;
    const path = hash.slice(0, qIdx);
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    if (!params.has('qr')) return;
    params.delete('qr');
    const qs = params.toString();
    const base = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', `${base}#${path}${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

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
  done: '🟢 Засчитано',
  rejected: '🔴 Не принято',
};

const CATEGORY_TONES = ['terracotta', 'olive', 'teal', 'sand', 'slate', 'rose'] as const;
type CategoryTone = (typeof CATEGORY_TONES)[number];

function categoryTone(name: string): CategoryTone {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

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
  if (methods.includes('qr')) return 'QR · скан у организатора';
  const at = task.answerType || (methods.includes('photo') ? 'text_and_photo' : 'text');
  const formatMap: Record<string, string> = {
    text: 'Текст',
    choice: 'Выбор',
    multi: 'Несколько вариантов',
    photo: 'Фото',
    text_and_photo: 'Фото + текст',
  };
  const format = formatMap[at] || at;
  if (methods.length === 0) return `${format} · автоподтверждение`;
  const parts = methods.map(m => {
    if (m === 'photo') return 'Фото до 5 МБ';
    if (m === 'link') return 'Ссылка';
    if (m === 'volunteer') return 'Волонтёр';
    if (m === 'team') return 'Команда';
    if (m === 'moderator') return 'на проверке у играпрактика';
    return m;
  });
  return `${format} · ${parts.join(' · ')}`;
}

function isTaskAlreadySubmittedError(message: string): boolean {
  const m = message.toLowerCase();
  // Do not match «с этого устройства другим участником» — that is a hard block, not "already done".
  if (m.includes('другим участником') || m.includes('этого устройства')) return false;
  return m.includes('already submitted')
    || m.includes('уже выполн')
    || m.includes('уже на проверке')
    || m.includes('заявка уже')
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

function TaskDescriptionClamp({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return;
      setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text, expanded]);

  return (
    <div className="tasks-desc-wrap">
      <div
        ref={ref}
        className={`tasks-desc${expanded ? ' tasks-desc--open' : ''}`}
      >
        {text}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          className="tasks-desc-toggle"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Скрыть' : 'Развернуть'}
        </button>
      )}
    </div>
  );
}

function TaskDetailHeader({ task }: { task: any }) {
  const tone = task?.category ? categoryTone(task.category) : null;
  const progress = repeatableProgressLabel(task || {});
  return (
    <div className="tasks-detail-head">
      <div className="tasks-detail-title-row">
        <strong className="tasks-detail-title">{task?.title || 'Задание'}</strong>
        {task?.status && (
          <span className={`tasks-status-pill tasks-status-pill--${task.status}`}>
            {STATUS_LABEL[task.status] || task.status}
          </span>
        )}
      </div>
      <div className="tasks-detail-badges">
        {task?.category && (
          <span className="tasks-cat-badge" data-tone={tone || 'sand'}>{task.category}</span>
        )}
        <span className="tasks-meta-pill">+{task?.points ?? 0} XP</span>
        <span className="tasks-meta-pill">{taskConfirmLabel(task || {})}</span>
        {progress && <span className="tasks-meta-pill">{progress}</span>}
      </div>
      {task?.description && (
        <div className="tasks-detail-desc">{task.description}</div>
      )}
    </div>
  );
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
  const [selectedChoice, setSelectedChoice] = useState('');
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const autoQrSubmitRef = useRef(false);
  const methods = taskMethodsFromMeta(meta);
  const answerType = meta?.answerType || (methods.includes('photo') ? 'text_and_photo' : 'text');
  const answerOptions: Array<{ label: string; value: string }> = meta?.answerOptions || [];
  const effectiveQr = scannedQr || meta?._scannedQr || '';

  useEffect(() => {
    const fromMeta = meta?._scannedQr || '';
    const pending = peekPendingTaskQr();
    const pendingForTask = pending && (!pending.taskId || pending.taskId === taskId)
      ? extractTaskQrToken(pending.qr)
      : '';
    const fromHash = extractTaskQrToken(getHashSearchParams().get('qr') || '');
    const token = fromMeta || pendingForTask || fromHash || '';
    if (token) {
      setScannedQr(token);
      setPendingTaskQr(token, taskId || undefined);
      stripQrFromHash();
    } else {
      setScannedQr('');
    }
    setSelectedChoice('');
    setSelectedMulti([]);
    setAnswerText('');
    setPhotoUrl(null);
    setSubmitting(false);
    setFormError(null);
    autoQrSubmitRef.current = false;
  }, [taskId, meta?._scannedQr]);

  const finishSuccess = useCallback((payload: SubmitSuccessPayload) => {
    clearPendingTaskQr();
    onClose();
    onSubmitSuccess(payload);
    onSuccess();
  }, [onClose, onSubmitSuccess, onSuccess]);

  const finishAlreadySubmitted = useCallback((message: string) => {
    clearPendingTaskQr();
    onClose();
    onSubmitSuccess({
      confirm: {
        ...TASK_SUBMIT_CONFIRM,
        titleTemplate: message.includes('проверк') ? 'Задание уже на проверке' : 'Задание уже отправлено',
        showPoints: false,
      },
      detail: message,
      tone: 'info',
      xpAwarded: 0,
      track: 'experience',
    });
    onSuccess();
  }, [onClose, onSubmitSuccess, onSuccess]);

  const submitAnswerText = useCallback(() => {
    if (answerType === 'choice') return selectedChoice;
    if (answerType === 'multi') return JSON.stringify(selectedMulti);
    return answerText.trim();
  }, [answerType, selectedChoice, selectedMulti, answerText]);

  const isQr = methods.includes('qr');
  // QR tasks: only the scanned code matters — no answer inputs (incl. old tasks with text/photo answerType).
  const needsFreeText = !isQr && (answerType === 'text' || answerType === 'text_and_photo');
  const needsPhoto = !isQr && (answerType === 'photo' || answerType === 'text_and_photo');
  const isChoice = !isQr && answerType === 'choice';
  const isMulti = !isQr && answerType === 'multi';
  const needsPostUrl = !isQr && methods.includes('link');
  const needsTeam = !isQr && methods.includes('team');
  const isAuto = methods.length === 0;

  // Fallback: if user opened #/tasks?task=&qr=, credit immediately (main path is #/scan).
  useEffect(() => {
    if (!isQr || !effectiveQr || !taskId || submitting || autoQrSubmitRef.current) return;
    autoQrSubmitRef.current = true;
    setSubmitting(true);
    setFormError(null);
    void apiPost<{ xpAwarded?: number; track?: 'path' | 'experience' }>(`/tasks/${taskId}/submit`, {
      answerText: 'Готово',
      qrToken: effectiveQr,
      deviceKey: getDeviceKey(),
    })
      .then((res) => {
        const xp = res.xpAwarded ?? 0;
        finishSuccess({
          confirm: {
            ...TASK_SUBMIT_CONFIRM,
            titleTemplate: 'Задание засчитано',
            showPoints: xp > 0,
          },
          detail: xp > 0 ? `Начислено +${xp}` : 'QR принят, задание выполнено',
          tone: 'success',
          xpAwarded: xp,
          track: res.track ?? 'experience',
        });
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'Ошибка отправки';
        if (err instanceof ApiError && isTaskAlreadySubmittedError(msg)) {
          finishAlreadySubmitted(msg);
          return;
        }
        setFormError(msg);
        setSubmitting(false);
        autoQrSubmitRef.current = false;
      });
  }, [isQr, effectiveQr, taskId, submitting, finishSuccess, finishAlreadySubmitted]);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message.trim() : '';
      setSnackbar(msg || 'Не удалось загрузить фото');
    }
  };

  const handleSubmit = async () => {
    if (!taskId || submitting) return;
    if (isQr && !effectiveQr) {
      setFormError('Отсканируйте QR, который даст организатор');
      return;
    }
    if (!isQr && answerType === 'text' && !answerText.trim()) {
      setFormError('Введите текст ответа');
      return;
    }
    if (isChoice && !selectedChoice) {
      setFormError('Выберите вариант ответа');
      return;
    }
    if (isMulti && selectedMulti.length === 0) {
      setFormError('Выберите хотя бы один вариант');
      return;
    }
    if (needsPhoto && !photoUrl) {
      setFormError('Прикрепите фото');
      return;
    }
    if (needsPostUrl && !postUrl.trim()) {
      setFormError('Укажите ссылку на пост');
      return;
    }
    if (needsTeam && selectedTeam.length < 1) {
      setFormError('Добавьте участников команды');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const teamIds = selectedTeam.map(p => p.id);
      const res = await apiPost<{ xpAwarded?: number; track?: 'path' | 'experience' }>(`/tasks/${taskId}/submit`, {
        answerText: isQr ? 'Готово' : (submitAnswerText() || (isAuto ? 'Готово' : undefined)),
        photoUrl: isQr ? null : photoUrl,
        postUrl: isQr ? undefined : (postUrl || undefined),
        teamMemberIds: !isQr && teamIds.length ? teamIds : undefined,
        qrToken: effectiveQr || undefined,
        deviceKey: isQr ? getDeviceKey() : undefined,
      });
      const xp = res.xpAwarded ?? 0;
      const teamPending = !isQr && methods.includes('team');
      finishSuccess({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: teamPending
            ? 'Задание отправлено команде'
            : isQr
              ? 'QR-задание выполнено'
              : TASK_SUBMIT_CONFIRM.titleTemplate,
          showPoints: xp > 0,
        },
        xpAwarded: xp,
        track: res.track ?? 'experience',
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка отправки';
      if (err instanceof ApiError && isTaskAlreadySubmittedError(msg)) {
        finishAlreadySubmitted(msg);
        return;
      }
      setFormError(msg);
      setSubmitting(false);
    }
  };

  return (
    <ModalPage id="task-submit" settlingHeight={100} onClose={onClose}>
      <ModalPageHeader>Выполнение задания</ModalPageHeader>
      <Group>
        <TaskDetailHeader task={meta} />

        <div className="tasks-answer-block">
          {!isQr && (
            <div className="tasks-answer-block-title">Ваш ответ</div>
          )}
          {isAuto && (
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Нажмите «Подтвердить» — задание подтвердится автоматически.
            </div>
          )}
          {isQr && (
            <div className="tasks-qr-status" style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.45 }}>
              {effectiveQr || submitting
                ? 'QR принят — засчитываем задание…'
                : 'Отсканируйте обычной камерой телефона QR, который даст организатор на событии — задание засчитается автоматически.'}
            </div>
          )}
          {isChoice && answerOptions.map(opt => (
            <Radio
              key={opt.value}
              checked={selectedChoice === opt.value}
              onChange={() => setSelectedChoice(opt.value)}
              style={{ marginBottom: 6 }}
            >
              {opt.label}
            </Radio>
          ))}
          {isMulti && answerOptions.map(opt => (
            <Checkbox
              key={opt.value}
              checked={selectedMulti.includes(opt.value)}
              onChange={() => setSelectedMulti(prev => (
                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
              ))}
              style={{ marginBottom: 6 }}
            >
              {opt.label}
            </Checkbox>
          ))}
          {needsFreeText && (
            <Textarea
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              placeholder={answerType === 'text_and_photo' ? 'Комментарий (необязательно)...' : 'Ваш ответ...'}
            />
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
          {formError && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#FDECEC', color: '#C53030', fontSize: 13 }}>
              {formError}
            </div>
          )}
          {!(isQr && effectiveQr) && (
            <Button
              size="l"
              stretched
              onClick={() => void handleSubmit()}
              style={{ marginTop: 12 }}
              loading={submitting}
              disabled={
                submitting
                || (isQr && !effectiveQr)
                || (!isQr && isChoice && !selectedChoice)
                || (!isQr && isMulti && selectedMulti.length === 0)
                || (!isQr && answerType === 'text' && !answerText.trim())
                || (needsPhoto && !photoUrl)
              }
            >
              {submitting
                ? 'Отправляем…'
                : isAuto
                  ? 'Подтвердить'
                  : isQr
                    ? 'Нужен QR организатора'
                    : 'Отправить на проверку'}
            </Button>
          )}
          {isQr && (effectiveQr || submitting) && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Spinner />
            </div>
          )}
        </div>
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
    const pending = peekPendingTaskQr();
    const fromHash = extractTaskQrToken(getHashSearchParams().get('qr') || '');
    const pendingForTask = pending && (!pending.taskId || pending.taskId === task.id)
      ? extractTaskQrToken(pending.qr)
      : '';
    const token = task._scannedQr || pendingForTask || fromHash || '';
    if (token) {
      setPendingTaskQr(token, task.id);
      stripQrFromHash();
    }
    setSubmitTaskId(task.id);
    setSubmitTaskMeta(token ? { ...task, _scannedQr: token } : task);
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
    const pending = peekPendingTaskQr();
    const targetId = taskId || (pending?.taskId ? String(pending.taskId) : null);
    if (!targetId || !data?.tasks) return;
    const task = data.tasks.find((t: { id: number }) => String(t.id) === targetId);
    if (task && (task.status === 'available' || task.canResubmit)) {
      openSubmit(task);
    }
  }, [data, openSubmit]);

  useEffect(() => {
    if (activePanel !== id) {
      if (submitTaskId) setSubmitTaskId(null);
      setModal(null);
      return;
    }
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
  }, [
    submitTaskId, submitTaskMeta,
    load, setModal, activePanel, id,
  ]);

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
              </div>
              <div style={{ height: 8, background: '#E8E0D4', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--m-accent, #B8621A)', borderRadius: 8 }} />
              </div>
            </div>
            <div className="tasks-filter-row">
              {([
                { id: 'all', label: 'Все' },
                { id: 'active', label: 'Активные' },
                { id: 'done', label: 'Готово' },
                { id: 'pending', label: 'На проверке' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`tasks-filter-chip tasks-filter-chip--${f.id}${filter === f.id ? ' on' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <div className="tasks-filter-row tasks-filter-row--cats">
                <button
                  type="button"
                  className={`tasks-cat-chip${!categoryFilter ? ' on' : ''}`}
                  onClick={() => setCategoryFilter('')}
                >
                  Все категории
                </button>
                {categories.map(c => {
                  const tone = categoryTone(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`tasks-cat-chip${categoryFilter === c ? ' on' : ''}`}
                      data-tone={tone}
                      onClick={() => setCategoryFilter(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
            {filteredTasks.length === 0 ? (
              <EmptyState icon="📋" title="Нет заданий" subtitle="Задания появятся по ходу дня" />
            ) : filteredTasks.map((t: any) => {
              const tone = t.category ? categoryTone(t.category) : null;
              const isDone = t.status === 'done';
              const isQrTask = taskMethodsFromMeta(t).includes('qr');
              return (
              <div
                key={t.id}
                className={`m-card tasks-card${tone && !isDone ? ` tasks-card--${tone}` : ''}${isDone ? ' tasks-card--done' : ''}`}
                style={{
                  marginBottom: 10,
                  border: (t.status === 'available' || t.canResubmit) && !isDone ? '2px solid var(--m-accent, #B8621A)' : undefined,
                  opacity: t.status === 'soon' ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <strong className="tasks-card-title">{t.title}</strong>
                  <span className={`tasks-status-pill tasks-status-pill--${t.status || 'unknown'}`}>
                    {isDone && isQrTask ? '🟢 QR засчитан' : (STATUS_LABEL[t.status] || t.status)}
                  </span>
                </div>
                {t.category && (
                  <span className="tasks-cat-badge" data-tone={tone || 'sand'}>{t.category}</span>
                )}
                {t.description && <TaskDescriptionClamp text={t.description} />}
                <div style={{ fontSize: 11, color: isDone ? '#2F6B45' : '#888', marginTop: 6 }}>
                  +{t.points ?? 0} · {taskConfirmLabel(t)}
                  {repeatableProgressLabel(t) ? ` · ${repeatableProgressLabel(t)}` : ''}
                  {isDone && isQrTask ? ' · готово' : ''}
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
              );
            })}
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
