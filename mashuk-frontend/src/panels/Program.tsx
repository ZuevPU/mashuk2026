import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelHeader, Group, Div, Spinner, Button, ModalRoot, ModalPage, ModalPageHeader } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { ProgramTabs } from '../components/program/ProgramTabs';
import { useAppModal } from '../App';
import { DaySwitcher } from '../components/program/DaySwitcher';
import { ProgramTimeline, type ProgramEvent, type ProgramSlot } from '../components/program/ProgramTimeline';
import { KnowledgeBasePanel } from '../components/program/KnowledgeBase';
import { EmptyState } from '../components/EmptyState';
import { apiGet, apiPost, ApiError } from '../api/client';
type DayStatus = 'done' | 'today' | 'future' | 'locked';

export const ProgramPanel: React.FC<{ id: string }> = ({ id }) => {
  const { setModal } = useAppModal();
  const { panel: activePanel } = useActiveVkuiLocation();
  const [activeTab, setActiveTab] = useState<'sched' | 'kb'>('sched');
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [totalDays, setTotalDays] = useState(8);
  const [currentDay, setCurrentDay] = useState(1);
  const [liveDay, setLiveDay] = useState(1);
  const [slots, setSlots] = useState<ProgramSlot[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recMeta, setRecMeta] = useState<{
    interests: string[];
    publishedEventsCount: number;
    noMatch: string;
    noEvents: string;
  } | null>(null);
  const [kb, setKb] = useState<any>(null);
  const [kbDays, setKbDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayPublished, setDayPublished] = useState(true);
  const [publishedDays, setPublishedDays] = useState<number[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ProgramEvent | null>(null);
  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});
  const [settingsReady, setSettingsReady] = useState(false);
  const programVisitRef = useRef(0);

  const toggleParent = (id: number) => {
    setExpandedParents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const loadSettings = useCallback((jumpToToday = true) => {
    return apiGet<{
      currentDay: number;
      liveScheduleDay?: number;
      totalDays: number;
      publishedDays?: number[];
    }>('/program/settings')
      .then(s => {
        const today = s.liveScheduleDay ?? s.currentDay ?? 1;
        setCurrentDay(s.currentDay ?? today);
        setLiveDay(today);
        setTotalDays(s.totalDays);
        setPublishedDays(s.publishedDays || []);
        if (jumpToToday) setActiveDay(today);
        return today;
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить настройки программы');
        const fallback = 1;
        if (jumpToToday) setActiveDay(fallback);
        return fallback;
      });
  }, []);

  const loadProgram = useCallback(() => {
    if (activeDay == null) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ slots: ProgramSlot[]; dayPublished?: boolean }>(`/program?day=${activeDay}`),
      apiGet<{ recommendations: any[]; interests?: string[]; publishedEventsCount?: number; noMatch?: string; noEvents?: string }>(`/program/recommendations?day=${activeDay}`),
      apiGet<any>(`/program/knowledge-base?day=${activeDay}`),
    ]).then(([prog, rec, knowledge]) => {
      setSlots(prog.slots || []);
      setDayPublished(prog.dayPublished === true);
      setRecommendations(rec.recommendations || []);
      setRecMeta({
        interests: rec.interests || [],
        publishedEventsCount: rec.publishedEventsCount ?? 0,
        noMatch: rec.noMatch || '',
        noEvents: rec.noEvents || '',
      });
      setKb(knowledge);
    }).catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить программу');
    }).finally(() => setLoading(false));
  }, [activeDay]);

  const openOnForumToday = useCallback(() => {
    programVisitRef.current += 1;
    const visit = programVisitRef.current;
    setActiveDay(null);
    setSettingsReady(false);
    loadSettings(true)
      .then(today => {
        if (visit !== programVisitRef.current) return;
        setActiveDay(today);
      })
      .finally(() => {
        if (visit === programVisitRef.current) setSettingsReady(true);
      });
  }, [loadSettings]);

  // Каждый вход на вкладку «Программа» — текущий день форума (как на главной)
  useEffect(() => {
    if (activePanel !== id) return;
    openOnForumToday();
    apiGet<{ days: any[] }>('/program/knowledge-base/days')
      .then(r => setKbDays(r.days || []))
      .catch(() => setKbDays([]));
  }, [activePanel, id, openOnForumToday]);

  useEffect(() => {
    const onReset = () => {
      if (activePanel !== id) return;
      openOnForumToday();
    };
    window.addEventListener('mashuk-program-reset-day', onReset);
    return () => window.removeEventListener('mashuk-program-reset-day', onReset);
  }, [activePanel, id, openOnForumToday]);

  useEffect(() => {
    if (!settingsReady || activeDay == null) return;
    loadProgram();
  }, [loadProgram, settingsReady, activeDay]);
  const publishedSet = new Set(publishedDays);
  const days = Array.from({ length: totalDays }, (_, i) => {
    const dayNum = i + 1;
    let status: DayStatus = 'future';
    if (dayNum < liveDay) status = 'done';
    else if (dayNum === liveDay) status = 'today';
    const scheduleLocked = activeTab === 'sched' && dayNum > liveDay && !publishedSet.has(dayNum);
    if (scheduleLocked) status = 'locked';
    const kbMeta = kbDays.find(d => d.day === dayNum);
    const kbSub = activeTab === 'kb' && kbMeta?.switcherLabel
      ? kbMeta.switcherLabel
      : (dayNum < currentDay ? '✓' : dayNum === currentDay ? '→' : '🔒');
    const weekday = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс', 'пн · отъезд'][i] || '';
    const schedSub = scheduleLocked
      ? 'скоро'
      : (dayNum < liveDay ? `✓ ${weekday}` : weekday);
    return {
      id: dayNum,
      title: `День ${dayNum}`,
      subtitle: activeTab === 'kb' ? kbSub : schedSub,
      status: activeTab === 'kb' && kbMeta?.kbStatus === 'locked' && dayNum > currentDay ? 'locked' as const : status,
    };
  });

  const handleRecClick = async (eventId: number) => {
    type Nested = NonNullable<ProgramEvent['children']>[number];
    const toDetail = (root: ProgramEvent, node: Nested): ProgramEvent => {
      const speakerNames = (node.speakers || []).map(s => s.name).filter(Boolean).join(', ');
      const nestedSub = [node.place, speakerNames].filter(Boolean).join(' · ');
      return {
        ...root,
        id: node.id,
        title: node.title,
        place: node.place || undefined,
        time: node.time,
        endTime: node.endTime,
        tags: node.tags,
        speakers: node.speakers,
        description: node.description,
        descriptionHtml: node.descriptionHtml,
        subtitle: nestedSub,
        hasSubSessions: false,
        children: [],
      };
    };
    const findNested = (
      nodes: Nested[] | undefined,
      id: number,
      ancestors: number[],
    ): { node: Nested; ancestors: number[] } | null => {
      for (const n of nodes || []) {
        if (n.id === id) return { node: n, ancestors };
        const deeper = findNested(n.children, id, [...ancestors, n.id]);
        if (deeper) return deeper;
      }
      return null;
    };

    let found: ProgramEvent | null = null;
    for (const root of slots.flatMap(s => s.events)) {
      if (root.id === eventId) {
        found = root;
        break;
      }
      const nested = findNested(root.children, eventId, [root.id]);
      if (nested) {
        setExpandedParents(prev => {
          const next = { ...prev };
          for (const aid of nested.ancestors) next[aid] = true;
          return next;
        });
        found = toDetail(root, nested.node);
        break;
      }
    }
    if (found) setSelectedEvent(found);
    try {
      await apiPost(`/program/events/${eventId}/attendance`);
    } catch {
      // attendance may already exist
    }
  };

  // Deep-link from event QR: #/program?event=ID&qr=TOKEN → validate + mark attendance
  useEffect(() => {
    if (activePanel !== id) return;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const qIdx = hash.indexOf('?');
    if (qIdx < 0) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const eventId = Number(params.get('event'));
    const qrToken = params.get('qr');
    if (!eventId || !qrToken) return;
    let cancelled = false;
    (async () => {
      try {
        await apiPost(`/program/events/${eventId}/attendance`, { qrToken });
        if (!cancelled) {
          // Strip qr params so refresh doesn't re-fire; keep panel
          const clean = hash.slice(0, qIdx);
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${clean || '#/program'}`);
        }
      } catch {
        /* invalid token or already attended */
      }
    })();
    return () => { cancelled = true; };
  }, [activePanel, id]);

  useEffect(() => {
    if (activePanel !== id) return;
    if (selectedEvent) {
      const html = selectedEvent.descriptionHtml?.trim()
        || (selectedEvent.description ? selectedEvent.description.replace(/\n/g, '<br/>') : '');
      const speakerText = (selectedEvent.speakers || [])
        .map(s => (s.credentials?.trim() ? `${s.name} — ${s.credentials.trim()}` : s.name))
        .filter(Boolean)
        .join(', ');
      setModal(
        <ModalRoot activeModal="event-detail" onClose={() => setSelectedEvent(null)}>
          <ModalPage id="event-detail" settlingHeight={100} onClose={() => setSelectedEvent(null)}>
            <ModalPageHeader>{selectedEvent.title}</ModalPageHeader>
            <Group>
              <Div className="m-prog-detail">
                <div className="m-prog-detail-meta">
                  <div className="m-prog-detail-row">
                    <span className="m-prog-detail-label">Время</span>
                    <span>
                      {selectedEvent.time}
                      {selectedEvent.endTime ? ` — ${selectedEvent.endTime}` : ''}
                    </span>
                  </div>
                  {selectedEvent.place && (
                    <div className="m-prog-detail-row">
                      <span className="m-prog-detail-label">Место</span>
                      <span>{selectedEvent.place}</span>
                    </div>
                  )}
                  {speakerText && (
                    <div className="m-prog-detail-row">
                      <span className="m-prog-detail-label">Спикеры</span>
                      <span>{speakerText}</span>
                    </div>
                  )}
                </div>
                {html && (
                  <div className="m-prog-detail-desc">
                    <div className="m-prog-detail-label">Описание</div>
                    <div
                      className="m-prog-detail-html"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  </div>
                )}
              </Div>
            </Group>
          </ModalPage>
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [selectedEvent, setModal, activePanel, id]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  return (
    <Panel id={id}>
      <PanelHeader fixed>Программа</PanelHeader>
      <Group>
        <Div>
          <ProgramTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <DaySwitcher
            days={days}
            activeDay={activeDay ?? liveDay}
            onDayChange={setActiveDay}
          />

          {!settingsReady || activeDay == null || loading ? <Spinner size="l" /> : error ? (
            <>
              <div className="m-card" style={{ color: '#C53030', marginTop: 12 }}>{error}</div>
              <Button style={{ marginTop: 8 }} onClick={loadProgram}>Повторить</Button>
            </>
          ) : activeTab === 'sched' ? (            <div style={{ marginTop: 12 }}>
              {activeDay === 8 ? (
                <div className="m-card" style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFECB3)', border: '1px solid #FFE082', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🎯</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>День 8 · Отъезд</div>
                  <div style={{ fontSize: 11, color: '#5D4B37', marginTop: 6, lineHeight: 1.4 }}>
                    Утро — Точка Б (финальная рефлексия). Дневная программа не запускается. Эксперимент дня не показывается.
                  </div>
                </div>
              ) : (
              <>
              {recommendations.length > 0 && (
                <div className="m-rec-block">
                  <div className="m-rec-block-hdr">Рекомендуем тебе</div>
                  {recommendations.map(r => {
                    const themeLine = r.matchedThemes?.length
                      ? `Тема: ${r.matchedThemes.join(' · ')}`
                      : (r.subtitle || '');
                    const meta = [r.time, r.place, themeLine].filter(Boolean).join(' · ');
                    return (
                    <div key={r.id} className="m-rec-item" onClick={() => handleRecClick(r.eventId || r.id)} style={{ cursor: 'pointer' }}>
                      <div className="m-rec-cb">✓</div>
                      <div style={{ flex: 1 }}>
                        <div className="m-rec-item-t">{r.title}</div>
                        {meta && (
                          <div className="m-rec-item-s">{meta}</div>
                        )}
                      </div>
                      <div className="m-rec-arr">›</div>
                    </div>
                    );
                  })}
                </div>
              )}
              {recommendations.length === 0 && recMeta && recMeta.interests.length > 0 && activeDay !== 8 && (
                <div className="m-card" style={{ marginBottom: 12, fontSize: 12, color: '#5D4B37', lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Персональные рекомендации</div>
                  {recMeta.publishedEventsCount === 0 ? (
                    <span>{recMeta.noEvents}</span>
                  ) : (
                    <span>{recMeta.noMatch}</span>
                  )}
                </div>
              )}
              {slots.length > 0 ? (
                <ProgramTimeline
                  slots={slots}
                  expandedParents={expandedParents}
                  onToggleParent={toggleParent}
                  onSelectEvent={setSelectedEvent}
                />
              ) : (
                <EmptyState
                  icon="📅"
                  title={!dayPublished ? 'Расписание ещё не опубликовано' : 'Расписание пусто'}
                  subtitle={
                    !dayPublished
                      ? 'Организаторы уже готовят программу — откроем расписание этого дня, когда оно будет опубликовано.'
                      : `События для дня ${activeDay} появятся позже`
                  }
                />
              )}
              </>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {kb?.dayTitle && (
                <div className="m-card" style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{kb.dayTitle}</div>
                  {kb.dayDescription && <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.4 }}>{kb.dayDescription}</div>}
                  <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
                    Точки осмысления: {kb.touchpointsCompleted ?? 0} / {kb.touchpointsTotal ?? 7}
                  </div>
                </div>
              )}
              <KnowledgeBasePanel kb={kb} />
            </div>
          )}
        </Div>
      </Group>
    </Panel>
  );
};
