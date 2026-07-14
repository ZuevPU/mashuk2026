import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button, Textarea, ModalRoot, ModalPage, ModalPageHeader, Snackbar, Input } from '@vkontakte/vkui';
import { apiGet, apiPost, ApiError, getHashSearchParams } from '../api/client';
import { uploadTaskPhoto } from '../utils/uploadPhoto';
import { useAppModal } from '../App';
import { EmptyState } from '../components/EmptyState';

const STATUS_LABEL: Record<string, string> = {
  soon: '⚪ Скоро',
  available: '🔵 Доступно',
  pending: '🟡 На проверке',
  done: '🟢 Выполнено',
  rejected: '🔴 Не принято',
};

const CONFIRM_HINT: Record<string, string> = {
  photo: 'Нужно фото',
  post_url: 'Нужна ссылка на пост',
  qr: 'Подтверждение по QR',
  auto: 'Автоподтверждение',
  team: 'Командное задание',
  text_photo: 'Текст и/или фото',
};

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
  const [teamMemberIds, setTeamMemberIds] = useState('');
  const confirmationType = meta?.confirmationType || 'text_photo';
  const qrFromHash = getHashSearchParams().get('qr');

  const needsText = confirmationType === 'text_photo' && meta?.answerType !== 'photo';
  const needsPhoto = confirmationType === 'photo'
    || (confirmationType === 'text_photo' && (meta?.answerType === 'photo' || meta?.answerType === 'text_and_photo'));
  const needsPostUrl = confirmationType === 'post_url';
  const needsTeam = confirmationType === 'team';
  const isQr = confirmationType === 'qr';
  const isAuto = confirmationType === 'auto';

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
    if (needsText && !answerText.trim()) return;
    if (needsPhoto && !photoUrl) {
      setSnackbar('Прикрепите фото');
      return;
    }
    if (needsPostUrl && !postUrl.trim()) {
      setSnackbar('Укажите ссылку на пост');
      return;
    }
    if (needsTeam && !teamMemberIds.trim()) {
      setSnackbar('Укажите ID участников команды');
      return;
    }
    try {
      const teamIds = teamMemberIds
        .split(/[,;\s]+/)
        .map(Number)
        .filter(Boolean);
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
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка отправки');
    }
  };

  return (
    <ModalPage id="task-submit" onClose={onClose}>
      <ModalPageHeader>Отправка задания</ModalPageHeader>
      <Group>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          {CONFIRM_HINT[confirmationType] || confirmationType}
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
          <Input
            value={teamMemberIds}
            onChange={e => setTeamMemberIds(e.target.value)}
            placeholder="ID участников через запятую"
            style={{ marginTop: 8 }}
          />
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
              <div key={t.id} className="m-card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{t.title}</strong>
                  <span style={{ fontSize: 12 }}>{STATUS_LABEL[t.status] || t.status}</span>
                </div>
                {t.description && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                  +{t.points ?? 0} · {CONFIRM_HINT[t.confirmationType] || t.confirmationType || 'текст/фото'}
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
