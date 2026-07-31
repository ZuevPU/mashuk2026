import { useMemo } from 'react';
import { SearchMultiPick } from '../admin/SearchMultiPick';
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
  embedded?: boolean;
};

function CatalogChipBlock(p: ChipProps) {
  const inner = (
    <>
      {!p.embedded && <h3>{p.title}</h3>}
      {!p.embedded && <p className="adm-forum-hint">{p.hint}</p>}
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
    </>
  );
  return p.embedded ? inner : <div className="card adm-forum-block">{inner}</div>;
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
  embedded = false,
}: {
  blockTypes: ProgramBlockType[];
  newName: string;
  onNewNameChange: (v: string) => void;
  editing: { id: number; name: string } | null;
  onEditingChange: (v: { id: number; name: string } | null) => void;
  onAdd: () => void;
  onSaveEdit: () => void;
  onDelete: (id: number) => void;
  embedded?: boolean;
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
      embedded={embedded}
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
  const items = useMemo(
    () => speakers.map(s => ({
      id: s.id,
      label: speakerShortLabel(s),
      sublabel: s.credentials?.trim() || speakerFullLabel(s),
    })),
    [speakers],
  );

  if (speakers.length === 0) {
    return (
      <span className="adm-muted">
        Справочник пуст. Добавьте спикеров во вкладке «Спикеры».
      </span>
    );
  }

  return (
    <SearchMultiPick
      items={items}
      selectedIds={selectedIds}
      onChange={onChange}
      placeholder="Выберите или найдите спикера…"
      emptyHint="Начните ввод ФИО"
      minQueryLength={0}
      filterItem={(item, needle) => {
        const sp = speakers.find(s => s.id === item.id);
        return sp ? speakerSearchHaystack(sp).includes(needle) : item.label.toLowerCase().includes(needle);
      }}
    />
  );
}
