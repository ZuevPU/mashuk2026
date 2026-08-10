import type { ReactNode } from 'react';
import type { ProgramSpeaker } from '../program/types';
import { speakerFullLabel } from '../speakers/speakerFormat';
import type { MaterialRow } from './MaterialCard';

type Props = {
  day: number;
  materials: MaterialRow[];
  typeOptions: { key: string; name: string }[];
  speakers: ProgramSpeaker[];
  kbThreshold?: number;
};

function PreviewShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="adm-evening-preview-shell">
      <div className="adm-forum-preview-label">{label}</div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card">{children}</div>
      </div>
    </div>
  );
}

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

export function KnowledgeBaseParticipantPreview({
  day,
  materials,
  typeOptions,
  speakers,
  kbThreshold = 4,
}: Props) {
  const dayMats = materials
    .filter(m => Number(m.dayNumber) === day && (m.status || 'published') === 'published')
    .slice()
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));

  return (
    <PreviewShell label={`Как у участника · база знаний · день ${day}`}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>База знаний · день {day}</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12, lineHeight: 1.4 }}>
        Материалы открываются когда пройдено <strong style={{ color: '#FF5500' }}>≥ {kbThreshold} из 7 точек осмысления</strong> за день
      </div>

      {dayMats.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 20, fontSize: 12 }}>
          Нет опубликованных материалов на этот день
        </div>
      ) : (
        <div className="adm-kb-preview-table-wrap">
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
                    <span className="adm-kb-preview-title">{m.title || '—'}</span>
                  </td>
                  <td className="adm-kb-preview-speaker">{speakerName(m, speakers)}</td>
                  <td>
                    <span className="adm-kb-preview-piggy">В копилку</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PreviewShell>
  );
}
