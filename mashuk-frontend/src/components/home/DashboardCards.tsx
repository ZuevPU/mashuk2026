import React from 'react';
import { Button } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import '../../style.css';

interface PriorityActionProps {
  tag: string;
  title: string;
  subtitle: string;
  buttonText: string;
  onClick: () => void;
}

export const PriorityAction: React.FC<PriorityActionProps> = ({ tag, title, subtitle, buttonText, onClick }) => {
  return (
    <div className="m-prio" onClick={onClick}>
      <div className="m-prio-tag">{tag}</div>
      <div className="m-prio-title">{title}</div>
      <div className="m-prio-sub">{subtitle}</div>
      <div className="m-prio-btn">{buttonText}</div>
    </div>
  );
};

export const NextEventCard: React.FC<{title: string, time: string, isSoon?: boolean, isNext?: boolean}> = ({ title, time, isSoon, isNext }) => {
  return (
    <div className="m-card">
      {isSoon && <div className="m-soon-bdg">СКОРО</div>}
      {isNext && <div className="m-soon-bdg" style={{ background: '#E8E0D4', color: '#5D4B37' }}>ДАЛЕЕ</div>}
      <div className="m-now-t">{title}</div>
      <div className="m-now-tm">{time}</div>
    </div>
  );
};

export type TouchpointItem = {
  id: number;
  slotIndex?: number;
  title?: string;
  state: 'done' | 'active' | 'overdue' | 'locked' | 'pending';
  block?: string | null;
};

export const TouchpointsCard: React.FC<{
  completed: number;
  total: number;
  message: string;
  missed?: number;
  items?: TouchpointItem[];
  onItemClick?: (item: TouchpointItem) => void;
}> = ({ completed, total, message, missed = 0, items, onItemClick }) => {
  const points = [];
  if (items && items.length > 0) {
    for (const item of items) {
      let cls = 'ft';
      let text: string = String(points.length + 1);
      if (item.state === 'done') { cls = 'ok'; text = '✓'; }
      else if (item.state === 'overdue') { cls = 'miss'; text = '!'; }
      else if (item.state === 'active') { cls = 'ac'; }
      else if (item.state === 'locked') { cls = 'ft'; text = '🔒'; }
      const clickable = item.state === 'active' || item.state === 'overdue' || item.state === 'done';
      points.push(
        <div
          key={`tp-${item.slotIndex ?? points.length}-${item.id}`}
          className={`m-pd ${cls}`}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          title={item.title || undefined}
          style={clickable ? { cursor: 'pointer' } : undefined}
          onClick={() => { if (clickable && onItemClick) onItemClick(item); }}
          onKeyDown={(e) => {
            if (clickable && onItemClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onItemClick(item);
            }
          }}
        >
          {text}
        </div>,
      );
    }
  } else {
    for (let i = 1; i <= total; i++) {
      let cls = 'ft';
      let text = String(i);
      if (i <= completed) { cls = 'ok'; text = '✓'; }
      else if (missed > 0 && i <= completed + missed) { cls = 'miss'; text = '!'; }
      else if (i === completed + missed + 1) { cls = 'ac'; }
      points.push(<div key={i} className={`m-pd ${cls}`}>{text}</div>);
    }
  }

  return (
    <div className="m-tp">
      <div className="m-tp-l">Точки дня · {completed} из {total}</div>
      <div className="m-pdots">
        {points}
      </div>
      <div className="m-tp-tx">{message}</div>
    </div>
  );
};

export const MiniTasksCard: React.FC<{totalCount: number, hasNew?: boolean}> = ({ totalCount, hasNew }) => {
  const routeNavigator = useRouteNavigator();
  return (
    <div className="m-tmi" onClick={() => routeNavigator.push('/tasks')}>
      <div className="m-tmi-l">
        <span style={{ fontSize: '20px' }}>⚡</span>
        <div>
          <div className="m-tmi-t">Задания</div>
          <div className="m-tmi-s">{totalCount} доступно сегодня</div>
        </div>
      </div>
      {hasNew && <div className="m-tmbdg new">Новые</div>}
    </div>
  );
};

