import { useState } from 'react';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Checkbox, CustomSelect, Button } from '@vkontakte/vkui';
import { openExternalUrl } from '../../utils/openUrl';
import { apiPost } from '../../api/client';
import { PIGGYBANK_SOURCES, PIGGYBANK_TAGS, inferSourceFromEventTitle } from '../../data/piggybank';

interface Material {
  id: number;
  title: string;
  type?: string;
  typeLabel?: string;
  description?: string;
  url?: string;
  isNew?: boolean;
  speakerName?: string;
  speakerInitials?: string;
  topic?: string;
  eventTitle?: string;
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
    lockMessage?: string | null;
    materials?: Material[];
    day?: number;
    dayTitle?: string;
    dayDescription?: string | null;
    opensOn?: string | null;
  } | null;
}

export function KnowledgeBasePanel({ kb }: KnowledgeBaseProps) {
  const [openSpeaker, setOpenSpeaker] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [pendingMaterial, setPendingMaterial] = useState<Material | null>(null);
  const [piggyTags, setPiggyTags] = useState<string[]>(['на будущее']);
  const [piggySource, setPiggySource] = useState('');
  const [piggyStep, setPiggyStep] = useState<'tags' | 'source'>('tags');
  const [toast, setToast] = useState<string | null>(null);
  const routeNavigator = useRouteNavigator();

  if (!kb) return null;

  if (kb.lockReason === 'point_b' || kb.day === 8) {
    return (
      <div className="kb-lock">
        <div className="kb-lock-icon">🎯</div>
        <div className="kb-lock-t">Заключительный день</div>
        <div className="kb-lock-s">{kb.lockMessage || 'Заполни Точку Б — финальную рефлексию смены'}</div>
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
          {kb.lockMessage || (isFuture
            ? `Откроется, когда наступит день ${kb.day}`
            : (kb.ruleLabel || `Пройдите ${req} из ${total} точек осмысления за день`))}
        </div>
        {!isFuture && (
          <div className="kb-lock-bar">
            <div className="kb-lock-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  }

  const bySpeaker = new Map<string, { topic: string; mats: Material[] }>();
  for (const m of kb.materials ?? []) {
    const key = m.speakerName || 'Материалы';
    if (!bySpeaker.has(key)) {
      bySpeaker.set(key, { topic: m.topic || m.eventTitle || m.title, mats: [] });
    }
    bySpeaker.get(key)!.mats.push(m);
  }

  const openPiggyDialog = (m: Material) => {
    setPendingMaterial(m);
    setPiggyTags(['на будущее']);
    setPiggySource(inferSourceFromEventTitle(m.eventTitle || m.topic));
    setPiggyStep('tags');
  };

  const togglePiggyTag = (tag: string) => {
    setPiggyTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= 3) return prev;
      return [...prev, tag];
    });
  };

  const saveToPiggy = async () => {
    if (!pendingMaterial || piggyTags.length === 0 || !piggySource) return;
    try {
      await apiPost(`/program/materials/${pendingMaterial.id}/piggybank`, {
        tags: piggyTags,
        source: piggySource,
      });
      setSavedIds(prev => new Set(prev).add(pendingMaterial.id));
      setPendingMaterial(null);
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
      {Array.from(bySpeaker.entries()).map(([speaker, group]) => {
        const initials = group.mats[0]?.speakerInitials || speaker.slice(0, 2).toUpperCase();
        const isOpen = openSpeaker === speaker;
        return (
          <div key={speaker} className="kb-speaker">
            <div className="kb-speaker-h" onClick={() => setOpenSpeaker(isOpen ? null : speaker)}>
              <div className="kb-av">{initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{speaker}</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{group.topic}</div>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && group.mats.map(m => (
              <div key={m.id} className="kb-mat">
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: m.url ? 'pointer' : 'default' }}
                  onClick={() => m.url && openExternalUrl(m.url)}
                >
                  <span style={{ fontSize: 11, minWidth: 88 }}>{m.typeLabel || m.title}</span>
                  <span style={{ flex: 1, fontSize: 11 }}>{m.title}</span>
                  {m.isNew && <span className="kb-mat-new">Новый</span>}
                </span>
                <button
                  type="button"
                  style={{ fontSize: 10, border: '1px solid #ddd', borderRadius: 8, padding: '4px 8px', background: '#fff', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPiggyDialog(m);
                  }}
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
      {pendingMaterial != null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setPendingMaterial(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 360 }}
            onClick={e => e.stopPropagation()}
          >
            {piggyStep === 'tags' ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Теги для копилки</div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>{pendingMaterial.title}</div>
                {PIGGYBANK_TAGS.map(tag => (
                  <Checkbox
                    key={tag}
                    checked={piggyTags.includes(tag)}
                    onChange={() => togglePiggyTag(tag)}
                  >
                    {tag}
                  </Checkbox>
                ))}
                <Button
                  size="l"
                  stretched
                  style={{ marginTop: 12 }}
                  disabled={piggyTags.length === 0}
                  onClick={() => setPiggyStep('source')}
                >
                  Далее · источник
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Источник записи</div>
                <CustomSelect
                  placeholder="Выберите источник"
                  value={piggySource || undefined}
                  onChange={e => setPiggySource(String(e.target.value))}
                  options={PIGGYBANK_SOURCES.map(s => ({ label: s, value: s }))}
                />
                <Button size="l" stretched style={{ marginTop: 12 }} disabled={!piggySource} onClick={saveToPiggy}>
                  Сохранить в копилку
                </Button>
                <Button size="m" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setPiggyStep('tags')}>
                  Назад
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
