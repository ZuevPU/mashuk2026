import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EveningField, EveningQuestionnaireConfig, EveningStep } from './types';
import {
  buildEveningProgramPickNodes,
  countProgramLeaves,
  flattenSelectableLeaves,
  type ProgramEventRow,
  type ProgramPickNode,
} from './programEventTree';

type ProgramEventValue = {
  eventId: number;
  eventTitle: string;
  parentEventId?: number | null;
  parentEventTitle?: string | null;
};

type Props = {
  day: number;
  config: EveningQuestionnaireConfig;
  programEvents: ProgramEventRow[];
};

const MOCK_ROLES = [
  { roleKey: 'navigator', name: 'Навигатор' },
  { roleKey: 'facilitator', name: 'Фасилитатор' },
  { roleKey: 'mentor', name: 'Наставник' },
];

function isValueSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object' && value !== null && 'eventId' in value) {
    return Number.isFinite(Number((value as ProgramEventValue).eventId));
  }
  return false;
}

function fieldVisible(field: EveningField, form: Record<string, unknown>, allFields: EveningField[]): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  const expected = field.visibleWhen.equals;
  if (expected === '__set__') return isValueSet(v);
  if (expected === '__other__') {
    const parent = allFields.find(f => f.key === field.visibleWhen!.field);
    const opts = parent?.options ?? [];
    return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v);
  }
  return v === expected;
}

function stepHasVisibleFields(step: EveningStep, form: Record<string, unknown>, day: number): boolean {
  return step.fields.some(f => {
    if (!fieldVisible(f, form, step.fields)) return false;
    if (f.type === 'role_select' && day > 6) return false;
    return true;
  });
}

