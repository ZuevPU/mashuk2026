import { useEffect, useRef, useState } from 'react';
import { Panel, PanelHeader, Group, Spinner, Button } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { apiPost, ApiError, getHashSearchParams } from '../api/client';
import { extractTaskQrToken } from '../utils/qrDeepLink';
import { peekPendingTaskQr, setPendingTaskQr } from '../utils/launchParams';
import {
  AnswerSuccessOverlay,
  type SubmitSuccessPayload,
  type AnswerConfirmationConfig,
} from '../components/questions/AnswerSuccessOverlay';

const SCAN_CONFIRM: AnswerConfirmationConfig = {
  enabled: true,
  showPoints: false,
  titleTemplate: 'QR принят',
};

type ResolveResult = {
  taskId: number;
  taskTitle?: string;
  qrToken?: string;
};

export function ScanPanel({ id }: { id: string }) {
  const routeNavigator = useRouteNavigator();
  const started = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Принимаем QR…');
  const [successPayload, setSuccessPayload] = useState<SubmitSuccessPayload | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fromHash = getHashSearchParams().get('qr');
    const raw = fromHash || peekPendingTaskQr()?.qr || '';
    const code = extractTaskQrToken(raw);

    if (!code) {
      setStatus('error');
      setMessage('Код QR не найден. Отсканируйте табличку камерой телефона.');
      return;
    }

    // Strip code from URL so it is not visible / re-applied on refresh
    try {
      const path = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', `${path}#/scan`);
    } catch {
      /* ignore */
    }

    void apiPost<ResolveResult>('/tasks/qr/resolve', { qr: code })
      .then((res) => {
        const token = extractTaskQrToken(res.qrToken || code) || code;
        setPendingTaskQr(token, res.taskId);
        setStatus('ok');
        setMessage(res.taskTitle
          ? `QR принят · ${res.taskTitle}. Откройте задание и нажмите «Отправить задание».`
          : 'QR принят. Откройте задание и нажмите «Отправить задание».');
        void routeNavigator.push(`/tasks?task=${res.taskId}`);
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'Не удалось принять QR';
        setStatus('error');
        setMessage(msg);
        setSuccessPayload({
          confirm: { ...SCAN_CONFIRM, titleTemplate: 'QR не принят', showPoints: false },
          detail: msg,
          tone: 'error',
          xpAwarded: 0,
          track: 'experience',
        });
      });
  }, [routeNavigator]);

  return (
    <Panel id={id}>
      <PanelHeader fixed>Скан QR</PanelHeader>
      <Group>
        <div className="m-card" style={{ textAlign: 'center', padding: 24 }}>
          {status === 'loading' && <Spinner />}
          <div style={{ marginTop: 12, fontSize: 15 }}>{message}</div>
          {status === 'error' && (
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
