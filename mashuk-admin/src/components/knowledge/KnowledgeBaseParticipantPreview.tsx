import { useMemo, useState } from 'react';
import type { ProgramSpeaker } from '../program/types';
import { speakerFullLabel } from '../speakers/speakerFormat';
import type { MaterialRow } from './MaterialCard';

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
  if (t === 'pdf' || t === 'presentation') return 'PDF';
  if (t === 'video' || t === 'vk') return 'VK Video';
  if (t === 'links' || t === 'resources' || t === 'link') return 'Ресурсы';
  return type;
}

function speakerName(m: MaterialRow, speakers: ProgramSpeaker[]): string {
  if (m.speakerIds?.length) {
    const names = speakers.filter(s => m.speakerIds!.includes(s.id)).map(speakerFullLabel);
    if (names.length) return names.join('; ');
  }
  return m.speakerName || '—';
}

function materialHref(m: MaterialRow): string | null {
  return m.url || m.fileUrl || null;
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
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru')),
    [materials, day],
  );

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
            <div className="adm-kb-preview-table-card">
              <table className="adm-kb-preview-table">
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Название</th>
                    <th>Спикер</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dayMats.map(m => (
                    <tr key={m.id}>
                      <td className="adm-kb-preview-type">{typeLabel(m.type, typeOptions)}</td>
                      <td>
                        <button
                          type="button"
                          className="adm-kb-preview-title-btn"
                          onClick={() => openMaterial(m)}
                        >
                          <span className="adm-kb-preview-title">{m.title || '—'}</span>
                        </button>
                      </td>
                      <td className="adm-kb-preview-speaker">{speakerName(m, speakers)}</td>
                      <td>
                        <button
                          type="button"
                          className="adm-kb-preview-piggy"
                          onClick={() => savePiggy(m)}
                        >
                          {savedIds.has(m.id) ? 'В копилке' : 'В копилку'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {toast && (
            <button type="button" className="adm-kb-preview-toast" onClick={() => setToast(null)}>
              {toast}
            </button>
          )}

          <div className="adm-kb-preview-hint">
            Интерактивный макет экрана участника. В копилку в превью не уходит на сервер.
          </div>
        </div>
      </div>
    </div>
  );
}
