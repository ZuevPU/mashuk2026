type DirectionOpt = { id: number; name: string };

type Props = {
  directions: DirectionOpt[];
  /** Empty = all directions / everyone. */
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

/**
 * Multi-select directions for one program slot.
 * Empty selectedIds = «все направления».
 * Non-empty = only those directions see the block.
 */
export function DirectionAudiencePick({ directions, selectedIds, onChange }: Props) {
  const allMode = selectedIds.length === 0;
  const selectedSet = new Set(selectedIds);

  const setAll = () => onChange([]);

  const selectExplicitAll = () => onChange(directions.map(d => d.id));

  const toggleOne = (id: number) => {
    if (allMode) {
      // Leaving «all»: keep every direction except the unchecked one
      onChange(directions.map(d => d.id).filter(x => x !== id));
      return;
    }
    if (selectedSet.has(id)) {
      const next = selectedIds.filter(x => x !== id);
      // Nothing left → back to «all» so the block is not accidentally hidden from everyone
      onChange(next.length ? next : []);
      return;
    }
    const next = [...selectedIds, id];
    // If every known direction is selected → store as «all»
    if (directions.length > 0 && directions.every(d => next.includes(d.id))) {
      onChange([]);
      return;
    }
    onChange(next);
  };

  const isChecked = (id: number) => allMode || selectedSet.has(id);

  return (
    <div className="adm-field">
      <span className="adm-label">Аудитория · направления</span>
      <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px', lineHeight: 1.4 }}>
        Можно отметить сразу несколько. Участник увидит этот слот, только если его направление из регистрации входит в список.
        Если отмечены все — блок видят все направления.
      </p>

      <div className="adm-forum-toolbar" style={{ marginBottom: 8, gap: 6 }}>
        <button type="button" className={`adm-btn adm-btn-sm ${allMode ? 'adm-btn-primary' : 'adm-btn-secondary'}`} onClick={setAll}>
          Все направления
        </button>
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={selectExplicitAll} disabled={!directions.length}>
          Отметить все в списке
        </button>
      </div>

      {!directions.length ? (
        <p className="adm-muted" style={{ fontSize: 12 }}>Справочник пуст — добавьте направления во вкладке «Направления».</p>
      ) : (
        <div
          className="adm-direction-audience-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 10px',
            border: '1px solid var(--m-border, #E8E4DC)',
            borderRadius: 10,
            background: '#fff',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {directions.map(d => (
            <label key={d.id} className="adm-forum-check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={isChecked(d.id)}
                onChange={() => toggleOne(d.id)}
              />
              {d.name}
            </label>
          ))}
        </div>
      )}

      <p className="adm-muted" style={{ fontSize: 11, marginTop: 6 }}>
        {allMode
          ? 'Сейчас: все направления'
          : `Сейчас: ${selectedIds.length} направл. — ${directions
            .filter(d => selectedSet.has(d.id))
            .map(d => d.name)
            .join(', ')}`}
      </p>
    </div>
  );
}
