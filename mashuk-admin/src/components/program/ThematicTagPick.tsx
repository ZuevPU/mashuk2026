import { useMemo } from 'react';
import { SearchMultiPick } from '../admin/SearchMultiPick';
import type { ThematicTag } from './types';

type Props = {
  tags: ThematicTag[];
  selectedNames: string[];
  onChange: (names: string[]) => void;
};

export function ThematicTagPick({ tags, selectedNames, onChange }: Props) {
  const items = useMemo(
    () => tags.map(t => ({ id: t.id, label: t.name })),
    [tags],
  );

  const nameToId = useMemo(() => new Map(tags.map(t => [t.name, t.id])), [tags]);
  const selectedIds = selectedNames.map(n => nameToId.get(n)).filter((id): id is number => id != null);

  return (
    <SearchMultiPick
      items={items}
      selectedIds={selectedIds}
      onChange={ids => {
        const names = ids.map(id => tags.find(t => t.id === id)?.name).filter(Boolean) as string[];
        onChange(names);
      }}
      placeholder="Выберите или найдите интерес…"
      emptyHint="Начните ввод названия интереса"
      minQueryLength={0}
    />
  );
}
