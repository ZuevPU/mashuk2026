import { useState, useEffect, useRef } from 'react';
import { Panel, PanelHeader, Group, FormItem, Input, Button, Snackbar, Textarea } from '@vkontakte/vkui';
import { apiPost, ApiError, getHashSearchParams } from '../api/client';
import { extractParticipantQrToken, extractTaskIdFromInput } from '../utils/qrDeepLink';
import { isVkEnvironment, openCodeReader } from '../utils/vkBridgeClient';

/** Панель волонтёра: VK CodeReader / deep-link / paste / file-input fallback */
export const VolunteerPanel: React.FC<{ id: string }> = ({ id }) => {
  const params = getHashSearchParams();
  const [qrInput, setQrInput] = useState(params.get('qr') || '');
  const [taskId, setTaskId] = useState(params.get('task') || '');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canNativeScan = isVkEnvironment();

  useEffect(() => {
    const p = getHashSearchParams();
    if (p.get('qr')) setQrInput(p.get('qr')!);
    if (p.get('task')) setTaskId(p.get('task')!);
  }, []);

  const applyPaste = (raw: string) => {
    setQrInput(raw);
    const token = extractParticipantQrToken(raw);
    if (token && token !== raw.trim()) setQrInput(token);
    const task = extractTaskIdFromInput(raw);
    if (task) setTaskId(task);
  };

  const scanNative = async () => {
    setScanning(true);
    try {
      const code = await openCodeReader();
      if (!code) {
        setSnackbar('Сканирование отменено или недоступно — вставьте ссылку вручную');
        return;
      }
      applyPaste(code);
      setSnackbar('QR распознан');
    } catch {
      setSnackbar('Не удалось открыть сканер VK');
    } finally {
      setScanning(false);
    }
  };

  const confirm = async () => {
    const token = extractParticipantQrToken(qrInput);
    if (!token || !taskId.trim()) {
      setSnackbar('Вставьте ссылку/токен QR участника и ID задания');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<{
        ok: boolean;
        alreadyConfirmed?: boolean;
        pointsAwarded?: number;
        participant?: { firstName?: string; lastName?: string };
      }>('/volunteer/confirm', {
        participantQrToken: token,
        taskId: Number(taskId),
      });
      const name = `${res.participant?.firstName || ''} ${res.participant?.lastName || ''}`.trim();
      if (res.alreadyConfirmed) {
        setLastResult(`Уже подтверждено: ${name || 'участник'}`);
      } else {
        setLastResult(`Подтверждено: ${name || 'участник'}${res.pointsAwarded ? ` · +${res.pointsAwarded}` : ''}`);
      }
      setSnackbar('Готово');
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка подтверждения');
    } finally {
      setLoading(false);
    }
  };

  const onImagePick = async (file: File | null) => {
    if (!file) return;
    setSnackbar('Вставьте ссылку из QR участника в поле ниже (#/volunteer?qr=…&task=…)');
  };

  return (
    <Panel id={id}>
      <PanelHeader>Волонтёр</PanelHeader>
      <Group>
        <div className="m-card" style={{ fontSize: 13, marginBottom: 8 }}>
          Отсканируйте QR участника сканером VK или вставьте ссылку / токен.
          Формат: <code>#/volunteer?qr=ТОКЕН&amp;task=ID</code>
        </div>
        <FormItem top="Ссылка или QR-токен участника">
          <Textarea
            value={qrInput}
            onChange={e => applyPaste(e.target.value)}
            placeholder="Вставьте #/volunteer?qr=… или токен"
          />
        </FormItem>
        <FormItem top="ID задания">
          <Input value={taskId} onChange={e => setTaskId(e.target.value)} placeholder="например 12" type="number" />
        </FormItem>
        {canNativeScan && (
          <Button size="l" stretched mode="secondary" style={{ marginBottom: 8 }} loading={scanning} onClick={scanNative}>
            Сканировать QR (камера VK)
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => onImagePick(e.target.files?.[0] || null)}
        />
        <Button size="l" stretched mode="tertiary" style={{ marginBottom: 8 }} onClick={() => fileRef.current?.click()}>
          Открыть камеру / фото (fallback)
        </Button>
        <Button size="l" stretched loading={loading} onClick={confirm}>
          Подтвердить выполнение
        </Button>
        {lastResult && (
          <div className="m-card" style={{ marginTop: 12, color: '#2F855A' }}>{lastResult}</div>
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
