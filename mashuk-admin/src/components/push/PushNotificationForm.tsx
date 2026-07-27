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
      <label className="adm-muted" style={{ fontSize: 12 }}>Аудитория</label>
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
        <input
          className="adm-input"
          style={{ marginTop: 8 }}
          placeholder="ID через запятую"
          value={Array.isArray(payload.participantIds) ? payload.participantIds.join(', ') : ''}
          onChange={e => {
            const participantIds = e.target.value.split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n));
            onChange({ audiencePayload: { participantIds } });
          }}
        />
      )}
      {draft.audienceType === 'rule' && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <select
            className="adm-input"
            value={String((payload.rule as { conditions?: { field: string; cmp: string; value: string }[] })?.conditions?.[0]?.field ?? 'directionId')}
            onChange={e => onChange({
              audiencePayload: {
                rule: {
                  op: 'and',
                  conditions: [{ field: e.target.value, cmp: 'eq', value: '' }],
                },
              },
            })}
          >
            <option value="directionId">Направление (ID)</option>
            <option value="groupId">Группа (ID)</option>
            <option value="pedagogicalRole">Роль</option>
            <option value="isBlocked">Заблокирован</option>
          </select>
          <input
            className="adm-input"
            style={{ marginTop: 6 }}
            placeholder="Значение"
            value={String((payload.rule as { conditions?: { value: unknown }[] })?.conditions?.[0]?.value ?? '')}
            onChange={e => {
              const field = (payload.rule as { conditions?: { field: string; cmp: string; value: unknown }[] })?.conditions?.[0]?.field ?? 'directionId';
              let value: string | number | boolean = e.target.value;
              if (field === 'directionId' || field === 'groupId') value = Number(e.target.value);
              if (field === 'isBlocked') value = e.target.value === 'true';
              onChange({
                audiencePayload: {
                  rule: { op: 'and', conditions: [{ field, cmp: 'eq', value }] },
                },
              });
            }}
          />
        </div>
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

  return (
    <div className="card adm-task-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{draft.internalName || 'Новое уведомление'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTogglePreview}>
            👁 {showPreview ? 'Скрыть превью' : 'Предпросмотр'}
          </button>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onCancel}>Назад</button>
        </div>
      </div>

      <label className="adm-muted" style={{ fontSize: 12 }}>Использовать шаблон</label>
      <select
        className="adm-input"
        value=""
        onChange={e => {
          const id = Number(e.target.value);
          if (id) onApplyTemplate(id);
        }}
      >
        <option value="">— выбрать шаблон —</option>
        {presetTemplates.map(t => (
          <option key={t.id} value={t.id}>{t.title || t.key}</option>
        ))}
      </select>

      <div className="form-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <input className="adm-input" placeholder="Внутреннее название" value={draft.internalName} onChange={e => onChange({ internalName: e.target.value })} />
        <input className="adm-input" placeholder="Заголовок пуша" value={draft.pushTitle} onChange={e => onChange({ pushTitle: e.target.value })} />
        <input className="adm-input" style={{ width: 56 }} placeholder="Иконка" value={draft.icon} onChange={e => onChange({ icon: e.target.value })} />
        <select className="adm-input" value={draft.notificationType} onChange={e => onChange({ notificationType: e.target.value })}>
          {PUSH_NOTIFICATION_TYPE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      <textarea
        className="adm-input"
        rows={4}
        style={{ width: '100%', marginTop: 8 }}
        maxLength={200}
        placeholder="Текст (до 200 символов для VK)"
        value={draft.body}
        onChange={e => onChange({ body: e.target.value })}
      />
      <div className="adm-muted" style={{ fontSize: 11 }}>{draft.body.length}/200</div>

      <div style={{ marginTop: 8 }}>
        <label className="adm-muted" style={{ fontSize: 12 }}>Картинка</label>
        <input type="file" accept="image/*" onChange={e => {
          const f = e.target.files?.[0];
          if (f) onImagePick(f);
        }} />
        {draft.imageUrl && (
          <div style={{ fontSize: 11, marginTop: 4 }}>
            <a href={draft.imageUrl} target="_blank" rel="noreferrer">Прикреплено</a>
          </div>
        )}
      </div>

      <PushAudienceBuilder draft={draft} directions={directions} groups={groups} onChange={onChange} />

      <div className="form-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <select className="adm-input" value={draft.programDay === '' ? '' : draft.programDay} onChange={e => onChange({ programDay: e.target.value === '' ? '' : Number(e.target.value) })}>
          <option value="">День программы</option>
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>Д{d}</option>
          ))}
        </select>
        <input type="date" className="adm-input" value={draft.programDate} onChange={e => onChange({ programDate: e.target.value })} />
        <input type="datetime-local" className="adm-input" value={draft.publishAt} onChange={e => onChange({ publishAt: e.target.value })} title="Время публикации" />
        <input type="datetime-local" className="adm-input" value={draft.visibleUntil} onChange={e => onChange({ visibleUntil: e.target.value })} title="До скольки висит в приложении" />
      </div>

      <div className="form-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <select className="adm-input" value={draft.sendMode} onChange={e => onChange({ sendMode: e.target.value })}>
          {PUSH_SEND_MODE_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        {draft.sendMode === 'trigger' && (
          <>
            <select
              className="adm-input"
              value={String(draft.triggerConfig.kind ?? 'webhook')}
              onChange={e => onChange({ triggerConfig: { ...draft.triggerConfig, kind: e.target.value } })}
            >
              <option value="webhook">Webhook (ручной URL)</option>
              <option value="task_publish">Публикация задания</option>
              <option value="program_event_before">До события программы</option>
            </select>
            {draft.triggerConfig.kind === 'webhook' && (
              <input
                className="adm-input"
                readOnly
                value={String(draft.triggerConfig.token ?? '(создастся при сохранении)')}
                title="Token для POST /api/push/webhook/:token"
              />
            )}
            {draft.triggerConfig.kind === 'task_publish' && (
              <input
                className="adm-input"
                type="number"
                placeholder="ID задания (пусто = любое)"
                value={String(draft.triggerConfig.taskId ?? '')}
                onChange={e => onChange({
                  triggerConfig: {
                    ...draft.triggerConfig,
                    taskId: e.target.value ? Number(e.target.value) : undefined,
                  },
                })}
              />
            )}
            {draft.triggerConfig.kind === 'program_event_before' && (
              <>
                <input
                  className="adm-input"
                  type="number"
                  placeholder="ID события"
                  value={String(draft.triggerConfig.eventId ?? '')}
                  onChange={e => onChange({
                    triggerConfig: { ...draft.triggerConfig, eventId: Number(e.target.value) },
                  })}
                />
                <input
                  className="adm-input"
                  type="number"
                  placeholder="Минут до"
                  value={String(draft.triggerConfig.minutesBefore ?? 15)}
                  onChange={e => onChange({
                    triggerConfig: { ...draft.triggerConfig, minutesBefore: Number(e.target.value) },
                  })}
                />
              </>
            )}
          </>
        )}
      </div>

      {showPreview && (
        <div className="card" style={{ marginTop: 12, background: '#f8f8f8' }}>
          <strong>{draft.icon} {draft.pushTitle || 'Заголовок'}</strong>
          <div style={{ fontSize: 13, marginTop: 6 }}>{previewText ?? draft.body}</div>
        </div>
      )}

      <div className="adm-forum-toolbar" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => { onChange({ status: 'draft' }); onSaveDraft(); }}>
          Сохранить черновик
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTest}>Тест-отправка себе</button>
        <button type="button" className="adm-btn adm-btn-sm" onClick={() => onSend(draft.sendMode === 'scheduled' || draft.sendMode === 'trigger' ? 'queue' : 'now')}>
          {draft.sendMode === 'now' ? 'Отправить' : 'В очередь'}
        </button>
      </div>
    </div>
  );
}
