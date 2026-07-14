import { useState } from 'react';
import { ModalCard, Textarea, Button, Title, FormItem, CustomSelect } from '@vkontakte/vkui';
import { PIGGYBANK_SOURCES } from '../data/piggybank';

interface QuickCaptureModalProps {
  tag: string;
  onClose: () => void;
  onSave: (text: string, source: string) => Promise<void>;
  requireSource?: boolean;
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  tag,
  onClose,
  onSave,
  requireSource = true,
}) => {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [step, setStep] = useState<'text' | 'source'>('text');
  const [saving, setSaving] = useState(false);

  const labels: Record<string, string> = {
    идея: '💡 Идея', мысль: '💭 Мысль', вопрос: '❓ Вопрос',
    контакт: '📇 Контакт', 'на будущее': '📌 На будущее', 'в работу': '✅ В работу',
  };

  const handleNext = () => {
    if (!text.trim()) return;
    if (requireSource) setStep('source');
    else void handleSave('Своя мысль');
  };

  const handleSave = async (src: string) => {
    if (!text.trim() || (requireSource && !src)) return;
    setSaving(true);
    try {
      await onSave(text.trim(), src);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCard id="quick-capture" onClose={onClose}>
      <Title level="2" style={{ marginBottom: 12 }}>{labels[tag] || tag}</Title>
      {step === 'text' ? (
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
