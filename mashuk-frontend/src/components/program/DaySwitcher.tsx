import React from 'react';
import '../../style.css';

interface DaySwitcherProps {
  days: { id: number; title: string; subtitle: string; status: 'done' | 'today' | 'locked' | 'future' }[];
  activeDay: number;
  onDayChange: (day: number) => void;
}

export const DaySwitcher: React.FC<DaySwitcherProps> = ({ days, activeDay, onDayChange }) => {
  return (
    <div className="m-day-sw">
      {days.map(day => {
        const isDone = day.status === 'done';
        const isToday = day.status === 'today';
        const isOn = day.id === activeDay;
        
        let cls = 'm-dsb';
        if (isDone) cls += ' done';
        if (isToday) cls += ' today';
        if (isOn) cls += ' on';

        return (
          <button key={day.id} className={cls} onClick={() => onDayChange(day.id)}>
            {day.title}
            <span className="dn">{day.subtitle}</span>
          </button>
        );
      })}
    </div>
  );
};
