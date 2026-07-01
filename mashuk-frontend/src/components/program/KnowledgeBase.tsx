import { useState } from 'react';
import { openExternalUrl } from '../../utils/openUrl';

interface Material {
  id: number;
  title: string;
  type?: string;
  description?: string;
  url?: string;
  isNew?: boolean;
  speakerName?: string;
  speakerInitials?: string;
}

interface KnowledgeBaseProps {
  kb: {
    unlocked?: boolean;
    requiredTouchpoints?: number;
    touchpointsCompleted?: number;
    materials?: Material[];
  } | null;
}

export function KnowledgeBasePanel({ kb }: KnowledgeBaseProps) {
  const [openSpeaker, setOpenSpeaker] = useState<string | null>(null);

  if (!kb) return null;

  if (!kb.unlocked) {
    const req = kb.requiredTouchpoints ?? 4;
    const done = kb.touchpointsCompleted ?? 0;
    const pct = Math.min(100, Math.round((done / req) * 100));
    return (
      <div className="kb-lock">
        <div className="kb-lock-icon">🔒</div>
        <div className="kb-lock-t">База знаний заблокирована</div>
        <div className="kb-lock-s">Пройдите {req} точек осмысления</div>
        <div className="kb-progress"><div className="kb-progress-fill" style={{ width: `${pct}%` }} /></div>
        <div style={{ fontSize: 10, color: '#888' }}>{done} / {req} точек</div>
      </div>
    );
  }

  const bySpeaker = new Map<string, Material[]>();
  for (const m of kb.materials ?? []) {
    const key = m.speakerName || 'Материалы';
    if (!bySpeaker.has(key)) bySpeaker.set(key, []);
    bySpeaker.get(key)!.push(m);
  }

  return (
    <>
      {Array.from(bySpeaker.entries()).map(([speaker, mats]) => {
        const initials = mats[0]?.speakerInitials || speaker.slice(0, 2).toUpperCase();
        const isOpen = openSpeaker === speaker;
        return (
          <div key={speaker} className="kb-speaker">
            <div className="kb-speaker-h" onClick={() => setOpenSpeaker(isOpen ? null : speaker)}>
              <div className="kb-av">{initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{speaker}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{mats.length} материал(ов)</div>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && mats.map(m => (
              <div key={m.id} className="kb-mat" onClick={() => m.url && openExternalUrl(m.url)}>
                <span>{m.type === 'video' ? '🎥' : m.type === 'pdf' ? '📄' : '📎'}</span>
                <span style={{ flex: 1 }}>{m.title}</span>
                {m.isNew && <span className="kb-mat-new">Новый</span>}
              </div>
            ))}
          </div>
        );
      })}
      {(kb.materials ?? []).length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', padding: 16, fontSize: 12 }}>Материалы появятся после мероприятий</div>
      )}
    </>
  );
}
