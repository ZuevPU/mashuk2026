import { useMemo, useState } from 'react';
import { Button, Div } from '@vkontakte/vkui';

export type PracticeCard = {
  id: string;
  title: string;
  description: string;
  participantName: string;
  direction: string;
  resultPlace?: string | null;
  resultTime?: string | null;
};

export type PracticesVoteConfig = {
  preamble: string;
  likesPerParticipant: number;
  resultsPublished: boolean;
  practices: PracticeCard[];
};

type Props = {
  config: PracticesVoteConfig;
  initialLikedIds?: string[];
  onSubmit: (answerData: { likedPracticeIds: string[] }) => Promise<void>;
};

export function PracticesVoteForm({ config, initialLikedIds = [], onSubmit }: Props) {
  const [liked, setLiked] = useState<string[]>(() => [...new Set(initialLikedIds)]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const quota = Math.max(1, config.likesPerParticipant || 1);
  const remaining = Math.max(0, quota - liked.length);

  const sorted = useMemo(() => config.practices, [config.practices]);

  const toggleLike = (id: string) => {
    if (config.resultsPublished) return;
    setLiked(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= quota) return prev;
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSubmit({ likedPracticeIds: liked });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Div>
      {config.preamble && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: '#F5F0E8',
            fontSize: 13,
            lineHeight: 1.45,
            color: '#1A1714',
          }}
        >
          {config.preamble}
        </div>
      )}

      {config.resultsPublished ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Результаты голосования</div>
          {sorted.length === 0 ? (
            <div style={{ fontSize: 13, color: '#888' }}>Практики пока не опубликованы</div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #E0DAD0', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F5F0E8', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Практика</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Участник</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Место</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Время</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #EDE7DC' }}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700 }}>{p.title}</div>
                        {p.direction ? <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{p.direction}</div> : null}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#444' }}>
                        {p.participantName || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        {p.resultPlace || <span style={{ color: '#888' }}>уточняется</span>}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        {p.resultTime || <span style={{ color: '#888' }}>уточняется</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            Осталось лайков: {remaining} из {quota}
          </div>
          {sorted.length === 0 && (
            <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              Список практик пока пуст. Администратор ещё не добавил строки для голосования.
            </div>
          )}
          {sorted.map(p => {
            const isOpen = !!expanded[p.id];
            const isLiked = liked.includes(p.id);
            return (
              <div
                key={p.id}
                style={{
                  marginBottom: 10,
                  borderRadius: 12,
                  border: isLiked ? '2px solid #FF5500' : '1px solid #E0DAD0',
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 12px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                    {(p.participantName || p.direction) && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        {[p.participantName, p.direction].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span style={{ color: '#888', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 12px 12px' }}>
                    {p.description && (
                      <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                        {p.description}
                      </div>
                    )}
                    <Button
                      size="m"
                      mode={isLiked ? 'primary' : 'secondary'}
                      disabled={!isLiked && remaining <= 0}
                      onClick={() => toggleLike(p.id)}
                    >
                      {isLiked ? '♥ Лайк снять' : '♡ Лайк'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <Button size="l" stretched loading={saving} onClick={handleSave} style={{ marginTop: 8 }}>
            Сохранить голос
          </Button>
        </>
      )}
    </Div>
  );
}
