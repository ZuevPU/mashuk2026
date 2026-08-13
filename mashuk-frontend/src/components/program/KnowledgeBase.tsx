import { useMemo, useState } from 'react';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Checkbox, CustomSelect, Button } from '@vkontakte/vkui';
import { openExternalUrl } from '../../utils/openUrl';
import { apiPost } from '../../api/client';
import { PIGGYBANK_SOURCES, PIGGYBANK_TAGS, inferSourceFromEventTitle } from '../../data/piggybank';
import { KB_SECTIONS, kbSectionMeta, kbSubsectionLabel } from './kbSections';
import { MashukCoursesButton, useMashukCourses } from './MashukCourses';

interface Material {
  id: number;
  title: string;
  type?: string;
  typeLabel?: string;
  description?: string;
  url?: string;
  fileUrl?: string | null;
  isNew?: boolean;
  speakerName?: string;
  speakerInitials?: string;
  topic?: string;
  topicTitle?: string | null;
  eventTitle?: string;
  kbSection?: string | null;
  kbSubsection?: string | null;
  sectionLabel?: string | null;
  subsectionLabel?: string | null;
  direction?: string | null;
  groupKey?: string;
}

interface KbSectionMeta {
  key: string;
  label: string;
  color: string;
  tint: string;
  subsections?: { key: string; label: string }[];
}

interface KnowledgeBaseProps {
  kb: {
    unlocked?: boolean;
    requiredTouchpoints?: number;
    touchpointsCompleted?: number;
    touchpointsTotal?: number;
    remaining?: number;
    ruleLabel?: string;
    lockReason?: string | null;
    lockMessage?: string | null;
    materials?: Material[];
    sections?: KbSectionMeta[];
    day?: number;
    dayTitle?: string;
    dayDescription?: string | null;
    dayDescriptionHtml?: string | null;
    opensOn?: string | null;
  } | null;
}

type TopicGroup = {
  key: string;
  topic: string;
  speakerName: string;
  direction?: string | null;
  subsection?: string | null;
  items: Material[];
};

