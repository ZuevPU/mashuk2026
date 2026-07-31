import type { ProgramPlace } from './types';

type Props = {
  places: ProgramPlace[];
  newPlaceName: string;
  onNewPlaceNameChange: (v: string) => void;
  editingPlace: { id: number; name: string } | null;
  onEditingPlaceChange: (v: { id: number; name: string } | null) => void;
  onAdd: () => void;
  onSaveEdit: () => void;
  onDelete: (id: number) => void;
  embedded?: boolean;
};

export function ProgramPlacesBlock({
  places,
  newPlaceName,
  onNewPlaceNameChange,
  editingPlace,
  onEditingPlaceChange,
  onAdd,
  onSaveEdit,
  onDelete,
  embedded = false,
}: Props) {
  const inner = (
    <>
      {!embedded && <h3>Места проведения</h3>}
      {!embedded && (
        <p className="adm-forum-hint">Справочник площадок. В событии можно выбрать из списка или ввести место вручную.</p>
      )}
      {places.length === 0 && <p className="adm-muted">Справочник пуст — в карточке события всё равно можно вписать место вручную.</p>}
      <div className="adm-forum-toolbar">
        <input
          className="adm-input"
          value={newPlaceName}
          onChange={e => onNewPlaceNameChange(e.target.value)}
          placeholder="Новое место"
          style={{ maxWidth: 220 }}
        />
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onAdd}>
          Добавить
        </button>
      </div>
      <div className="adm-program-tag-pick" style={{ marginTop: 10 }}>
        {places.map(p => (
          <span key={p.id} className="tag-chip adm-program-tag-chip">
            {editingPlace?.id === p.id ? (
              <>
                <input
                  className="adm-input adm-input-narrow"
                  value={editingPlace.name}
                  onChange={e => onEditingPlaceChange({ id: p.id, name: e.target.value })}
                />
                <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={onSaveEdit}>OK</button>
                <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => onEditingPlaceChange(null)}>×</button>
              </>
            ) : (
              <>
                <span className="adm-program-tag-name">{p.name}</span>
                <button
                  type="button"
                  className="adm-tag-icon-btn"
                  title="Изменить"
                  aria-label="Изменить"
                  onClick={() => onEditingPlaceChange({ id: p.id, name: p.name })}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="adm-tag-icon-btn adm-tag-icon-btn-delete"
                  title="Удалить"
                  aria-label="Удалить"
                  onClick={() => onDelete(p.id)}
                >
                  ×
                </button>
              </>
            )}
          </span>
        ))}
      </div>
    </>
  );
  return embedded ? inner : <div className="card adm-forum-block">{inner}</div>;
}

export function PlaceSelect({
  places,
  value,
  onChange,
  legacyPlace,
}: {
  places: ProgramPlace[];
  value: string;
  onChange: (name: string) => void;
  legacyPlace?: string | null;
}) {
  const legacy = legacyPlace?.trim() || '';
  const legacyOrphan = !!legacy && !places.some(p => p.name === legacy);
  const valueInCatalog = places.some(p => p.name === value) || (legacyOrphan && value === legacy);

  return (
    <div className="adm-place-select" onClick={e => e.stopPropagation()}>
      <select
        className="adm-input"
        value={valueInCatalog ? value : ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{value.trim() && !valueInCatalog ? `— вручную: ${value} —` : '— из справочника —'}</option>
        {legacyOrphan && <option value={legacy}>{legacy} (не в справочнике)</option>}
        {places.map(p => (
          <option key={p.id} value={p.name}>{p.name}</option>
        ))}
      </select>
      <input
        className="adm-input"
        style={{ marginTop: 6 }}
        value={value}
        placeholder="Место: выберите выше или введите вручную"
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
