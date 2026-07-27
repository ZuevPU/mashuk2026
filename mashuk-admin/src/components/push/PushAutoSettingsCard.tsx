import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';

export function PushAutoSettingsCard({ adminFetch, act }: Pick<AdminTabProps, 'adminFetch' | 'act'>) {
  const [pushNightSlot, setPushNightSlot] = useState(false);
  const [pushBlockTypesJson, setPushBlockTypesJson] = useState('{}');

  const load = useCallback(async () => {
    const fs = (await adminFetch('/forum-settings')).settings;
    setPushNightSlot(!!fs?.pushNightSlotEnabled);
    setPushBlockTypesJson(JSON.stringify(fs?.pushBlockTypes || {}, null, 2));
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="card adm-forum-block">
      <h3>Настройки автопush</h3>
      <label className="adm-forum-check" style={{ display: 'block', marginBottom: 8 }}>
        <input type="checkbox" checked={pushNightSlot} onChange={e => setPushNightSlot(e.target.checked)} />
        {' '}Ночной push 23:00 («Спокойной ночи»)
      </label>
      <p className="adm-muted" style={{ fontSize: 12 }}>
        Напоминания о блоках программы: JSON типов блоков (true = push за 10–15 мин).
      </p>
      <textarea
        className="adm-input"
        value={pushBlockTypesJson}
        onChange={e => setPushBlockTypesJson(e.target.value)}
        rows={4}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      <button
        type="button"
        className="adm-btn adm-btn-secondary adm-btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => act(async () => {
          let parsed: Record<string, boolean> = {};
          try {
            parsed = JSON.parse(pushBlockTypesJson || '{}');
          } catch {
            throw new Error('Некорректный JSON push_block_types');
          }
          await adminFetch('/forum-settings', {
            method: 'PATCH',
            body: JSON.stringify({ pushNightSlotEnabled: pushNightSlot, pushBlockTypes: parsed }),
          });
        }, 'Настройки push сохранены')}
      >
        Сохранить настройки push
      </button>
      <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>
        Слоты: {label('slot_0800')}, {label('slot_1300')}… — подписи в журнале через словарь.
      </p>
    </div>
  );
}
