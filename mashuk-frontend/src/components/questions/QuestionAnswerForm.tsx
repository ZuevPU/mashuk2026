import React, { useState, useEffect } from 'react';
import { Textarea, Button, Checkbox, Radio, Slider, Div, FormItem } from '@vkontakte/vkui';
import {
  ROLE_CATALOG,
  coerceGoalQuestions,
  visibleGoalQuestionsFilled,
  pruneHiddenGoalAnswers,
  type GoalQuestion,
} from '../../data/onboarding';
import { GoalQuestionsFields } from '../onboarding/GoalQuestionsFields';
import { apiGet, getStoredShiftId } from '../../api/client';
import { isPointBQuestion } from '../../utils/eveningSummaryQuestion';
import { PracticesVoteForm, type PracticesVoteConfig } from './PracticesVoteForm';

/** What the participant should read: admin «Текст вопроса», not the internal title. */
const BLOCK_PICK_START_RE = /^(на каком (уроке|блоке)|где вы были|где ты был)/i;

function splitPromptSentences(text: string): string[] {
  const raw = (text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[?？])\s+/))
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

function isBlockPickPromptText(text: string): boolean {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return Boolean(t) && BLOCK_PICK_START_RE.test(t);
}

function isAfterBlocksQuestion(q: {
  questionKind?: string | null;
  reflectionKind?: string | null;
}): boolean {
  return q.questionKind === 'after_blocks' || q.reflectionKind === 'after_blocks';
}

function afterBlocksPromptBody(text: string): string {
  return splitPromptSentences(text).filter(s => !isBlockPickPromptText(s)).join(' ').trim();
}

function afterBlocksCardHeading(q: {
  title?: string | null;
  text?: string | null;
  afterBlocksConfig?: { prompts?: Array<{ text?: string | null }> } | null;
}): string {
  const fromCfg = (q.afterBlocksConfig?.prompts || [])
    .map(p => afterBlocksPromptBody(p.text || ''))
    .filter(Boolean);
  if (fromCfg.length) return fromCfg.join('\n');
  const fromText = afterBlocksPromptBody(q.text || '');
  if (fromText) return fromText;
  return (q.title || '').trim();
}

export function participantQuestionPrompt(q: {
  title?: string | null;
  text?: string | null;
  subtitle?: string | null;
  questionKind?: string | null;
  reflectionKind?: string | null;
  afterBlocksConfig?: { prompts?: Array<{ text?: string | null }> } | null;
}): { subtitle: string; heading: string } {
  const title = (q.title || '').trim();
  const text = (q.text || '').trim();
  const subtitle = (q.subtitle || '').trim();
  if (isAfterBlocksQuestion(q)) {
    return { subtitle, heading: afterBlocksCardHeading(q) || text || title };
  }
  return { subtitle, heading: text || title };
}

function QuestionPrompt({
  question,
}: {
  question: { title?: string | null; text?: string | null; subtitle?: string | null };
}) {
  const { subtitle, heading } = participantQuestionPrompt(question);
  if (!heading && !subtitle) return null;
  return (
    <div className="q-prompt">
      {subtitle ? <div className="q-prompt-sub">{subtitle}</div> : null}
      {heading ? <div className="q-prompt-title">{heading}</div> : null}
    </div>
  );
}

const CHECKIN_EMOTIONS = [
  { id: 'joy', label: 'Радость', icon: '😊' },
  { id: 'calm', label: 'Спокойствие', icon: '😌' },
  { id: 'interest', label: 'Интерес', icon: '🤔' },
  { id: 'inspiration', label: 'Вдохновение', icon: '✨' },
  { id: 'confidence', label: 'Уверенность', icon: '💪' },
  { id: 'tired', label: 'Усталость', icon: '😴' },
  { id: 'anxiety', label: 'Тревога', icon: '😰' },
  { id: 'irritation', label: 'Раздражение', icon: '😤' },
  { id: 'sadness', label: 'Грусть', icon: '😢' },
  { id: 'surprise', label: 'Удивление', icon: '😮' },
  { id: 'focus', label: 'Сосредоточенность', icon: '🎯' },
];

