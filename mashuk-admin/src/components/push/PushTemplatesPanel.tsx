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
  title: '',
  pushTitle: '',
  body: '',
  icon: '🔔',
  notificationType: 'reminder',
  presetCategory: 'reminder',
});

function slugFromTitle(title: string): string {
  const base = title.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\wа-яё]/gi, '').slice(0, 40);
  return base ? `preset_${base}_${Date.now().toString(36).slice(-4)}` : `preset_${Date.now().toString(36)}`;
}

export function PushTemplatesPanel({ adminFetch, act, templates, onReload }: Props) {
  const [form, setForm] = useState(emptyTpl);

  const presets = templates.filter(t => t.kind !== 'auto_slot');

  return (
    <div className="card adm-forum-block">
      <h3>Шаблоны для ручных рассылок</h3>
      <p className="adm-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Заготовки текстов для кнопки «Создать уведомление». При отправке подставятся данные участника:
        {' '}<strong>{'{ФИО}'}</strong>, <strong>{'{День}'}</strong>, <strong>{'{Роль}'}</strong>, <strong>{'{Событие}'}</strong>.
        Автоматические слоты выключены — отсюда уходят только тексты, которые вы отправите сами.
      </p>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Название шаблона</span>
          <input className="adm-input" placeholder="Например: Срочное объявление" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Категория</span>
          <select className="adm-input" value={form.presetCategory} onChange={e => setForm({ ...form, presetCategory: e.target.value })}>
            {PUSH_PRESET_CATEGORY_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Заголовок пуша</span>
          <input className="adm-input" placeholder="Заголовок" value={form.pushTitle} onChange={e => setForm({ ...form, pushTitle: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Иконка</span>
          <input className="adm-input" placeholder="🔔" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />
        </label>
      </div>

      <label className="adm-field">
        <span className="adm-label">Тип уведомления</span>
        <select className="adm-input" value={form.notificationType} onChange={e => setForm({ ...form, notificationType: e.target.value })}>
          {PUSH_NOTIFICATION_TYPE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="adm-field">
        <span className="adm-label">Текст шаблона</span>
        <textarea
          className="adm-input"
          rows={3}
          style={{ width: '100%' }}
          placeholder="{ФИО}, напоминаем: сегодня {День} смены — загляните в приложение."
          value={form.body}
          onChange={e => setForm({ ...form, body: e.target.value })}
        />
      </label>

      <button
        type="button"
        className="adm-btn adm-btn-primary adm-btn-sm"
        disabled={!form.title.trim() || !form.body.trim()}
        onClick={() => act(async () => {
          await adminFetch('/push/templates', {
            method: 'POST',
            body: JSON.stringify({
              ...form,
              key: slugFromTitle(form.title),
              kind: 'preset',
            }),
          });
          setForm(emptyTpl());
          onReload();
        }, 'Шаблон создан')}
      >
        Добавить шаблон
      </button>

      {PUSH_PRESET_CATEGORY_OPTIONS.map(cat => {
        const group = presets.filter(t => t.presetCategory === cat.key);
        if (!group.length) return null;
        return (
          <div key={cat.key} style={{ marginTop: 20 }}>
            <strong>{cat.label}</strong>
            {group.map(t => (
              <div key={t.id} className="card" style={{ marginTop: 8, fontSize: 13, padding: 12 }}>
                <div>{t.icon} <strong>{t.title || t.key}</strong></div>
                {t.pushTitle && <div className="adm-muted" style={{ marginTop: 4 }}>{t.pushTitle}</div>}
                <div style={{ marginTop: 6 }}>{t.body}</div>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  style={{ marginTop: 8 }}
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
