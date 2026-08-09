import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar, Input, Radio, Checkbox } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { uploadTaskPhoto } from '../utils/uploadPhoto';
import { codeReaderFailureMessage, isVkEnvironment, readCodeWithVk } from '../utils/vkBridgeClient';
import { extractTaskQrToken, parseTaskQrScan } from '../utils/qrDeepLink';
import { decodeQrFromImageFile } from '../utils/decodeQrFromImage';
import { getDeviceKey } from '../utils/deviceKey';
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
    if (m === 'qr') return 'QR';
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
  onRequestVkScan,
}: {
  taskId: number | null;
  meta: any;
  onClose: () => void;
  onSuccess: () => void;
  onSubmitSuccess: (p: SubmitSuccessPayload) => void;
  setSnackbar: (msg: string) => void;
  /** Close modal first, then open VK CodeReader (iOS often fails if modal is open). */
  onRequestVkScan: () => void;
}) => {
  const [answerText, setAnswerText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamResults, setTeamResults] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [scannedQr, setScannedQr] = useState('');
  const [qrPaste, setQrPaste] = useState('');
  const [selectedChoice, setSelectedChoice] = useState('');
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [qrDecoding, setQrDecoding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const autoQrSubmitRef = useRef(false);
  const qrFileRef = useRef<HTMLInputElement>(null);
  const qrGalleryRef = useRef<HTMLInputElement>(null);
  const canNativeScan = isVkEnvironment();
  const methods = taskMethodsFromMeta(meta);
  const answerType = meta?.answerType || (methods.includes('photo') ? 'text_and_photo' : 'text');
  const answerOptions: Array<{ label: string; value: string }> = meta?.answerOptions || [];
  const qrFromHash = getHashSearchParams().get('qr');
  const effectiveQr = scannedQr || qrFromHash || meta?._scannedQr || '';

  useEffect(() => {
    setScannedQr(meta?._scannedQr || '');
    setQrPaste('');
    setSelectedChoice('');
    setSelectedMulti([]);
    setAnswerText('');
    setPhotoUrl(null);
    setSubmitting(false);
    setFormError(null);
    autoQrSubmitRef.current = false;
  }, [taskId, meta?._scannedQr]);

  /** Top-layer portal card (above VK ModalPage). Keep submit modal open unless closing. */
  const showQrOverlay = useCallback((payload: SubmitSuccessPayload) => {
    onSubmitSuccess(payload);
  }, [onSubmitSuccess]);

  const applyScannedQr = useCallback((raw: string) => {
    const token = extractTaskQrToken(raw);
    if (!token) {
      showQrOverlay({
        confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'Не удалось прочитать QR', showPoints: false },
        detail: 'Нужна ссылка задания с параметром qr=… или откройте QR обычной камерой телефона.',
        tone: 'error',
        xpAwarded: 0,
        track: 'experience',
      });
      return false;
    }
    setScannedQr(token);
    setQrPaste(raw.trim());
    setFormError(null);
    return true;
  }, [showQrOverlay]);

  const handleQrImageFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setQrDecoding(true);
    try {
      const raw = await decodeQrFromImageFile(file);
      if (!raw) {
        showQrOverlay({
          confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'QR на фото не найден', showPoints: false },
          detail: 'Снимите QR крупнее при хорошем свете, без бликов. Или выберите чёткое фото из галереи / вставьте ссылку с QR.',
          tone: 'error',
          xpAwarded: 0,
          track: 'experience',
        });
        return;
      }
      applyScannedQr(raw);
    } catch {
      showQrOverlay({
        confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'Не удалось прочитать фото', showPoints: false },
        detail: 'Попробуйте другое фото или вставьте ссылку с QR.',
        tone: 'error',
        xpAwarded: 0,
        track: 'experience',
      });
    } finally {
      setQrDecoding(false);
    }
  }, [applyScannedQr, showQrOverlay]);

  const finishSuccess = useCallback((payload: SubmitSuccessPayload) => {
    onClose();
    onSubmitSuccess(payload);
    onSuccess();
  }, [onClose, onSubmitSuccess, onSuccess]);

  const finishAlreadySubmitted = useCallback((message: string) => {
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

  const submitQrTask = useCallback(async (qrValue: string) => {
    if (!taskId || !qrValue || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiPost<{
        xpAwarded?: number;
        track?: 'path' | 'experience';
        submission?: { status?: string };
      }>(`/tasks/${taskId}/submit`, {
        answerText: 'Готово',
        qrToken: qrValue,
        deviceKey: getDeviceKey(),
      });
      const xp = res.xpAwarded ?? 0;
      const status = res.submission?.status || (xp > 0 ? 'approved' : 'pending');
      const approved = status === 'approved' || xp > 0;
      finishSuccess({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: approved ? 'QR-задание выполнено' : 'QR принят — на проверке',
          showPoints: xp > 0,
        },
        detail: approved
          ? (xp > 0 ? `Начислено +${xp} опыта` : 'Задание подтверждено')
          : 'Организаторы проверят ответ. Баллы придут после подтверждения.',
        tone: approved ? 'success' : 'info',
        xpAwarded: xp,
        track: res.track ?? 'experience',
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка отправки';
      if (err instanceof ApiError && isTaskAlreadySubmittedError(msg)) {
        finishAlreadySubmitted(msg);
        return;
      }
      showQrOverlay({
        confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'Сканирование не принято', showPoints: false },
        detail: msg,
        tone: 'error',
        xpAwarded: 0,
        track: 'experience',
      });
      setFormError(msg);
      setSubmitting(false);
    }
  }, [taskId, submitting, finishSuccess, finishAlreadySubmitted, showQrOverlay]);

  const needsFreeText = answerType === 'text' || answerType === 'text_and_photo';
  const needsPhoto = answerType === 'photo' || answerType === 'text_and_photo';
  const isChoice = answerType === 'choice';
  const isMulti = answerType === 'multi';
  const needsPostUrl = methods.includes('link');
  const needsTeam = methods.includes('team');
  const isQr = methods.includes('qr');
  const isAuto = methods.length === 0;

  useEffect(() => {
    if (!isQr || !effectiveQr || needsPhoto || needsPostUrl || needsTeam || needsFreeText || isChoice || isMulti) return;
    if (autoQrSubmitRef.current) return;
    autoQrSubmitRef.current = true;
    void submitQrTask(effectiveQr);
  }, [isQr, effectiveQr, needsPhoto, needsPostUrl, needsTeam, needsFreeText, isChoice, isMulti, submitQrTask]);

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
    if (answerType === 'text' && !answerText.trim()) {
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
    if (isQr && !effectiveQr) {
      setFormError('Отсканируйте QR задания');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const teamIds = selectedTeam.map(p => p.id);
      const res = await apiPost<{ xpAwarded?: number; track?: 'path' | 'experience' }>(`/tasks/${taskId}/submit`, {
        answerText: submitAnswerText() || (isAuto || isQr ? 'Готово' : undefined),
        photoUrl,
        postUrl: postUrl || undefined,
        teamMemberIds: teamIds.length ? teamIds : undefined,
        qrToken: effectiveQr || undefined,
        deviceKey: isQr ? getDeviceKey() : undefined,
      });
      const xp = res.xpAwarded ?? 0;
      const teamPending = methods.includes('team');
      finishSuccess({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: teamPending ? 'Задание отправлено команде' : TASK_SUBMIT_CONFIRM.titleTemplate,
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
          <div className="tasks-answer-block-title">Ваш ответ</div>
          {isAuto && (
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Нажмите «Подтвердить» — задание подтвердится автоматически.
            </div>
          )}
          {isQr && (
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {effectiveQr
                ? 'QR распознан — начисляем баллы…'
                : 'Сфотографируйте QR площадки или откройте его обычной камерой телефона. Сканер VK на части iPhone не открывается — это нормально.'}
              <input
                ref={qrFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  void handleQrImageFile(file);
                }}
              />
              <input
                ref={qrGalleryRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  void handleQrImageFile(file);
                }}
              />
              <Button
                size="l"
                mode="primary"
                stretched
                loading={qrDecoding}
                style={{ marginTop: 8 }}
                onClick={() => qrFileRef.current?.click()}
              >
                Сфотографировать QR
              </Button>
              <Button
                size="m"
                mode="secondary"
                stretched
                loading={qrDecoding}
                style={{ marginTop: 8 }}
                onClick={() => qrGalleryRef.current?.click()}
              >
                Выбрать фото QR из галереи
              </Button>
              {canNativeScan && (
                <Button
                  size="m"
                  mode="secondary"
                  stretched
                  style={{ marginTop: 8 }}
                  onClick={onRequestVkScan}
                >
                  Сканер VK (если работает)
                </Button>
              )}
              <Input
                style={{ marginTop: 8 }}
                value={qrPaste}
                placeholder="Вставьте ссылку с QR (#/tasks?task=…&qr=…)"
                onChange={e => setQrPaste(e.target.value)}
              />
              <Button
                size="m"
                mode="tertiary"
                stretched
                style={{ marginTop: 8 }}
                onClick={() => {
                  if (!qrPaste.trim()) {
                    showQrOverlay({
                      confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'Вставьте ссылку QR', showPoints: false },
                      detail: 'Скопируйте ссылку с QR или нажмите «Сфотографировать QR».',
                      tone: 'info',
                      xpAwarded: 0,
                      track: 'experience',
                    });
                    return;
                  }
                  applyScannedQr(qrPaste);
                }}
              >
                Подтвердить ссылку QR
              </Button>
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
          <Button
            size="l"
            stretched
            onClick={() => void handleSubmit()}
            style={{ marginTop: 12 }}
            loading={submitting}
            disabled={submitting || (isChoice && !selectedChoice) || (isMulti && selectedMulti.length === 0) || (answerType === 'text' && !answerText.trim()) || (needsPhoto && !photoUrl) || (isQr && !effectiveQr)}
          >
            {submitting
              ? 'Отправляем…'
              : isAuto || (isQr && effectiveQr)
                ? 'Подтвердить'
                : 'Отправить на проверку'}
          </Button>
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
    setSubmitTaskId(task.id);
    setSubmitTaskMeta(task);
  }, []);

  const applyVkScanResult = useCallback((raw: string, reopenTask?: any) => {
    const parsed = parseTaskQrScan(raw);
    if (parsed) {
      const task = data?.tasks?.find((t: { id: number }) => t.id === parsed.taskId) || reopenTask;
      if (task) {
        if (window.location.hash.split('?')[0] !== '#/tasks') {
          window.location.hash = `#/tasks?task=${parsed.taskId}&qr=${encodeURIComponent(parsed.qrToken)}`;
        }
        openSubmit({ ...task, _scannedQr: parsed.qrToken });
        return;
      }
      window.location.hash = `#/tasks?task=${parsed.taskId}&qr=${encodeURIComponent(parsed.qrToken)}`;
      return;
    }
    const token = extractTaskQrToken(raw);
    if (token && reopenTask) {
      openSubmit({ ...reopenTask, _scannedQr: token });
      return;
    }
    setSuccessPayload({
      confirm: { ...TASK_SUBMIT_CONFIRM, titleTemplate: 'Это не QR задания', showPoints: false },
      detail: 'Нужна ссылка вида #/tasks?task=…&qr=… — или нажмите «Сфотографировать QR» в задании.',
      tone: 'error',
      xpAwarded: 0,
      track: 'experience',
    });
    if (reopenTask) openSubmit(reopenTask);
  }, [data?.tasks, openSubmit]);

  /** VK CodeReader must not run under ModalPage — close first (iOS). */
  const requestVkScanForOpenTask = useCallback(async () => {
    const task = submitTaskMeta;
    if (!task) return;
    setSubmitTaskId(null);
    await new Promise<void>(resolve => { window.setTimeout(() => resolve(), 400); });
    const result = await readCodeWithVk();
    if (!result.ok) {
      setSuccessPayload({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: result.reason === 'cancelled' ? 'Сканирование отменено' : 'Сканер VK не открылся',
          showPoints: false,
        },
        detail: `${codeReaderFailureMessage(result.reason)}\n\nОткройте задание снова и нажмите «Сфотографировать QR».`,
        tone: result.reason === 'cancelled' ? 'info' : 'error',
        xpAwarded: 0,
        track: 'experience',
      });
      openSubmit(task);
      return;
    }
    applyVkScanResult(result.code, task);
  }, [submitTaskMeta, openSubmit, applyVkScanResult]);

  const scanTaskQr = useCallback(async () => {
    const result = await readCodeWithVk();
    if (!result.ok) {
      setSuccessPayload({
        confirm: {
          ...TASK_SUBMIT_CONFIRM,
          titleTemplate: result.reason === 'cancelled' ? 'Сканирование отменено' : 'Сканер VK не открылся',
          showPoints: false,
        },
        detail: `${codeReaderFailureMessage(result.reason)}\n\nОткройте задание и нажмите «Сфотографировать QR».`,
        tone: result.reason === 'cancelled' ? 'info' : 'error',
        xpAwarded: 0,
        track: 'experience',
      });
      return;
    }
    applyVkScanResult(result.code);
  }, [applyVkScanResult]);

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
            onRequestVkScan={() => { void requestVkScanForOpenTask(); }}
          />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [submitTaskId, submitTaskMeta, load, setModal, activePanel, id, requestVkScanForOpenTask]);

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
              <button type="button" className="tasks-filter-chip tasks-filter-chip--scan" onClick={() => void scanTaskQr()}>
                Скан QR
              </button>
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
              return (
              <div
                key={t.id}
                className={`m-card tasks-card${tone ? ` tasks-card--${tone}` : ''}`}
                style={{
                  marginBottom: 10,
                  border: (t.status === 'available' || t.canResubmit) ? '2px solid var(--m-accent, #B8621A)' : undefined,
                  opacity: t.status === 'soon' ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <strong className="tasks-card-title">{t.title}</strong>
                  <span className={`tasks-status-pill tasks-status-pill--${t.status === 'unknown'}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                {t.category && (
                  <span className="tasks-cat-badge" data-tone={tone || 'sand'}>{t.category}</span>
                )}
                {t.description && <TaskDescriptionClamp text={t.description} />}
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
