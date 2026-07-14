import { useState } from 'react';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { openExternalUrl } from '../../utils/openUrl';
import { apiPost } from '../../api/client';

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
    touchpointsTotal?: number;
    remaining?: number;
    ruleLabel?: string;
    lockReason?: string | null;
    materials?: Material[];
    day?: number;
  } | null;
}

export function KnowledgeBasePanel({ kb }: KnowledgeBaseProps) {
  const [openSpeaker, setOpenSpeaker] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const routeNavigator = useRouteNavigator();

  if (!kb) return null;

  if (kb.lockReason === 'point_b' || kb.day === 8) {
    return (
      <div className="kb-lock">
        <div className="kb-lock-icon">🎯</div>
        <div className="kb-lock-t">Заключительный день</div>
        <div className="kb-lock-s">Заполни Точку Б — финальную рефлексию смены</div>
        <button
          type="button"
          className="m-prio-btn"
          style={{ marginTop: 12 }}
          onClick={() => routeNavigator.push('/questions')}
        >
          Перейти к Точке Б →
        </button>
      </div>
    );
  }

  if (!kb.unlocked) {
    const req = kb.requiredTouchpoints ?? 4;
    const done = kb.touchpointsCompleted ?? 0;
    const total = kb.touchpointsTotal ?? 7;
    const pct = Math.min(100, Math.round((done / req) * 100));
    const isFuture = kb.lockReason === 'future_day';
    return (
      <div className="kb-lock">
        <div className="kb-lock-icon">🔒</div>
        <div className="kb-lock-t">{isFuture ? 'День ещё не наступил' : 'База знаний заблокирована'}</div>
        <div className="kb-lock-s">
          {isFuture
            ? `Откроется, когда наступит день ${kb.day}`
            : (kb.ruleLabel || `Пройдите ${req} из ${total} точек осмысления за день`)}
        </div>
        {!isFuture && (
          <>
            <div className="kb-progress"><div className="kb-progress-fill" style={{ width: `${pct}%` }} /></div>
            <div style={{ fontSize: 10, color: '#888' }}>{done} / {req} точек · осталось {kb.remaining ?? Math.max(0, req - done)}</div>
            <button
              type="button"
              className="m-prio-btn"
              style={{ marginTop: 12 }}
              onClick={() => routeNavigator.push('/questions')}
            >
              К точкам осмысления →
            </button>
          </>
        )}
      </div>
    );
  }

  const bySpeaker = new Map<string, Material[]>();
  for (const m of kb.materials ?? []) {
    const key = m.speakerName || 'Материалы';
    if (!bySpeaker.has(key)) bySpeaker.set(key, []);
    bySpeaker.get(key)!.push(m);
  }

  const saveToPiggy = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiPost(`/program/materials/${id}/piggybank`, {});
      setSavedIds(prev => new Set(prev).add(id));
      setToast('Сохранено в копилку');
    } catch {
      setToast('Не удалось сохранить');
    }
  };

  return (
    <>
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 50,
            background: '#222', color: '#fff', padding: '10px 14px', borderRadius: 10,
            fontSize: 13, textAlign: 'center',
          }}
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#888', marginBottom: 10, lineHeight: 1.4 }}>
        {kb.ruleLabel || <>Материалы открываются когда пройдено <strong style={{ color: '#FF5500' }}>≥ 4 из 7 точек осмысления</strong> за день</>}
      </div>
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
              <div key={m.id} className="kb-mat">
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: m.url ? 'pointer' : 'default' }}
                  onClick={() => m.url && openExternalUrl(m.url)}
                >
                  <span>{m.type === 'video' ? '🎥' : m.type === 'pdf' ? '📄' : '📎'}</span>
                  <span style={{ flex: 1 }}>{m.title}</span>
                  {m.isNew && <span className="kb-mat-new">Новый</span>}
                </span>
                <button
                  type="button"
                  style={{ fontSize: 10, border: '1px solid #ddd', borderRadius: 8, padding: '4px 8px', background: '#fff', cursor: 'pointer' }}
                  onClick={(e) => saveToPiggy(m.id, e)}
                >
                  {savedIds.has(m.id) ? 'В копилке' : 'В копилку'}
                </button>
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
