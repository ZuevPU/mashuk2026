import type { PushDraft, PushTemplateRow } from './types';
import {
  PUSH_AUDIENCE_OPTIONS,
  PUSH_NOTIFICATION_TYPE_OPTIONS,
  PUSH_SEND_MODE_OPTIONS,
} from './types';

type Props = {
  draft: PushDraft;
  templates: PushTemplateRow[];
  directions: { id: number; name: string }[];
  groups: { id: number; name: string }[];
  totalDays: number;
  showPreview: boolean;
  previewText?: string | null;
  onChange: (patch: Partial<PushDraft>) => void;
  onApplyTemplate: (templateId: number) => void;
  onSaveDraft: () => void;
  onTest: () => void;
  onTogglePreview: () => void;
  onSend: (mode: 'now' | 'queue') => void;
  onCancel: () => void;
  onImagePick: (file: File) => void;
};

export function PushAudienceBuilder({
  draft,
  directions,
  groups,
  onChange,
}: Pick<Props, 'draft' | 'directions' | 'groups' | 'onChange'>) {
  const payload = draft.audiencePayload;

  return (
    <div className="adm-forum-block" style={{ marginTop: 12 }}>
      <span className="adm-label">Кому отправить</span>
      <select
        className="adm-input"
        value={draft.audienceType}
        onChange={e => onChange({ audienceType: e.target.value, audiencePayload: {} })}
      >
        {PUSH_AUDIENCE_OPTIONS.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      {draft.audienceType === 'direction' && (
        <select
          className="adm-input"
          style={{ marginTop: 8 }}
          value={String(payload.directionId ?? '')}
          onChange={e => onChange({ audiencePayload: { directionId: Number(e.target.value) } })}
        >
          <option value="">Выберите направление</option>
          {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      {draft.audienceType === 'group' && (
        <select
          className="adm-input"
          style={{ marginTop: 8 }}
          value={String(payload.groupId ?? '')}
          onChange={e => onChange({ audiencePayload: { groupId: Number(e.target.value) } })}
        >
          <option value="">Выберите группу</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
      {draft.audienceType === 'ids' && (
        <>
          <input
            className="adm-input"
            style={{ marginTop: 8 }}
            placeholder="ID участников через запятую (из карточки участника)"
            value={Array.isArray(payload.participantIds) ? payload.participantIds.join(', ') : ''}
            onChange={e => {
              const participantIds = e.target.value.split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n));
              onChange({ audiencePayload: { participantIds } });
            }}
          />
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Номер участника виден в админке в разделе «Участники» или в URL карточки.
          </p>
        </>
      )}
    </div>
  );
}

export function PushNotificationForm(props: Props) {
  const {
    draft, templates, directions, groups, totalDays, showPreview, previewText,
    onChange, onApplyTemplate, onSaveDraft, onTest, onTogglePreview, onSend, onCancel, onImagePick,
  } = props;

  const presetTemplates = templates.filter(t => t.kind !== 'auto_slot');
  const typeHint = PUSH_NOTIFICATION_TYPE_OPTIONS.find(o => o.key === draft.notificationType)?.label;

  return (
    <div className="card adm-task-form adm-push-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{draft.internalName || 'Новая рассылка'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTogglePreview}>
            👁 {showPreview ? 'Скрыть превью' : 'Как увидит участник'}
          </button>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onCancel}>← К списку</button>
        </div>
      </div>

      <p className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Ручная рассылка: текст уйдёт во VK и появится баннером в мини-приложении до указанного времени.
        Лимит текста для VK — 200 символов.
      </p>

      <label className="adm-field">
        <span className="adm-label">Шаблон (необязательно)</span>
        <select
          className="adm-input"
          value=""
          onChange={e => {
            const id = Number(e.target.value);
            if (id) onApplyTemplate(id);
          }}
        >
          <option value="">— начать с пустого или выбрать шаблон —</option>
          {presetTemplates.map(t => (
            <option key={t.id} value={t.id}>{t.title || t.key}</option>
          ))}
        </select>
      </label>

      <label className="adm-field">
        <span className="adm-label">Название для себя</span>
        <input
          className="adm-input"
          placeholder="Например: Напоминание о сборе в 9:00"
          value={draft.internalName}
          onChange={e => onChange({ internalName: e.target.value })}
        />
        <span className="adm-muted" style={{ fontSize: 11 }}>Участники это название не видят — только для списка в админке.</span>
      </label>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Заголовок в приложении</span>
          <input className="adm-input" placeholder="Короткий заголовок" value={draft.pushTitle} onChange={e => onChange({ pushTitle: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Иконка</span>
          <input className="adm-input" placeholder="🔔" value={draft.icon} onChange={e => onChange({ icon: e.target.value })} />
        </label>
      </div>

      <label className="adm-field">
        <span className="adm-label">Тип уведомления</span>
        <select className="adm-input" value={draft.notificationType} onChange={e => onChange({ notificationType: e.target.value })}>
          {PUSH_NOTIFICATION_TYPE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <span className="adm-muted" style={{ fontSize: 11 }}>
          Участник может отключить отдельные типы в профиле. Сейчас: {typeHint}.
        </span>
      </label>

      <label className="adm-field">
        <span className="adm-label">Текст сообщения</span>
        <textarea
          className="adm-input"
          rows={4}
          style={{ width: '100%' }}
          maxLength={200}
          placeholder="Текст, который получит участник"
          value={draft.body}
          onChange={e => onChange({ body: e.target.value })}
        />
        <span className="adm-muted" style={{ fontSize: 11 }}>{draft.body.length}/200 символов</span>
      </label>

      <label className="adm-field">
        <span className="adm-label">Картинка в баннере приложения (необязательно)</span>
        <input type="file" accept="image/*" className="adm-input" onChange={e => {
          const f = e.target.files?.[0];
          if (f) onImagePick(f);
        }} />
        {draft.imageUrl && (
          <div style={{ fontSize: 11, marginTop: 4 }}>
            <a href={draft.imageUrl} target="_blank" rel="noreferrer">Прикреплено</a>
          </div>
        )}
      </label>

      <PushAudienceBuilder draft={draft} directions={directions} groups={groups} onChange={onChange} />

      <div className="adm-forum-grid-2" style={{ marginTop: 12 }}>
        <label className="adm-field">
          <span className="adm-label">День программы (для фильтра)</span>
          <select className="adm-input" value={draft.programDay === '' ? '' : draft.programDay} onChange={e => onChange({ programDay: e.target.value === '' ? '' : Number(e.target.value) })}>
            <option value="">Не привязано</option>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Дата (календарная)</span>
          <input type="date" className="adm-input" value={draft.programDate} onChange={e => onChange({ programDate: e.target.value })} />
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Когда отправить</span>
          <input type="datetime-local" className="adm-input" value={draft.publishAt} onChange={e => onChange({ publishAt: e.target.value })} />
          <span className="adm-muted" style={{ fontSize: 11 }}>Для отложенной отправки укажите дату и время.</span>
        </label>
        <label className="adm-field">
          <span className="adm-label">Баннер в приложении до</span>
          <input type="datetime-local" className="adm-input" value={draft.visibleUntil} onChange={e => onChange({ visibleUntil: e.target.value })} />
          <span className="adm-muted" style={{ fontSize: 11 }}>После этого времени баннер скроется у участников.</span>
        </label>
      </div>

      <label className="adm-field">
        <span className="adm-label">Способ отправки</span>
        <select className="adm-input" value={draft.sendMode} onChange={e => onChange({ sendMode: e.target.value })}>
          {PUSH_SEND_MODE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        {draft.sendMode === 'scheduled' && (
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Укажите «Когда отправить» выше — сообщение попадёт в очередь и уйдёт в это время. Это ваша отложенная отправка, не автослот.
          </p>
        )}
        {draft.sendMode === 'trigger' && (
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Отправка «по событию» выключена. Выберите «сразу» или «в указанное время».
          </p>
        )}
      </label>

      {showPreview && (
        <div className="card adm-push-preview" style={{ marginTop: 12 }}>
          <span className="adm-label">Предпросмотр</span>
          <strong>{draft.icon} {draft.pushTitle || 'Заголовок'}</strong>
          <div style={{ fontSize: 13, marginTop: 6 }}>{previewText ?? draft.body}</div>
        </div>
      )}

      <div className="adm-forum-toolbar adm-medal-form-footer">
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => { onChange({ status: 'draft' }); onSaveDraft(); }}>
          Сохранить черновик
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTest}>
          Отправить себе (тест)
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          disabled={!draft.body.trim()}
          onClick={() => onSend(draft.sendMode === 'scheduled' || draft.sendMode === 'trigger' ? 'queue' : 'now')}
        >
          {draft.sendMode === 'now' ? 'Отправить участникам' : 'Поставить в очередь'}
        </button>
        {!draft.body.trim() && (
          <span className="adm-muted" style={{ fontSize: 12 }}>Введите текст сообщения</span>
        )}
      </div>
    </div>
  );
}
