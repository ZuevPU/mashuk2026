import React, { useState } from 'react';
import { Textarea, Button, Checkbox, Radio, Slider, Div, FormItem } from '@vkontakte/vkui';
import { GOAL_QUESTIONS, ROLE_CATALOG } from '../../data/onboarding';

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

interface QuestionAnswerFormProps {
  question: {
    id: number;
    type: string;
    title: string;
    text?: string;
    timePoint?: string;
    block?: string;
    requiresLessonPick?: boolean;
  };
  options: { id: number; label: string; value: string; parentOptionId?: number | null }[];
  dayEvents?: { id: number; title: string; place?: string | null; startTime?: string | null }[];
  onSubmit: (answerData: unknown) => Promise<void>;
}

const PointBForm: React.FC<{ onSubmit: (data: unknown) => Promise<void> }> = ({ onSubmit }) => {
  const [answers, setAnswers] = useState<string[]>(GOAL_QUESTIONS.map(() => ''));
  const [strongRole, setStrongRole] = useState('');
  const [growthRole, setGrowthRole] = useState('');
  const [growthWhy, setGrowthWhy] = useState('');
  const [nextExperiment, setNextExperiment] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const canNextAnswers = answers.every(a => a.trim().length > 0);
  const canSubmit = !!strongRole && !!growthRole && growthWhy.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({
        answers: answers.map(a => a.trim()),
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
          {GOAL_QUESTIONS.map((q, i) => (
            <FormItem key={i} top={`${i + 1}. ${q}`}>
              <Textarea
                value={answers[i]}
                onChange={e => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                placeholder="Ответ на выходе…"
              />
            </FormItem>
          ))}
          <Button size="l" stretched disabled={!canNextAnswers} onClick={() => setStep(1)}>Далее</Button>
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
          <FormItem top="Почему выбрал эту роль для развития?">
            <Textarea value={growthWhy} onChange={e => setGrowthWhy(e.target.value)} placeholder="Коротко своими словами…" />
          </FormItem>
          <FormItem top="Следующий эксперимент после программы (опционально)">
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

const LessonReflectionForm: React.FC<{
  question: QuestionAnswerFormProps['question'];
  dayEvents: { id: number; title: string; place?: string | null; startTime?: string | null }[];
  onSubmit: (data: unknown) => Promise<void>;
}> = ({ question, dayEvents, onSubmit }) => {
  const [eventId, setEventId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const selected = dayEvents.find(e => e.id === eventId);

  const handleSubmit = async () => {
    if (dayEvents.length > 0 && !eventId) return;
    if (!text.trim()) return;
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
    <Div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{question.title}</div>
      {question.text && <div style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>{question.text}</div>}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Шаг {step + 1} из 2</div>

      {step === 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>На каком уроке / блоке ты был(а)?</div>
          {dayEvents.length === 0 && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              Событий дня в расписании пока нет — опишите блок текстом на следующем шаге.
            </div>
          )}
          {dayEvents.map(ev => (
            <div
              key={ev.id}
              onClick={() => setEventId(ev.id)}
              style={{
                padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer',
                border: eventId === ev.id ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                background: eventId === ev.id ? '#D8F3DC' : '#fff',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.title}</div>
              {(ev.place || ev.startTime) && (
                <div style={{ fontSize: 11, color: '#666' }}>
                  {[ev.place, ev.startTime ? new Date(ev.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null]
                    .filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ))}
          <Button
            size="l"
            stretched
            disabled={dayEvents.length > 0 && !eventId}
            onClick={() => setStep(1)}
            style={{ marginTop: 8 }}
          >
            Далее
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
          <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Что зафиксировал(а)?" />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="l" mode="secondary" onClick={() => setStep(0)}>Назад</Button>
            <Button size="l" stretched disabled={saving || !text.trim() || (dayEvents.length > 0 && !eventId)} onClick={handleSubmit}>
              Отправить
            </Button>
          </div>
        </>
      )}
    </Div>
  );
};

export const QuestionAnswerForm: React.FC<QuestionAnswerFormProps> = ({ question, options, dayEvents = [], onSubmit }) => {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [emotion, setEmotion] = useState('');
  const [energy, setEnergy] = useState(5);
  const [interests, setInterests] = useState('');
  const [masterChoice, setMasterChoice] = useState('');
  const [dependentText, setDependentText] = useState('');
  const [saving, setSaving] = useState(false);

  if (question.block === 'Точка Б') {
    return <PointBForm onSubmit={onSubmit} />;
  }

  const needsLesson = question.requiresLessonPick
    || /осмысление урока/i.test(question.title || '');

  if (needsLesson && question.type === 'open') {
    return <LessonReflectionForm question={question} dayEvents={dayEvents} onSubmit={onSubmit} />;
  }

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let answerData: unknown;
      switch (question.type) {
        case 'checkin':
          answerData = { emotion, energy, timePoint: question.timePoint || 'утро' };
          break;
        case 'choice':
          answerData = { choice };
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
    <Div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{question.title}</div>
      {question.text && <div style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>{question.text}</div>}

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

      {question.type === 'choice' && options.map(o => (
        <Radio key={o.id} checked={choice === o.value} onChange={() => setChoice(o.value)}>{o.label}</Radio>
      ))}

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

      <Button size="l" stretched disabled={saving} onClick={handleSubmit} style={{ marginTop: 16 }}>
        Отправить ответ
      </Button>
    </Div>
  );
};
