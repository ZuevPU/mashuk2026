import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { withEveningQuestionNumber, type EveningField, type EveningQuestionnaireConfig, type EveningStep } from './types';
import {
  buildEveningProgramPickNodes,
  countProgramLeaves,
  flattenSelectableLeaves,
  type ProgramEventRow,
  type ProgramPickNode,
} from './programEventTree';

type ProgramEventItem = {
  eventId: number;
  eventTitle: string;
  parentEventId: number;
  parentEventTitle: string;
  score: number | null;
};

type ProgramEventValue = { items: ProgramEventItem[] };

type RoleOpt = { roleKey: string; name: string };

type Props = {
  day: number | null;
  config: EveningQuestionnaireConfig;
  programEvents: ProgramEventRow[];
  /** Роли из pedagogical_roles (админка «Роли»). */
  roles?: RoleOpt[];
};

function normalizeProgramValue(raw: unknown): ProgramEventValue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    const items = (o.items as ProgramEventItem[]).filter(i => i && Number(i.eventId) > 0);
    return items.length ? { items } : null;
  }
  if (Number(o.eventId) > 0) {
    return {
      items: [{
        eventId: Number(o.eventId),
        eventTitle: String(o.eventTitle || ''),
        parentEventId: Number(o.parentEventId) || Number(o.eventId),
        parentEventTitle: String(o.parentEventTitle || o.eventTitle || ''),
        score: o.score == null ? null : Number(o.score),
      }],
    };
  }
  return null;
}

function isProgramComplete(raw: unknown): boolean {
  const v = normalizeProgramValue(raw);
  if (!v?.items.length) return false;
  return v.items.every(i => i.score != null && i.score >= 1 && i.score <= 10);
}

function isValueSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (normalizeProgramValue(value)) return isProgramComplete(value);
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

function fieldVisible(field: EveningField, form: Record<string, unknown>, allFields: EveningField[], visiting: Set<string> = new Set()): boolean {
  if (!field.visibleWhen) return true;
  if (visiting.has(field.key)) return false;
  visiting.add(field.key);
  const parent = allFields.find(f => f.key === field.visibleWhen!.field);
  if (parent && !fieldVisible(parent, form, allFields, visiting)) return false;
  const v = form[field.visibleWhen.field];
  const expectedList = Array.isArray(field.visibleWhen.equals)
    ? field.visibleWhen.equals
    : [field.visibleWhen.equals];
  if (expectedList.length === 0) return false;
  return expectedList.some((expected) => {
    if (expected === '__set__') return isValueSet(v);
    if (expected === '__other__') {
      const opts = (parent?.options ?? []).map(o => String(o).trim());
      return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v.trim());
    }
    const left = typeof v === 'string' ? v.trim() : v;
    const right = typeof expected === 'string' ? expected.trim() : expected;
    if (left === right) return true;
    if (typeof right === 'boolean') {
      if (right) return left === 'true' || left === 'yes' || left === 1 || left === '1';
      return left === 'false' || left === 'no' || left === 0 || left === '0';
    }
    if (typeof right === 'number') return left === String(right) || Number(left) === right;
    if (typeof right === 'string' && typeof left === 'number') return String(left) === right;
    return false;
  });
}

