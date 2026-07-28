import { useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import type { AdminTabProps } from '../admin/types';
import {
  PUSH_NOTIFICATION_TYPE_OPTIONS,
  PUSH_PRESET_CATEGORY_OPTIONS,
  type PushTemplateRow,
} from './types';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act'> & {
  templates: PushTemplateRow[];
  onReload: () => void;
};

const emptyTpl = () => ({
  key: '',
  title: '',
  pushTitle: '',
  body: '',
  icon: '🔔',
  notificationType: 'reminder',
  presetCategory: 'reminder',
});

export function PushTemplatesPanel({ adminFetch, act, templates, onReload }: Props) {
  const [form, setForm] = useState(emptyTpl);

  const presets = templates.filter(t => t.kind !== 'auto_slot');

  return (
    <div className="card adm-forum-block">
      <h3>Шаблоны (пресеты)</h3>
      <p className="adm-muted" style={{ fontSize: 12 }}>
        Плейсхолдеры: {'{ФИО}'}, {'{День}'}, {'{Роль}'}, {'{Событие}'} — разворачиваются при отправке.
      </p>
      <div className="form-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="adm-input" placeholder="Название (key)" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
        <input className="adm-input" placeholder="Заголовок в админке" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input className="adm-input" placeholder="Заголовок пуша" value={form.pushTitle} onChange={e => setForm({ ...form, pushTitle: e.target.value })} />
        <input className="adm-input" style={{ width: 56 }} placeholder="Иконка" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />
        <select className="adm-input" value={form.presetCategory} onChange={e => setForm({ ...form, presetCategory: e.target.value })}>
          {PUSH_PRESET_CATEGORY_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <select className="adm-input" value={form.notificationType} onChange={e => setForm({ ...form, notificationType: e.target.value })}>
          {PUSH_NOTIFICATION_TYPE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      <textarea
        className="adm-input"
        rows={3}
        style={{ width: '100%', marginTop: 8 }}
        placeholder="Текст шаблона"
        value={form.body}
        onChange={e => setForm({ ...form, body: e.target.value })}
      />
      <button
        type="button"
        className="adm-btn adm-btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => act(async () => {
          await adminFetch('/push/templates', {
            method: 'POST',
            body: JSON.stringify({ ...form, kind: 'preset' }),
          });
          setForm(emptyTpl());
          onReload();
        }, 'Шаблон создан')}
      >
        Добавить пресет
      </button>

      {PUSH_PRESET_CATEGORY_OPTIONS.map(cat => {
        const group = presets.filter(t => t.presetCategory === cat.key);
        if (!group.length) return null;
        return (
          <div key={cat.key} style={{ marginTop: 16 }}>
            <strong>{cat.label}</strong>
            {group.map(t => (
              <div key={t.id} className="card" style={{ marginTop: 8, fontSize: 12 }}>
                <div>{t.icon} <strong>{t.title || t.key}</strong></div>
                <div style={{ color: '#666' }}>{t.pushTitle}</div>
                <div>{t.body}</div>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    if (confirmDelete('Удалить шаблон?')) {
                      act(async () => {
                        await adminFetch(`/push/templates/${t.id}`, { method: 'DELETE' });
                        onReload();
                      });
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
