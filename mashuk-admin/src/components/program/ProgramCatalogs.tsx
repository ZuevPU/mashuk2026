import { useMemo, useState } from 'react';
import type { ProgramBlockType, ProgramSpeaker } from './types';
import { speakerFullLabel, speakerSearchHaystack, speakerShortLabel } from '../speakers/speakerFormat';

type ChipProps = {
  title: string;
  hint: string;
  items: { id: number; label: string }[];
  newName: string;
  onNewNameChange: (v: string) => void;
  onAdd: () => void;
  editing: { id: number; name: string } | null;
  onEditingChange: (v: { id: number; name: string } | null) => void;
  onSaveEdit: () => void;
  onDelete: (id: number) => void;
};

function CatalogChipBlock(p: ChipProps) {
  return (
    <div className="card adm-forum-block">
      <h3>{p.title}</h3>
      <p className="adm-forum-hint">{p.hint}</p>
      <div className="adm-forum-toolbar">
        <input className="adm-input" value={p.newName} onChange={e => p.onNewNameChange(e.target.value)} placeholder="Название" style={{ maxWidth: 220 }} />
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={p.onAdd}>Добавить</button>
      </div>
      <div className="adm-program-tag-pick" style={{ marginTop: 10 }}>
        {p.items.map(it => (
          <span key={it.id} className="tag-chip adm-program-tag-chip">
            {p.editing?.id === it.id ? (
              <>
                <input className="adm-input adm-input-narrow" value={p.editing.name} onChange={e => p.onEditingChange({ id: it.id, name: e.target.value })} />
                <button type="button" className="adm-btn adm-btn-sm" onClick={p.onSaveEdit}>OK</button>
                <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => p.onEditingChange(null)}>×</button>
              </>
            ) : (
              <>
                <span>{it.label}</span>
                <button type="button" className="adm-tag-icon-btn" onClick={() => p.onEditingChange({ id: it.id, name: it.label })}>✎</button>
                <button type="button" className="adm-tag-icon-btn adm-tag-icon-btn-delete" onClick={() => p.onDelete(it.id)}>×</button>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProgramBlockTypesBlock({
  blockTypes,
  newName,
  onNewNameChange,
  editing,
  onEditingChange,
  onAdd,
  onSaveEdit,
  onDelete,
}: {
  blockTypes: ProgramBlockType[];
  newName: string;
  onNewNameChange: (v: string) => void;
  editing: { id: number; name: string } | null;
  onEditingChange: (v: { id: number; name: string } | null) => void;
  onAdd: () => void;
  onSaveEdit: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <CatalogChipBlock
      title="Типы блоков"
      hint="Справочник типов событий программы."
      items={blockTypes.map(b => ({ id: b.id, label: b.name }))}
      newName={newName}
      onNewNameChange={onNewNameChange}
      onAdd={onAdd}
      editing={editing}
      onEditingChange={onEditingChange}
      onSaveEdit={onSaveEdit}
      onDelete={onDelete}
    />
  );
}

export function SpeakerMultiPick({
  speakers,
  selectedIds,
  onChange,
}: {
  speakers: ProgramSpeaker[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return speakers;
    return speakers.filter(s => speakerSearchHaystack(s).includes(needle));
  }, [speakers, q]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  if (speakers.length === 0) {
    return (
      <span className="adm-muted">
        Справочник пуст. Добавьте спикеров во вкладке «Спикеры».
      </span>
    );
  }

  const selected = speakers.filter(s => selectedIds.includes(s.id));

  return (
    <div className="adm-speaker-pick">
      {selected.length > 0 && (
        <div className="adm-speaker-pick-selected">
          {selected.map(s => (
            <span key={s.id} className="adm-speaker-pick-chip" title={speakerFullLabel(s)}>
              {speakerShortLabel(s)}
              <button type="button" className="adm-speaker-pick-chip-x" aria-label="Убрать" onClick={() => toggle(s.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="adm-input adm-input-sm"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={`Поиск среди ${speakers.length} спикеров…`}
      />
      <div className="adm-speaker-pick-list" role="listbox" aria-multiselectable>
        {filtered.map(s => {
          const on = selectedIds.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={on}
              className={`adm-speaker-pick-row ${on ? 'on' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <span className="adm-speaker-pick-check">{on ? '✓' : ''}</span>
              <span className="adm-speaker-pick-main">
                <span className="adm-speaker-pick-name">{s.name}</span>
                {s.credentials?.trim() && (
                  <span className="adm-speaker-pick-cred">{s.credentials.trim()}</span>
                )}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="adm-muted adm-speaker-pick-empty">Никого не найдено</div>}
      </div>
    </div>
  );
}
