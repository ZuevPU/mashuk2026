import { useMemo, useState } from 'react';
import { Button, Div, Spinner } from '@vkontakte/vkui';
import { apiPatch } from '../../api/client';

export type InterestGroup = { title: string; tags: string[] };

type Props = {
  current: string[];
  groups: InterestGroup[];
  interestMin: number;
  interestMax: number;
  onSaved: (interests: string[]) => void;
};

export function InterestsReselectGate({
  current,
  groups,
  interestMin,
  interestMax,
  onSaved,
}: Props) {
  const allowed = useMemo(() => new Set(groups.flatMap(g => g.tags)), [groups]);
  const [picked, setPicked] = useState<string[]>(() => {
    const catalog = new Set(groups.flatMap(g => g.tags));
    return current.filter(tag => catalog.has(tag));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = picked.length >= interestMin && picked.length <= interestMax;

  const toggle = (tag: string) => {
    setPicked(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= interestMax) return prev;
      return [...prev, tag];
    });
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch('/profile/interests', { interests: picked });
      onSaved(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить интересы');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="mashuk-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#F6F4EF',
        overflowY: 'auto',
        padding: '20px 0 32px',
      }}
    >
      <Div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
          Выбери интересы ещё раз
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555', lineHeight: 1.45 }}>
          Ты уже в программе. Сохрани интересы в этом окне — по ним подберём события и материалы.
          Первый заход с регистрацией здесь не нужен.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
          Выбери {interestMin === interestMax ? interestMin : `${interestMin}–${interestMax}`} интерес(ов).
        </p>
      </Div>
      {groups.map(group => (
        <Div key={group.title}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{group.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {group.tags.map(tag => {
              const on = picked.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`m-itag ${on ? 'on' : ''}`}
                  style={{
                    border: on ? '1.5px solid #FF5500' : '1px solid #ddd',
                    background: on ? '#FFF3E0' : '#fff',
                    color: on ? '#B8621A' : '#333',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </Div>
      ))}
      <Div style={{ fontSize: 12, color: canSave ? '#2F855A' : '#C53030' }}>
        {canSave
          ? `✓ Выбрано ${picked.length}${interestMax > interestMin ? ` (макс. ${interestMax})` : ''}`
          : `Выбрано ${picked.length} — нужно минимум ${interestMin}`}
      </Div>
      {error && (
        <Div style={{ fontSize: 13, color: '#C53030' }}>{error}</Div>
      )}
      <Div>
        <Button size="l" stretched disabled={!canSave || saving} onClick={() => void save()}>
          {saving ? <Spinner size="s" /> : 'Сохранить интересы'}
        </Button>
      </Div>
    </div>
  );
}
