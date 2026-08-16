import { useEffect, useMemo, useState } from 'react';
import { SpeakerMultiPick } from '../program/ProgramCatalogs';
import type { ProgramSpeaker } from '../program/types';
import { normalizeSpeakerIds, speakerFullLabel, speakerNamesFromCatalog } from '../speakers/speakerFormat';
import { confirmDelete } from '../../admin/confirmDelete';
import { KB_SECTIONS, kbSectionMeta, kbSubsectionOptions } from './kbSections';

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
  sortOrder: number | '';
};

type Props = {
  material: MaterialRow;
  typeOptions: { key: string; name: string }[];
  speakers: ProgramSpeaker[];
  events: { id: number; dayNumber: number; title: string }[];
  directions: { id: number; name: string }[];
  dayOptions: number[];
  onSave: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onPreview?: () => void;
};

function mkDraft(m: MaterialRow): Draft {
  return {
    title: m.title || '',
    url: m.url || '',
    fileUrl: m.fileUrl || '',
    type: m.type || '',
    status: m.status || 'draft',
    tags: [...((m.tags as string[]) || [])],
    speakerIds: normalizeSpeakerIds(m.speakerIds),
    dayNumber: m.dayNumber ?? 1,
    eventId: m.eventId != null ? String(m.eventId) : '',
    direction: m.direction || '',
    isGeneral: !!m.isGeneral,
    audienceAll: !m.direction,
    kbUnlockMode: (m.kbUnlockMode === 'immediate' ? 'immediate' : 'touchpoints') as 'immediate' | 'touchpoints',
    kbUnlockMinTouchpoints: m.kbUnlockMinTouchpoints != null ? m.kbUnlockMinTouchpoints : '',
    kbSection: m.kbSection || '',
    kbSubsection: m.kbSubsection || '',
    sortOrder: m.sortOrder != null ? m.sortOrder : '',
  };
}

function draftToBody(
  draft: Draft,
  speakers: ProgramSpeaker[],
  fallbackName?: string | null,
  statusOverride?: string,
): Record<string, unknown> {
  const direction = draft.audienceAll ? '' : draft.direction;
  return {
    title: draft.title,
    url: draft.url || null,
    fileUrl: draft.fileUrl || null,
    type: draft.type || null,
    status: statusOverride ?? draft.status,
    tags: draft.tags,
    speakerIds: draft.speakerIds,
    speakerName: speakerNamesFromCatalog(draft.speakerIds, speakers, fallbackName) || null,
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
    sortOrder: draft.sortOrder === '' ? 0 : draft.sortOrder,
  };
}

