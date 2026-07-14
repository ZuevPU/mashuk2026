import React from 'react';
import '../../style.css';

interface HeaderInfoProps {
  firstName: string;
  lastName: string;
  direction: string;
  groupName?: string | null;
  dayCount: number;
  totalDays: number;
  currentDateStr: string;
  focusTitle: string;
  focusSubtitle: string;
  focusKeyQuestion?: string;
  progressPercent: number;
}

export const HeaderInfo: React.FC<HeaderInfoProps> = ({
  firstName, lastName, direction, groupName, dayCount, totalDays, currentDateStr,
  focusTitle, focusSubtitle, focusKeyQuestion, progressPercent,
}) => {
  return (
    <div className="m-hdr">
      <div className="m-hdr-row">
        <div>
          <div className="m-hdr-n">{`${firstName} ${lastName}`}</div>
          <div className="m-hdr-dir">Направление «{direction}»</div>
          {groupName && (
            <div style={{ fontSize: 11, color: '#B8621A', marginTop: 2, fontWeight: 600 }}>
              Группа «{groupName}»
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="m-hdr-d">{currentDateStr}</div>
          <div className="m-hdr-dhl">День {dayCount} из {totalDays}</div>
        </div>
      </div>

      <div className="m-hdr-fl">Фокус дня</div>
      <div className="m-hdr-fv">{focusTitle}</div>
      {focusSubtitle && (
        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{focusSubtitle}</div>
      )}
      {focusKeyQuestion && (
        <div className="m-hdr-kq">Ключевой вопрос: {focusKeyQuestion}</div>
      )}

      <div className="m-dots">
        {Array.from({ length: totalDays }, (_, i) => {
          const threshold = ((i + 1) / totalDays) * 100;
          const cls = progressPercent >= threshold ? 'td' : i + 1 === dayCount ? 'td' : 'ft';
          return <div key={i} className={`m-d ${cls}`} />;
        })}
      </div>
    </div>
  );
};
