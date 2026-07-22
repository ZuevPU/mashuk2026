import React from 'react';
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

export const NextEventCard: React.FC<{title: string, time: string, isSoon?: boolean}> = ({ title, time, isSoon }) => {
  return (
    <div className="m-card">
      {isSoon && <div className="m-soon-bdg">СКОРО</div>}
      <div className="m-now-t">{title}</div>
      <div className="m-now-tm">{time}</div>
    </div>
  );
};

export type TouchpointItem = {
  id: number;
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
          key={item.id}
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
      <div className="m-tp-l">Точки осмысления · {completed} из {total}</div>
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

export const StatsRow: React.FC<{
  path: number;
  exp: number;
  ideas: number;
  pathLevel?: number;
  experienceLevel?: number;
  pathProgress?: number;
  experienceProgress?: number;
}> = ({
  path, exp, ideas,
  pathLevel, experienceLevel, pathProgress = 0, experienceProgress = 0,
}) => {
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
        <div className="m-sv">✦ {ideas}</div>
        <div className="m-sl">Идей</div>
      </div>
    </div>
  );
};

export const RoleOfDayCard: React.FC<{
  name: string;
  quadrant?: string | null;
  essence?: string | null;
}> = ({ name, quadrant, essence }) => (
  <div className="m-card" style={{ background: 'linear-gradient(135deg,#FFF3E0 0%,#FFECB3 100%)' }}>
    <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Роль дня</div>
    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>◆ {name}</div>
    {quadrant && <div style={{ fontSize: 11, color: '#B8621A', marginTop: 2 }}>{quadrant}</div>}
    {essence && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.4, color: '#5D4B37' }}>{essence}</div>}
  </div>
);

export const ExperimentCard: React.FC<{
  title: string;
  body?: string | null;
  hint?: string | null;
  roleName?: string | null;
  status: string;
  onStatusChange: (status: 'in_progress' | 'done') => void;
}> = ({ title, body, hint, roleName, status, onStatusChange }) => {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="m-card">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter') setOpen(o => !o); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Эксперимент дня</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        </div>
        <span style={{ fontSize: 12, color: '#888' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {roleName && (
            <div style={{ fontSize: 11, marginBottom: 8 }}>
              Развиваю сегодня · <strong style={{ color: '#B8621A' }}>◆ {roleName}</strong>
            </div>
          )}
          {body && <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 8px' }}>{body}</p>}
          {hint && <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{hint}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="m-prio-btn"
              style={{ opacity: status === 'in_progress' ? 1 : 0.7 }}
              onClick={() => onStatusChange('in_progress')}
            >
              В процессе
            </button>
            <button
              type="button"
              className="m-prio-btn"
              style={{ opacity: status === 'done' ? 1 : 0.7 }}
              onClick={() => onStatusChange('done')}
            >
              Сделано
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
