import { useEffect, useRef, useState } from 'react';
import { SpeakerMultiPick } from '../program/ProgramCatalogs';
import type { ProgramSpeaker } from '../program/types';
import { speakerFullLabel } from '../speakers/speakerFormat';
import { confirmDelete } from '../../admin/confirmDelete';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import { KB_SECTIONS, kbSectionMeta, kbSubsectionLabel, kbSubsectionOptions } from './kbSections';

export type MaterialRow = {
  id: number;
  title: string;
  url?: string | null;
  fileUrl?: string | null;
  type?: string | null;
  status?: string | null;
  tags?: string[];
  dayNumber?: number;
  eventId?: number | null;
  direction?: string | null;
  isGeneral?: boolean;
  createdAt?: string;
  speakerName?: string | null;
  speakerIds?: number[];
  kbUnlockMode?: 'immediate' | 'touchpoints' | string | null;
  kbUnlockMinTouchpoints?: number | null;
  kbSection?: string | null;
  kbSubsection?: string | null;
  topicTitle?: string | null;
  sortOrder?: number | null;
};

type Draft = {
  title: string;
  url: string;
  fileUrl: string;
  type: string;
  status: string;
  tags: string[];
  speakerIds: number[];
  dayNumber: number;
  eventId: string;
  direction: string;
  isGeneral: boolean;
  audienceAll: boolean;
  kbUnlockMode: 'immediate' | 'touchpoints';
  kbUnlockMinTouchpoints: number | '';
  kbSection: string;
  kbSubsection: string;
  topicTitle: string;
  sortOrder: number | '';
};

type Props = {
  material: MaterialRow;
  typeOptions: { key: string; name: string }[];
  speakers: ProgramSpeaker[];
  events: { id: number; dayNumber: number; title: string }[];
  directions: { id: number; name: string }[];
  /** Дни смены для выбора (1…totalDays) */
  dayOptions: number[];
  onSave: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onCopyLink?: (url: string) => void;
  onPreview?: () => void;
};

function speakerLabel(ids: number[], speakers: ProgramSpeaker[], fallback?: string | null): string {
  if (ids.length) {
    return speakers.filter(s => ids.includes(s.id)).map(speakerFullLabel).join('; ') || '—';
  }
  return fallback || '—';
}

function bindingLabel(m: MaterialRow, events: Props['events']): string {
  if (m.isGeneral) return 'Общий';
  if (m.eventId) {
    const ev = events.find(e => e.id === m.eventId);
    return ev ? `Блок: Д${ev.dayNumber} · ${ev.title}` : `Событие #${m.eventId}`;
  }
  return '—';
}

function mkDraft(m: MaterialRow): Draft {
  return {
    title: m.title || '',
    url: m.url || '',
    fileUrl: m.fileUrl || '',
    type: m.type || '',
    status: m.status || 'draft',
    tags: [...((m.tags as string[]) || [])],
    speakerIds: [...(m.speakerIds || [])],
    dayNumber: m.dayNumber ?? 1,
    eventId: m.eventId != null ? String(m.eventId) : '',
    direction: m.direction || '',
    isGeneral: !!m.isGeneral,
    audienceAll: !m.direction,
    kbUnlockMode: (m.kbUnlockMode === 'immediate' ? 'immediate' : 'touchpoints') as 'immediate' | 'touchpoints',
    kbUnlockMinTouchpoints: m.kbUnlockMinTouchpoints != null ? m.kbUnlockMinTouchpoints : '',
    kbSection: m.kbSection || '',
    kbSubsection: m.kbSubsection || '',
    topicTitle: m.topicTitle || '',
    sortOrder: m.sortOrder != null ? m.sortOrder : '',
  };
}

