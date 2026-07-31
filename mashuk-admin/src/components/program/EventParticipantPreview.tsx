import { parseOptionalTimeSlot, type ProgramEvent } from './types';
import { speakerFullLabel } from '../speakers/speakerFormat';
import { ParticipantPreviewFrame } from '../admin/ParticipantPreviewModal';

function timeLabel(slot?: string | null): string {
  const { start, end } = parseOptionalTimeSlot(slot);
  if (!start) return '';
  return end ? `${start}–${end}` : start;
}

function NestedPreview({
  nodes,
  depth = 1,
}: {
  nodes: ProgramEvent[];
  depth?: number;
}) {
  if (!nodes.length) return null;
  return (
    <div style={{ marginTop: depth === 1 ? 10 : 6, marginLeft: depth === 1 ? 0 : 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {nodes.map(n => {
        const kids = n.children || [];
        const time = timeLabel(n.timeSlot);
        const speakers = (n.speakers || []).map(s => speakerFullLabel(s)).filter(Boolean).join(', ');
        return (
          <div
            key={n.id}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: '8px 10px',
              border: '1px solid #E8E2D8',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {time && (
                <div style={{ fontSize: 11, fontWeight: 700, minWidth: 40, color: '#1A1714' }}>{time}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: depth >= 2 ? 12 : 13, fontWeight: 700 }}>{n.title}</div>
                {n.place && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{n.place}</div>}
                {speakers && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{speakers}</div>}
              </div>
              {kids.length > 0 && (
                <div style={{ fontSize: 11, color: '#888' }}>{kids.length}</div>
              )}
            </div>
            {kids.length > 0 && <NestedPreview nodes={kids} depth={depth + 1} />}
          </div>
        );
      })}
    </div>
  );
}

/** Превью карточки события как в приложении участника (с подтемами). */
export function EventParticipantPreview({
  title,
  place,
  timeStart,
  timeEnd,
  speakerLine,
  descriptionHtml,
  description,
  children,
}: {
  title: string;
  place?: string;
  timeStart?: string;
  timeEnd?: string;
  speakerLine?: string;
  descriptionHtml?: string;
  description?: string;
  children?: ProgramEvent[];
}) {
  const time = timeStart
    ? (timeEnd ? `${timeStart}–${timeEnd}` : timeStart)
    : '';
  const html = descriptionHtml || (description ? description.replace(/\n/g, '<br/>') : '');
  const nested = children || [];

  return (
    <ParticipantPreviewFrame>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Как в расписании участника</div>
      <div
        style={{
          background: '#fff',
          borderRadius: 13,
          padding: '12px 14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {time && <div style={{ fontSize: 12, fontWeight: 700, minWidth: 44 }}>{time}</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{title || 'Событие'}</div>
            {(place || speakerLine || nested.length > 0) && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 3, lineHeight: 1.35 }}>
                {[place, speakerLine, nested.length ? `${nested.length} тем` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <div style={{ fontSize: 15, color: '#D5CFC7' }}>{nested.length ? '▼' : '›'}</div>
        </div>
      </div>

      {nested.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9A4E12', marginTop: 12, marginBottom: 2 }}>
            Подтемы
          </div>
          <NestedPreview nodes={nested} />
        </>
      )}

      {html && (
        <div
          className="adm-kb-preview-body"
          style={{ marginTop: 12, fontSize: 14 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {!html && nested.length === 0 && (
        <p className="adm-muted" style={{ marginTop: 10 }}>Нет описания и подтем</p>
      )}
    </ParticipantPreviewFrame>
  );
}