function buildGroups(list: Material[]): TopicGroup[] {
  const order: string[] = [];
  const map = new Map<string, TopicGroup>();
  for (const m of list) {
    const key = m.groupKey
      || `${(m.topicTitle || m.topic || m.title || '').toLowerCase()}\0${(m.speakerName || '').toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        topic: m.topicTitle || m.topic || m.title,
        speakerName: m.speakerName || '—',
        direction: m.direction,
        subsection: m.kbSubsection,
        items: [],
      };
      map.set(key, g);
      order.push(key);
    }
    g.items.push(m);
  }
  return order.map(k => map.get(k)!);
}

export function KnowledgeBasePanel({ kb }: KnowledgeBaseProps) {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [pendingMaterial, setPendingMaterial] = useState<Material | null>(null);
  const [piggyTags, setPiggyTags] = useState<string[]>(['на будущее']);
  const [piggySource, setPiggySource] = useState('');
  const [piggyStep, setPiggyStep] = useState<'tags' | 'source'>('tags');
  const [toast, setToast] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const { openCourses, sheet: coursesSheet } = useMashukCourses();
  const routeNavigator = useRouteNavigator();

  const catalog = kb?.sections?.length ? kb.sections : KB_SECTIONS.map(s => ({
    key: s.key,
    label: s.label,
    color: s.color,
    tint: s.tint,
  }));

  const materials = kb?.materials ?? [];

  const presentSections = useMemo(() => {
    const keys = new Set(materials.map(m => m.kbSection).filter(Boolean) as string[]);
    const known = catalog.filter(s => keys.has(s.key));
    const hasOther = materials.some(m => !m.kbSection);
    return { known, hasOther };
  }, [materials, catalog]);

  const visible = useMemo(() => {
    if (sectionFilter === 'all') return materials;
    if (sectionFilter === 'other') return materials.filter(m => !m.kbSection);
    return materials.filter(m => m.kbSection === sectionFilter);
  }, [materials, sectionFilter]);

  const blocks = useMemo(() => {
    const bySection = new Map<string, Material[]>();
    for (const m of visible) {
      const sk = m.kbSection || 'other';
      const arr = bySection.get(sk) || [];
      arr.push(m);
      bySection.set(sk, arr);
    }
    const sectionOrder = [
      ...catalog.map(s => s.key),
      'other',
    ];
    return sectionOrder
      .filter(k => bySection.has(k))
      .map(sectionKey => {
        const mats = bySection.get(sectionKey)!;
        const meta = kbSectionMeta(sectionKey) || catalog.find(s => s.key === sectionKey);
        const color = meta?.color || '#666';
        const tint = meta?.tint || '#F4F4F4';
        const label = meta?.label || (sectionKey === 'other' ? 'Без раздела' : sectionKey);

        if (sectionKey === 'thematic') {
          const dirs = [...new Set(mats.map(m => m.direction || 'Общее'))];
          return {
            sectionKey,
            label,
            color,
            tint,
            chunks: dirs.map(dir => ({
              title: dir,
              groups: buildGroups(mats.filter(m => (m.direction || 'Общее') === dir)),
            })),
          };
        }
        if (sectionKey === 'open_lessons') {
          const subs = ['open', 'practices', 'reverse', ''];
          const chunks = subs
            .map(sub => {
              const list = mats.filter(m => (m.kbSubsection || '') === sub);
              if (!list.length) return null;
              return {
                title: kbSubsectionLabel('open_lessons', sub || null) || 'Без подраздела',
                groups: buildGroups(list),
              };
            })
            .filter(Boolean) as { title: string; groups: TopicGroup[] }[];
          return { sectionKey, label, color, tint, chunks };
        }
        return {
          sectionKey,
          label,
          color,
          tint,
          chunks: [{ title: null as string | null, groups: buildGroups(mats) }],
        };
      });
  }, [visible, catalog]);

  if (!kb) return null;

  if (kb.lockReason === 'point_b' || kb.day === 8) {
    return (
      <>
        <div className="kb-lock">
          <div className="kb-lock-icon">🎯</div>
          <div className="kb-lock-t">Заключительный день</div>
          <div className="kb-lock-s">{kb.lockMessage || 'Заполни Точку Б — финальную рефлексию смены'}</div>
          <button
            type="button"
            className="m-prio-btn"
            style={{ marginTop: 12 }}
            onClick={() => routeNavigator.push('/questions')}
          >
            Перейти к Точке Б →
          </button>
          <MashukCoursesButton onOpen={openCourses} />
        </div>
        {coursesSheet}
      </>
    );
  }

  if (!kb.unlocked) {
    const req = kb.requiredTouchpoints ?? 4;
    const done = kb.touchpointsCompleted ?? 0;
    const total = kb.touchpointsTotal ?? 7;
    const pct = Math.min(100, Math.round((done / req) * 100));
    const isFuture = kb.lockReason === 'future_day';
    return (
      <>
        <div className="kb-lock">
          <div className="kb-lock-icon">🔒</div>
          <div className="kb-lock-t">{isFuture ? 'День ещё не наступил' : 'База знаний заблокирована'}</div>
          <div className="kb-lock-s">
            {kb.lockMessage || (isFuture
              ? `Откроется, когда наступит день ${kb.day}`
              : (kb.ruleLabel || `Пройдите ${req} из ${total} точек осмысления за день`))}
          </div>
          {!isFuture && (
            <div className="kb-lock-bar">
              <div className="kb-lock-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
          <MashukCoursesButton onOpen={openCourses} />
        </div>
        {coursesSheet}
      </>
    );
  }

  const openPiggyDialog = (m: Material) => {
    setPendingMaterial(m);
    setPiggyTags(['на будущее']);
    setPiggySource(inferSourceFromEventTitle(m.eventTitle || m.topic));
    setPiggyStep('tags');
  };

  const togglePiggyTag = (tag: string) => {
    setPiggyTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= 3) return prev;
      return [...prev, tag];
    });
  };

  const saveToPiggy = async () => {
    if (!pendingMaterial || piggyTags.length === 0 || !piggySource) return;
    try {
      await apiPost(`/program/materials/${pendingMaterial.id}/piggybank`, {
        tags: piggyTags,
        source: piggySource,
      });
      setSavedIds(prev => new Set(prev).add(pendingMaterial.id));
      setPendingMaterial(null);
      setToast('Сохранено в копилку');
    } catch {
      setToast('Не удалось сохранить');
    }
  };

  return (
    <>
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 50,
            background: '#222', color: '#fff', padding: '10px 14px', borderRadius: 10,
            fontSize: 13, textAlign: 'center',
          }}
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#888', marginBottom: 10, lineHeight: 1.4 }}>
        {kb.ruleLabel || <>Материалы открываются когда пройдено <strong style={{ color: '#FF5500' }}>≥ 4 из 7 точек осмысления</strong> за день</>}
      </div>

      {materials.length > 0 && (
        <div className="kb-section-chips" role="tablist" aria-label="Разделы базы знаний">
          <button
            type="button"
            className={`kb-section-chip${sectionFilter === 'all' ? ' active' : ''}`}
            onClick={() => setSectionFilter('all')}
          >
            Все
          </button>
          {presentSections.known.map(s => (
            <button
              key={s.key}
              type="button"
              className={`kb-section-chip${sectionFilter === s.key ? ' active' : ''}`}
              style={{
                ['--kb-sec' as string]: s.color,
                ['--kb-sec-tint' as string]: s.tint,
              }}
              onClick={() => setSectionFilter(s.key)}
            >
              {s.label}
            </button>
          ))}
          {presentSections.hasOther && (
            <button
              type="button"
              className={`kb-section-chip${sectionFilter === 'other' ? ' active' : ''}`}
              onClick={() => setSectionFilter('other')}
            >
              Без раздела
            </button>
          )}
        </div>
      )}

      <div className="kb-courses-open-slot">
        <MashukCoursesButton onOpen={openCourses} />
      </div>

      {materials.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 16, fontSize: 12 }}>Материалы появятся после мероприятий</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 16, fontSize: 12 }}>В этом разделе пока пусто</div>
      ) : (
        <div className="kb-sections">
          {blocks.map(block => (
            <section
              key={block.sectionKey}
              className="kb-section-block"
              style={{ ['--kb-sec' as string]: block.color, ['--kb-sec-tint' as string]: block.tint }}
            >
              {(sectionFilter === 'all' || blocks.length > 1) && (
                <h3 className="kb-section-title">{block.label}</h3>
              )}
              {block.chunks.map((chunk, idx) => (
                <div key={`${block.sectionKey}-${chunk.title || idx}`} className="kb-section-chunk">
                  {chunk.title && <div className="kb-chunk-title">{chunk.title}</div>}
                  {chunk.groups.map(group => (
                    <article key={group.key} className="kb-topic-card">
                      <div className="kb-topic-head">
                        <div className="kb-topic-name">{group.topic}</div>
                        <div className="kb-topic-speaker">{group.speakerName}</div>
                      </div>
                      <div className="kb-artifact-row">
                        {group.items.map(m => (
                          <div key={m.id} className="kb-artifact">
                            <button
                              type="button"
                              className="kb-artifact-open"
                              onClick={() => m.url && openExternalUrl(m.url)}
                              disabled={!m.url && !m.fileUrl}
                            >
                              <span className="kb-artifact-type">{m.typeLabel || m.type || 'Материал'}</span>
                              <span className="kb-artifact-title">
                                {m.title}
                                {m.isNew && <span className="kb-mat-new">Новый</span>}
                              </span>
                            </button>
                            {m.fileUrl && (
                              <button
                                type="button"
                                className="kb-piggy-btn"
                                onClick={() => openExternalUrl(m.fileUrl!)}
                              >
                                Файл
                              </button>
                            )}
                            <button
                              type="button"
                              className="kb-piggy-btn"
                              onClick={() => openPiggyDialog(m)}
                            >
                              {savedIds.has(m.id) ? 'В копилке' : 'В копилку'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {pendingMaterial != null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setPendingMaterial(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 360 }}
            onClick={e => e.stopPropagation()}
          >
            {piggyStep === 'tags' ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Теги для копилки</div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>{pendingMaterial.title}</div>
                {PIGGYBANK_TAGS.map(tag => (
                  <Checkbox
                    key={tag}
                    checked={piggyTags.includes(tag)}
                    onChange={() => togglePiggyTag(tag)}
                  >
                    {tag}
                  </Checkbox>
                ))}
                <Button
                  size="l"
                  stretched
                  style={{ marginTop: 12 }}
                  disabled={piggyTags.length === 0}
                  onClick={() => setPiggyStep('source')}
                >
                  Далее · источник
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Источник записи</div>
                <CustomSelect
                  placeholder="Выберите источник"
                  value={piggySource || undefined}
                  onChange={e => setPiggySource(String(e.target.value))}
                  options={PIGGYBANK_SOURCES.map(s => ({ label: s, value: s }))}
                />
                <Button size="l" stretched style={{ marginTop: 12 }} disabled={!piggySource} onClick={saveToPiggy}>
                  Сохранить в копилку
                </Button>
                <Button size="m" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setPiggyStep('tags')}>
                  Назад
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {coursesSheet}
    </>
  );
}
