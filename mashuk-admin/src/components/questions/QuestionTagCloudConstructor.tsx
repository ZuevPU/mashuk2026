import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Token = { token: string; count: number };

type Props = {
  questionId: number;
  adminFetch: (path: string, init?: RequestInit) => Promise<any>;
};

const DEFAULT_PALETTE = [
  '#1F3A5F',
  '#0A7B6F',
  '#B8621A',
  '#2F6FED',
  '#C75000',
  '#6B5B95',
  '#2C7A7B',
  '#9A3412',
];

type PlacedWord = {
  token: string;
  count: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  width: number;
  height: number;
};

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 4,
): boolean {
  return !(
    a.x + a.width / 2 + pad < b.x - b.width / 2
    || a.x - a.width / 2 - pad > b.x + b.width / 2
    || a.y + a.height / 2 + pad < b.y - b.height / 2
    || a.y - a.height / 2 - pad > b.y + b.height / 2
  );
}

function layoutCloud(
  words: { token: string; count: number; color: string }[],
  width: number,
  height: number,
  minFs: number,
  maxFs: number,
): PlacedWord[] {
  if (!words.length) return [];
  const maxCount = Math.max(...words.map(w => w.count), 1);
  const minCount = Math.min(...words.map(w => w.count), 1);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const placed: PlacedWord[] = [];
  const cx = width / 2;
  const cy = height / 2;

  for (const w of words) {
    const t = maxCount === minCount ? 1 : (w.count - minCount) / (maxCount - minCount);
    const fontSize = Math.round(minFs + t * (maxFs - minFs));
    ctx.font = `700 ${fontSize}px "Segoe UI", "PT Sans", Arial, sans-serif`;
    const metrics = ctx.measureText(w.token);
    const tw = Math.ceil(metrics.width);
    const th = Math.ceil(fontSize * 1.15);

    let x = cx;
    let y = cy;
    let found = false;
    for (let step = 0; step < 900; step++) {
      const angle = 0.35 * step;
      const radius = 2.2 * step;
      x = cx + Math.cos(angle) * radius;
      y = cy + Math.sin(angle) * radius * 0.72;
      const box = { x, y, width: tw, height: th };
      if (
        x - tw / 2 < 8 || x + tw / 2 > width - 8
        || y - th / 2 < 8 || y + th / 2 > height - 8
      ) continue;
      if (!placed.some(p => overlaps(box, p))) {
        found = true;
        break;
      }
    }
    if (!found) {
      x = 8 + tw / 2 + Math.random() * Math.max(1, width - tw - 16);
      y = 8 + th / 2 + Math.random() * Math.max(1, height - th - 16);
    }
    placed.push({
      token: w.token,
      count: w.count,
      x,
      y,
      fontSize,
      color: w.color,
      width: tw,
      height: th,
    });
  }
  return placed;
}

