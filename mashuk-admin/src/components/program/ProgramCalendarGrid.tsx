import { Fragment, useMemo } from 'react';
import { label } from '../../labels/ru';
import { eventVisibilityLabel, parseTimeSlot, type ProgramEvent, type ScheduleDayRow } from './types';
import {
  buildTimeSlots,
  minutesToTime,
  timeToMinutes,
  CAL_SLOT_MINUTES,
  parallelEventsForCell,
} from './programCalendar';

function eventTimeLabel(timeSlot: string | null | undefined): string {
  const { start, end } = parseTimeSlot(timeSlot);
  return end && end !== start ? `${start}–${end}` : start;
}

type Props = {
  events: ProgramEvent[];
  totalDays: number;
  scheduleDays: ScheduleDayRow[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onAddEvent: (day: number, timeStart: string, timeEnd: string) => void;
  onEditEvent: (event: ProgramEvent) => void;
};

function defaultEndTime(start: string): string {
  return minutesToTime(timeToMinutes(start) + CAL_SLOT_MINUTES * 3);
}

export function ProgramCalendarGrid({
  events,
  totalDays,
  scheduleDays,
  selectedDay,
  onSelectDay,
  onAddEvent,
  onEditEvent,
}: Props) {
  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const dayLabels = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of scheduleDays) {
      map.set(d.dayNumber, d.displayLabel || `Д${d.dayNumber}`);
    }
    for (let i = 1; i <= totalDays; i += 1) {
      if (!map.has(i)) map.set(i, `Д${i}`);
    }
    return map;
  }, [scheduleDays, totalDays]);

  const publishedDays = useMemo(() => {
    const set = new Set<number>();
    for (const d of scheduleDays) {
      if (d.isPublished) set.add(d.dayNumber);
    }
    return set;
  }, [scheduleDays]);

  const rootEvents = useMemo(() => events, [events]);

  const cellEvents = (day: number, time: string) => parallelEventsForCell(rootEvents, day, time);

  return (
    <div className="adm-program-calendar">
      <div
        className="adm-program-cal-grid"
        style={{ gridTemplateColumns: `56px repeat(${totalDays}, minmax(120px, 1fr))` }}
      >
        <div className="adm-program-cal-corner" />
        {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
          <button
            key={day}
            type="button"
            className={`adm-program-cal-day-head ${selectedDay === day ? 'selected' : ''} ${publishedDays.has(day) ? 'published' : ''}`}
            onClick={() => onSelectDay(day)}
            title={publishedDays.has(day) ? 'День опубликован' : 'Черновик дня'}
          >
            {dayLabels.get(day)}
          </button>
        ))}

        {timeSlots.map(time => (
          <Fragment key={time}>
            <div className="adm-program-cal-time">{time}</div>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
              const list = cellEvents(day, time);
              return (
                <div key={`${day}-${time}`} className={`adm-program-cal-cell${list.length > 1 ? ' adm-program-cal-cell-parallel' : ''}`}>
                  <div className={list.length > 1 ? 'adm-program-cal-parallel' : ''}>
                    {list.map(ev => {
                      const vis = eventVisibilityLabel(ev);
                      const timeLabel = eventTimeLabel(ev.timeSlot);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className={`adm-program-cal-event adm-program-badge-${vis}`}
                          onClick={() => onEditEvent(ev)}
                          title={`${ev.title || 'Без названия'} · ${timeLabel}`}
                        >
                          <span className="adm-program-cal-event-time">{timeLabel}</span>
                          <span className="adm-program-cal-event-title">{ev.title || 'Без названия'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="adm-program-cal-add"
                    aria-label={`Добавить событие ${dayLabels.get(day)} ${time}`}
                    onClick={() => onAddEvent(day, time, defaultEndTime(time))}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="adm-muted adm-forum-hint" style={{ marginTop: 8 }}>
        Блоки стоят в строке по времени начала (шаг 30 мин). Несколько блоков с одним стартом — в одной ячейке.
        Клик по заголовку дня — выбор для публикации. {label('schedule_visible')} / {label('schedule_waiting_day')} / {label('draft')} — цвет полоски у события.
      </p>
    </div>
  );
}
