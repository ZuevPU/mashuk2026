import { useMemo, useState } from 'react';
import type { ProgramSpeaker } from '../program/types';
import { normalizeSpeakerIds, speakerFullLabel, speakerNamesFromCatalog } from '../speakers/speakerFormat';
import type { MaterialRow } from './MaterialCard';
import { KB_SECTIONS, compareKbMaterials, kbSectionMeta, kbSubsectionLabel } from './kbSections';

type Props = {
  day: number;
  dayOptions: number[];
  materials: MaterialRow[];
  typeOptions: { key: string; name: string }[];
  speakers: ProgramSpeaker[];
  kbThreshold?: number;
  onDayChange?: (day: number) => void;
};

function typeLabel(type: string | null | undefined, typeOptions: Props['typeOptions']): string {
  if (!type) return 'Материал';
  const found = typeOptions.find(t => t.key === type);
  if (found?.name) return found.name;
  const t = type.toLowerCase();
  if (t === 'notes' || t === 'конспект') return 'Конспект';
  if (t === 'pdf' || t === 'presentation') return 'Презентация';
  if (t === 'video' || t === 'vk') return 'Видео';
  if (t === 'audio') return 'Аудио';
  if (t === 'links' || t === 'resources' || t === 'link') return 'Ресурсы';
  return type;
}

function speakerName(m: MaterialRow, speakers: ProgramSpeaker[]): string {
  const ids = normalizeSpeakerIds(m.speakerIds);
  if (ids.length) {
    const names = speakers.filter(s => ids.includes(s.id)).map(speakerFullLabel);
    if (names.length) return names.join('; ');
  }
  return speakerNamesFromCatalog(ids, speakers, m.speakerName) || '—';
}

function materialHref(m: MaterialRow): string | null {
  return m.url || m.fileUrl || null;
}

function groupKey(m: MaterialRow, speakers: ProgramSpeaker[]): string {
  if (m.speakerIds?.length) {
    return `s:${[...m.speakerIds].map(Number).filter(Number.isFinite).sort((a, b) => a - b).join(',')}`;
  }
  const sp = speakerName(m, speakers).trim().toLowerCase();
  if (sp && sp !== '—') return `n:${sp}`;
  return `t:${(m.topicTitle || m.title || '').trim().toLowerCase()}`;
}

