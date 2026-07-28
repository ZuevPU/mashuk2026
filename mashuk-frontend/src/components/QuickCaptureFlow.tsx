import { ReactElement, ReactNode, useState } from 'react';
import { ModalCard, ModalRoot, Button, Title } from '@vkontakte/vkui';
import { QuickCaptureModal } from './QuickCaptureModal';
import { QUICK_CAPTURE_ITEMS, PIGGYBANK_TAGS } from '../data/piggybank';
import { apiPost } from '../api/client';

const MODAL_CAPTURE = 'quick-capture';
const MODAL_PICK = 'quick-capture-pick';

export function openQuickCapture(
  setModal: (modal: ReactNode | null) => void,
  opts?: {
    initialTag?: string;
    initialTags?: string[];
    prefillText?: string;
    onSaved?: () => void;
    onError?: (message: string) => void;
  },
) {
  const closeModal = () => setModal(null);

  const wrapModal = (activeId: string, children: ReactElement) => (
    <ModalRoot activeModal={activeId} onClose={closeModal}>
      {children}
    </ModalRoot>
  );

  const save = async (text: string, source: string, tags: string[]) => {
    await apiPost('/piggybank/quick', { tags, text, source });
    opts?.onSaved?.();
  };

  const openCaptureModal = (tags: string[], prefillText?: string) => {
    setModal(
      wrapModal(
        MODAL_CAPTURE,
        <QuickCaptureModal
          tags={tags}
          initialText={prefillText}
          onClose={closeModal}
          onSave={save}
          onError={opts?.onError}
        />,
      ),
    );
  };

  if (opts?.initialTags?.length) {
    openCaptureModal(opts.initialTags, opts.prefillText);
    return;
  }
  if (opts?.initialTag) {
    openCaptureModal([opts.initialTag], opts.prefillText);
    return;
  }
  if (opts?.prefillText) {
    openCaptureModal(['мысль'], opts.prefillText);
    return;
  }

  const TagPicker = () => {
    const [picked, setPicked] = useState<string[]>([]);
    const toggle = (tag: string) => {
      setPicked(prev => {
        if (prev.includes(tag)) return prev.filter(t => t !== tag);
        if (prev.length >= 3) return prev;
        return [...prev, tag];
      });
    };
    return (
      <ModalCard id={MODAL_PICK} onClose={closeModal}>
        <Title level="2" style={{ marginBottom: 12 }}>Копилка</Title>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Выберите тип записи (можно несколько)</div>
        <div className="cap-row">
          {QUICK_CAPTURE_ITEMS.map(item => (
            <div
              key={item.tag}
              className="cap"
              role="button"
              tabIndex={0}
              onClick={() => toggle(item.tag)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(item.tag); }}
              style={{
                outline: picked.includes(item.tag) ? '2px solid #FF5500' : undefined,
                borderRadius: 8,
              }}
            >
              <span className="ci">{item.icon}</span>
              <span className="cl">{item.label}</span>
            </div>
          ))}
        </div>
        {PIGGYBANK_TAGS.filter(t => !QUICK_CAPTURE_ITEMS.some(i => i.tag === t)).length === 0 && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            Отмечено: {picked.length ? picked.join(', ') : '—'}
          </div>
        )}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)', marginTop: 12 }}>
          <Button
            size="l"
            stretched
            disabled={picked.length === 0}
            onClick={() => openCaptureModal(picked)}
          >
            Далее
          </Button>
          <Button size="m" stretched mode="secondary" style={{ marginTop: 8 }} onClick={closeModal}>
            Отмена
          </Button>
        </div>
      </ModalCard>
    );
  };

  setModal(wrapModal(MODAL_PICK, <TagPicker />));
}
