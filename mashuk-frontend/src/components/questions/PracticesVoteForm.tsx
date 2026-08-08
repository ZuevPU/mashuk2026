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
          {sorted.map(p => (
            <div
              key={p.id}
              style={{
                marginBottom: 10,
                padding: 12,
                borderRadius: 12,
                border: '1px solid #E0DAD0',
                background: '#fff',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
              {(p.participantName || p.direction) && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {[p.participantName, p.direction].filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ fontSize: 13, marginTop: 8 }}>
                {p.resultPlace ? <>Место: <strong>{p.resultPlace}</strong></> : null}
                {p.resultPlace && p.resultTime ? ' · ' : null}
                {p.resultTime ? <>Время: <strong>{p.resultTime}</strong></> : null}
                {!p.resultPlace && !p.resultTime ? <span style={{ color: '#888' }}>Место и время уточняются</span> : null}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            Осталось лайков: {remaining} из {quota}
          </div>
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
