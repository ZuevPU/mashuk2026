import { SearchMultiPick } from '../admin/SearchMultiPick';

type DirectionOpt = { id: number; name: string };

type Props = {
  directions: DirectionOpt[];
  /** Empty = all directions / everyone. */
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

/** Multi-select directions for a program block. Empty selection = все направления. */
export function DirectionAudiencePick({ directions, selectedIds, onChange }: Props) {
  const allMode = selectedIds.length === 0;
  const items = directions.map(d => ({ id: d.id, label: d.name }));

  return (
    <div className="adm-field">
      <span className="adm-label">Направления</span>
      <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
        По умолчанию — все. Можно оставить несколько: участник увидит блок только если выбрал одно из них при регистрации.
      </p>
      <label className="adm-forum-check" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={allMode}
          onChange={e => {
            if (e.target.checked) onChange([]);
            else onChange(directions.map(d => d.id));
          }}
        />
        Все направления
      </label>
      {!allMode && (
        <>
          <div className="adm-forum-toolbar" style={{ marginBottom: 6 }}>
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              onClick={() => onChange(directions.map(d => d.id))}
            >
              Выбрать все
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              onClick={() => onChange([])}
            >
              Сбросить → все
            </button>
          </div>
          <SearchMultiPick
            items={items}
            selectedIds={selectedIds}
            onChange={onChange}
            placeholder="Добавить направление…"
            emptyHint="Справочник направлений пуст — заполните вкладку «Направления»"
          />
        </>
      )}
    </div>
  );
}
