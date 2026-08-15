import { useCallback, useEffect, useRef, useState } from 'react';
import { resolvePublicMediaUrl } from '../../admin/client';
import { confirmDelete } from '../../admin/confirmDelete';
import type { AdminTabProps } from '../admin/types';

export type HomeNoticeRow = {
  id: number;
  shiftId: number;
  title: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  imageUrls: string[] | null;
  image_urls?: string[] | null;
  status: string;
  publishedAt: string | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type Draft = {
  title: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  imageUrls: string[];
};

const emptyDraft = (): Draft => ({
  title: '',
  body: '',
  ctaUrl: '',
  ctaLabel: 'Открыть',
  imageUrls: [],
});

function rowToDraft(row: HomeNoticeRow): Draft {
  return {
    title: row.title || '',
    body: row.body || '',
    ctaUrl: row.ctaUrl || '',
    ctaLabel: row.ctaLabel || 'Открыть',
    imageUrls: (Array.isArray(row.imageUrls) ? row.imageUrls : Array.isArray(row.image_urls) ? row.image_urls : [])
      .map(u => resolvePublicMediaUrl(String(u || '')))
      .filter(Boolean),
  };
}

function statusLabel(status: string) {
  if (status === 'published') return 'Опубликовано';
  if (status === 'archived') return 'Снято';
  return 'Черновик';
}

/** Fit notice photos into 960px so the card stays sharp and the payload stays small. */
async function fileToResizedDataUrl(file: File, maxEdge = 960, quality = 0.82): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('canvas');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    throw new Error('Этот формат фото не читается. Сохраните как JPG или PNG и загрузите снова.');
  }
}

function normalizeCtaUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith('//')) return `https:${t}`;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?]|$)/i.test(t)) return `https://${t}`;
  return t;
}

type Props = Pick<AdminTabProps, 'adminFetch' | 'act'> & {
  reloadKey?: number;
};