function speakerSummary(ids: number[], speakers: ProgramSpeaker[], fallback?: string | null): string {
  return speakerNamesFromCatalog(ids, speakers, fallback) || (ids.length ? '—' : 'Без спикера');
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
  onPreview,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => mkDraft(material));
  const [cardOpen, setCardOpen] = useState(false);
  const materialDay = material.dayNumber ?? 1;
  const days = dayOptions.includes(materialDay)
    ? dayOptions
    : [...dayOptions, materialDay].sort((a, b) => a - b);
  const subOptions = kbSubsectionOptions(draft.kbSection);
  const sec = kbSectionMeta(draft.kbSection || material.kbSection);

  useEffect(() => {
    setDraft(mkDraft(material));
  }, [material]);

  const dirty = useMemo(() => {
    const base = mkDraft(material);
    return JSON.stringify(base) !== JSON.stringify(draft);
  }, [material, draft]);

  const persist = (statusOverride?: string) => {
    onSave(draftToBody(draft, speakers, material.speakerName, statusOverride));
    if (statusOverride) {
      setDraft(d => ({ ...d, status: statusOverride }));
    }
    setCardOpen(false);
  };

  const eventsForDay = events.filter(ev =>
    !draft.dayNumber
    || ev.dayNumber === draft.dayNumber
    || String(ev.id) === draft.eventId,
  );

  const sectionKey = draft.kbSection || material.kbSection || '';
  const rowClass = [
    sectionKey ? `adm-kb-row--${sectionKey}` : 'adm-kb-row--none',
    dirty ? 'adm-kb-row-dirty' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <tr className={rowClass}>
        <td className="adm-kb-col-section">
          <select
            className="adm-input adm-kb-select"
            value={draft.kbSection}
            onChange={e => setDraft(d => ({
              ...d,
              kbSection: e.target.value,
              kbSubsection: e.target.value === 'open_lessons' ? d.kbSubsection : '',
            }))}
          >
            <option value="">— раздел —</option>
            {KB_SECTIONS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {draft.kbSection === 'open_lessons' && (
            <select
              className="adm-input adm-kb-select"
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
          {sec && (
            <div
              className="adm-kb-section-chip"
              style={{
                background: sec.tint,
                color: sec.color,
                borderColor: 'transparent',
                marginTop: 6,
              }}
            >
              {sec.label}
            </div>
          )}
        </td>
        <td className="adm-kb-col-day">
          <select
            className="adm-input adm-kb-select-sm"
            value={draft.dayNumber}
            onChange={e => setDraft(d => ({
              ...d,
              dayNumber: Number(e.target.value),
              eventId: '',
            }))}
            title="День смены"
          >
            {days.map(d => (
              <option key={d} value={d}>Д{d}</option>
            ))}
          </select>
        </td>
        <td className="adm-kb-col-speaker">
          <button
            type="button"
            className="adm-kb-speaker-btn"
            title="Открыть карточку всех параметров"
            onClick={() => setCardOpen(true)}
          >
            {speakerSummary(draft.speakerIds, speakers, material.speakerName)}
          </button>
          <div className="adm-kb-speaker-hint">карточка</div>
        </td>
        <td className="adm-kb-col-title">
          <input
            className="adm-input"
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="Название"
          />
          <input
            className="adm-input"
            style={{ marginTop: 4 }}
            value={draft.url}
            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            placeholder="https://…"
          />
        </td>
        <td className="adm-kb-col-type">
          <select
            className="adm-input adm-kb-select"
            value={draft.type}
            onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
          >
            <option value="">—</option>
            {typeOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </td>
        <td className="adm-kb-col-audience">
          <select
            className="adm-input adm-kb-select"
            value={draft.audienceAll ? '__all__' : (draft.direction || '')}
            onChange={e => {
              const v = e.target.value;
              if (v === '__all__') setDraft(d => ({ ...d, audienceAll: true, direction: '' }));
              else setDraft(d => ({ ...d, audienceAll: false, direction: v }));
            }}
          >
            <option value="__all__">Для всех направлений</option>
            {directions.map(dir => <option key={dir.id} value={dir.name}>{dir.name}</option>)}
          </select>
        </td>
        <td className="adm-kb-col-bind">
          <label className="adm-forum-check" style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={draft.isGeneral}
              onChange={e => setDraft(d => ({
                ...d,
                isGeneral: e.target.checked,
                eventId: e.target.checked ? '' : d.eventId,
              }))}
            />
            Общий
          </label>
          {!draft.isGeneral && (
            <select
              className="adm-input adm-kb-select"
              style={{ marginTop: 4 }}
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
              {eventsForDay.map(ev => (
                <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
              ))}
            </select>
          )}
        </td>
        <td className="adm-kb-col-status">
          <select
            className="adm-input adm-kb-select"
            value={draft.status}
            onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">Скрыт</option>
          </select>
        </td>
      </tr>

      <tr className={`${rowClass} adm-kb-actions-row`}>
        <td colSpan={8}>
          <div className="adm-kb-row-actions">
            <button
              type="button"
              className="adm-kb-btn adm-kb-btn-primary"
              disabled={!dirty}
              onClick={() => persist()}
              title="Сохранить текущие поля"
            >
              Сохранить
            </button>
            <button
              type="button"
              className="adm-kb-btn adm-kb-btn-secondary"
              onClick={() => persist('published')}
            >
              Опубликовать
            </button>
            <button
              type="button"
              className="adm-kb-btn adm-kb-btn-secondary"
              onClick={() => persist('draft')}
            >
              Черновик
            </button>
            <button
              type="button"
              className="adm-kb-btn adm-kb-btn-secondary"
              onClick={() => persist('archived')}
            >
              Скрыть
            </button>
            {onPreview && (
              <button
                type="button"
                className="adm-kb-btn adm-kb-btn-ghost"
                onClick={onPreview}
              >
                Превью
              </button>
            )}
            <button
              type="button"
              className="adm-kb-btn adm-kb-btn-danger"
              onClick={() => {
                if (!confirmDelete('Удалить материал?')) return;
                onDelete();
              }}
            >
              Удалить
            </button>
          </div>
        </td>
      </tr>

      {cardOpen && (
        <tr className="adm-kb-card-row">
          <td colSpan={8}>
            <div className="adm-kb-detail-card">
              <div className="adm-kb-detail-head">
                <div>
                  <strong>Карточка материала #{material.id}</strong>
                  <p className="adm-kb-panel-sub">Все параметры · спикеры · условия открытия</p>
                </div>
                <button
                  type="button"
                  className="adm-kb-btn adm-kb-btn-ghost"
                  onClick={() => {
                    setDraft(mkDraft(material));
                    setCardOpen(false);
                  }}
                >
                  Закрыть
                </button>
              </div>
              <div className="adm-forum-grid-2" style={{ marginTop: 10 }}>
                <label className="adm-field">
                  <span className="adm-label">Раздел</span>
                  <select
                    className="adm-input"
                    value={draft.kbSection}
                    onChange={e => setDraft(d => ({
                      ...d,
                      kbSection: e.target.value,
                      kbSubsection: e.target.value === 'open_lessons' ? d.kbSubsection : '',
                    }))}
                  >
                    <option value="">—</option>
                    {KB_SECTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </label>
                {draft.kbSection === 'open_lessons' && (
                  <label className="adm-field">
                    <span className="adm-label">Подраздел</span>
                    <select
                      className="adm-input"
                      value={draft.kbSubsection}
                      onChange={e => setDraft(d => ({ ...d, kbSubsection: e.target.value }))}
                    >
                      <option value="">—</option>
                      {subOptions.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="adm-field">
                  <span className="adm-label">Название</span>
                  <input
                    className="adm-input"
                    value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Ссылка</span>
                  <input
                    className="adm-input"
                    value={draft.url}
                    onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Файл (URL)</span>
                  <input
                    className="adm-input"
                    value={draft.fileUrl}
                    onChange={e => setDraft(d => ({ ...d, fileUrl: e.target.value }))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Тип</span>
                  <select
                    className="adm-input"
                    value={draft.type}
                    onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
                  >
                    <option value="">—</option>
                    {typeOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </select>
                </label>
                <label className="adm-field">
                  <span className="adm-label">День</span>
                  <select
                    className="adm-input"
                    value={draft.dayNumber}
                    onChange={e => setDraft(d => ({
                      ...d,
                      dayNumber: Number(e.target.value),
                      eventId: '',
                    }))}
                  >
                    {days.map(d => (
                      <option key={d} value={d}>День {d}</option>
                    ))}
                  </select>
                </label>
                <label className="adm-field">
                  <span className="adm-label">Статус</span>
                  <select
                    className="adm-input"
                    value={draft.status}
                    onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                  >
                    <option value="draft">Черновик</option>
                    <option value="published">Опубликован</option>
                    <option value="archived">Скрыт</option>
                  </select>
                </label>
                <label className="adm-field">
                  <span className="adm-label">Порядок</span>
                  <input
                    type="number"
                    className="adm-input"
                    value={draft.sortOrder === '' ? '' : draft.sortOrder}
                    onChange={e => setDraft(d => ({
                      ...d,
                      sortOrder: e.target.value === '' ? '' : Number(e.target.value),
                    }))}
                  />
                </label>
                <div className="adm-field">
                  <span className="adm-label">Спикеры</span>
                  <SpeakerMultiPick
                    speakers={speakers}
                    selectedIds={draft.speakerIds}
                    onChange={ids => setDraft(d => ({ ...d, speakerIds: ids }))}
                  />
                  {(draft.speakerIds.length > 0 || material.speakerName) && (
                    <p className="adm-muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
                      {speakerNamesFromCatalog(draft.speakerIds, speakers, material.speakerName)
                        || draft.speakerIds.map(id => speakers.find(s => s.id === id)).filter(Boolean).map(s => speakerFullLabel(s!)).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="adm-field">
                  <span className="adm-label">Аудитория</span>
                  <label className="adm-forum-check" style={{ display: 'block', marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={draft.audienceAll}
                      onChange={e => setDraft(d => ({
                        ...d,
                        audienceAll: e.target.checked,
                        direction: e.target.checked ? '' : d.direction,
                      }))}
                    />
                    Для всех направлений
                  </label>
                  <select
                    className="adm-input"
                    value={draft.direction}
                    disabled={draft.audienceAll}
                    onChange={e => setDraft(d => ({ ...d, direction: e.target.value, audienceAll: false }))}
                  >
                    <option value="">— направление —</option>
                    {directions.map(dir => <option key={dir.id} value={dir.name}>{dir.name}</option>)}
                  </select>
                </div>
                <div className="adm-field">
                  <span className="adm-label">Привязка к программе</span>
                  <label className="adm-forum-check" style={{ display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={draft.isGeneral}
                      onChange={e => setDraft(d => ({
                        ...d,
                        isGeneral: e.target.checked,
                        eventId: e.target.checked ? '' : d.eventId,
                      }))}
                    />
                    Общий материал
                  </label>
                  {!draft.isGeneral && (
                    <select
                      className="adm-input"
                      style={{ marginTop: 6 }}
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
                      {eventsForDay.map(ev => (
                        <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="adm-field">
                  <span className="adm-label">Условие открытия</span>
                  <label className="adm-forum-check" style={{ display: 'block' }}>
                    <input
                      type="radio"
                      checked={draft.kbUnlockMode === 'immediate'}
                      onChange={() => setDraft(d => ({
                        ...d,
                        kbUnlockMode: 'immediate',
                        kbUnlockMinTouchpoints: '',
                      }))}
                    />
                    Открыт сразу
                  </label>
                  <label className="adm-forum-check" style={{ display: 'block' }}>
                    <input
                      type="radio"
                      checked={draft.kbUnlockMode === 'touchpoints'}
                      onChange={() => setDraft(d => ({
                        ...d,
                        kbUnlockMode: 'touchpoints',
                        kbUnlockMinTouchpoints: d.kbUnlockMinTouchpoints === '' ? 4 : d.kbUnlockMinTouchpoints,
                      }))}
                    />
                    После ≥ N точек осмысления
                  </label>
                  {draft.kbUnlockMode === 'touchpoints' && (
                    <input
                      type="number"
                      min={1}
                      max={7}
                      className="adm-input"
                      style={{ width: 72, marginTop: 6 }}
                      value={draft.kbUnlockMinTouchpoints === '' ? '' : draft.kbUnlockMinTouchpoints}
                      onChange={e => setDraft(d => ({
                        ...d,
                        kbUnlockMinTouchpoints: e.target.value === '' ? '' : Number(e.target.value),
                      }))}
                    />
                  )}
                </div>
              </div>
              <div className="adm-kb-actions adm-kb-actions-detail">
                <button type="button" className="adm-kb-btn adm-kb-btn-primary" onClick={() => persist()}>
                  Сохранить
                </button>
                <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => persist('published')}>
                  Опубликовать
                </button>
                <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => persist('draft')}>
                  Черновик
                </button>
                <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => persist('archived')}>
                  Скрыть
                </button>
                <button
                  type="button"
                  className="adm-kb-btn adm-kb-btn-danger"
                  onClick={() => {
                    if (!confirmDelete('Удалить материал?')) return;
                    onDelete();
                  }}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="adm-kb-btn adm-kb-btn-ghost"
                  onClick={() => {
                    setDraft(mkDraft(material));
                    setCardOpen(false);
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
