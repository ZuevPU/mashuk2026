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

export const TouchpointsCard: React.FC<{completed: number, total: number, message: string, missed?: number}> = ({ completed, total, message, missed = 0 }) => {
  const points = [];
  for (let i = 1; i <= total; i++) {
    let cls = 'ft';
    let text = String(i);
    if (i <= completed) { cls = 'ok'; text = '✓'; }
    else if (missed > 0 && i <= completed + missed) { cls = 'miss'; text = '!'; }
    else if (i === completed + missed + 1) { cls = 'ac'; }
    points.push(<div key={i} className={`m-pd ${cls}`}>{text}</div>);
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

export const StatsRow: React.FC<{path: number, exp: number, ideas: number}> = ({ path, exp, ideas }) => {
  return (
    <div className="m-stats">
      <div className="m-st">
        <div className="m-sv">📍 {path}</div>
        <div className="m-sl">Путь</div>
      </div>
      <div className="m-st">
        <div className="m-sv">⚡ {exp}</div>
        <div className="m-sl">Опыт</div>
      </div>
      <div className="m-st">
        <div className="m-sv">✦ {ideas}</div>
        <div className="m-sl">Идей</div>
      </div>
    </div>
  );
};
