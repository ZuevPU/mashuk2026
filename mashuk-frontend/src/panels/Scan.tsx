import { useEffect, useRef, useState } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { apiPost, ApiError, getHashSearchParams, setStoredShiftId } from '../api/client';
import { getDeviceKey } from '../utils/deviceKey';
import { extractTaskQrToken } from '../utils/qrDeepLink';
import { clearPendingTaskQr, peekPendingTaskQr, takePendingTaskQr } from '../utils/launchParams';
import {
  AnswerSuccessOverlay,
  type SubmitSuccessPayload,
  type AnswerConfirmationConfig,
} from '../components/questions/AnswerSuccessOverlay';

const SCAN_CONFIRM: AnswerConfirmationConfig = {
  enabled: true,
  showPoints: true,
  titleTemplate: 'Задание засчитано',
};

type ScanResult = {
  points?: number;
  xpAwarded?: number;
  taskTitle?: string;
  taskId?: number;
  shiftId?: number | null;
};

export function ScanPanel({ id }: { id: string }) {
  const routeNavigator = useRouteNavigator();
  const started = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Засчитываем QR…');
  const [successPayload, setSuccessPayload] = useState<SubmitSuccessPayload | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fromHash = getHashSearchParams().get('qr');
    const raw = fromHash || peekPendingTaskQr()?.qr || '';
    const code = extractTaskQrToken(raw);
    takePendingTaskQr();

    if (!code) {
      setStatus('error');
      setMessage('Код QR не найден. Отсканируйте табличку камерой телефона.');
      return;
    }

    // Strip code from URL so refresh does not re-submit
    try {
      const path = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', `${path}#/scan`);
    } catch {
      /* ignore */
    }

    void apiPost<ScanResult>('/tasks/scan', { qr: code, deviceKey: getDeviceKey() })
      .then((res) => {
        clearPendingTaskQr();
        if (res.shiftId) setStoredShiftId(res.shiftId);
        const points = res.points ?? res.xpAwarded ?? 0;
        setStatus('ok');
        setMessage(res.taskTitle
          ? `Засчитано · ${res.taskTitle}${points > 0 ? ` · +${points}` : ''}`
          : 'Задание засчитано');
        setSuccessPayload({
          confirm: { ...SCAN_CONFIRM, showPoints: points > 0 },
          detail: res.taskTitle || undefined,
          tone: 'success',
          xpAwarded: points,
          track: 'experience',
        });
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'Не удалось засчитать QR';
        setStatus('error');
        setMessage(msg);
        setSuccessPayload({
          confirm: { ...SCAN_CONFIRM, titleTemplate: 'QR не засчитан', showPoints: false },
          detail: msg,
          tone: 'error',
          xpAwarded: 0,
          track: 'experience',
        });
      });
  }, []);

  return (
    <Panel id={id}>
      <PanelHeader fixed>Скан QR</PanelHeader>
      <Group>
        <div className="m-card" style={{ textAlign: 'center', padding: 24 }}>
          {status === 'loading' && <Spinner />}
          <div style={{ marginTop: 12, fontSize: 15 }}>{message}</div>
          {status !== 'loading' && (
            <Button
              size="l"
              stretched
              style={{ marginTop: 16 }}
              onClick={() => routeNavigator.push('/tasks')}
            >
              К заданиям
            </Button>
          )}
        </div>
      </Group>
      {successPayload && (
        <AnswerSuccessOverlay
          payload={successPayload}
          onDone={() => {
            setSuccessPayload(null);
            void routeNavigator.push('/tasks');
          }}
        />
      )}
    </Panel>
  );
}
