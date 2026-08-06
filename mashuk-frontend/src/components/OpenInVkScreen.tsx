import { Button } from '@vkontakte/vkui';

const DEFAULT_MINI_APP_URL = 'https://vk.ru/app54662212';

/** Production outside VK Mini App: auth launch params are unavailable. */
export function OpenInVkScreen({
  miniAppUrl = DEFAULT_MINI_APP_URL,
  reason,
}: {
  miniAppUrl?: string;
  reason?: string | null;
}) {
  return (
    <div
      className="mashuk-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
        textAlign: 'center',
        background: 'linear-gradient(180deg, #F7F2EA 0%, #FFF 55%)',
      }}
    >
      <div className="m-card" style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#1a1a1a' }}>
          МАШУК 2026
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
          Откройте приложение во ВКонтакте
        </div>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px', lineHeight: 1.45 }}>
          В обычном браузере вход недоступен: нужна авторизация VK Mini App.
          Запустите «МАШУК 2026» из приложения ВКонтакте или по ссылке ниже.
        </p>
        {reason ? (
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px', wordBreak: 'break-word' }}>
            {reason}
          </p>
        ) : null}
        <Button
          size="l"
          stretched
          href={miniAppUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть во ВКонтакте
        </Button>
        <p style={{ fontSize: 12, color: '#999', margin: '14px 0 0' }}>
          Если ссылка не открывает мини‑приложение — найдите его в сообществе форума
          или попросите организаторов прислать приглашение.
        </p>
      </div>
    </div>
  );
}
