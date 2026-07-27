import { useState } from 'react';
import { ModalCard, Textarea, Button, Title, FormItem, CustomSelect, Checkbox } from '@vkontakte/vkui';
import { PIGGYBANK_SOURCES, PIGGYBANK_TAGS } from '../data/piggybank';

interface QuickCaptureModalProps {
  tags: string[];
  initialText?: string;
  onClose: () => void;
  onSave: (text: string, source: string, tags: string[]) => Promise<void>;
  requireSource?: boolean;
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  tags: initialTags,
  initialText = '',
  onClose,
  onSave,
  requireSource = true,
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [text, setText] = useState(initialText);
  const [source, setSource] = useState('');
  const [step, setStep] = useState<'tags' | 'text' | 'source'>(initialTags.length > 0 ? 'text' : 'tags');
  const [saving, setSaving] = useState(false);

  const labels: Record<string, string> = {
    идея: '💡 Идея', мысль: '💭 Мысль', вопрос: '❓ Вопрос',
    контакт: '📇 Контакт', 'на будущее': '📌 На будущее', 'в работу': '✅ В работу',
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= 3) return prev;
      return [...prev, tag];
    });
  };

  const handleNextFromTags = () => {
    if (selectedTags.length === 0) return;
    setStep('text');
  };

  const handleNext = () => {
    if (!text.trim() || selectedTags.length === 0) return;
    if (requireSource) setStep('source');
    else void handleSave('Своя мысль');
  };

  const handleSave = async (src: string) => {
    if (!text.trim() || selectedTags.length === 0 || (requireSource && !src)) return;
    setSaving(true);
    try {
      await onSave(text.trim(), src, selectedTags);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const titleTags = selectedTags.map(t => labels[t] || t).join(' · ') || 'Копилка';

  return (
    <ModalCard id="quick-capture" onClose={onClose}>
      <Title level="2" style={{ marginBottom: 12 }}>{titleTags}</Title>
      {step === 'tags' ? (
        <>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Выберите один или несколько тегов (до 3)</div>
          {PIGGYBANK_TAGS.map(tag => (
            <Checkbox
              key={tag}
              checked={selectedTags.includes(tag)}
              onChange={() => toggleTag(tag)}
              style={{ marginBottom: 4 }}
            >
              {labels[tag] || tag}
            </Checkbox>
          ))}
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)', marginTop: 12 }}>
            <Button size="l" stretched disabled={selectedTags.length === 0} onClick={handleNextFromTags}>
              Далее
            </Button>
          </div>
        </>
      ) : step === 'text' ? (
        <>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Запишите мысль..."
            style={{ minHeight: 80 }}
          />
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)', marginBottom: 24 }}>
            <Button size="l" stretched disabled={!text.trim()} onClick={handleNext} style={{ marginTop: 12 }}>
              {requireSource ? 'Далее · источник' : 'Сохранить в копилку'}
            </Button>
            {selectedTags.length > 1 && (
              <Button size="m" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setStep('tags')}>
                Изменить теги
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <FormItem top="Откуда взяли? (источник)">
            <CustomSelect
              placeholder="Выберите источник"
              options={PIGGYBANK_SOURCES.map(s => ({ label: s, value: s }))}
              value={source || undefined}
              onChange={e => setSource(String(e.target.value))}
            />
          </FormItem>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)', marginBottom: 24 }}>
            <Button
              size="l"
              stretched
              disabled={!source || saving}
              onClick={() => handleSave(source)}
              style={{ marginTop: 12 }}
            >
              Сохранить в копилку
            </Button>
            <Button size="m" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setStep('text')}>
              Назад
            </Button>
          </div>
        </>
      )}
    </ModalCard>
  );
};
