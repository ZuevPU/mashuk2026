import React, { useState, useEffect, useCallback } from 'react';
import { Panel, PanelHeader, Group, Div, Spinner, Button, ModalRoot, ModalPage, ModalPageHeader } from '@vkontakte/vkui';
import { ProgramTabs } from '../components/program/ProgramTabs';
import { useAppModal } from '../App';
import { DaySwitcher } from '../components/program/DaySwitcher';
import { TimelineEvent } from '../components/program/TimelineEvent';
import { KnowledgeBasePanel } from '../components/program/KnowledgeBase';
import { EmptyState } from '../components/EmptyState';
import { apiGet, apiPost, ApiError } from '../api/client';
type DayStatus = 'done' | 'today' | 'future';

interface ProgramEvent {
  id: number;
  time: string;
  endTime?: string;
  title: string;
  subtitle: string;
  description?: string;
  place?: string;
  tags?: string[];
  status: 'past' | 'now' | 'future';
}

interface ProgramSlot {
  timeSlot: string;
  parallel: boolean;
  events: ProgramEvent[];
}

export const ProgramPanel: React.FC<{ id: string }> = ({ id }) => {
  const { setModal } = useAppModal();
  const [activeTab, setActiveTab] = useState<'sched' | 'kb'>('sched');
  const [activeDay, setActiveDay] = useState(1);
  const [totalDays, setTotalDays] = useState(8);
  const [currentDay, setCurrentDay] = useState(1);
  const [slots, setSlots] = useState<ProgramSlot[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [kb, setKb] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ProgramEvent | null>(null);

  const loadProgram = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ slots: ProgramSlot[] }>(`/program?day=${activeDay}`),
      apiGet<{ recommendations: any[] }>(`/program/recommendations?day=${activeDay}`),
      apiGet<any>(`/program/knowledge-base?day=${activeDay}`),
    ]).then(([prog, rec, knowledge]) => {
      setSlots(prog.slots || []);
      setRecommendations(rec.recommendations);
      setKb(knowledge);
    }).catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить программу');
    }).finally(() => setLoading(false));
  }, [activeDay]);

  useEffect(() => {
    apiGet<{ currentDay: number; totalDays: number }>('/program/settings')
      .then(s => {
        setCurrentDay(s.currentDay);
        setTotalDays(s.totalDays);
        setActiveDay(s.currentDay);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить настройки программы');
      });
  }, []);

  useEffect(() => {
    loadProgram();
  }, [loadProgram]);
  const days = Array.from({ length: totalDays }, (_, i) => {
    const dayNum = i + 1;
    let status: DayStatus = 'future';
    if (dayNum < currentDay) status = 'done';
    else if (dayNum === currentDay) status = 'today';
    const weekday = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс', 'пн · отъезд'][i] || '';
    return {
      id: dayNum,
      title: `День ${dayNum}`,
      subtitle: dayNum < currentDay ? `✓ ${weekday}` : weekday,
      status,
    };
  });

  const handleRecClick = async (eventId: number) => {
    try {
      await apiPost(`/program/events/${eventId}/attendance`);
    } catch {
      // attendance may already exist
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      setModal(
        <ModalRoot activeModal="event-detail" onClose={() => setSelectedEvent(null)}>
          <ModalPage id="event-detail" onClose={() => setSelectedEvent(null)}>
            <ModalPageHeader>{selectedEvent.title}</ModalPageHeader>
            <Group>
              <div style={{ fontSize: 12 }}>{selectedEvent.time}{selectedEvent.endTime ? ` — ${selectedEvent.endTime}` : ''}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{selectedEvent.place || selectedEvent.subtitle}</div>
              {selectedEvent.description && <div style={{ fontSize: 12, marginTop: 8 }}>{selectedEvent.description}</div>}
            </Group>
          </ModalPage>
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [selectedEvent, setModal]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  return (
    <Panel id={id}>
      <PanelHeader>Программа</PanelHeader>
      <Group>
        <Div>
          <ProgramTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <DaySwitcher days={days} activeDay={activeDay} onDayChange={setActiveDay} />

          {loading ? <Spinner size="l" /> : error ? (
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
                  {recommendations.map(r => (
                    <div key={r.id} className="m-rec-item" onClick={() => handleRecClick(r.eventId || r.id)} style={{ cursor: 'pointer' }}>
                      <div className="m-rec-cb">✓</div>
                      <div style={{ flex: 1 }}>
                        <div className="m-rec-item-t">{r.title}</div>
                        <div className="m-rec-item-s">{r.subtitle}</div>
                      </div>
                      <div className="m-rec-arr">›</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="m-tl-wrap">
                {slots.map(slot => (
                  <div key={slot.timeSlot}>
                    {slot.parallel ? (
                      <div className="m-parallel-scroll">
                        {slot.events.map(e => (
                          <div key={e.id} style={{ minWidth: 200, flex: '0 0 auto' }}>
                            <TimelineEvent
                              time={e.time}
                              title={e.title}
                              subtitle={e.subtitle}
                              tags={e.tags}
                              status={e.status}
                              onClick={() => setSelectedEvent(e)}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      slot.events.map(e => (
                        <TimelineEvent
                          key={e.id}
                          time={e.time}
                          title={e.title}
                          subtitle={e.subtitle}
                          tags={e.tags}
                          status={e.status}
                          onClick={() => setSelectedEvent(e)}
                        />
                      ))
                    )}
                  </div>
                ))}
                {slots.length === 0 && (
                  <EmptyState icon="📅" title="Расписание пусто" subtitle={`События для дня ${activeDay} появятся позже`} />
                )}
              </div>
              </>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <KnowledgeBasePanel kb={kb} />
            </div>
          )}
        </Div>
      </Group>
    </Panel>
  );
};
