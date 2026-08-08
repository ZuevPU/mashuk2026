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

  if (config.resultsPublished) {
    return (
      <Div>
        {config.preamble && (
          <div className="m-practices-vote__preamble">{config.preamble}</div>
        )}
        <div className="m-practices-vote__quota">Результаты голосования</div>
        {sorted.length === 0 ? (
          <div className="m-practices-vote__empty">Практики пока не опубликованы</div>
        ) : (
          <div className="m-practices-results">
            {sorted.map(p => (
              <div key={p.id} className="m-practices-results__row">
                <div className="m-practices-results__title">{p.title}</div>
                <div className="m-practices-results__meta">
                  {[p.participantName, p.direction].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="m-practices-results__place">
                  <span>{p.resultPlace || 'место уточняется'}</span>
                  <span>{p.resultTime || 'время уточняется'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Div>
    );
  }

  return (
    <Div>
      {config.preamble && (
        <div className="m-practices-vote__preamble">{config.preamble}</div>
      )}

      <div className="m-practices-vote__quota" aria-live="polite">
        <span className="m-practices-vote__quota-label">Осталось лайков</span>
        <span className="m-practices-vote__quota-val">{remaining}<span> / {quota}</span></span>
      </div>

      {sorted.length === 0 && (
        <div className="m-practices-vote__empty">
          Список практик пока пуст. Администратор ещё не добавил строки для голосования.
        </div>
      )}

      <div className="m-practices-vote__list">
        {sorted.map(p => {
          const isLiked = liked.includes(p.id);
          const isOpen = !!expanded[p.id];
          const hasDescription = !!p.description?.trim();
          const likeDisabled = !isLiked && remaining <= 0;

          return (
            <div
              key={p.id}
              className={`m-practices-vote__card${isLiked ? ' is-liked' : ''}`}
            >
              <div className="m-practices-vote__row">
                <button
                  type="button"
                  className="m-practices-vote__body"
                  onClick={() => {
                    if (!hasDescription) return;
                    setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }));
                  }}
                  aria-expanded={hasDescription ? isOpen : undefined}
                >
                  <div className="m-practices-vote__title">{p.title}</div>
                  {(p.participantName || p.direction) && (
                    <div className="m-practices-vote__meta">
                      {[p.participantName, p.direction].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {hasDescription && (
                    <div className="m-practices-vote__more">
                      {isOpen ? 'Скрыть описание' : 'Подробнее'}
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  className={`m-practices-vote__like${isLiked ? ' is-on' : ''}`}
                  disabled={likeDisabled}
                  aria-pressed={isLiked}
                  aria-label={isLiked ? 'Снять лайк' : 'Поставить лайк'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(p.id);
                  }}
                >
                  <span className="m-practices-vote__heart" aria-hidden>{isLiked ? '♥' : '♡'}</span>
                </button>
              </div>

              {hasDescription && isOpen && (
                <div className="m-practices-vote__desc">{p.description}</div>
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="l"
        stretched
        loading={saving}
        onClick={handleSave}
        className="m-practices-vote__save"
        style={{ marginTop: 14 }}
      >
        Сохранить голос
      </Button>
    </Div>
  );
}
