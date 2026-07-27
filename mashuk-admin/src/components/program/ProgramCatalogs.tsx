import type { ProgramBlockType, ProgramSpeaker } from './types';

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

export function ProgramSpeakersBlock({
  speakers,
  newName,
  onNewNameChange,
  editing,
  onEditingChange,
  onAdd,
  onSaveEdit,
  onDelete,
}: {
  speakers: ProgramSpeaker[];
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
      title="Спикеры"
      hint="Выбирайте спикеров при создании события и под-тем."
      items={speakers.map(s => ({ id: s.id, label: s.name }))}
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
  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };
  if (speakers.length === 0) return <span className="adm-muted">Добавьте спикеров в справочник</span>;
  return (
    <div className="adm-program-tag-pick">
      {speakers.map(s => (
        <label key={s.id} className={`adm-chip-btn ${selectedIds.includes(s.id) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggle(s.id)} style={{ display: 'none' }} />
          {s.name}
        </label>
      ))}
    </div>
  );
}
