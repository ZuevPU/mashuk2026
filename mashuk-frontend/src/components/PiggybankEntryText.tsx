import { splitPiggybankText, openPiggyLink } from '../utils/piggyLinks';

export function PiggybankEntryText({ text }: { text: string }) {
  const { body, items } = splitPiggybankText(text);
  if (!body && items.length === 0) return null;

  return (
    <div className="piggy-entry">
      {body ? <div className="piggy-entry-text">{body}</div> : null}
      {items.length > 0 && (
        <div className="piggy-entry-actions">
          {items.map(item => (
            <button
              key={`${item.kind}-${item.url}`}
              type="button"
              className={`piggy-entry-open${item.kind === 'file' ? ' is-file' : ''}`}
              onClick={() => openPiggyLink(item.url)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
