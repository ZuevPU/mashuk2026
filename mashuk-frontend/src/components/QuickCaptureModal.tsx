import { useState } from 'react';
import { ModalCard, Textarea, Button, Title } from '@vkontakte/vkui';

interface QuickCaptureModalProps {
  tag: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({ tag, onClose, onSave }) => {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const labels: Record<string, string> = {
    идея: '💡 Идея', мысль: '💭 Мысль', вопрос: '❓ Вопрос',
    контакт: '📇 Контакт', 'на будущее': '📌 На будущее', 'забрать в работу': '✅ В работу',
    'обсудить с командой': '👥 Обсудить с командой',
  };

  return (
    <ModalCard id="quick-capture" onClose={onClose}>
      <Title level="2" style={{ marginBottom: 12 }}>{labels[tag] || tag}</Title>
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Запишите мысль..." />
      <Button size="l" stretched disabled={!text.trim() || saving} onClick={handleSave} style={{ marginTop: 12 }}>
        Сохранить в копилку
      </Button>
    </ModalCard>
  );
};
