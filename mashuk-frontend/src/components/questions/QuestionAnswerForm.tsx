import React, { useState } from 'react';
import { Textarea, Button, Checkbox, Radio, Slider, Div } from '@vkontakte/vkui';

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
  question: { id: number; type: string; title: string; text?: string; timePoint?: string; block?: string };
  options: { id: number; label: string; value: string; parentOptionId?: number | null }[];
  onSubmit: (answerData: unknown) => Promise<void>;
}

export const QuestionAnswerForm: React.FC<QuestionAnswerFormProps> = ({ question, options, onSubmit }) => {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [emotion, setEmotion] = useState('');
  const [energy, setEnergy] = useState(5);
  const [interests, setInterests] = useState('');
  const [masterChoice, setMasterChoice] = useState('');
  const [dependentText, setDependentText] = useState('');
  const [saving, setSaving] = useState(false);

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