export function QuestionTagCloudConstructor({ questionId, adminFetch }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [wordLimit, setWordLimit] = useState(25);
  const [palette, setPalette] = useState<string[]>([...DEFAULT_PALETTE]);
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize] = useState({ w: 900, h: 520 });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminFetch(`/questions/${questionId}/wordcloud?limit=80`)
      .then((r) => {
        setTokens(r.tokens ?? []);
        setAnswerCount(r.answerCount ?? 0);
      })
      .catch((e: Error) => setError(e.message || 'Не удалось загрузить слова'))
      .finally(() => setLoading(false));
  }, [adminFetch, questionId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const n = Math.min(Math.max(1, wordLimit), 50);
    return tokens.slice(0, n).map((t, i) => ({
      ...t,
      color: colorOverrides[t.token] ?? palette[i % palette.length]!,
    }));
  }, [tokens, wordLimit, palette, colorOverrides]);

  const placed = useMemo(
    () => layoutCloud(visible, canvasSize.w, canvasSize.h, 14, 64),
    [visible, canvasSize.w, canvasSize.h],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const w of placed) {
      ctx.font = `700 ${w.fontSize}px "Segoe UI", "PT Sans", Arial, sans-serif`;
      ctx.fillStyle = w.color;
      ctx.fillText(w.token, w.x, w.y);
    }
  }, [placed]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Transparent background: no fillRect; canvas is cleared to transparent
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `tagcloud_q${questionId}.png`;
    a.click();
  };

  const setPaletteColor = (index: number, color: string) => {
    setPalette(prev => prev.map((c, i) => (i === index ? color : c)));
  };

  const applySelectedColor = (color: string) => {
    if (!selectedToken) return;
    setColorOverrides(prev => ({ ...prev, [selectedToken]: color }));
  };

  if (loading) {
    return <p className="adm-muted">Собираю слова из ответов…</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: '#b91c1c' }}>{error}</p>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={load}>Повторить</button>
      </div>
    );
  }

  if (!tokens.length) {
    return (
      <p className="adm-muted" style={{ fontSize: 13 }}>
        Недостаточно текстовых слов в ответах (ответов: {answerCount}).
        Нужны развёрнутые текстовые ответы — предлоги и союзы отфильтрованы.
      </p>
    );
  }

  return (
    <div className="adm-tagcloud">
      <p className="adm-muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        Популярные слова из {answerCount} ответ(ов). Предлоги, союзы и междометия убраны.
        Размер слова = частота упоминаний. PNG сохраняется с прозрачным фоном.
      </p>

      <div className="adm-tagcloud-controls">
        <label className="adm-insights-filter" style={{ minWidth: 220 }}>
          Слов в облаке: <strong>{wordLimit}</strong>
          <input
            type="range"
            min={1}
            max={50}
            value={wordLimit}
            onChange={e => setWordLimit(Number(e.target.value))}
          />
        </label>

        <div className="adm-tagcloud-palette">
          <span className="adm-muted" style={{ fontSize: 12 }}>Палитра</span>
          {palette.map((c, i) => (
            <label key={i} className="adm-tagcloud-swatch" title={`Цвет ${i + 1}`}>
              <input
                type="color"
                value={c}
                onChange={e => setPaletteColor(i, e.target.value)}
              />
            </label>
          ))}
        </div>

        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={downloadPng}>
          Скачать PNG
        </button>
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={load}>
          Обновить слова
        </button>
      </div>

      {selectedToken ? (
        <div className="adm-tagcloud-selected">
          <span>Цвет для «{selectedToken}»:</span>
          <input
            type="color"
            value={colorOverrides[selectedToken] ?? visible.find(v => v.token === selectedToken)?.color ?? '#1F3A5F'}
            onChange={e => applySelectedColor(e.target.value)}
          />
          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => {
              setColorOverrides(prev => {
                const next = { ...prev };
                delete next[selectedToken];
                return next;
              });
              setSelectedToken(null);
            }}
          >
            Сбросить
          </button>
        </div>
      ) : (
        <p className="adm-muted" style={{ fontSize: 12 }}>Клик по слову в списке — задать индивидуальный цвет</p>
      )}

      <div className="adm-tagcloud-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="adm-tagcloud-canvas"
        />
      </div>

      <div className="adm-tagcloud-list">
        <div className="adm-dash-card-title" style={{ marginBottom: 8 }}>
          Слова в облаке ({visible.length})
        </div>
        <ul>
          {visible.map(w => (
            <li key={w.token}>
              <button
                type="button"
                className={`adm-tagcloud-word${selectedToken === w.token ? ' is-selected' : ''}`}
                style={{
                  color: w.color,
                  fontSize: `${Math.max(12, Math.min(28, 11 + w.count))}px`,
                  fontWeight: 700,
                }}
                onClick={() => setSelectedToken(w.token)}
                title={`${w.count} упом.`}
              >
                {w.token}
              </button>
              <span className="adm-muted" style={{ fontSize: 11 }}>×{w.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