function stepHasVisibleFields(step: EveningStep, form: Record<string, unknown>, day: number | null, allFields: EveningField[]): boolean {
  return step.fields.some(f => {
    if (!fieldVisible(f, form, allFields)) return false;
    if (f.type === 'role_select' && day != null && day > 6) return false;
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
  const items = value?.items || [];
  const [parentId, setParentId] = useState<number | null>(items[0]?.parentEventId ?? null);
  const parent = nodes.find(n => n.id === parentId) || null;
  const subtopics = parent
    ? flattenSelectableLeaves(parent).filter(l => l.id !== parent.id)
    : [];

  const emit = (next: ProgramEventItem[]) => onChange(next.length ? { items: next } : null);
  const find = (id: number) => items.find(i => i.eventId === id);

  return (
    <div className="adm-evening-preview-field">
      <div className="adm-evening-preview-label">{field.label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>1. Событие программы</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        Можно отметить несколько тем — под каждой шкала 1–10.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nodes.length === 0 && (
          <div style={{ fontSize: 12, color: '#888' }}>Нет блоков программы на этот день.</div>
        )}
        {nodes.map(root => {
          const active = parentId === root.id;
          const time = formatTimeRange(root.startTime, root.endTime);
          const leafCount = countProgramLeaves(root.children);
          const picked = items.filter(i => i.parentEventId === root.id).length;
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => {
                setParentId(root.id);
                if (!root.children.length && !find(root.id)) {
                  emit([...items, {
                    eventId: root.id,
                    eventTitle: root.title,
                    parentEventId: root.id,
                    parentEventTitle: root.title,
                    score: null,
                  }]);
                }
              }}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 12,
                border: active || picked > 0 ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                background: active || picked > 0 ? '#D8F3DC' : '#FBF9F5',
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
                {picked > 0 && (
                  <span style={{ fontWeight: 600, color: '#2D6A4F' }}> · выбрано {picked}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {parent && subtopics.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>2. Подсобытия / темы</div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>{parent.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {subtopics.map(leaf => {
              const item = find(leaf.id);
              const selected = !!item;
              return (
                <div
                  key={leaf.id}
                  style={{
                    borderRadius: 10,
                    border: selected ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                    background: selected ? '#F3FAF5' : '#fff',
                    padding: '8px 10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (selected) emit(items.filter(i => i.eventId !== leaf.id));
                      else emit([...items, {
                        eventId: leaf.id,
                        eventTitle: leaf.title,
                        parentEventId: parent.id,
                        parentEventTitle: parent.title,
                        score: null,
                      }]);
                    }}
                    style={{
                      display: 'flex',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: selected ? '#2D6A4F' : '#888' }}>
                      {selected ? '✓' : '·'}
                    </span>
                    <span style={{ flex: 1 }}>{leaf.title}</span>
                  </button>
                  {selected && item && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E5E5' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Оценка 1–10</div>
                      <div className="adm-evening-preview-scale">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                          <button
                            key={n}
                            type="button"
                            className={item.score === n ? 'is-on' : undefined}
                            onClick={() => emit(items.map(i => (
                              i.eventId === leaf.id ? { ...i, score: n } : i
                            )))}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EveningQuestionnaireParticipantPreview({
  day, config, programEvents, roles = [],
}: Props) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [tomorrowRole, setTomorrowRole] = useState(roles[0]?.roleKey || '');
  const [step, setStep] = useState(0);

  useEffect(() => {
    setForm({});
    setStep(0);
    setTomorrowRole(roles[0]?.roleKey || '');
  }, [day, config, roles]);

  const allConfigFields = useMemo(
    () => (config.steps || []).flatMap(s => s.fields),
    [config.steps],
  );

  const steps = useMemo(
    () => (config.steps || []).filter(s => stepHasVisibleFields(s, form, day, allConfigFields)),
    [config.steps, form, day, allConfigFields],
  );

  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const currentStep = steps[Math.min(step, Math.max(steps.length - 1, 0))] ?? null;
  const visibleFields = (currentStep?.fields || []).filter(f => fieldVisible(f, form, allConfigFields));
  const questionNumbers = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.type === 'info_text') continue;
        if (!fieldVisible(f, form, allConfigFields)) continue;
        if (f.type === 'role_select' && day != null && day > 6) continue;
        n += 1;
        map.set(f.key, n);
      }
    }
    return map;
  }, [steps, form, day, allConfigFields]);
  const showExperiment = !!currentStep && (
    currentStep.id === 'experiment' || currentStep.fields.some(f => f.type === 'experiment_text')
  );

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5' || field.type === 'scale_1_10') {
      const max = field.type === 'scale_1_10' ? 10 : 5;
      const selected = Number(form[field.key]);
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <div className="adm-evening-preview-scale">
            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                className={selected === n ? 'is-on' : undefined}
                onClick={() => setField(field.key, n)}
              >
                {n}
              </button>
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
      const current = normalizeProgramValue(form[field.key]);
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
    if (field.type === 'info_text') {
      const html = (field.html || '').trim();
      const plain = field.label.trim();
      return (
        <div
          key={field.key}
          className="adm-evening-info-block"
          {...(html
            ? { dangerouslySetInnerHTML: { __html: html } }
            : { children: plain || 'Текстовый блок' })}
        />
      );
    }
    if (field.type === 'role_select') {
      if (day != null && day > 6) return null;
      return (
        <div key={field.key} className="adm-evening-preview-field">
          <div className="adm-evening-preview-label">{field.label}</div>
          <select
            className="adm-input"
            value={tomorrowRole}
            onChange={e => setTomorrowRole(e.target.value)}
            style={{ width: '100%' }}
          >
            {roles.length === 0 ? (
              <option value="">Нет ролей в разделе «Роли»</option>
            ) : (
              roles.map(r => (
                <option key={r.roleKey} value={r.roleKey}>{r.name}</option>
              ))
            )}
          </select>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Список из админки «Роли» (pedagogical_roles)
          </div>
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
      <div className="adm-forum-preview-label">
        Как у участника · {day == null ? 'итоговая анкета форума' : `итоговая анкета · день ${day}`}
      </div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card">
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
            {day == null ? 'Итоговая анкета форума' : `Итоговая анкета · день ${day}`}
          </div>
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

          {visibleFields.map(f => renderField(withEveningQuestionNumber(f, questionNumbers)))}

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
