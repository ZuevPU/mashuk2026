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
  focusSubtitleHtml?: string | null;
  focusKeyQuestion?: string;
  progressPercent: number;
}

function plainToFocusHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/** Map editor inline text-align to CSS classes (more reliable in VK WebView). */
function prepareFocusHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll<HTMLElement>('[style*="text-align"], [align]').forEach((el) => {
    const styleAlign = el.style?.textAlign?.toLowerCase();
    const attrAlign = (el.getAttribute('align') || '').toLowerCase();
    const align = styleAlign || attrAlign;
    if (!align || !['center', 'right', 'left', 'justify'].includes(align)) return;
    el.classList.add(`m-hdr-align-${align}`);
    el.style.textAlign = '';
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    el.removeAttribute('align');
  });
  return root.innerHTML;
}

export const HeaderInfo: React.FC<HeaderInfoProps> = ({
  firstName, lastName, direction, groupName, dayCount, totalDays, currentDateStr,
  focusTitle, focusSubtitle, focusSubtitleHtml, focusKeyQuestion, progressPercent,
}) => {
  const rawHtml = (focusSubtitleHtml && focusSubtitleHtml.trim())
    ? focusSubtitleHtml
    : (focusSubtitle ? plainToFocusHtml(focusSubtitle) : '');
  const bodyHtml = rawHtml ? prepareFocusHtml(rawHtml) : '';

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
      {bodyHtml && (
        <div
          className="m-hdr-focus-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
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
