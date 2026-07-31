import type { LeaderboardFiltersState, LeaderboardMode, LeaderboardScope, LeaderboardSort, LeaderboardTrack, MedalMode } from './leaderboardTypes';
import { NOMINATION_OPTIONS } from './leaderboardTypes';

type MedalOption = { id: number; name: string };

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="lb-segment">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          className={`lb-segment-btn ${value === o.key ? 'on' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LeaderboardFilters({
  filters,
  onChange,
  directions,
  medals,
  forumDay,
  compact,
}: {
  filters: LeaderboardFiltersState;
  onChange: (patch: Partial<LeaderboardFiltersState>) => void;
  directions: string[];
  medals: MedalOption[];
  forumDay?: string;
  compact?: boolean;
}) {
  const set = (patch: Partial<LeaderboardFiltersState>) => onChange(patch);

  return (
    <div className={`lb-filters ${compact ? 'lb-filters-compact' : ''}`}>
      {!compact && (
        <Segment<LeaderboardMode>
          value={filters.mode}
          onChange={mode => set({ mode })}
          options={[
            { key: 'points', label: 'Баллы' },
            { key: 'medals', label: 'Медали' },
            { key: 'nomination', label: 'Номинации' },
          ]}
        />
      )}

      <Segment<LeaderboardScope>
        value={filters.scope}
        onChange={scope => set({ scope })}
        options={[
          { key: 'shift', label: 'Смена' },
          { key: 'day', label: 'День' },
          { key: 'total', label: 'Общий' },
        ]}
      />

      {filters.scope === 'day' && (
        <select
          className="adm-input lb-select"
          value={filters.day}
          onChange={e => set({ day: e.target.value })}
        >
          {[1, 2, 3, 4, 5, 6, 7].map(d => (
            <option key={d} value={String(d)}>День {d}{forumDay === String(d) ? ' (сегодня)' : ''}</option>
          ))}
        </select>
      )}

      {filters.mode === 'points' && (
        <Segment<LeaderboardTrack>
          value={filters.track}
          onChange={track => set({ track })}
          options={[
            { key: 'total', label: 'Общий' },
            { key: 'path', label: 'Путь' },
            { key: 'experience', label: 'Опыт' },
          ]}
        />
      )}

      {filters.mode === 'nomination' && (
        <select
          className="adm-input lb-select"
          value={filters.nomination}
          onChange={e => set({ nomination: e.target.value })}
        >
          {NOMINATION_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      )}

      {filters.mode === 'medals' && (
        <>
          <Segment<MedalMode>
            value={filters.medalMode}
            onChange={medalMode => set({ medalMode })}
            options={[
              { key: 'count', label: 'По количеству' },
              { key: 'holders', label: 'По медали' },
            ]}
          />
          {filters.medalMode === 'holders' && (
            <select
              className="adm-input lb-select"
              value={filters.medalId}
              onChange={e => set({ medalId: e.target.value })}
            >
              <option value="">Выберите медаль</option>
              {medals.map(m => (
                <option key={m.id} value={String(m.id)}>{m.name}</option>
              ))}
            </select>
          )}
        </>
      )}

      <select
        className="adm-input lb-select"
        value={filters.direction}
        onChange={e => set({ direction: e.target.value })}
      >
        <option value="">Все направления</option>
        {directions.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <Segment<LeaderboardSort>
        value={filters.sort}
        onChange={sort => set({ sort })}
        options={[
          { key: 'score', label: 'По баллам' },
          { key: 'name', label: 'По ФИО' },
        ]}
      />
    </div>
  );
}