export const UnansweredAfterBlocksCard: React.FC<{
  items: { id: number; title: string; overdue?: boolean }[];
}> = ({ items }) => {
  const routeNavigator = useRouteNavigator();
  if (items.length === 0) return null;
  const n = items.length;
  const word = n === 1 ? 'неотвеченный вопрос' : n >= 2 && n <= 4 ? 'неотвеченных вопроса' : 'неотвеченных вопросов';
  const targetId = items[0]?.id;

  return (
    <div
      className="m-card miss"
      role="button"
      tabIndex={0}
      onClick={() => { if (targetId) routeNavigator.push(`/questions?q=${targetId}`); }}
      onKeyDown={(e) => {
        if (targetId && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          routeNavigator.push(`/questions?q=${targetId}`);
        }
      }}
      style={{
        background: '#FFF0F0',
        border: '1.5px solid rgba(229,62,62,.35)',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#C53030', marginBottom: 6 }}>
        Внимание
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#9B2C2C', marginBottom: 6 }}>
        У вас есть {n} {word}
      </div>
      <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#742A2A', lineHeight: 1.45 }}>
        {items.slice(0, 4).map(i => (
          <li key={i.id} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {i.title}{i.overdue ? ' · ожидает ответа' : ''}
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#E53E3E' }}>
        Ответить →
      </div>
    </div>
  );
};

export const PracticesHomeCard: React.FC<{
  section: {
    questionId: number;
    title: string;
    resultsPublished: boolean;
    answered: boolean;
    likesPerParticipant?: number;
    preamble?: string;
    practices: Array<{
      id: string;
      title: string;
      participantName?: string;
      direction?: string;
    }>;
  };
}> = ({ section }) => {
  const routeNavigator = useRouteNavigator();
  const count = section.practices.length;
  if (count === 0) return null;

  const openVote = () => routeNavigator.push(`/questions?q=${section.questionId}`);
  const cta = section.resultsPublished
    ? 'Смотреть результаты'
    : section.answered
      ? 'Открыть практики'
      : 'Голосовать';
  const status = section.resultsPublished
    ? 'Результаты опубликованы'
    : section.answered
      ? 'Ваш голос уже учтён'
      : `${count} ${count === 1 ? 'практика' : count < 5 ? 'практики' : 'практик'} · можно поддержать`;

  return (
    <div className="m-card m-practices-teaser">
      <div className="m-practices-teaser__eyebrow">Практики участников</div>
      <div className="m-now-t" style={{ marginTop: 4 }}>
        {section.title?.trim() || 'Практики участников'}
      </div>
      {section.preamble?.trim() ? (
        <p className="m-practices-teaser__preamble">{section.preamble.trim()}</p>
      ) : (
        <p className="m-practices-teaser__preamble">
          Участники делятся своими практиками. Откройте список, чтобы поддержать понравившиеся.
        </p>
      )}
      <div className="m-practices-teaser__meta">{status}</div>
      <button type="button" className="m-practices-teaser__cta" onClick={openVote}>
        {cta}
      </button>
    </div>
  );
};

export const MissedTouchpointsCard: React.FC<{
  items: { id: number; title: string; state: 'overdue' | 'locked' }[];
  ctaQuestionId?: number | null;
}> = ({ items, ctaQuestionId }) => {
  const routeNavigator = useRouteNavigator();
  if (items.length === 0) return null;
  const n = items.length;
  const titleWord = n === 1 ? 'точка' : n >= 2 && n <= 4 ? 'точки' : 'точек';
  const fillable = items.filter(i => i.state === 'overdue');
  const targetId = ctaQuestionId ?? fillable[0]?.id ?? items[0]?.id;

  return (
    <div className="m-card miss" style={{ background: '#FFF0F0', border: '1.5px solid rgba(229,62,62,.25)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#C53030', marginBottom: 8 }}>
        {n} {titleWord} пропущено
      </div>
      <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#742A2A', lineHeight: 1.45 }}>
        {items.map(i => (
          <li key={i.id}>
            {i.title}
            {i.state === 'locked' ? ' · 🔒' : ''}
          </li>
        ))}
      </ul>
      {targetId && fillable.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => routeNavigator.push(`/questions?q=${targetId}`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') routeNavigator.push(`/questions?q=${targetId}`); }}
          style={{ fontSize: 12, fontWeight: 700, color: '#E53E3E', cursor: 'pointer' }}
        >
          Заполнить пропущенные →
        </div>
      )}
      {fillable.length === 0 && (
        <div style={{ fontSize: 11, color: '#888' }}>Окно закрыто — точки заморожены</div>
      )}
    </div>
  );
};

export const StatsRow: React.FC<{
  path: number;
  exp: number;
  ideas: number;
  total?: number;
  pathLevel?: number;
  experienceLevel?: number;
  pathProgress?: number;
  experienceProgress?: number;
  onIdeasClick?: () => void;
}> = ({
  path, exp, ideas, total,
  pathLevel, experienceLevel, pathProgress = 0, experienceProgress = 0,
  onIdeasClick,
}) => {
  const combined = total ?? path + exp;
  return (
    <div className="m-stats">
      <div className="m-st">
        <div className="m-sv">📍 {path}</div>
        <div className="m-sl">Путь{pathLevel ? ` · ур. ${pathLevel}` : ''}</div>
        <div style={{ height: 4, background: '#E8E0D4', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(pathProgress * 100)}%`, height: '100%', background: '#2D6A4F', borderRadius: 4 }} />
        </div>
      </div>
      <div className="m-st">
        <div className="m-sv">⚡ {exp}</div>
        <div className="m-sl">Опыт{experienceLevel ? ` · ур. ${experienceLevel}` : ''}</div>
        <div style={{ height: 4, background: '#E8E0D4', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(experienceProgress * 100)}%`, height: '100%', background: '#B8621A', borderRadius: 4 }} />
        </div>
      </div>
      <div className="m-st">
        <div className="m-sv">🏆 {combined}</div>
        <div className="m-sl">Рейтинг</div>
      </div>
      <div
        className="m-st"
        role={onIdeasClick ? 'button' : undefined}
        tabIndex={onIdeasClick ? 0 : undefined}
        onClick={onIdeasClick}
        onKeyDown={onIdeasClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onIdeasClick();
          }
        } : undefined}
        style={onIdeasClick ? { cursor: 'pointer' } : undefined}
      >
        <div className="m-sv">✦ {ideas}</div>
        <div className="m-sl">Копилка</div>
      </div>
    </div>
  );
};

export interface ExperimentItem {
  id?: number;
  title: string;
  body?: string | null;
  hint?: string | null;
  title2?: string | null;
  body2?: string | null;
  hint2?: string | null;
  title3?: string | null;
  body3?: string | null;
  hint3?: string | null;
  roleName?: string | null;
}

export const RoleOfDayCard: React.FC<{
  name: string;
  quadrant?: string | null;
  essence?: string | null;
  experiment?: ExperimentItem | null;
}> = ({ name, quadrant, essence, experiment }) => {
  const [expOpen, setExpOpen] = React.useState(false);
  const toggleExp = () => setExpOpen(o => !o);

  const items: Array<{ b?: string | null }> = [];
  if (experiment) {
    if (experiment.body?.trim()) items.push({ b: experiment.body });
    if (experiment.body2?.trim()) items.push({ b: experiment.body2 });
    if (experiment.body3?.trim()) items.push({ b: experiment.body3 });
  }

  return (
    <div className="m-card m-role-day" style={{ background: 'linear-gradient(135deg,#FFF3E0 0%,#FFECB3 100%)' }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Роль дня</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>◆ {name}</div>
      {quadrant && <div style={{ fontSize: 11, color: '#B8621A', marginTop: 2 }}>{quadrant}</div>}
      {essence && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.4, color: '#5D4B37' }}>{essence}</div>}

      {items.length > 0 && (
        <div className="m-role-exp" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="m-role-exp-toggle"
            aria-expanded={expOpen}
            onClick={toggleExp}
          >
            <span className="m-role-exp-toggle-text">
              <span className="m-role-exp-toggle-title">
                {items.length > 1 ? `Советы дня (${items.length})` : 'Совет дня'}
              </span>
            </span>
            <span className="m-role-exp-chevron" aria-hidden>{expOpen ? '▾' : '▸'}</span>
          </button>
          {expOpen && (
            <div className="m-role-exp-body">
              {items.map((it, i) => (
                <div key={i} style={{ borderTop: i > 0 ? '1px dashed rgba(61,52,41,0.2)' : 'none', paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                  {items.length > 1 && <div style={{ fontSize: 10, fontWeight: 800, color: '#B8621A', marginBottom: 4 }}>СОВЕТ №{i + 1}</div>}
                  {it.b && (
                    <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: '#3D3429' }}>{it.b}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ExperimentCard: React.FC<{
  experiment: ExperimentItem;
  onSaveFixation?: (item: { t: string, b?: string | null }) => void;
}> = ({ experiment, onSaveFixation }) => {
  const [open, setOpen] = React.useState(false);
  const items: Array<{ t: string; b?: string | null }> = [];
  if (experiment.body?.trim()) items.push({ t: experiment.body.trim(), b: experiment.body });
  if (experiment.body2?.trim()) items.push({ t: experiment.body2.trim(), b: experiment.body2 });
  if (experiment.body3?.trim()) items.push({ t: experiment.body3.trim(), b: experiment.body3 });

  return (
    <div className="m-card">
      <button
        type="button"
        className="m-role-exp-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="m-role-exp-toggle-text">
          <span className="m-role-exp-toggle-title">
            {items.length > 1 ? `Советы дня (${items.length})` : 'Совет дня'}
          </span>
        </span>
        <span className="m-role-exp-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="m-role-exp-body" style={{ marginTop: 10 }}>
          {experiment.roleName && (
            <div style={{ fontSize: 11, marginBottom: 8 }}>
              Развиваю сегодня · <strong style={{ color: '#B8621A' }}>◆ {experiment.roleName}</strong>
            </div>
          )}
          {items.map((it, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px dashed rgba(61,52,41,0.1)' : 'none', paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
              {items.length > 1 && <div style={{ fontSize: 10, fontWeight: 800, color: '#B8621A', marginBottom: 4 }}>СОВЕТ №{i + 1}</div>}
              {it.b && <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 8px' }}>{it.b}</p>}
              {onSaveFixation && (
                <Button size="s" mode="secondary" onClick={() => onSaveFixation(it)}>
                  Сохранить совет №{items.length > 1 ? i + 1 : ''} в копилку
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