export function MaterialCard({
  material,
  typeOptions,
  speakers,
  events,
  directions,
  dayOptions,
  onSave,
  onDelete,
  onCopyLink,
  onPreview,
}: Props) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => mkDraft(material));
  const materialDay = material.dayNumber ?? 1;
  const days = dayOptions.includes(materialDay)
    ? dayOptions
    : [...dayOptions, materialDay].sort((a, b) => a - b);

  useEffect(() => {
    setDraft(mkDraft(material));
    setEditing(false);
  }, [material]);

  const link = draft.url || draft.fileUrl || material.url || material.fileUrl;
  const dateStr = material.createdAt
    ? new Date(material.createdAt).toLocaleDateString('ru-RU')
    : '—';
  const typeName = typeOptions.find(t => t.key === material.type)?.name || material.type || '—';
  const sec = kbSectionMeta(material.kbSection);
  const audienceStr = material.direction ? material.direction : 'Для всех';
  const subOptions = kbSubsectionOptions(draft.kbSection);

  const persist = (statusOverride?: string) => {
    const direction = draft.audienceAll && draft.kbSection !== 'thematic'
      ? ''
      : draft.direction;
    const nextStatus = statusOverride ?? draft.status;
    onSave({
      title: draft.title,
      url: draft.url || null,
      fileUrl: draft.fileUrl || null,
      type: draft.type || null,
      status: nextStatus,
      tags: draft.tags,
      speakerIds: draft.speakerIds,
      dayNumber: draft.dayNumber,
      eventId: draft.isGeneral ? null : (draft.eventId ? Number(draft.eventId) : null),
      direction: direction || null,
      isGeneral: draft.isGeneral,
      kbUnlockMode: draft.kbUnlockMode,
      kbUnlockMinTouchpoints: draft.kbUnlockMode === 'touchpoints' && draft.kbUnlockMinTouchpoints !== ''
        ? draft.kbUnlockMinTouchpoints
        : null,
      kbSection: draft.kbSection || null,
      kbSubsection: draft.kbSection === 'open_lessons' ? (draft.kbSubsection || null) : null,
      topicTitle: draft.topicTitle.trim() || null,
      sortOrder: draft.sortOrder === '' ? 0 : draft.sortOrder,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <tr ref={rowRef}>
        <td>
          {sec ? (
            <span className="adm-kb-section-chip" style={{ background: sec.tint, color: sec.color, borderColor: sec.color }}>
              {sec.label}
            </span>
          ) : (
            <span className="adm-muted">—</span>
          )}
          {material.kbSubsection && (
            <div className="adm-muted" style={{ fontSize: 10, marginTop: 4 }}>
              {kbSubsectionLabel(material.kbSection, material.kbSubsection)}
            </div>
          )}
          {material.topicTitle && (
            <div className="adm-muted" style={{ fontSize: 10, marginTop: 2 }} title="Тема группировки">
              Тема: {material.topicTitle}
            </div>
          )}
        </td>
        <td className="adm-muted" style={{ fontSize: 11 }}>{dateStr}</td>
        <td style={{ fontSize: 11, maxWidth: 140 }}>{speakerLabel(material.speakerIds || [], speakers, material.speakerName)}</td>
        <td>{material.title}</td>
        <td>{typeName}</td>
        <td>{audienceStr}</td>
        <td style={{ fontSize: 11 }}>{bindingLabel(material, events)}</td>
        <td>{material.status === 'published' ? 'Опубликован' : material.status === 'archived' ? 'Скрыт' : 'Черновик'}</td>
        <td>
          <RowActionsMenu
            actions={[
              { label: 'Редактировать', onClick: () => setEditing(true) },
              ...(material.status !== 'published' ? [{
                label: 'Опубликовать',
                onClick: () => onSave({ status: 'published' }),
              }] : []),
              ...(link && onCopyLink ? [{ label: 'Скопировать ссылку', onClick: () => onCopyLink(link) }] : []),
              ...(onPreview ? [{ label: 'Превью', onClick: onPreview }] : []),
              ...(material.status !== 'archived' ? [{
                label: 'Скрыть',
                onClick: () => onSave({ status: 'archived' }),
              }] : [{
                label: 'Вернуть из архива',
                onClick: () => onSave({ status: 'draft' }),
              }]),
              {
                label: 'Удалить',
                onClick: () => {
                  if (!confirmDelete('Удалить материал?')) return;
                  onDelete();
                },
              },
            ]}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr ref={rowRef} className="adm-material-edit-row">
      <td style={{ minWidth: 200 }}>
        <select
          className="adm-input adm-input-narrow"
          value={draft.kbSection}
          onChange={e => setDraft(d => ({
            ...d,
            kbSection: e.target.value,
            kbSubsection: e.target.value === 'open_lessons' ? d.kbSubsection : '',
            audienceAll: e.target.value === 'thematic' ? false : d.audienceAll,
          }))}
        >
          <option value="">— раздел —</option>
          {KB_SECTIONS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {draft.kbSection === 'open_lessons' && (
          <select
            className="adm-input adm-input-narrow"
            style={{ marginTop: 4 }}
            value={draft.kbSubsection}
            onChange={e => setDraft(d => ({ ...d, kbSubsection: e.target.value }))}
          >
            <option value="">— подраздел —</option>
            {subOptions.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        )}
        <input
          className="adm-input"
          style={{ marginTop: 4 }}
          value={draft.topicTitle}
          onChange={e => setDraft(d => ({ ...d, topicTitle: e.target.value }))}
          placeholder="Тема (для группировки)"
        />
        <div className="adm-muted" style={{ fontSize: 10 }}>{dateStr}</div>
      </td>
      <td>
        <select
          className="adm-input adm-input-narrow"
          value={draft.dayNumber}
          onChange={e => setDraft(d => ({
            ...d,
            dayNumber: Number(e.target.value),
            eventId: '',
          }))}
          title="День смены"
        >
          {days.map(d => (
            <option key={d} value={d}>День {d}</option>
          ))}
        </select>
      </td>
      <td style={{ minWidth: 160 }}>
        <SpeakerMultiPick
          speakers={speakers}
          selectedIds={draft.speakerIds}
          onChange={ids => setDraft(d => ({ ...d, speakerIds: ids }))}
        />
      </td>
      <td>
        <input className="adm-input adm-input-narrow" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
        <input className="adm-input" style={{ marginTop: 4 }} value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))} placeholder="URL" />
      </td>
      <td>
        <select className="adm-input adm-input-narrow" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
          <option value="">—</option>
          {typeOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </td>
      <td>
        {draft.kbSection === 'thematic' ? (
          <select
            className="adm-input adm-input-narrow"
            value={draft.direction}
            onChange={e => setDraft(d => ({ ...d, direction: e.target.value, audienceAll: false }))}
          >
            <option value="">— направление —</option>
            {directions.map(dir => <option key={dir.id} value={dir.name}>{dir.name}</option>)}
          </select>
        ) : (
          <>
            <label className="adm-forum-check" style={{ display: 'block', fontSize: 11 }}>
              <input type="radio" checked={draft.audienceAll} onChange={() => setDraft(d => ({ ...d, audienceAll: true, direction: '' }))} />
              Для всех
            </label>
            <label className="adm-forum-check" style={{ display: 'block', fontSize: 11 }}>
              <input type="radio" checked={!draft.audienceAll} onChange={() => setDraft(d => ({ ...d, audienceAll: false }))} />
              Направление
            </label>
            {!draft.audienceAll && (
              <select className="adm-input adm-input-narrow" value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}>
                <option value="">—</option>
                {directions.map(dir => <option key={dir.id} value={dir.name}>{dir.name}</option>)}
              </select>
            )}
          </>
        )}
      </td>
      <td>
        <label className="adm-forum-check" style={{ fontSize: 11 }}>
          <input type="checkbox" checked={draft.isGeneral} onChange={e => setDraft(d => ({ ...d, isGeneral: e.target.checked, eventId: e.target.checked ? '' : d.eventId }))} />
          Общий
        </label>
        {!draft.isGeneral && (
          <select
            className="adm-input adm-input-narrow"
            value={draft.eventId}
            onChange={e => {
              const eventId = e.target.value;
              const ev = events.find(x => String(x.id) === eventId);
              setDraft(d => ({
                ...d,
                eventId,
                ...(ev ? { dayNumber: ev.dayNumber } : {}),
              }));
            }}
          >
            <option value="">— блок —</option>
            {events
              .filter(ev =>
                !draft.dayNumber
                || ev.dayNumber === draft.dayNumber
                || String(ev.id) === draft.eventId,
              )
              .map(ev => (
                <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
              ))}
          </select>
        )}
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <span className="adm-label" style={{ display: 'block', marginBottom: 4 }}>Условие открытия (учёт)</span>
          <label className="adm-forum-check" style={{ display: 'block' }}>
            <input
              type="radio"
              checked={draft.kbUnlockMode === 'immediate'}
              onChange={() => setDraft(d => ({ ...d, kbUnlockMode: 'immediate', kbUnlockMinTouchpoints: '' }))}
            />
            Открыт сразу
          </label>
          <label className="adm-forum-check" style={{ display: 'block' }}>
            <input
              type="radio"
              checked={draft.kbUnlockMode === 'touchpoints'}
              onChange={() => setDraft(d => ({ ...d, kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: d.kbUnlockMinTouchpoints === '' ? 4 : d.kbUnlockMinTouchpoints }))}
            />
            После ≥ N точек осмысления
          </label>
          {draft.kbUnlockMode === 'touchpoints' && (
            <input
              type="number"
              min={1}
              max={7}
              className="adm-input adm-input-narrow"
              style={{ marginTop: 4, width: 56 }}
              value={draft.kbUnlockMinTouchpoints === '' ? '' : draft.kbUnlockMinTouchpoints}
              placeholder="4"
              onChange={e => setDraft(d => ({ ...d, kbUnlockMinTouchpoints: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          )}
        </div>
      </td>
      <td>
        <select className="adm-input adm-input-narrow" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
          <option value="draft">Черновик</option>
          <option value="published">Опубликован</option>
          <option value="archived">Скрыт</option>
        </select>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => persist('draft')}>
            Сохранить черновик
          </button>
          <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => persist('published')}>
            Опубликовать
          </button>
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => { setDraft(mkDraft(material)); setEditing(false); }}>
            Отмена
          </button>
        </div>
      </td>
    </tr>
  );
}
