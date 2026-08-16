import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import type { PushTemplateRow } from './types';
import { PUSH_AUTO_SCHEDULE, PUSH_SYSTEM_EVENTS } from './pushLabels';

type BlockType = { id: number; key: string; name: string };

export function PushAutoSchedulePanel({ adminFetch, act }: Pick<AdminTabProps, 'adminFetch' | 'act'>) {
  const [pushNightSlot, setPushNightSlot] = useState(false);
  const [blockTypes, setBlockTypes] = useState<BlockType[]>([]);
  const [pushBlockTypes, setPushBlockTypes] = useState<Record<string, boolean>>({});
  const [slotTemplates, setSlotTemplates] = useState<PushTemplateRow[]>([]);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState('');

  const load = useCallback(async () => {
    const [fsRes, btRes, tplRes] = await Promise.all([
      adminFetch('/forum-settings'),
      adminFetch('/program-block-types'),
      adminFetch('/push/templates?kind=auto_slot'),
    ]);
    const fs = fsRes.settings;
    setPushNightSlot(!!fs?.pushNightSlotEnabled);
    setPushBlockTypes((fs?.pushBlockTypes as Record<string, boolean>) || {});
    setBlockTypes(btRes.blockTypes || []);
    setSlotTemplates(tplRes.templates || []);
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const saveSettings = () =>
    act(async () => {
      await adminFetch('/forum-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          pushNightSlotEnabled: pushNightSlot,
          pushBlockTypes,
        }),
      });
    }, 'Настройки сохранены');

  const toggleBlockType = (key: string, enabled: boolean) => {
    setPushBlockTypes(prev => {
      const next = { ...prev };
      if (enabled) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const startEditSlot = (slotKey: string) => {
    const tpl = slotTemplates.find(t => t.slotKey === slotKey || t.key === slotKey);
    setEditingSlot(slotKey);
    setSlotDraft(tpl?.body || '');
  };

  const saveSlotText = (tpl: PushTemplateRow | undefined, slotKey: string) =>
    act(async () => {
      const body = slotDraft.trim();
      if (!body) throw new Error('Введите текст сообщения');
      if (tpl?.id) {
        await adminFetch(`/push/templates/${tpl.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        });
      } else {
        await adminFetch('/push/templates', {
          method: 'POST',
          body: JSON.stringify({
            key: slotKey,
            slotKey,
            title: PUSH_AUTO_SCHEDULE.find(s => s.slotKey === slotKey)?.title || slotKey,
            body,
            kind: 'auto_slot',
            isActive: true,
          }),
        });
      }
      setEditingSlot(null);
      await load();
    }, 'Текст слота сохранён');

  return (
    <div className="adm-push-auto">
      <div className="card adm-forum-block" style={{ borderColor: 'var(--adm-danger, #c0392b)' }}>
        <h3>Авторассылка выключена</h3>
        <p className="adm-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Слоты 08:00–23:00, догонялки, пуш при публикации вопроса или задания и напоминания о программе
          больше не уходят сами. Рассылка только руками: «Уведомления → По дням», «Создать уведомление»
          или «Отправить в указанное время». Ниже — архив старых текстов, они не отправляются.
        </p>
      </div>
      <div className="card adm-forum-block" style={{ marginTop: 16 }}>
        <h3>Старые тексты слотов (не отправляются)</h3>
        <p className="adm-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Раньше бот слал эти сообщения по московскому времени. Сейчас расписание не работает.
        </p>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Время (МСК)</th>
              <th>Событие</th>
              <th>Что происходит</th>
              <th>Текст</th>
            </tr>
          </thead>
          <tbody>
            {PUSH_AUTO_SCHEDULE.map(row => {
              const tpl = slotTemplates.find(t => t.slotKey === row.slotKey || t.key === row.slotKey);
              const isOptionalOff = 'optional' in row && row.optional && !pushNightSlot;
              return (
                <tr key={row.slotKey} style={isOptionalOff ? { opacity: 0.5 } : undefined}>
                  <td><strong>{row.time}</strong></td>
                  <td>{row.title}{'optional' in row && row.optional ? ' · опционально' : ''}</td>
                  <td style={{ fontSize: 12 }}>{row.description}</td>
                  <td>
                    {editingSlot === row.slotKey ? (
                      <div>
                        <textarea
                          className="adm-input"
                          rows={3}
                          style={{ width: '100%', fontSize: 12 }}
                          maxLength={200}
                          value={slotDraft}
                          onChange={e => setSlotDraft(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => saveSlotText(tpl, row.slotKey)}>
                            Сохранить
                          </button>
                          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setEditingSlot(null)}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12 }}>
                        <div>{tpl?.body || '— стандартный текст —'}</div>
                        {!isOptionalOff && (
                          <button type="button" className="adm-link-btn" style={{ marginTop: 4 }} onClick={() => startEditSlot(row.slotKey)}>
                            Изменить текст
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card adm-forum-block" style={{ marginTop: 16 }}>
        <h3>Дополнительные настройки</h3>
        <label className="adm-field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={pushNightSlot}
            onChange={e => setPushNightSlot(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            <strong>Сообщение «Спокойной ночи» в 23:00</strong>
            <span className="adm-muted" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
              Короткое пожелание перед сном. Можно отключить, если не нужно беспокоить участников поздно.
            </span>
          </span>
        </label>

        <div className="adm-field" style={{ marginTop: 16 }}>
          <span className="adm-label">Напоминания о блоках программы</span>
          <p className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            <strong>Ключевые блоки</strong> (отмечены в календаре программы) всегда получают напоминание за 10–15 минут,
            если у события включено «Push-напоминание». Отметьте типы блоков, для которых нужны напоминания
            <em> дополнительно</em>:
          </p>
          {blockTypes.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 12 }}>Типы блоков не заданы — используйте только ключевые блоки в программе.</p>
          ) : (
            <div className="adm-push-block-grid">
              {blockTypes.map(bt => (
                <label key={bt.key} className="adm-push-block-chip">
                  <input
                    type="checkbox"
                    checked={pushBlockTypes[bt.key] === true}
                    onChange={e => toggleBlockType(bt.key, e.target.checked)}
                  />
                  {' '}{bt.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" style={{ marginTop: 12 }} onClick={saveSettings}>
          Сохранить настройки
        </button>
      </div>

      <div className="card adm-forum-block" style={{ marginTop: 16 }}>
        <h3>Что ещё отправляет бот автоматически</h3>
        <p className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Эти уведомления настраиваются в соответствующих разделах админки (вопросы, задания, программа, медали).
          Тексты формируются системой и не требуют ручной настройки здесь.
        </p>
        {PUSH_SYSTEM_EVENTS.map(section => (
          <div key={section.group} style={{ marginBottom: 16 }}>
            <strong>{section.group}</strong>
            <ul className="adm-list" style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
              {section.items.map(item => (
                <li key={item} style={{ border: 'none', padding: '4px 0' }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
