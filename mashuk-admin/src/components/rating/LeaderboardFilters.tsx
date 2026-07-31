import type { LeaderboardMode, LeaderboardFiltersState, LeaderboardScope, LeaderboardSort, LeaderboardTrack, MedalFilter } from './leaderboardTypes';
import { FORUM_RATING_DAYS, NOMINATION_OPTIONS, scopeLabel, trackLabel } from './leaderboardTypes';

type MedalOption = { id: number; name: string };
type GroupOption = { id: number; name: string };

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
  groups,
  medals,
  forumDay,
  compact,
}: {
  filters: LeaderboardFiltersState;
  onChange: (patch: Partial<LeaderboardFiltersState>) => void;
  directions: string[];
  groups: GroupOption[];
  medals: MedalOption[];
  forumDay?: string;
  compact?: boolean;
}) {
  const set = (patch: Partial<LeaderboardFiltersState>) => onChange(patch);
  const clampedForumDay = forumDay && Number(forumDay) <= 6 ? forumDay : undefined;

  return (
    <div className={`lb-filters ${compact ? 'lb-filters-compact' : ''}`}>
      {!compact && (
        <Segment<LeaderboardMode>
          value={filters.mode}
          onChange={mode => set({ mode })}
          options={[
            { key: 'points', label: 'Баллы' },
            { key: 'nomination', label: 'Номинации' },
          ]}
        />
      )}

      <Segment<LeaderboardScope>
        value={filters.scope}
        onChange={scope => set({ scope })}
        options={[
          { key: 'shift', label: scopeLabel('shift') },
          { key: 'day', label: scopeLabel('day') },
          { key: 'total', label: scopeLabel('total') },
        ]}
      />

      {filters.scope === 'day' && (
        <select
          className="adm-input lb-select"
          value={filters.day}
          onChange={e => set({ day: e.target.value })}
        >
          {FORUM_RATING_DAYS.map(d => (
            <option key={d} value={String(d)}>
              День {d}{clampedForumDay === String(d) ? ' (сегодня)' : ''}
            </option>
          ))}
        </select>
      )}

      {filters.mode === 'points' && (
        <Segment<LeaderboardTrack>
          value={filters.track}
          onChange={track => set({ track })}
          options={[
            { key: 'total', label: trackLabel('total') },
            { key: 'path', label: trackLabel('path') },
            { key: 'experience', label: trackLabel('experience') },
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

      {filters.mode === 'points' && (
        <>
          <select
            className="adm-input lb-select"
            value={filters.medalFilter}
            onChange={e => set({ medalFilter: e.target.value as MedalFilter, medalId: '' })}
            aria-label="Фильтр по медалям"
          >
            <option value="">Все участники</option>
            <option value="count">Сортировка по медалям</option>
            <option value="holders">Только с медалью</option>
          </select>
          {filters.medalFilter === 'holders' && (
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

      <select
        className="adm-input lb-select"
        value={filters.groupId}
        onChange={e => set({ groupId: e.target.value })}
      >
        <option value="">Все группы / потоки</option>
        {groups.map(g => (
          <option key={g.id} value={String(g.id)}>{g.name}</option>
        ))}
      </select>

      <input
        className="adm-input lb-select"
        type="search"
        placeholder="Поиск по ФИО или ID"
        value={filters.search}
        onChange={e => set({ search: e.target.value })}
        aria-label="Поиск участника"
      />

      <Segment<LeaderboardSort>
        value={filters.sort}
        onChange={sort => set({ sort })}
        options={[
          { key: 'score', label: 'По баллам' },
          { key: 'name', label: 'По ФИО' },
        ]}
      />

      <label className="lb-show-all" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={filters.showAll}
          onChange={e => set({ showAll: e.target.checked })}
        />
        Показать всех
      </label>
    </div>
  );
}