export function KnowledgeBaseParticipantPreview({
  day,
  dayOptions,
  materials,
  typeOptions,
  speakers,
  kbThreshold = 4,
  onDayChange,
}: Props) {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const dayMats = useMemo(
    () => materials
      .filter(m => Number(m.dayNumber) === day && (m.status || 'published') === 'published')
      .slice()
      .sort(compareKbMaterials),
    [materials, day],
  );

  const sections = useMemo(() => {
    const bySec = new Map<string, MaterialRow[]>();
    for (const m of dayMats) {
      const key = m.kbSection || 'other';
      const arr = bySec.get(key) || [];
      arr.push(m);
      bySec.set(key, arr);
    }
    const order = [...KB_SECTIONS.map(s => s.key), 'other'];
    return order.filter(k => bySec.has(k)).map(sectionKey => {
      const mats = bySec.get(sectionKey)!;
      const meta = kbSectionMeta(sectionKey);
      const groups = new Map<string, MaterialRow[]>();
      const gOrder: string[] = [];
      const sorted = mats.slice().sort((a, b) => compareKbMaterials(
        { ...a, speakerName: speakerName(a, speakers) },
        { ...b, speakerName: speakerName(b, speakers) },
      ));
      for (const m of sorted) {
        const k = `${m.kbSubsection || ''}\0${m.direction || ''}\0${groupKey(m, speakers)}`;
        if (!groups.has(k)) {
          groups.set(k, []);
          gOrder.push(k);
        }
        groups.get(k)!.push(m);
      }
      return {
        sectionKey,
        label: meta?.label || 'Без раздела',
        color: meta?.color || '#666',
        tint: meta?.tint || '#F4F4F4',
        groups: gOrder.map(k => {
          const items = groups.get(k)!;
          const first = items[0];
          const topic = first.topicTitle
            || [...new Set(items.map(i => i.topicTitle || i.title).filter(Boolean))].join(' · ')
            || first.title;
          return {
            key: k,
            topic,
            speaker: speakerName(first, speakers),
            sub: kbSubsectionLabel(first.kbSection, first.kbSubsection),
            direction: first.direction,
            items,
          };
        }),
      };
    });
  }, [dayMats, speakers]);

  const openMaterial = (m: MaterialRow) => {
    const href = materialHref(m);
    if (!href) {
      setToast('У материала нет ссылки');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const savePiggy = (m: MaterialRow) => {
    setSavedIds(prev => new Set(prev).add(m.id));
    setToast('В превью: сохранено в копилку');
  };

  return (
    <div className="adm-evening-preview-shell">
      <div className="adm-forum-preview-label">Как у участника · база знаний · день {day}</div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card adm-kb-preview-card">
          <div className="adm-kb-preview-appbar">Программа</div>

          <div className="adm-kb-preview-tabs">
            <span className="adm-kb-preview-tab">Расписание</span>
            <span className="adm-kb-preview-tab active">База знаний</span>
          </div>

          <div className="adm-kb-preview-days">
            {dayOptions.map(d => (
              <button
                key={d}
                type="button"
                className={`adm-kb-preview-day${d === day ? ' active' : ''}`}
                onClick={() => onDayChange?.(d)}
              >
                Д{d}
              </button>
            ))}
          </div>

          <div className="adm-kb-preview-day-card">
            <div className="adm-kb-preview-day-title">День {day}</div>
            <div className="adm-kb-preview-day-meta">
              Точки осмысления: {kbThreshold} / 7 · материалы открыты
            </div>
          </div>

          <div className="adm-kb-preview-rule">
            Материалы открываются когда пройдено{' '}
            <strong>≥ {kbThreshold} из 7 точек осмысления</strong> за день
          </div>

          {dayMats.length === 0 ? (
            <div className="adm-kb-preview-empty">Нет опубликованных материалов на этот день</div>
          ) : (
            sections.map(sec => (
              <div
                key={sec.sectionKey}
                className="adm-kb-preview-section"
                style={{ ['--kb-sec' as string]: sec.color, ['--kb-sec-tint' as string]: sec.tint }}
              >
                <div className="adm-kb-preview-section-title">{sec.label}</div>
                {sec.groups.map(g => (
                  <div key={g.key} className="adm-kb-preview-topic">
                    <div className="adm-kb-preview-topic-name">{g.topic}</div>
                    <div className="adm-kb-preview-topic-speaker">
                      {g.speaker}
                      {g.direction ? ` · ${g.direction}` : ''}
                      {g.sub && g.sub !== '—' ? ` · ${g.sub}` : ''}
                    </div>
                    {g.items.map(m => (
                      <div key={m.id} className="adm-kb-preview-artifact">
                        <button
                          type="button"
                          className="adm-kb-preview-title-btn"
                          onClick={() => openMaterial(m)}
                          style={{ flex: 1 }}
                        >
                          <span className="adm-kb-preview-type">{typeLabel(m.type, typeOptions)}</span>
                          {' '}
                          <span className="adm-kb-preview-title">{m.title || '—'}</span>
                        </button>
                        <button
                          type="button"
                          className="adm-kb-preview-piggy"
                          onClick={() => savePiggy(m)}
                        >
                          {savedIds.has(m.id) ? '✓' : '+'}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}

          {toast && (
            <button type="button" className="adm-kb-preview-toast" onClick={() => setToast(null)}>
              {toast}
            </button>
          )}

          <div className="adm-kb-preview-hint">
            Интерактивный макет: разделы цветом, артефакты одной темы подряд. В копилку в превью не уходит на сервер.
          </div>
        </div>
      </div>
    </div>
  );
}