type LessonPickEvent = {
  id: number;
  title: string;
  place?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

type AfterBlocksEventNode = LessonPickEvent & {
  children: LessonPickEvent[];
};

type LessonPickMeta = {
  programThemeCount?: number;
  emptyReason?: 'none' | 'none_in_program' | 'none_conducted_yet';
};

interface QuestionAnswerFormProps {
  question: {
    id: number;
    type: string;
    title: string;
    text?: string;
    subtitle?: string;
    timePoint?: string;
    block?: string;
    questionKind?: string | null;
    reflectionKind?: string | null;
    answerType?: string | null;
    requiresLessonPick?: boolean;
    allowRetry?: boolean;
    allowOther?: boolean;
    practicesConfig?: PracticesVoteConfig | null;
    afterBlocksConfig?: {
      prompts?: Array<{ id?: string; text: string; answerType?: string; options?: string[] }>;
    } | null;
  };
  options: { id: number; label: string; value: string; parentOptionId?: number | null }[];
  dayEvents?: LessonPickEvent[];
  afterBlocksEvents?: AfterBlocksEventNode[];
  lessonPickMeta?: LessonPickMeta | null;
  myAnswer?: { preview?: string; createdAt?: string | null; answerData?: unknown } | null;
  onSubmit: (answerData: unknown) => Promise<void>;
}

function formatStoredAnswer(
  myAnswer: { preview?: string; answerData?: unknown } | null | undefined,
  questionType?: string,
): string {
  if (myAnswer?.preview?.trim()) return myAnswer.preview.trim();
  const data = myAnswer?.answerData;
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.reflections) && o.reflections.length > 0) {
      const parent = typeof o.parentEventTitle === 'string' ? o.parentEventTitle.trim() : '';
      const parts = o.reflections.map((raw) => {
        if (!raw || typeof raw !== 'object') return '';
        const r = raw as Record<string, unknown>;
        const topic = typeof r.eventTitle === 'string' ? r.eventTitle.trim() : '';
        let text = typeof r.text === 'string' ? r.text.trim() : '';
        if (!text && r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) {
          text = Object.values(r.answers as Record<string, unknown>)
            .map((v) => (Array.isArray(v) ? v.map(String).filter(Boolean).join(', ') : String(v ?? '').trim()))
            .filter(Boolean)
            .join('\n');
        }
        if (!text) return '';
        const where = parent && topic && parent !== topic
          ? `${parent} · ${topic}`
          : (topic || parent);
        return where ? `${where}\n\n${text}` : text;
      }).filter(Boolean);
      if (parts.length) return parts.join('\n\n——\n\n');
    }
    if (typeof o.text === 'string' && o.text.trim()) {
      const parent = typeof o.parentEventTitle === 'string' ? o.parentEventTitle.trim() : '';
      const topic = typeof o.eventTitle === 'string' ? o.eventTitle.trim() : '';
      const where = parent && topic && parent !== topic
        ? `${parent} · ${topic}`
        : (topic || parent);
      return where ? `${where}\n\n${o.text.trim()}` : o.text.trim();
    }
    if (o.choice === '__other__' && typeof o.otherText === 'string') return o.otherText;
    if (typeof o.choice === 'string') return o.choice;
    if (Array.isArray(o.choices)) return o.choices.map(String).join(', ');
    if (o.emotion != null || o.energy != null) {
      const emo = CHECKIN_EMOTIONS.find(e => e.id === o.emotion);
      const parts = [
        emo ? `${emo.icon} ${emo.label}` : (o.emotion ? String(o.emotion) : null),
        o.energy != null ? `энергия ${o.energy}/10` : null,
        typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : null,
      ].filter(Boolean);
      if (parts.length) return parts.join('\n');
    }
    if (Array.isArray(o.answers)) return o.answers.map(String).filter(Boolean).join('\n');
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(questionType || 'Ответ сохранён');
    }
  }
  return String(data);
}