function formatTimeRange(start?: string | null, end?: string | null): string {
  const fmt = (raw?: string | null) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a}–${b}`;
  return a || b || '';
}

function ChipBtn({
  active,
  onClick,
  children,
  wide,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: wide ? undefined : 36,
        minWidth: wide ? undefined : 36,
        height: wide ? undefined : 36,
        padding: wide ? '8px 14px' : 0,
        borderRadius: wide ? 10 : 8,
        border: active ? '2px solid #2D6A4F' : '1px solid #ddd',
        background: active ? '#D8F3DC' : '#fff',
        fontWeight: 700,
        cursor: 'pointer',
        fontSize: wide ? 13 : 14,
      }}
    >
      {children}
    </button>
  );
}

function ProgramEventPreviewField({
  field,
  value,
  nodes,
  onChange,
}: {
  field: EveningField;
  value: ProgramEventValue | null;
  nodes: ProgramPickNode[];
  onChange: (v: ProgramEventValue | null) => void;
}) {
  const [parentId, setParentId] = useState<number | null>(value?.parentEventId ?? null);
  const parent = nodes.find(n => n.id === parentId) || null;
  const subtopics = parent
    ? flattenSelectableLeaves(parent).filter(l => l.id !== parent.id)
    : [];

  return (
    <div className="adm-evening-preview-field">
      <div className="adm-evening-preview-label">{field.label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>1. Событие программы</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nodes.length === 0 && (
          <div style={{ fontSize: 12, color: '#888' }}>Нет блоков программы на этот день.</div>
        )}
        {nodes.map(root => {
          const active = parentId === root.id;
          const time = formatTimeRange(root.startTime, root.endTime);
          const leafCount = countProgramLeaves(root.children);
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => {
                setParentId(root.id);
                if (!root.children.length) {
                  onChange({
                    eventId: root.id,
                    eventTitle: root.title,
                    parentEventId: root.id,
                    parentEventTitle: root.title,
                  });
                } else if (value?.parentEventId !== root.id) {
                  onChange(null);
                }
              }}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 12,
                border: active ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                background: active ? '#D8F3DC' : '#FBF9F5',
                cursor: 'pointer',
              }}
            >
              {time && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2D6A4F', marginBottom: 4 }}>{time}</div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
                {root.title}
                {leafCount > 0 && (
                  <span style={{ fontWeight: 500, color: '#666' }}> · {leafCount} тем</span>
                )}
              </div>
              {leafCount > 0 && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  {active ? '▼ выберите подсобытие ниже' : '▼ есть подсобытия'}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {parent && subtopics.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>2. Подсобытие / тема</div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>{parent.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subtopics.map(leaf => {
              const selected = value?.eventId === leaf.id;
              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() => onChange({
                    eventId: leaf.id,
                    eventTitle: leaf.title,
                    parentEventId: parent.id,
                    parentEventTitle: parent.title,
                  })}
                  style={{
                    display: 'flex',
                    gap: 8,
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: selected ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                    background: selected ? '#D8F3DC' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    lineHeight: 1.35,
                  }}
                >
                  <span style={{ color: '#888' }}>·</span>
                  <span style={{ flex: 1 }}>{leaf.title}</span>
                  <span style={{ color: '#888' }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {value && (
        <div style={{ fontSize: 12, color: '#2D6A4F', marginTop: 10, fontWeight: 600 }}>
          Выбрано: {value.parentEventTitle && value.parentEventTitle !== value.eventTitle
            ? `${value.parentEventTitle} → ${value.eventTitle}`
            : value.eventTitle}
        </div>
      )}
    </div>
  );
}

export function EveningQuestionnaireParticipantPreview({ day, config, programEvents }: Props) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [tomorrowRole, setTomorrowRole] = useState(MOCK_ROLES[0].roleKey);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setForm({});
    setStep(0);
    setTomorrowRole(MOCK_ROLES[0].roleKey);
  }, [day, config]);

  const steps = useMemo(
    () => (config.steps || []).filter(s => stepHasVisibleFields(s, form, day)),
    [config.steps, form, day],
  );

  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const currentStep = steps[Math.min(step, Math.max(steps.length - 1, 0))] ?? null;
  const visibleFields = (currentStep?.fields || []).filter(f => fieldVisible(f, form, currentStep?.fields || []));
  const showExperiment = !!currentStep && (
    currentStep.id === 'experiment' || currentStep.fields.some(f => f.type === 'experiment_text')
  );

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5') {
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <ChipBtn key={n} active={form[field.key] === n} onClick={() => setField(field.key, n)}>{n}</ChipBtn>
            ))}
          </div>
        </div>
      );
    }
    if (field.type === 'scale_1_10') {
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <ChipBtn key={n} active={form[field.key] === n} onClick={() => setField(field.key, n)}>{n}</ChipBtn>
            ))}
          </div>
        </div>
      );
    }
    if (field.type === 'yes_no') {
      const val = !!form[field.key];
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ChipBtn wide active={val === true} onClick={() => setField(field.key, true)}>Да</ChipBtn>
            <ChipBtn wide active={form[field.key] === false} onClick={() => setField(field.key, false)}>Нет</ChipBtn>
          </div>
        </div>
      );
    }
    if (field.type === 'choice') {
      const opts = (field.options || []).map(o => String(o).trim()).filter(Boolean);
      const raw = String(form[field.key] ?? '');
      const otherOn = !!field.allowOther && raw.length > 0 && !opts.includes(raw);
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setField(field.key, opt)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: raw === opt ? '2px solid #2D6A4F' : '1px solid #ddd',
                  background: raw === opt ? '#D8F3DC' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {opt}
              </button>
            ))}
            {field.allowOther && (
              <>
                <button
                  type="button"
                  onClick={() => setField(field.key, otherOn ? raw : ' ')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: otherOn ? '2px solid #2D6A4F' : '1px solid #ddd',
                    background: otherOn ? '#D8F3DC' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {field.otherLabel || 'Свой вариант'}
                </button>
                {otherOn && (
                  <textarea
                    value={raw.trim() ? raw : ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder="Введите свой вариант…"
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      );
    }
    if (field.type === 'program_event') {
      const nodes = buildEveningProgramPickNodes(programEvents, day, field.linkedEventIds);
      const current = isValueSet(form[field.key]) ? form[field.key] as ProgramEventValue : null;
      return (
        <ProgramEventPreviewField
          key={field.key}
          field={field}
          value={current}
          nodes={nodes}
          onChange={v => setField(field.key, v)}
        />
      );
    }
    if (field.type === 'text' || field.type === 'experiment_text') {
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <textarea
            value={String(form[field.key] || '')}
            onChange={e => setField(field.key, e.target.value)}
            placeholder={field.type === 'experiment_text' ? 'Кратко: что попробовали…' : 'Ваш ответ…'}
            style={{
              width: '100%',
              minHeight: field.type === 'experiment_text' ? 88 : 48,
              borderRadius: 10,
              border: '1px solid #ddd',
              padding: 10,
              fontFamily: 'inherit',
            }}
          />
        </div>
      );
    }
    if (field.type === 'role_select') {
      if (day > 6) return null;
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <select
            className="adm-input"
            value={tomorrowRole}
            onChange={e => setTomorrowRole(e.target.value)}
            style={{ width: '100%' }}
          >
            {MOCK_ROLES.map(r => (
              <option key={r.roleKey} value={r.roleKey}>{r.name}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={field.key} className="adm-evening-preview-field">
        <div className="adm-evening-preview-label">{field.label}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Тип «{field.type}» (на устройстве участника)</div>
      </div>
    );
  };

  if (!currentStep) {
    return (
      <div className="adm-evening-preview-shell">
        <div className="adm-forum-preview-label">Как у участника · итоговая анкета</div>
        <div className="adm-evening-preview-phone">
          <div className="adm-evening-preview-card">Нет шагов анкеты для этого дня.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-evening-preview-shell">
      <div className="adm-forum-preview-label">Как у участника · итоговая анкета · день {day}</div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card">
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Итоговая анкета · день {day}</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
            {currentStep.title} · шаг {step + 1} из {steps.length} · можно закрыть и вернуться
          </div>
          <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
            <div
              style={{
                width: `${((step + 1) / Math.max(steps.length, 1)) * 100}%`,
                height: 4,
                background: '#2D6A4F',
                borderRadius: 4,
              }}
            />
          </div>

          {showExperiment && (
            <div className="adm-evening-preview-experiment">
              <div className="adm-evening-preview-experiment-tag">Эксперимент с ролью</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B8621A', marginBottom: 6 }}>
                Роль дня: Навигатор
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Пример эксперимента дня</div>
              <p style={{ fontSize: 12, lineHeight: 1.45, margin: '0 0 8px', color: '#555' }}>
                Здесь участник видит текст эксперимента, который опубликован для его роли на этот день.
              </p>
              <div style={{ fontSize: 11, color: '#888' }}>Подсказка: зафиксируйте, что получилось / не получилось.</div>
            </div>
          )}

          {visibleFields.map(renderField)}

          {day === 7 && currentStep.fields.some(f => f.type === 'role_select') && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              День 7 — роль на день отъезда не выбираем.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {step > 0 && (
              <button type="button" className="adm-evening-preview-btn secondary" onClick={() => setStep(s => s - 1)}>
                Назад
              </button>
            )}
            {step < steps.length - 1 ? (
              <button type="button" className="adm-evening-preview-btn primary" style={{ flex: 1 }} onClick={() => setStep(s => s + 1)}>
                Далее
              </button>
            ) : (
              <button type="button" className="adm-evening-preview-btn primary" style={{ flex: 1 }} onClick={() => alert('В превью сохранение не отправляется')}>
                Сохранить
              </button>
            )}
          </div>
          <button type="button" className="adm-evening-preview-btn ghost" style={{ width: '100%', marginTop: 8 }}>
            Отложить
          </button>
        </div>
      </div>
    </div>
  );
}
