import { useEffect, useState } from 'react';

export type MaterialRow = {
  id: number;
  title: string;
  url?: string | null;
  tags?: string[];
  dayNumber?: number;
  eventId?: number | null;
  direction?: string | null;
  isGeneral?: boolean;
  includeInAnalytics?: boolean;
  createdAt?: string;
};

type Draft = {
  title: string;
  url: string;
  tags: string[];
  includeInAnalytics: boolean;
};

type Props = {
  material: MaterialRow;
  onSave: (body: { title: string; url: string; tags: string[]; includeInAnalytics: boolean }) => void;
  onDelete: () => void;
};

export function MaterialCard({ material, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    title: material.title || '',
    url: material.url || '',
    tags: [...((material.tags as string[]) || [])],
    includeInAnalytics: material.includeInAnalytics !== false,
  }));
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    setDraft({
      title: material.title || '',
      url: material.url || '',
      tags: [...((material.tags as string[]) || [])],
      includeInAnalytics: material.includeInAnalytics !== false,
    });
  }, [material]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || draft.tags.includes(t)) return;
    setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== tag) }));

  return (
    <div className="card adm-kb-material" style={{ fontSize: 12 }}>
      <strong>{material.title}</strong> · Д{material.dayNumber}
      {material.eventId ? ` · event#${material.eventId}` : ''}
      {material.direction ? ` · ${material.direction}` : ''}
      {material.isGeneral ? ' · общий' : ''}
      {material.createdAt ? ` · ${new Date(material.createdAt).toLocaleString('ru-RU')}` : ''}
      {material.includeInAnalytics === false ? ' · вне аналитики' : ''}
      <div className="form-row" style={{ marginTop: 4 }}>
        <input
          className="adm-input"
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder="Название"
        />
        <input
          className="adm-input"
          value={draft.url}
          onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
          placeholder="Ссылка"
          style={{ flex: 1 }}
        />
        <label className="adm-forum-check">
          <input
            type="checkbox"
            checked={draft.includeInAnalytics}
            onChange={e => setDraft(d => ({ ...d, includeInAnalytics: e.target.checked }))}
          />
          аналитика
        </label>
        <button type="button" className="adm-btn" onClick={() => onSave(draft)}>Сохранить</button>
        <button type="button" className="adm-btn btn-danger" onClick={onDelete}>×</button>
      </div>
      <div className="form-row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
        {draft.tags.map(tag => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              style={{ marginLeft: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#C53030' }}
              onClick={() => removeTag(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="adm-input"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Новый тег"
          style={{ width: 120 }}
        />
        <button type="button" className="adm-btn adm-btn-secondary" onClick={addTag}>+ тег</button>
      </div>
    </div>
  );
}