const PointBForm: React.FC<{ onSubmit: (data: unknown) => Promise<void> }> = ({ onSubmit }) => {
  const [goalQuestions, setGoalQuestions] = useState<GoalQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [goalsReady, setGoalsReady] = useState(false);
  const [strongRole, setStrongRole] = useState('');
  const [growthRole, setGrowthRole] = useState('');
  const [growthWhy, setGrowthWhy] = useState('');
  const [nextExperiment, setNextExperiment] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const shiftId = getStoredShiftId();
    const url = shiftId != null
      ? `/auth/onboarding-meta?shiftId=${shiftId}`
      : '/auth/onboarding-meta';
    let cancelled = false;
    setGoalsReady(false);
    setGoalQuestions([]);
    setAnswers([]);
    apiGet<{ goalQuestions?: unknown; activeShiftId?: number | null }>(url)
      .then(data => {
        if (cancelled) return;
        if (shiftId != null && data.activeShiftId != null && data.activeShiftId !== shiftId) {
          setGoalsReady(true);
          return;
        }
        if (Array.isArray(data.goalQuestions) && data.goalQuestions.length) {
          const gq = coerceGoalQuestions(data.goalQuestions);
          setGoalQuestions(gq);
          setAnswers(gq.map(() => ''));
        }
        setGoalsReady(true);
      })
      .catch(() => {
        if (!cancelled) setGoalsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const canNextAnswers = visibleGoalQuestionsFilled(goalQuestions, answers);
  const canSubmit = !!strongRole && !!growthRole && growthWhy.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({
        answers: pruneHiddenGoalAnswers(goalQuestions, answers).map(a => a.trim()),
        strongRole,
        growthRole,
        growthWhy: growthWhy.trim(),
        nextExperiment: nextExperiment.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Div>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Точка Б · финал смены</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
        Шаг {step + 1} из 3 · те же вопросы, что на входе (Точка А)
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
      </div>

      {step === 0 && (
        <>
          {!goalsReady || goalQuestions.length === 0 ? (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#888' }}>
              {goalsReady ? 'Не удалось загрузить вопросы этой смены.' : 'Загружаем вопросы этой смены…'}
            </p>
          ) : (
            <GoalQuestionsFields
              questions={goalQuestions}
              answers={answers}
              onChange={setAnswers}
              openPlaceholder="Ответ на выходе…"
            />
          )}
          <Button size="l" stretched disabled={!goalsReady || !canNextAnswers} onClick={() => setStep(1)}>Далее</Button>
        </>
      )}

      {step === 1 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            В какой роли ты почувствовал себя наиболее естественно? (сильная роль)
          </div>
          {ROLE_CATALOG.map(r => (
            <div
              key={r.roleKey}
              onClick={() => setStrongRole(r.roleKey)}
              style={{
                padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer',
                border: strongRole === r.roleKey ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                background: strongRole === r.roleKey ? '#D8F3DC' : '#fff',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{r.essence}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button size="l" mode="secondary" onClick={() => setStep(0)}>Назад</Button>
            <Button size="l" stretched disabled={!strongRole} onClick={() => setStep(2)}>Далее</Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            Какую роль хочется развивать дальше? (роль роста)
          </div>
          {ROLE_CATALOG.map(r => (
            <div
              key={r.roleKey}
              onClick={() => setGrowthRole(r.roleKey)}
              style={{
                padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer',
                border: growthRole === r.roleKey ? '2px solid #B8621A' : '1px solid #E0DAD0',
                background: growthRole === r.roleKey ? '#FFF3E0' : '#fff',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{r.keywords}</div>
            </div>
          ))}
          <FormItem top="Почему выбрал эту роль для развития?" topMultiline>
            <Textarea value={growthWhy} onChange={e => setGrowthWhy(e.target.value)} placeholder="Коротко своими словами…" />
          </FormItem>
          <FormItem top="Следующий эксперимент после программы (опционально)" topMultiline>
            <Textarea value={nextExperiment} onChange={e => setNextExperiment(e.target.value)} placeholder="Одно конкретное действие…" />
          </FormItem>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button size="l" mode="secondary" onClick={() => setStep(1)}>Назад</Button>
            <Button size="l" stretched disabled={saving || !canSubmit} onClick={handleSubmit}>
              Сохранить Точку Б
            </Button>
          </div>
        </>
      )}
    </Div>
  );
};

const MIN_LESSON_REFLECTION_CHARS = 20;
const MIN_STATE_REASON_CHARS = 15;

type AfterBlocksPrompt = {
  id: string;
  text: string;
  answerType: string;
  options: string[];
};

function resolveAfterBlocksPrompts(question: QuestionAnswerFormProps['question']): AfterBlocksPrompt[] {
  const prompts = (question.afterBlocksConfig?.prompts || [])
    .filter(p => (p.text || '').trim())
    .map((p, i) => ({
      id: p.id || `prompt_${i}`,
      text: p.text.trim(),
      answerType: p.answerType || 'text',
      options: Array.isArray(p.options) ? p.options.map(o => String(o || '').trim()).filter(Boolean) : [],
    }))
    .flatMap((p) => {
      const parts = splitPromptSentences(p.text);
      if (parts.length <= 1) return isBlockPickPromptText(p.text) ? [] : [p];
      const reflection = parts.filter(t => !isBlockPickPromptText(t));
      return reflection.length ? [{ ...p, text: reflection.join(' ').trim() }] : [];
    });
  if (prompts.length) return prompts;
  const fallback = afterBlocksCardHeading(question) || 'Что вынесли из этого блока?';
  return [{
    id: 'legacy',
    text: fallback,
    answerType: 'text',
    options: [],
  }];
}

function afterBlocksPromptOk(prompt: AfterBlocksPrompt, value: unknown): boolean {
  if (prompt.answerType === 'text') {
    return String(value || '').trim().length >= MIN_LESSON_REFLECTION_CHARS;
  }
  if (prompt.answerType === 'scale_5' || prompt.answerType === 'scale_10') {
    const n = typeof value === 'number' ? value : Number(value);
    const max = prompt.answerType === 'scale_10' ? 10 : 5;
    return Number.isFinite(n) && n >= 1 && n <= max;
  }
  if (prompt.answerType === 'choice') return String(value || '').trim().length > 0;
  if (prompt.answerType === 'multi') {
    return Array.isArray(value) && value.some(v => String(v).trim());
  }
  return String(value || '').trim().length > 0;
}

function formatAfterBlocksPromptValue(prompt: AfterBlocksPrompt, value: unknown): string {
  if (prompt.answerType === 'multi' && Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean).join(', ');
  }
  if (value == null) return '';
  return String(value).trim();
}

function composeAfterBlocksText(prompts: AfterBlocksPrompt[], answers: Record<string, unknown>): string {
  return prompts.map(p => {
    const formatted = formatAfterBlocksPromptValue(p, answers[p.id]);
    if (!formatted) return '';
    return prompts.length > 1 ? `${p.text}: ${formatted}` : formatted;
  }).filter(Boolean).join('\n');
}

function afterBlocksAnswerKey(topicId: number, promptId: string): string {
  return `${topicId}:${promptId}`;
}

const AfterBlocksPromptFields: React.FC<{
  prompt: AfterBlocksPrompt;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ prompt, value, onChange }) => {
  if (prompt.answerType === 'scale_5' || prompt.answerType === 'scale_10') {
    const max = prompt.answerType === 'scale_10' ? 10 : 5;
    const n = typeof value === 'number' ? value : Number(value);
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Array.from({ length: max }, (_, i) => i + 1).map(num => (
          <div
            key={num}
            onClick={() => onChange(num)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              border: n === num ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
              background: n === num ? '#D8F3DC' : '#fff',
            }}
          >
            {num}
          </div>
        ))}
      </div>
    );
  }
  if (prompt.answerType === 'choice') {
    const selected = String(value || '');
    return (
      <>
        {prompt.options.map(opt => (
          <Radio key={opt} checked={selected === opt} onChange={() => onChange(opt)}>{opt}</Radio>
        ))}
      </>
    );
  }
  if (prompt.answerType === 'multi') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    const toggle = (opt: string) => {
      onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
    };
    return (
      <>
        {prompt.options.map(opt => (
          <Checkbox key={opt} checked={selected.includes(opt)} onChange={() => toggle(opt)}>{opt}</Checkbox>
        ))}
      </>
    );
  }
  return (
    <Textarea
      value={String(value || '')}
      onChange={e => onChange(e.target.value)}
      placeholder="Своими словами: какая мысль запомнилась, что попробуете на практике…"
    />
  );
};

function formatLessonTime(ev: { startTime?: string | null }) {
  if (!ev.startTime) return null;
  return new Date(ev.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const PickCard: React.FC<{
  title: string;
  meta?: string | null;
  selected: boolean;
  onClick: () => void;
}> = ({ title, meta, selected, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer',
      border: selected ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
      background: selected ? '#D8F3DC' : '#fff',
    }}
  >
    <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
    {meta && <div style={{ fontSize: 11, color: '#666' }}>{meta}</div>}
  </div>
);

/** После блоков: событие → (мульти)подтемы → вопросы по каждой выбранной */
const AfterBlocksForm: React.FC<{
  question: QuestionAnswerFormProps['question'];
  events: AfterBlocksEventNode[];
  lessonPickMeta?: LessonPickMeta | null;
  onSubmit: (data: unknown) => Promise<void>;
}> = ({ question, events, lessonPickMeta, onSubmit }) => {
  const prompts = resolveAfterBlocksPrompts(question);
  const [parentId, setParentId] = useState<number | null>(null);
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [pairIndex, setPairIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'event' | 'topic' | 'text'>('event');

  const parent = events.find(e => e.id === parentId) || null;
  const children = parent?.children || [];
  const topicPickNeeded = children.length > 1;
  const selectedTopics: LessonPickEvent[] = (() => {
    if (!parent) return [];
    if (children.length === 0) return [parent];
    return topicIds
      .map(id => children.find(c => c.id === id))
      .filter((c): c is LessonPickEvent => Boolean(c));
  })();
  const pairs = selectedTopics.flatMap(topic => prompts.map(prompt => ({ topic, prompt })));
  const current = pairs[pairIndex] || null;
  const currentValue = current
    ? answers[afterBlocksAnswerKey(current.topic.id, current.prompt.id)]
    : undefined;
  const currentOk = current ? afterBlocksPromptOk(current.prompt, currentValue) : false;
  const isLastPair = pairIndex >= pairs.length - 1;
  const emptyReason = lessonPickMeta?.emptyReason;
  const waiting = events.length === 0 && emptyReason === 'none_conducted_yet';

  const topicStepsCount = topicPickNeeded ? 1 : 0;
  const promptStepsCount = Math.max(pairs.length, 1);
  const totalSteps = 1 + topicStepsCount + promptStepsCount;
  const stepIndex = step === 'event'
    ? 1
    : step === 'topic'
      ? 2
      : (1 + topicStepsCount + pairIndex + 1);

  const resetAnswers = () => {
    setAnswers({});
    setPairIndex(0);
  };

  const goAfterEventPick = (ev: AfterBlocksEventNode) => {
    if (ev.children.length === 0) {
      setTopicIds([ev.id]);
      resetAnswers();
      setStep('text');
      return;
    }
    if (ev.children.length === 1) {
      setTopicIds([ev.children[0].id]);
      resetAnswers();
      setStep('text');
      return;
    }
    setTopicIds([]);
    resetAnswers();
    setStep('topic');
  };

  const toggleTopic = (id: number) => {
    setTopicIds(prev => (
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    ));
  };

  const handleSubmit = async () => {
    if (!parent || selectedTopics.length === 0) return;
    const reflections = selectedTopics.map(t => {
      const map: Record<string, unknown> = {};
      for (const p of prompts) {
        map[p.id] = answers[afterBlocksAnswerKey(t.id, p.id)];
      }
      return {
        eventId: t.id,
        eventTitle: t.title,
        text: composeAfterBlocksText(prompts, map),
        answers: map,
      };
    });
    if (reflections.some(r => prompts.some(p => !afterBlocksPromptOk(p, r.answers[p.id])))) return;
    setSaving(true);
    try {
      const first = reflections[0];
      await onSubmit({
        parentEventId: parent.id,
        parentEventTitle: parent.title,
        eventId: first.eventId,
        eventTitle: first.eventTitle,
        text: first.text,
        reflections,
      });
    } finally {
      setSaving(false);
    }
  };

  const metaLine = (ev: LessonPickEvent) => (
    [ev.place, formatLessonTime(ev)].filter(Boolean).join(' · ') || null
  );

  const currentTextLen = current?.prompt.answerType === 'text'
    ? String(currentValue || '').trim().length
    : 0;

  const reflectionHeading = afterBlocksCardHeading(question);

  return (
    <Div className="q-answer">
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
        Шаг {stepIndex} из {totalSteps}
      </div>

      {step === 'event' && (
        <>
          <div className="q-prompt-title" style={{ marginBottom: 8 }}>
            На каком уроке / блоке ты был(а)?
          </div>
          {reflectionHeading ? (
            <div className="q-prompt-sub" style={{ marginBottom: 8 }}>{reflectionHeading}</div>
          ) : null}
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            Выберите событие программы — параллельный блок, в котором вы участвовали.
          </div>
          {events.length === 0 && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
              {waiting
                ? 'События ещё не начались — список появится после старта блоков по расписанию.'
                : 'В программе дня пока нет связанных событий для этого вопроса.'}
            </div>
          )}
          {events.map(ev => (
            <PickCard
              key={ev.id}
              title={ev.title}
              meta={[
                metaLine(ev),
                ev.children.length ? `${ev.children.length} подтем` : null,
              ].filter(Boolean).join(' · ') || null}
              selected={parentId === ev.id}
              onClick={() => {
                setParentId(ev.id);
                setTopicIds([]);
                resetAnswers();
              }}
            />
          ))}
          <Button
            size="l"
            stretched
            disabled={!parentId || waiting}
            onClick={() => {
              const next = events.find(e => e.id === parentId);
              if (!next) return;
              goAfterEventPick(next);
            }}
            style={{ marginTop: 8 }}
          >
            {waiting ? 'Пока недоступно' : 'Далее'}
          </Button>
        </>
      )}

      {step === 'topic' && parent && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: '#2D6A4F' }}>
            Событие: <b>{parent.title}</b>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            На каких подтемах вы были?
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            Можно выбрать несколько — например, две практики в одном блоке. Дальше ответите по каждой по очереди.
          </div>
          {children.map(ev => (
            <PickCard
              key={ev.id}
              title={ev.title}
              meta={metaLine(ev)}
              selected={topicIds.includes(ev.id)}
              onClick={() => toggleTopic(ev.id)}
            />
          ))}
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            Выбрано: {topicIds.length}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="l" mode="secondary" onClick={() => setStep('event')}>Назад</Button>
            <Button
              size="l"
              stretched
              disabled={topicIds.length === 0}
              onClick={() => {
                if (topicIds.length === 0) return;
                resetAnswers();
                setStep('text');
              }}
            >
              Далее
            </Button>
          </div>
        </>
      )}

      {step === 'text' && current && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: '#2D6A4F', lineHeight: 1.4 }}>
            {parent && parent.id !== current.topic.id
              ? <>Событие: <b>{parent.title}</b><br />Подтема: <b>{current.topic.title}</b></>
              : <>Событие: <b>{current.topic.title}</b></>}
            {pairs.length > 1 && (
              <div style={{ marginTop: 4, color: '#666' }}>
                Ответ {pairIndex + 1} из {pairs.length}
                {prompts.length > 1 ? ` · вопрос ${prompts.findIndex(p => p.id === current.prompt.id) + 1} из ${prompts.length}` : ''}
              </div>
            )}
          </div>
          <div className="q-prompt-title" style={{ marginBottom: 10 }}>{current.prompt.text}</div>
          <AfterBlocksPromptFields
              prompt={current.prompt}
              value={currentValue}
              onChange={value => {
                setAnswers(prev => ({
                  ...prev,
                  [afterBlocksAnswerKey(current.topic.id, current.prompt.id)]: value,
                }));
              }}
            />
          {current.prompt.answerType === 'text' && (
            <div style={{ fontSize: 11, color: currentOk ? '#888' : '#B8621A', marginBottom: 4 }}>
              {currentTextLen < MIN_LESSON_REFLECTION_CHARS
                ? `Ещё минимум ${MIN_LESSON_REFLECTION_CHARS - currentTextLen} символов`
                : (isLastPair ? 'Можно отправлять' : 'Можно перейти дальше')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              size="l"
              mode="secondary"
              onClick={() => {
                if (pairIndex > 0) {
                  setPairIndex(i => i - 1);
                  return;
                }
                setStep(topicPickNeeded ? 'topic' : 'event');
              }}
            >
              Назад
            </Button>
            {isLastPair ? (
              <Button
                size="l"
                stretched
                disabled={saving || !currentOk || !parent || selectedTopics.length === 0}
                onClick={handleSubmit}
              >
                Отправить
              </Button>
            ) : (
              <Button
                size="l"
                stretched
                disabled={!currentOk}
                onClick={() => setPairIndex(i => i + 1)}
              >
                Далее
              </Button>
            )}
          </div>
        </>
      )}
    </Div>
  );
};

const LessonReflectionForm: React.FC<{
  question: QuestionAnswerFormProps['question'];
  dayEvents: LessonPickEvent[];
  lessonPickMeta?: LessonPickMeta | null;
  onSubmit: (data: unknown) => Promise<void>;
}> = ({ question, dayEvents, lessonPickMeta, onSubmit }) => {
  const [eventId, setEventId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const selected = dayEvents.find(e => e.id === eventId);
  const mustPickLesson = dayEvents.length > 0;
  const emptyReason = lessonPickMeta?.emptyReason;
  const waitingForLessons = dayEvents.length === 0 && emptyReason === 'none_conducted_yet';
  const canProceedFromPick = mustPickLesson
    ? eventId != null
    : !waitingForLessons;
  const textOk = text.trim().length >= MIN_LESSON_REFLECTION_CHARS;

  const handleSubmit = async () => {
    if (mustPickLesson && !eventId) return;
    if (!textOk) return;
    setSaving(true);
    try {
      await onSubmit({
        eventId: eventId || null,
        eventTitle: selected?.title || null,
        text: text.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Div className="q-answer">
      <QuestionPrompt question={question} />
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Шаг {step + 1} из 2</div>

      {step === 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Выберите урок из программы дня
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            Показаны темы, которые уже прошли по расписанию. Отметьте урок, о котором хотите написать осмысление.
          </div>
          {dayEvents.length === 0 && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
              {emptyReason === 'none_conducted_yet'
                ? 'Уроки по программе ещё не начались — список тем появится после проведения занятия.'
                : 'В программе дня пока нет тем уроков для этого слота. Можно описать тему текстом на следующем шаге.'}
            </div>
          )}
          {dayEvents.map(ev => (
            <PickCard
              key={ev.id}
              title={ev.title}
              meta={[ev.place, formatLessonTime(ev)].filter(Boolean).join(' · ') || null}
              selected={eventId === ev.id}
              onClick={() => setEventId(ev.id)}
            />
          ))}
          <Button
            size="l"
            stretched
            disabled={!canProceedFromPick}
            onClick={() => {
              if (!canProceedFromPick) return;
              setStep(1);
            }}
            style={{ marginTop: 8 }}
          >
            {waitingForLessons ? 'Пока недоступно' : 'Далее'}
          </Button>
        </>
      )}

      {step === 1 && (
        <>
          {selected && (
            <div style={{ fontSize: 12, marginBottom: 8, color: '#2D6A4F' }}>
              Урок: <b>{selected.title}</b>
            </div>
          )}
          <FormItem top="Что вынесли из урока?" topMultiline>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Своими словами: какая мысль запомнилась, что попробуете на практике…"
            />
          </FormItem>
          <div style={{ fontSize: 11, color: textOk ? '#888' : '#B8621A', marginBottom: 4 }}>
            {text.trim().length < MIN_LESSON_REFLECTION_CHARS
              ? `Ещё минимум ${MIN_LESSON_REFLECTION_CHARS - text.trim().length} символов`
              : 'Можно отправлять'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="l" mode="secondary" onClick={() => setStep(0)}>Назад</Button>
            <Button
              size="l"
              stretched
              disabled={saving || !textOk || (mustPickLesson && !eventId)}
              onClick={handleSubmit}
            >
              Отправить
            </Button>
          </div>
        </>
      )}
    </Div>
  );
};

export const QuestionAnswerForm: React.FC<QuestionAnswerFormProps> = ({
  question,
  options,
  dayEvents = [],
  afterBlocksEvents = [],
  lessonPickMeta = null,
  myAnswer,
  onSubmit,
}) => {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('');
  const [otherText, setOtherText] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [emotion, setEmotion] = useState('');
  const [energy, setEnergy] = useState(5);
  const [stateReason, setStateReason] = useState('');
  const [interests, setInterests] = useState('');
  const [masterChoice, setMasterChoice] = useState('');
  const [dependentText, setDependentText] = useState('');
  const [saving, setSaving] = useState(false);

  const isPracticesVote = question.questionKind === 'practices_vote'
    || question.answerType === 'practices_vote'
    || question.type === 'practices_vote'
    || !!question.practicesConfig;

  if (isPracticesVote) {
    const cfg = question.practicesConfig || {
      preamble: question.text || '',
      likesPerParticipant: 3,
      resultsPublished: false,
      practices: [],
    };
    const initialLiked = Array.isArray((myAnswer?.answerData as { likedPracticeIds?: string[] } | undefined)?.likedPracticeIds)
      ? (myAnswer!.answerData as { likedPracticeIds: string[] }).likedPracticeIds
      : [];
    const alreadyVoted = !!myAnswer;
    return (
      <Div className="q-answer">
        <QuestionPrompt question={question} />
        <PracticesVoteForm
          config={cfg}
          initialLikedIds={initialLiked}
          alreadyVoted={alreadyVoted}
          onSubmit={onSubmit}
        />
      </Div>
    );
  }

  if (isPointBQuestion(question) && !myAnswer) {
    return <PointBForm onSubmit={onSubmit} />;
  }

  const hasStoredAnswer = !!(myAnswer && (myAnswer.preview || myAnswer.answerData != null || myAnswer.createdAt));
  const readOnly = hasStoredAnswer && !question.allowRetry;

  if (readOnly || (hasStoredAnswer && isPointBQuestion(question))) {
    const when = myAnswer?.createdAt
      ? new Date(myAnswer.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    const body = formatStoredAnswer(myAnswer, question.type) || 'Ответ сохранён';
    return (
      <Div className="q-answer">
        <QuestionPrompt question={question} />
        <div style={{ fontSize: 12, color: '#2F855A', marginBottom: 8, fontWeight: 600 }}>
          Ваш ответ{when ? ` · ${when}` : ''}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            padding: 12,
            borderRadius: 12,
            background: '#F7F5F0',
            border: '1px solid #E8E2D6',
          }}
        >
          {body}
        </div>
      </Div>
    );
  }

  const isAfterBlocks = question.questionKind === 'after_blocks'
    || question.reflectionKind === 'after_blocks';

  if (isAfterBlocks) {
    const tree = afterBlocksEvents.length > 0
      ? afterBlocksEvents
      : dayEvents.map(e => ({ ...e, children: [] as LessonPickEvent[] }));
    return (
      <AfterBlocksForm
        question={question}
        events={tree}
        lessonPickMeta={lessonPickMeta}
        onSubmit={onSubmit}
      />
    );
  }

  const needsLesson = question.requiresLessonPick
    || /осмысление урока/i.test(question.title || '');

  if (needsLesson && question.type === 'open') {
    return (
      <LessonReflectionForm
        question={question}
        dayEvents={dayEvents}
        lessonPickMeta={lessonPickMeta}
        onSubmit={onSubmit}
      />
    );
  }

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let answerData: unknown;
      switch (question.type) {
        case 'checkin': {
          const reason = stateReason.trim().slice(0, 500);
          if (reason.length < MIN_STATE_REASON_CHARS) return;
          answerData = {
            emotion,
            energy,
            // Не подставляем «утро» по умолчанию — иначе дневные/вечерние
            // проверки в аналитике штаба уезжают в утренний столбец.
            ...(question.timePoint ? { timePoint: question.timePoint } : {}),
            reason,
          };
          break;
        }
        case 'choice':
          answerData = choice === '__other__'
            ? { choice: '__other__', otherText: otherText.trim() }
            : { choice };
          break;
        case 'multi':
          answerData = { choices: multi };
          break;
        case 'dependent':
          answerData = { masterChoice, dependentAnswer: dependentText };
          break;
        default:
          if (question.block === 'Целеполагание') {
            answerData = { interests: interests.split(',').map(s => s.trim()).filter(Boolean) };
          } else {
            answerData = text;
          }
      }
      await onSubmit(answerData);
    } finally {
      setSaving(false);
    }
  };

  const toggleMulti = (val: string) => {
    setMulti(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  return (
    <Div className="q-answer">
      <QuestionPrompt question={question} />

      {question.type === 'checkin' && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Выберите эмоцию</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {CHECKIN_EMOTIONS.map(e => (
              <div
                key={e.id}
                onClick={() => setEmotion(e.id)}
                style={{
                  padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                  border: emotion === e.id ? '2px solid #E53E3E' : '1px solid #E0DAD0',
                  background: emotion === e.id ? '#FFF5F5' : '#F5F0E8',
                }}
              >
                {e.icon} {e.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Энергия: {energy}/10</div>
          <Slider min={0} max={10} step={1} value={energy} onChange={setEnergy} />
          <FormItem top="С чем связано состояние" topMultiline style={{ marginTop: 12, paddingLeft: 0, paddingRight: 0 }}>
            <Textarea
              value={stateReason}
              onChange={e => setStateReason(e.target.value.slice(0, 500))}
              placeholder="Короткий комментарий: урок, общение, усталость, быт…"
              rows={3}
            />
            {stateReason.trim().length < MIN_STATE_REASON_CHARS && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                Ещё минимум {MIN_STATE_REASON_CHARS - stateReason.trim().length} символов
              </div>
            )}
          </FormItem>
        </>
      )}

      {question.type === 'open' && question.block === 'Целеполагание' && (
        <Textarea
          value={interests}
          onChange={e => setInterests(e.target.value)}
          placeholder="Ваши интересы через запятую (управление, команда, аналитика...)"
        />
      )}

      {question.type === 'open' && question.block !== 'Целеполагание' && (
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ваш ответ..." />
      )}

      {question.type === 'choice' && (
        <>
          {options.map(o => (
            <Radio key={o.id} checked={choice === o.value} onChange={() => setChoice(o.value)}>{o.label}</Radio>
          ))}
          {question.allowOther && (
            <>
              <Radio checked={choice === '__other__'} onChange={() => setChoice('__other__')}>Свой вариант</Radio>
              {choice === '__other__' && (
                <Textarea
                  value={otherText}
                  onChange={e => setOtherText(e.target.value)}
                  placeholder="Введите свой вариант…"
                  style={{ marginTop: 8 }}
                />
              )}
            </>
          )}
        </>
      )}

      {question.type === 'multi' && options.map(o => (
        <Checkbox key={o.id} checked={multi.includes(o.value)} onChange={() => toggleMulti(o.value)}>{o.label}</Checkbox>
      ))}

      {question.type === 'dependent' && (
        <>
          {options.filter(o => !o.parentOptionId).map(o => (
            <Radio key={o.id} checked={masterChoice === o.value} onChange={() => setMasterChoice(o.value)}>{o.label}</Radio>
          ))}
          {masterChoice && (
            <Textarea value={dependentText} onChange={e => setDependentText(e.target.value)} placeholder="Уточните ответ..." style={{ marginTop: 8 }} />
          )}
        </>
      )}

      <Button
        size="l"
        stretched
        disabled={
          saving
          || (question.type === 'checkin' && (!emotion || stateReason.trim().length < MIN_STATE_REASON_CHARS))
        }
        onClick={handleSubmit}
        style={{ marginTop: 16 }}
      >
        Отправить ответ
      </Button>
    </Div>
  );
};
