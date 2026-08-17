import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CustomSelect, FormItem } from '@vkontakte/vkui';
import { apiPatch, apiPost } from '../../api/client';

export type EveningField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  html?: string;
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  linkedEventIds?: number[];
  /** Empty / missing = all directions. Non-empty = only these direction ids. */
  audienceDirectionIds?: number[];
  visibleWhen?: { field: string; equals: boolean | string | number | Array<boolean | string | number> };
};

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

type RoleOpt = { roleKey: string; name: string };

export type EveningProgramEventNode = {
  id: number;
  title: string;
  place?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  children: EveningProgramEventNode[];
};

export type EveningProgramEventItem = {
  eventId: number;
  eventTitle: string;
  parentEventId: number;
  parentEventTitle: string;
  score: number | null;
};

export type EveningProgramEventValue = {
  items: EveningProgramEventItem[];
};

function formatEventTimeRange(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  const fmt = (v: string | Date | null | undefined) => {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a}–${b}`;
  return a || b || '';
}

function countProgramLeaves(nodes: EveningProgramEventNode[] | undefined): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((n, ch) => n + (ch.children?.length ? countProgramLeaves(ch.children) : 1), 0);
}

export type EveningExperimentContext = {
  status?: string;
  title?: string;
  body?: string;
  hint?: string;
  roleName?: string;
} | null;

export type EveningQuestionnaireProps = {
  currentDay: number;
  questionnaire: {
    /** Forum day this evening survey belongs to (may differ from clock currentDay). */
    dayNumber?: number;
    config?: { steps: EveningStep[] };
    roles?: RoleOpt[];
    askTomorrowRole?: boolean;
    savedDraft?: { step?: number; form?: Record<string, unknown>; tomorrowRoleKey?: string } | null;
    pointBQuestionId?: number | null;
    hasPointB?: boolean;
    programEventOptions?: Record<string, {
      events: EveningProgramEventNode[];
      emptyReason?: 'none' | 'none_in_program' | 'none_conducted_yet';
    }>;
  };
  experiment?: EveningExperimentContext;
  /** Override API paths for the forum wrap-up questionnaire. */
  submitPath?: string;
  draftPath?: string;
  heading?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

function normalizeProgramEventValue(raw: unknown): EveningProgramEventValue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    const items: EveningProgramEventItem[] = [];
    for (const row of o.items) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const eventId = Number(r.eventId);
      if (!Number.isFinite(eventId) || eventId <= 0) continue;
      const scoreNum = r.score == null || r.score === '' ? NaN : Number(r.score);
      items.push({
        eventId,
        eventTitle: String(r.eventTitle || ''),
        parentEventId: Number(r.parentEventId) || eventId,
        parentEventTitle: String(r.parentEventTitle || r.eventTitle || ''),
        score: Number.isFinite(scoreNum) && scoreNum >= 1 && scoreNum <= 10 ? Math.floor(scoreNum) : null,
      });
    }
    return items.length ? { items } : null;
  }
  const eventId = Number(o.eventId);
  if (!Number.isFinite(eventId) || eventId <= 0) return null;
  const scoreNum = o.score == null || o.score === '' ? NaN : Number(o.score);
  return {
    items: [{
      eventId,
      eventTitle: String(o.eventTitle || ''),
      parentEventId: Number(o.parentEventId) || eventId,
      parentEventTitle: String(o.parentEventTitle || o.eventTitle || ''),
      score: Number.isFinite(scoreNum) && scoreNum >= 1 && scoreNum <= 10 ? Math.floor(scoreNum) : null,
    }],
  };
}

function isProgramEventValue(raw: unknown): boolean {
  return normalizeProgramEventValue(raw) != null;
}

function isProgramEventComplete(raw: unknown): boolean {
  const v = normalizeProgramEventValue(raw);
  if (!v?.items.length) return false;
  return v.items.every(i => i.score != null && i.score >= 1 && i.score <= 10);
}

function isFieldValueSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (isProgramEventValue(value)) return isProgramEventComplete(value);
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

function sanitizeInfoHtml(html: string): string {
  if (!html) return '';
  const root = document.createElement('div');
  root.innerHTML = html;
  const allowed = new Set(['P', 'BR', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'FONT', 'H3', 'H4', 'UL', 'OL', 'LI']);
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!allowed.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ''));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'src' || name === 'href') {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          const safe = (child.getAttribute('style') || '')
            .split(';')
            .map(s => s.trim())
            .filter(s => /^(color|font-size|font-weight|font-style|text-decoration|text-align|background-color)\s*:/i.test(s))
            .join('; ');
          if (safe) child.setAttribute('style', safe);
          else child.removeAttribute('style');
        }
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

function fieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
  allFields: EveningField[] = [],
  visiting: Set<string> = new Set(),
): boolean {
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
    if (expected === '__set__') return isFieldValueSet(v);
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

/** Flatten nested sub-blocks to selectable leaves under a large program block. */
function flattenSelectableLeaves(node: EveningProgramEventNode): EveningProgramEventNode[] {
  if (!node.children?.length) return [node];
  return node.children.flatMap(ch => flattenSelectableLeaves(ch));
}

function scaleValue(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function ScaleButtons({
  max,
  value,
  onChange,
}: {
  max: 5 | 10;
  value: unknown;
  onChange: (n: number) => void;
}) {
  const selected = scaleValue(value);
  return (
    <div className="evening-q__scale" role="group">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          className={`evening-q__scale-btn${selected === n ? ' is-on' : ''}`}
          aria-pressed={selected === n}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(n);
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ScoreRow({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <ScaleButtons max={10} value={value} onChange={onChange} />
    </div>
  );
}

function ProgramEventPicker({
  field,
  value,
  nodes,
  emptyReason,
  onChange,
}: {
  field: EveningField;
  value: EveningProgramEventValue | null;
  nodes: EveningProgramEventNode[];
  emptyReason?: string;
  onChange: (v: EveningProgramEventValue | null) => void;
}) {
  const items = value?.items || [];
  const initialParentId = items[0]?.parentEventId
    ?? (items[0] && nodes.some(n => n.id === items[0].eventId) ? items[0].eventId : null);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(initialParentId);

  useEffect(() => {
    if (!items.length) return;
    const last = items[items.length - 1];
    const pid = last.parentEventId
      ?? (nodes.some(n => n.id === last.eventId) ? last.eventId : null);
    if (pid != null) setSelectedParentId(pid);
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps -- follow last pick

  const selectedParent = nodes.find(n => n.id === selectedParentId) || null;
  const subtopics = selectedParent
    ? flattenSelectableLeaves(selectedParent).filter(l => l.id !== selectedParent.id)
    : [];
  const needsSubtopic = subtopics.length > 0;

  const emit = (nextItems: EveningProgramEventItem[]) => {
    onChange(nextItems.length ? { items: nextItems } : null);
  };

  const findItem = (eventId: number) => items.find(i => i.eventId === eventId);

  const toggleLeaf = (leaf: EveningProgramEventNode, root: EveningProgramEventNode) => {
    const existing = findItem(leaf.id);
    if (existing) {
      emit(items.filter(i => i.eventId !== leaf.id));
      return;
    }
    emit([
      ...items,
      {
        eventId: leaf.id,
        eventTitle: leaf.title,
        parentEventId: root.id,
        parentEventTitle: root.title,
        score: null,
      },
    ]);
  };

  const setScore = (eventId: number, score: number) => {
    emit(items.map(i => (i.eventId === eventId ? { ...i, score } : i)));
  };

  const pickParent = (root: EveningProgramEventNode) => {
    setSelectedParentId(root.id);
    if (!root.children?.length) {
      const existing = findItem(root.id);
      if (!existing) {
        emit([
          ...items.filter(i => i.parentEventId !== root.id || i.eventId !== root.id),
          {
            eventId: root.id,
            eventTitle: root.title,
            parentEventId: root.id,
            parentEventTitle: root.title,
            score: null,
          },
        ]);
      }
    }
  };

  const parentSelectedCount = (rootId: number) =>
    items.filter(i => i.parentEventId === rootId).length;

  return (
    <FormItem top={<span className="evening-q__label">{field.label}</span>} topMultiline>
      {nodes.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.4 }}>
          {emptyReason === 'none_in_program'
            ? 'В программе дня пока нет блоков для выбора.'
            : 'В программе дня пока нет блоков для выбора.'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            1. Событие программы
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>
            Выберите крупный блок, затем отметьте одну или несколько тем — под каждой появится оценка 1–10.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nodes.map(root => {
              const active = selectedParentId === root.id;
              const timeRange = formatEventTimeRange(root.startTime, root.endTime);
              const leafCount = countProgramLeaves(root.children);
              const hasKids = (root.children?.length ?? 0) > 0;
              const picked = parentSelectedCount(root.id);
              const rootItem = !hasKids ? findItem(root.id) : null;
              return (
                <div key={root.id}>
                  <button
                    type="button"
                    onClick={() => pickParent(root)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: active || picked > 0 ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                      background: active || picked > 0 ? '#D8F3DC' : '#FBF9F5',
                      cursor: 'pointer',
                    }}
                  >
                    {timeRange && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2D6A4F', marginBottom: 4 }}>
                        {timeRange}
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
                      {root.title}
                      {hasKids ? (
                        <span style={{ fontWeight: 500, color: '#666' }}> · {leafCount} тем</span>
                      ) : null}
                      {picked > 0 && hasKids ? (
                        <span style={{ fontWeight: 600, color: '#2D6A4F' }}> · выбрано {picked}</span>
                      ) : null}
                    </div>
                    {hasKids && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        {active ? '▼ отметьте подсобытия ниже' : '▼ есть подсобытия'}
                      </div>
                    )}
                  </button>
                  {!hasKids && rootItem && (
                    <div style={{
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #E0DAD0',
                      background: '#fff',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Оценка 1–10</div>
                      <ScoreRow value={rootItem.score} onChange={n => setScore(root.id, n)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedParent && needsSubtopic && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                2. Подсобытия / темы — можно несколько
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, lineHeight: 1.35 }}>
                {selectedParent.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subtopics.map(leaf => {
                  const item = findItem(leaf.id);
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
                        onClick={() => toggleLeaf(leaf, selectedParent)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 13,
                          lineHeight: 1.35,
                          padding: 0,
                        }}
                      >
                        <span style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: selected ? '2px solid #2D6A4F' : '1px solid #bbb',
                          background: selected ? '#2D6A4F' : '#fff',
                          color: '#fff',
                          fontSize: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                        >
                          {selected ? '✓' : ''}
                        </span>
                        <span style={{ flex: 1, fontWeight: selected ? 600 : 500 }}>{leaf.title}</span>
                      </button>
                      {selected && item && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E5E5' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                            Оцените это подсобытие (1–10)
                          </div>
                          <ScoreRow value={item.score} onChange={n => setScore(leaf.id, n)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div style={{ fontSize: 12, color: '#2D6A4F', marginTop: 12, fontWeight: 600, lineHeight: 1.4 }}>
              Выбрано ({items.length}):{' '}
              {items.map(i => {
                const path = i.parentEventTitle && i.parentEventTitle !== i.eventTitle
                  ? `${i.parentEventTitle} → ${i.eventTitle}`
                  : i.eventTitle;
                return `${path}${i.score != null ? ` [${i.score}]` : ''}`;
              }).join('; ')}
            </div>
          )}
        </>
      )}
    </FormItem>
  );
}

function programEventAnswerComplete(
  _field: EveningField,
  form: Record<string, unknown>,
  _options: EveningQuestionnaireProps['questionnaire']['programEventOptions'],
): boolean {
  return isProgramEventComplete(form[_field.key]);
}

function stepHasVisibleFields(
  step: EveningStep,
  form: Record<string, unknown>,
  experiment: EveningExperimentContext,
  questionnaire: EveningQuestionnaireProps['questionnaire'],
  currentDay: number,
  allFields: EveningField[],
): boolean {
  return step.fields.some(f => {
    if (!fieldVisible(f, form, allFields)) return false;
    if (f.type === 'experiment_text' && !experiment) return false;
    if (f.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || currentDay > 6) return false;
    }
    return true;
  });
}

function isExperimentStep(step: EveningStep): boolean {
  return step.id === 'experiment'
    || step.fields.some(f => f.type === 'experiment_text');
}

export const EveningQuestionnaire: React.FC<EveningQuestionnaireProps> = ({
  currentDay,
  questionnaire,
  experiment,
  submitPath = '/day-state/evening',
  draftPath = '/day-state/evening/draft',
  heading,
  onClose,
  onSubmitted,
}) => {
  const rawSteps = questionnaire.config?.steps?.length
    ? questionnaire.config.steps
    : [{ id: 'legacy', title: 'Анкета', fields: [] }];
  const draft = questionnaire.savedDraft;
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    ...(draft?.form || {}),
  }));
  const [tomorrowRole, setTomorrowRole] = useState(
    draft?.tomorrowRoleKey || questionnaire.roles?.[0]?.roleKey || '',
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Forum day of this evening survey (not necessarily clock/admin currentDay). */
  const surveyDay = questionnaire.dayNumber ?? currentDay;

  const allConfigFields = useMemo(
    () => rawSteps.flatMap(s => s.fields),
    [rawSteps],
  );

  const steps = useMemo(
    () => rawSteps.filter(s => stepHasVisibleFields(s, form, experiment ?? null, questionnaire, surveyDay, allConfigFields)),
    [rawSteps, form, experiment, questionnaire, surveyDay, allConfigFields],
  );

  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, Math.max(steps.length - 1, 0)));

  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const persistDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiPatch(draftPath, {
        ...(draftPath.includes('forum-wrap') ? {} : { dayNumber: surveyDay }),
        step,
        form,
        tomorrowRoleKey: tomorrowRole || undefined,
      }).catch(() => undefined);
    }, 400);
  }, [draftPath, surveyDay, step, form, tomorrowRole]);

  useEffect(() => {
    persistDraft();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persistDraft]);

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const currentStep = steps[Math.min(step, Math.max(steps.length - 1, 0))] ?? steps[0];
  const visibleFields = useMemo(
    () => (currentStep?.fields ?? []).filter(f => fieldVisible(f, form, allConfigFields)),
    [currentStep, form, allConfigFields],
  );
  const questionNumbers = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.type === 'info_text') continue;
        if (!fieldVisible(f, form, allConfigFields)) continue;
        if (f.type === 'experiment_text' && !experiment) continue;
        if (f.type === 'role_select' && (!questionnaire.askTomorrowRole || surveyDay > 6)) continue;
        n += 1;
        map.set(f.key, n);
      }
    }
    return map;
  }, [steps, form, experiment, questionnaire.askTomorrowRole, surveyDay, allConfigFields]);
  const showExperimentBlock = currentStep && isExperimentStep(currentStep) && !!experiment;

  const stepReady = useMemo(() => {
    for (const f of visibleFields) {
      if (f.type === 'info_text') continue;
      if (f.type === 'program_event') {
        const answered = programEventAnswerComplete(f, form, questionnaire.programEventOptions);
        if (f.required && !answered) return false;
        // Partial / invalid object must not pass
        if (form[f.key] != null && !answered) return false;
        continue;
      }
      if (f.required && f.type !== 'role_select' && !isFieldValueSet(form[f.key])) return false;
    }
    return true;
  }, [visibleFields, form, questionnaire.programEventOptions]);

  const numberedLabel = (field: EveningField) => {
    const n = questionNumbers.get(field.key);
    return n != null ? `${n}. ${field.label}` : field.label;
  };
  const fieldTop = (field: EveningField) => (
    <span className="evening-q__label">{numberedLabel(field)}</span>
  );

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5' || field.type === 'scale_1_10') {
      const max = field.type === 'scale_1_10' ? 10 : 5;
      return (
        <FormItem key={field.key} top={fieldTop(field)} topMultiline>
          <ScaleButtons max={max} value={form[field.key]} onChange={n => setField(field.key, n)} />
        </FormItem>
      );
    }
    if (field.type === 'yes_no') {
      const raw = form[field.key];
      return (
        <FormItem key={field.key} top={fieldTop(field)} topMultiline>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button mode={raw === true ? 'primary' : 'secondary'} onClick={() => setField(field.key, true)}>Да</Button>
            <Button mode={raw === false ? 'primary' : 'secondary'} onClick={() => setField(field.key, false)}>Нет</Button>
          </div>
        </FormItem>
      );
    }
    if (field.type === 'choice') {
      const opts = (field.options || []).map(o => String(o).trim()).filter(Boolean);
      const raw = String(form[field.key] ?? '');
      const otherOn = !!field.allowOther && raw.length > 0 && !opts.includes(raw);
      const otherLabel = field.otherLabel || 'Свой вариант';
      return (
        <FormItem key={field.key} top={fieldTop(field)} topMultiline>
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
                  {otherLabel}
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
        </FormItem>
      );
    }
    if (field.type === 'program_event') {
      const pack = questionnaire.programEventOptions?.[field.key];
      const current = normalizeProgramEventValue(form[field.key]);
      return (
        <ProgramEventPicker
          key={field.key}
          field={{ ...field, label: numberedLabel(field) }}
          value={current}
          nodes={pack?.events || []}
          emptyReason={pack?.emptyReason}
          onChange={v => setField(field.key, v)}
        />
      );
    }
    if (field.type === 'text' || field.type === 'experiment_text') {
      if (field.type === 'experiment_text' && !experiment) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field)} topMultiline>
          <textarea
            value={String(form[field.key] || '')}
            onChange={e => setField(field.key, e.target.value)}
            placeholder={field.type === 'experiment_text' ? 'Кратко: что попробовали, что сработало, что нет…' : undefined}
            style={{ width: '100%', minHeight: field.type === 'experiment_text' ? 88 : 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
          />
        </FormItem>
      );
    }
    if (field.type === 'info_text') {
      const html = sanitizeInfoHtml(field.html || '');
      const plain = (field.label || '').trim();
      if (!html && !plain) return null;
      return (
        <div
          key={field.key}
          className="evening-info-block"
          {...(html
            ? { dangerouslySetInnerHTML: { __html: html } }
            : { children: plain })}
        />
      );
    }
    if (field.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || surveyDay > 6) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field)} topMultiline>
          <CustomSelect
            options={(questionnaire.roles || []).map(r => ({ label: r.name, value: r.roleKey }))}
            value={tomorrowRole || undefined}
            onChange={e => setTomorrowRole(String(e.target.value))}
          />
        </FormItem>
      );
    }
    return null;
  };

  const handleSubmit = async () => {
    const askRole = questionnaire.askTomorrowRole !== false && surveyDay <= 6;
    const ratings: Record<string, unknown> = { ...form };
    delete (ratings as Record<string, unknown>).tomorrowRoleKey;
    for (const f of allConfigFields) {
      if (f.type === 'info_text' || !fieldVisible(f, form, allConfigFields)) {
        delete (ratings as Record<string, unknown>)[f.key];
      }
    }
    const isWrap = submitPath.includes('forum-wrap');
    await apiPost(submitPath, isWrap
      ? { ratings }
      : {
        dayNumber: surveyDay,
        tomorrowRoleKey: askRole && tomorrowRole ? tomorrowRole : undefined,
        ratings,
        experimentStatus: experiment?.status === 'done' ? 'done' : undefined,
      });
    onSubmitted();
  };

  if (!currentStep) {
    return (
      <div className="m-card">
        <div style={{ fontSize: 13 }}>Нет шагов анкеты для этого дня.</div>
        <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>Закрыть</Button>
      </div>
    );
  }

  return (
    <div className="m-card evening-q">
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
        {heading || `Итоговая анкета · день ${surveyDay}`}
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {currentStep.title} · шаг {step + 1} из {steps.length} · можно закрыть и вернуться
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
      </div>

      {showExperimentBlock && (
        <div className="evening-experiment-block">
          <div className="evening-experiment-block__tag">Эксперимент с ролью</div>
          {experiment?.roleName && (
            <div className="evening-experiment-block__role">Роль дня: {experiment.roleName}</div>
          )}
          {experiment?.title && (
            <div className="evening-experiment-block__title">{experiment.title}</div>
          )}
          {experiment?.body && (
            <p className="evening-experiment-block__body">{experiment.body}</p>
          )}
          {experiment?.hint && (
            <div className="evening-experiment-block__hint">{experiment.hint}</div>
          )}
        </div>
      )}

      {visibleFields.map(renderField)}

      {surveyDay === 7 && currentStep.fields.some(f => f.type === 'role_select') && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          День 7 — роль на день отъезда не выбираем.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {step > 0 && (
          <Button size="l" mode="secondary" onClick={() => setStep(s => s - 1)}>Назад</Button>
        )}
        {step < steps.length - 1 ? (
          <Button
            size="l"
            stretched
            disabled={!stepReady}
            onClick={() => { if (stepReady) setStep(s => s + 1); }}
          >
            Далее
          </Button>
        ) : (
          <Button
            size="l"
            stretched
            disabled={!stepReady}
            onClick={() => { if (stepReady) void handleSubmit(); }}
          >
            Сохранить
          </Button>
        )}
      </div>
      <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>
        Отложить
      </Button>
    </div>
  );
};
