import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { AdminAccordion } from '../admin/AdminAccordion';

type ContentKind = 'question' | 'task' | 'event' | 'evening' | 'forum_wrap';

type BoardItem = {
  kind: ContentKind;
  id: number;
  title: string;
  subtitle: string;
  status: string;
  canSend: boolean;
  cannotSendReason: string | null;
  defaultText: string;
  lastSentAt: string | null;
  scheduledAt: string | null;
};

type Board = {
  day: number;
  totalDays: number;
  questions: BoardItem[];
  tasks: BoardItem[];
  events: BoardItem[];
  hint?: string;
};

type Composer = {
  item: BoardItem;
  text: string;
  scheduledAt: string;
  preview: string | null;
  force: boolean;
};

function formatWhen(iso: string | null): string {
  if (!iso) return 'ещё не отправляли';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PushContentBoard({ adminFetch, act, reloadKey }: Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'>) {
  const [day, setDay] = useState(1);
  const [totalDays, setTotalDays] = useState(8);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState<Composer | null>(null);

  const load = useCallback(async (nextDay = day) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/push/content-board?day=${nextDay}`) as Board;
      setBoard(res);
      setTotalDays(res.totalDays || 8);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, day]);

  useEffect(() => {
    load(day).catch(() => setLoading(false));
  }, [load, day, reloadKey]);

  const openComposer = (item: BoardItem) => {
    setComposer({
      item,
      text: item.defaultText,
      scheduledAt: item.scheduledAt ? toLocalInput(item.scheduledAt) : '',
      preview: item.defaultText,
      force: false,
    });
  };

  const runPreview = () => {
    if (!composer) return;
    act(async () => {
      const res = await adminFetch('/push/content-board/preview', {
        method: 'POST',
        body: JSON.stringify({
          kind: composer.item.kind,
          id: composer.item.id,
          day,
          text: composer.text,
          title: composer.item.title,
        }),
      }) as { preview?: string };
      setComposer(c => c ? { ...c, preview: res.preview || c.text } : c);
    }, 'Превью обновлено', { reload: false });
  };

  const send = (force = false) => {
    if (!composer) return;
    const { item, text, scheduledAt } = composer;
    if (!text.trim()) {
      alert('Введите текст сообщения');
      return;
    }
    act(async () => {
      try {
        const res = await adminFetch('/push/content-board/send', {
          method: 'POST',
          body: JSON.stringify({
            kind: item.kind,
            id: item.id,
            day,
            text: text.trim(),
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
            force: force || composer.force,
          }),
        }) as { message?: string };
        setComposer(null);
        await load(day);
        return res.message || 'Готово';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/уже отправлено|ещё раз/i.test(msg)) {
          setComposer(c => c ? { ...c, force: true } : c);
        }
        throw err;
      }
    }, 'Отправлено');
  };

  const renderTable = (items: BoardItem[], empty: string) => {
    if (!items.length) return <p className="adm-muted">{empty}</p>;
    return (
      <div className="adm-table-scroll">
        <table className="adm-table adm-table-compact">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Последняя отправка</th>
              <th>План</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={`${item.kind}-${item.id}`}>
                <td>{item.title}</td>
                <td className="adm-muted">{item.subtitle}</td>
                <td>{item.status}</td>
                <td>{formatWhen(item.lastSentAt)}</td>
                <td>{item.scheduledAt ? formatWhen(item.scheduledAt) : '—'}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-primary adm-btn-xs"
                    disabled={!item.canSend}
                    title={item.cannotSendReason || 'Текст, превью, время и отправка'}
                    onClick={() => openComposer(item)}
                  >
                    Уведомление
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <p className="adm-muted" style={{ marginTop: 0 }}>
        Создали вопрос, задание или слот — они сразу здесь, даже черновиком.
        Отправка: уведомление мини-приложения + личное сообщение от сообщества.
        Повтор в тот же день не уйдёт сам, только если нажмёте «ещё раз».
      </p>
      <div className="adm-seg" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
          <button
            key={d}
            type="button"
            className={day === d ? 'on' : ''}
            onClick={() => setDay(d)}
          >
            День {d}
          </button>
        ))}
      </div>

      {loading && !board ? (
        <p className="adm-muted">Загрузка дня…</p>
      ) : (
        <>
          <AdminAccordion
            title="Вопросы и итоговая анкета"
            summary={`${board?.questions.length ?? 0}`}
            defaultOpen
          >
            {renderTable(board?.questions || [], 'На этот день вопросов нет')}
          </AdminAccordion>
          <AdminAccordion
            title="Задания"
            summary={`${board?.tasks.length ?? 0}`}
            defaultOpen
          >
            {renderTable(board?.tasks || [], 'На этот день заданий нет')}
          </AdminAccordion>
          <AdminAccordion
            title="Программа"
            summary={`${board?.events.length ?? 0}`}
          >
            {renderTable(board?.events || [], 'На этот день слотов программы нет')}
          </AdminAccordion>
        </>
      )}

      {composer && (
        <div className="adm-modal-backdrop" onClick={() => setComposer(null)}>
          <div className="card" style={{ maxWidth: 560, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Уведомление</h3>
            <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
              {composer.item.title}
              <br />
              Уйдёт в мини-приложение и в личку сообщества. Ссылка откроет нужный экран.
            </p>
            {composer.item.lastSentAt && (
              <p className="adm-muted" style={{ fontSize: 13 }}>
                Уже отправляли: {formatWhen(composer.item.lastSentAt)}
              </p>
            )}
            <label className="adm-field">
              <span className="adm-label">Текст</span>
              <textarea
                className="adm-input"
                rows={5}
                value={composer.text}
                onChange={e => setComposer(c => c ? { ...c, text: e.target.value } : c)}
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Отправить в дату и время (пусто = сразу)</span>
              <input
                type="datetime-local"
                className="adm-input"
                value={composer.scheduledAt}
                onChange={e => setComposer(c => c ? { ...c, scheduledAt: e.target.value } : c)}
              />
            </label>
            {composer.preview && (
              <div className="card" style={{ background: '#F7F4EE', margin: '12px 0', padding: 12 }}>
                <div className="adm-muted" style={{ fontSize: 11, marginBottom: 6 }}>Как увидит участник</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{composer.preview}</div>
              </div>
            )}
            {composer.force && (
              <label className="adm-field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={composer.force}
                  onChange={e => setComposer(c => c ? { ...c, force: e.target.checked } : c)}
                />
                <span>Отправить ещё раз сегодня</span>
              </label>
            )}
            <div className="form-row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={runPreview}>
                Превью
              </button>
              <button type="button" className="adm-btn adm-btn-primary" onClick={() => send(composer.force)}>
                {composer.scheduledAt ? 'Запланировать' : composer.force ? 'Отправить ещё раз' : 'Отправить'}
              </button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setComposer(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