export function HomeNoticePanel({ adminFetch, act, reloadKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<HomeNoticeRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [previewMode, setPreviewMode] = useState<'compact' | 'modal'>('compact');
  const bootstrappedRef = useRef(false);

  const load = useCallback(async (mode: 'full' | 'soft' = 'full') => {
    if (mode === 'full') setLoading(true);
    try {
      const res = await adminFetch('/home-notices') as { notices: HomeNoticeRow[] };
      setNotices(res.notices || []);
      bootstrappedRef.current = true;
    } finally {
      if (mode === 'full') setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    // Первый заход — со спиннером; reloadKey после act — мягко, без размонтирования формы.
    load(bootstrappedRef.current ? 'soft' : 'full').catch(() => setLoading(false));
  }, [load, reloadKey]);

  const patchDraft = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const openEdit = (row: HomeNoticeRow) => {
    setEditingId(row.id);
    setDraft(rowToDraft(row));
  };

  const persist = async (status?: string, nextDraft?: Draft) => {
    const d = nextDraft ?? draft;
    if (!d.title.trim()) throw new Error('Укажите заголовок');
    const body = {
      title: d.title.trim(),
      body: d.body,
      ctaUrl: normalizeCtaUrl(d.ctaUrl) || null,
      ctaLabel: d.ctaLabel.trim() || null,
      imageUrls: d.imageUrls,
      ...(status ? { status } : {}),
    };
    if (editingId) {
      const res = await adminFetch(`/home-notices/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }) as { notice: HomeNoticeRow };
      setEditingId(res.notice.id);
      setDraft(rowToDraft(res.notice));
    } else {
      const res = await adminFetch('/home-notices', {
        method: 'POST',
        body: JSON.stringify({ ...body, status: status ?? 'draft' }),
      }) as { notice: HomeNoticeRow };
      setEditingId(res.notice.id);
      setDraft(rowToDraft(res.notice));
    }
    await load('soft');
  };

  const unpublish = async (id: number) => {
    const res = await adminFetch(`/home-notices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    }) as { notice: HomeNoticeRow };
    if (editingId === id) {
      setDraft(rowToDraft(res.notice));
    }
    await load('soft');
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await fileToResizedDataUrl(file);
      // Keep the data URL on the notice so the photo survives Timeweb redeploys
      // (ephemeral /uploads disk). Also try the public upload for other clients.
      try {
        await adminFetch('/upload-image', {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
      } catch {
        // Disk upload is optional for the home plate.
      }
      urls.push(dataUrl);
    }
    if (!urls.length) throw new Error('Не удалось загрузить картинку');
    const next: Draft = { ...draft, imageUrls: [...draft.imageUrls, ...urls] };
    if (!next.title.trim()) next.title = 'Объявление';
    setDraft(next);
    setPreviewMode('compact');
    await persist(undefined, next);
  };

  const published = notices.find(n => n.status === 'published');

  if (loading) {
    return <div className="card"><p className="adm-muted">Загрузка…</p></div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Плашка главного экрана</h3>
            <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              На главной участника — карточка с первым фото и кнопкой «Посмотреть». В модалке — текст, ссылка и все картинки.
              После загрузки нажмите «Опубликовать», иначе плашка останется черновиком и в приложении не появится.
            </p>
          </div>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={openCreate}>
            + Новая
          </button>
        </div>

        {published && (
          <div
            className="adm-forum-hint"
            style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
          >
            <span>Сейчас на главной: <strong>{published.title}</strong></span>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => act(() => unpublish(published.id), 'Снято с публикации')}
            >
              Снять с публикации
            </button>
          </div>
        )}

        <div className="adm-forum-block">
          <span className="adm-label">Заголовок</span>
          <input
            className="adm-input"
            value={draft.title}
            onChange={e => patchDraft({ title: e.target.value })}
            placeholder="Например: Как писать в сообщество Машука"
          />
        </div>

        <div className="adm-forum-block" style={{ marginTop: 12 }}>
          <span className="adm-label">Описание</span>
          <textarea
            className="adm-input"
            rows={6}
            value={draft.body}
            onChange={e => patchDraft({ body: e.target.value })}
            placeholder="Полный текст для модалки"
          />
        </div>

        <div className="adm-forum-block" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
          <div>
            <span className="adm-label">Ссылка кнопки</span>
            <input
              className="adm-input"
              value={draft.ctaUrl}
              onChange={e => patchDraft({ ctaUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <span className="adm-label">Текст кнопки</span>
            <input
              className="adm-input"
              value={draft.ctaLabel}
              onChange={e => patchDraft({ ctaLabel: e.target.value })}
              placeholder="Открыть"
            />
          </div>
        </div>

        <div className="adm-forum-block" style={{ marginTop: 12 }}>
          <span className="adm-label">Картинки</span>
          <p className="adm-muted" style={{ margin: '0 0 6px', fontSize: 11 }}>
            Первая картинка сразу видна на карточке главной. Остальные — в модалке.
            Фото сохраняется вместе с плашкой и не пропадает после выкладки.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={e => {
              const files = e.target.files;
              const input = e.currentTarget;
              void act(async () => {
                try {
                  await uploadImages(files);
                } finally {
                  input.value = '';
                }
              }, 'Картинки загружены', { reload: false });
            }}
          />
          {draft.imageUrls.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {draft.imageUrls.map((url, i) => (
                <div key={`${url}-${i}`} style={{ position: 'relative' }}>
                  <img
                    src={resolvePublicMediaUrl(url)}
                    alt=""
                    referrerPolicy="no-referrer"
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }}
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    style={{ position: 'absolute', top: -6, right: -6, padding: '0 6px', fontSize: 12 }}
                    onClick={() => {
                      const next = { ...draft, imageUrls: draft.imageUrls.filter((_, j) => j !== i) };
                      setDraft(next);
                      if (editingId) {
                        void act(() => persist(undefined, next), 'Картинка удалена', { reload: false });
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => act(() => persist('draft'), 'Черновик сохранён')}>
            Сохранить черновик
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => act(() => persist('published'), 'Опубликовано на главной')}>
            Опубликовать
          </button>
          {editingId && notices.find(n => n.id === editingId)?.status === 'published' && (
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => act(() => unpublish(editingId), 'Снято с публикации')}
            >
              Снять с публикации
            </button>
          )}
        </div>

        {notices.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <span className="adm-label">История</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {notices.map(n => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: editingId === n.id ? '#eef6f3' : '#f7f5f1',
                    border: editingId === n.id ? '1px solid #3D8B7A' : '1px solid transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openEdit(n)}
                    style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, padding: 0 }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    <div className="adm-muted" style={{ fontSize: 11 }}>{statusLabel(n.status)}</div>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => {
                      if (confirmDelete('Удалить плашку?')) {
                        act(async () => {
                          await adminFetch(`/home-notices/${n.id}`, { method: 'DELETE' });
                          if (editingId === n.id) openCreate();
                          await load('soft');
                        });
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="adm-evening-preview-shell">
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            type="button"
            className={`adm-btn adm-btn-sm ${previewMode === 'compact' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
            onClick={() => setPreviewMode('compact')}
          >
            Плашка
          </button>
          <button
            type="button"
            className={`adm-btn adm-btn-sm ${previewMode === 'modal' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
            onClick={() => setPreviewMode('modal')}
          >
            Модалка
          </button>
        </div>
        <div className="adm-evening-preview-phone" style={{ background: '#E8E2D8', padding: 12 }}>
          {previewMode === 'compact' ? (
            <div
              style={{
                background: 'linear-gradient(135deg, #F5F0E8 0%, #E8F0EC 100%)',
                borderRadius: 16,
                padding: '12px 14px',
                boxShadow: '0 4px 16px rgba(45, 106, 79, 0.12)',
                border: '1px solid rgba(61, 139, 122, 0.22)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {draft.imageUrls[0] && (
                <img
                  src={resolvePublicMediaUrl(draft.imageUrls[0])}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 14, flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1A1714', lineHeight: 1.3 }}>
                  {draft.title || 'Заголовок плашки'}
                </div>
                <button
                  type="button"
                  style={{
                    marginTop: 10,
                    border: 'none',
                    background: '#2D6A4F',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    borderRadius: 10,
                    padding: '8px 14px',
                  }}
                >
                  Посмотреть
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 16,
                boxShadow: '0 8px 24px rgba(45, 106, 79, 0.14)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1A1714', marginBottom: 10 }}>
                {draft.title || 'Заголовок'}
              </div>
              <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                {draft.body || 'Текст описания появится здесь.'}
              </div>
              {draft.imageUrls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {draft.imageUrls.map((url, i) => (
                    <img
                      key={`${url}-${i}`}
                      src={resolvePublicMediaUrl(url)}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', borderRadius: 10 }}
                    />
                  ))}
                </div>
              )}
              {draft.ctaUrl.trim() && (
                <button
                  type="button"
                  style={{
                    marginTop: 14,
                    width: '100%',
                    border: 'none',
                    background: '#3D8B7A',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: 12,
                    padding: '10px 14px',
                  }}
                >
                  {draft.ctaLabel.trim() || 'Открыть'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
