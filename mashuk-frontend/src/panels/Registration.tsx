import React, { useState, useEffect, useMemo } from 'react';
import {
  Panel, PanelHeader, Group, FormItem, CustomSelect, Button, Div, Cell,
  Snackbar, Input, Textarea, Checkbox, Progress,
} from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost } from '../api/client';
import {
  GOAL_QUESTIONS, INTEREST_GROUPS, DIAGNOSTIC_QUESTIONS, ROLE_CATALOG, scoreRoleClient, RoleKey,
} from '../data/onboarding';

type ApiRole = {
  roleKey: string;
  name: string;
  quadrant?: string;
  essence?: string;
  inClass?: string;
  keywords?: string;
};

interface RegistrationPanelProps {
  id: string;
  fetchedUser: UserInfo | null;
  isRegistered: boolean;
  onRegistered?: () => void;
}

interface Direction {
  id: number;
  name: string;
}

const DEV_FIRST_NAME = 'Тест';
const DEV_LAST_NAME = 'Пользователь';

type WizardStep = 1 | 2 | 3 | 4 | 'result' | 'confirm';

export const RegistrationPanel: React.FC<RegistrationPanelProps> = ({
  id, fetchedUser, isRegistered, onRegistered,
}) => {
  const routeNavigator = useRouteNavigator();
  const [step, setStep] = useState<WizardStep>(1);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [directionId, setDirectionId] = useState<number | null>(null);
  const [age, setAge] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [position, setPosition] = useState('');
  const [consentPd, setConsentPd] = useState(false);
  const [consentAnalytics, setConsentAnalytics] = useState(false);
  const [consentPdMeta, setConsentPdMeta] = useState<{ version: number; title: string; body: string } | null>(null);
  const [consentAnalyticsMeta, setConsentAnalyticsMeta] = useState<{ version: number; title: string; body: string } | null>(null);
  const [groupAssignMode, setGroupAssignMode] = useState<'list' | 'auto'>('list');
  const [groups, setGroups] = useState<{ id: number; name: string; seatsLeft: number | null }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [goalAnswers, setGoalAnswers] = useState<string[]>(['', '', '', '', '']);
  const [interests, setInterests] = useState<string[]>([]);
  const [roleAnswers, setRoleAnswers] = useState<(number | null)[]>([null, null, null, null, null, null]);
  const [diagIndex, setDiagIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalQuestions, setGoalQuestions] = useState<string[]>([...GOAL_QUESTIONS]);
  const [interestGroups, setInterestGroups] = useState<Array<{ title: string; tags: string[] }>>(
    INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] })),
  );
  const [diagQuestions, setDiagQuestions] = useState<Array<{ text: string; options: string[] }>>(
    DIAGNOSTIC_QUESTIONS.map(q => ({ text: q.text, options: [...q.options] })),
  );
  const [diagOptionToRole, setDiagOptionToRole] = useState<RoleKey[][] | null>(null);
  const [apiRoles, setApiRoles] = useState<ApiRole[] | null>(null);

  const firstName = fetchedUser?.first_name || DEV_FIRST_NAME;
  const lastName = fetchedUser?.last_name || DEV_LAST_NAME;

  const scoredRole = useMemo(() => {
    if (roleAnswers.some(a => a === null)) return null;
    return scoreRoleClient(roleAnswers as number[], diagOptionToRole ?? undefined);
  }, [roleAnswers, diagOptionToRole]);

  type RoleDisplay = {
    roleKey: RoleKey;
    name: string;
    quadrant: string;
    essence: string;
    inClass: string;
    keywords: string;
  };

  const mergeRoleEntry = (catalogEntry: typeof ROLE_CATALOG[number]): RoleDisplay => {
    const fromApi = apiRoles?.find(r => r.roleKey === catalogEntry.roleKey);
    if (fromApi) {
      return {
        roleKey: fromApi.roleKey as RoleKey,
        name: fromApi.name || catalogEntry.name,
        quadrant: fromApi.quadrant || catalogEntry.quadrant,
        essence: fromApi.essence || catalogEntry.essence,
        inClass: fromApi.inClass || catalogEntry.inClass,
        keywords: fromApi.keywords || catalogEntry.keywords,
      };
    }
    return catalogEntry;
  };

  const roleMeta = useMemo((): RoleDisplay | null => {
    if (!scoredRole) return null;
    const catalogEntry = ROLE_CATALOG.find(r => r.roleKey === scoredRole);
    if (!catalogEntry) return null;
    return mergeRoleEntry(catalogEntry);
  }, [scoredRole, apiRoles]);

  const otherRoles = useMemo((): RoleDisplay[] => {
    if (!roleMeta) return [];
    return ROLE_CATALOG.filter(r => r.roleKey !== roleMeta.roleKey).map(mergeRoleEntry);
  }, [roleMeta, apiRoles]);

  useEffect(() => {
    if (isRegistered) {
      routeNavigator.replace('/');
    }
  }, [isRegistered, routeNavigator]);

  useEffect(() => {
    apiGet<{ directions: Direction[] }>('/directions')
      .then(data => setDirections(data.directions))
      .catch(() => setError('Не удалось загрузить направления'));
    apiGet<{
      pd: { version: number; title: string; body: string };
      analytics: { version: number; title: string; body: string };
    }>('/consents/active')
      .then(data => {
        setConsentPdMeta(data.pd);
        setConsentAnalyticsMeta(data.analytics);
      })
      .catch(() => undefined);
    apiGet<{
      groupAssignMode?: string;
      groups?: { id: number; name: string; seatsLeft: number | null }[];
      goalQuestions?: string[];
      interestGroups?: Array<{ title: string; tags: string[] }>;
      roles?: ApiRole[];
      diagnostics?: {
        questions?: Array<{ text: string; options: string[] }>;
        optionToRole?: RoleKey[][];
      };
    }>('/auth/onboarding-meta')
      .then(data => {
        setGroupAssignMode((data.groupAssignMode as 'list' | 'auto') || 'list');
        setGroups(data.groups || []);
        if (data.goalQuestions?.length === 5) {
          setGoalQuestions(data.goalQuestions);
          setGoalAnswers(data.goalQuestions.map(() => ''));
        }
        if (data.interestGroups?.length) {
          setInterestGroups(data.interestGroups.map(g => ({ title: g.title, tags: [...g.tags] })));
        }
        if (data.diagnostics?.questions?.length === 6) {
          setDiagQuestions(data.diagnostics.questions.map(q => ({
            text: q.text,
            options: [...q.options],
          })));
        }
        if (data.diagnostics?.optionToRole?.length === 6) {
          setDiagOptionToRole(data.diagnostics.optionToRole);
        }
        if (data.roles?.length) setApiRoles(data.roles);
      })
      .catch(() => undefined);
  }, []);

  const progressValue = step === 'result' || step === 'confirm' ? 100 : ((step as number) / 4) * 100;

  const canGoStep1 = Boolean(
    directionId && age && Number(age) >= 14 && Number(age) <= 100
    && workplace.trim() && position.trim() && consentPd && consentAnalytics
    && (groupAssignMode !== 'list' || groups.length === 0 || groupId),
  );
  const canGoStep2 = goalQuestions.every((_, i) => (goalAnswers[i] || '').trim().length > 0);
  const canGoStep3 = interests.length >= 5 && interests.length <= 8;
  const canGoStep4 = roleAnswers[diagIndex] !== null;

  const toggleInterest = (tag: string) => {
    setInterests(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= 8) return prev;
      return [...prev, tag];
    });
  };

  const handleFinish = async () => {
    if (!directionId || !scoredRole || roleAnswers.some(a => a === null)) return;
    setLoading(true);
    setError(null);
    try {
      await apiPost('/auth/onboarding', {
        firstName,
        lastName,
        age: Number(age),
        directionId,
        workplace: workplace.trim(),
        position: position.trim(),
        consentPd: true,
        consentAnalytics: true,
        consentPdVersion: consentPdMeta?.version,
        consentAnalyticsVersion: consentAnalyticsMeta?.version,
        groupId: groupAssignMode === 'list' ? groupId : undefined,
        goalAnswers: goalAnswers.map(a => a.trim()),
        interests,
        roleAnswers,
      });
      void import('../utils/pushNotifications.js').then(m => m.requestVkPushPermission());
      onRegistered?.();
      routeNavigator.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка онбординга');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader>Онбординг</PanelHeader>
      <Group>
        <Div>
          <Progress value={progressValue} />
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            {step === 'confirm' ? 'Проверка данных' : step === 'result' ? 'Роль определена' : `Шаг ${step} из 4`}
          </div>
        </Div>

        {step === 1 && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Привет! Давай знакомиться</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                Заполни базовые поля — это займёт пару минут.
              </p>
            </Div>
            <Cell subtitle="ФИО из ВКонтакте">{firstName} {lastName}</Cell>
            <FormItem top="Возраст *">
              <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="34" />
            </FormItem>
            <FormItem top="Направление *">
              <CustomSelect
                placeholder="Выберите направление"
                options={directions.map(d => ({ label: d.name, value: d.id }))}
                value={directionId ?? undefined}
                onChange={e => setDirectionId(Number(e.target.value))}
              />
            </FormItem>
            <FormItem top="Место работы *">
              <Input value={workplace} onChange={e => setWorkplace(e.target.value)} placeholder="Школа №…, город" />
            </FormItem>
            <FormItem top="Должность / деятельность *">
              <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="Учитель истории…" />
            </FormItem>
            {groupAssignMode === 'list' && groups.length > 0 && (
              <FormItem top="Группа *">
                <CustomSelect
                  placeholder="Выберите группу"
                  options={groups.map(g => ({
                    label: g.seatsLeft != null ? `${g.name} (мест: ${g.seatsLeft})` : g.name,
                    value: g.id,
                  }))}
                  value={groupId ?? undefined}
                  onChange={e => setGroupId(Number(e.target.value))}
                />
              </FormItem>
            )}
            <FormItem top="Согласия *">
              <Checkbox checked={consentPd} onChange={e => setConsentPd(e.target.checked)}>
                {consentPdMeta?.title || 'Согласен на обработку персональных данных'}
                {consentPdMeta?.version ? ` (v${consentPdMeta.version})` : ''}
              </Checkbox>
              {consentPdMeta?.body && (
                <div style={{ fontSize: 11, color: '#666', margin: '4px 0 10px', lineHeight: 1.4 }}>{consentPdMeta.body}</div>
              )}
              <Checkbox checked={consentAnalytics} onChange={e => setConsentAnalytics(e.target.checked)}>
                {consentAnalyticsMeta?.title || 'Согласен на обезличенную аналитику ответов'}
                {consentAnalyticsMeta?.version ? ` (v${consentAnalyticsMeta.version})` : ''}
              </Checkbox>
              {consentAnalyticsMeta?.body && (
                <div style={{ fontSize: 11, color: '#666', margin: '4px 0 10px', lineHeight: 1.4 }}>{consentAnalyticsMeta.body}</div>
              )}
            </FormItem>
            <Button size="l" stretched disabled={!canGoStep1} onClick={() => setStep(2)}>
              Дальше → Целеполагание
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Точка А</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                Эти же вопросы мы зададим на последний день, чтобы ты увидел, как изменился за смену.
              </p>
            </Div>
            {goalQuestions.map((q, i) => (
              <FormItem key={i} top={`${i + 1}. ${q}`}>
                <Textarea
                  value={goalAnswers[i]}
                  onChange={e => {
                    const next = [...goalAnswers];
                    next[i] = e.target.value;
                    setGoalAnswers(next);
                  }}
                  placeholder="Ответь свободно, 1–2 предложения"
                />
              </FormItem>
            ))}
            <Button size="l" stretched disabled={!canGoStep2} onClick={() => setStep(3)}>
              Дальше → Интересы
            </Button>
            <Button size="l" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setStep(1)}>
              ← Назад
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Твои интересы</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                Выбери 5–8 тегов — по ним бот будет подбирать события и материалы.
              </p>
            </Div>
            {interestGroups.map(group => (
              <Div key={group.title}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{group.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {group.tags.map(tag => {
                    const on = interests.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleInterest(tag)}
                        className={`m-itag ${on ? 'on' : ''}`}
                        style={{
                          border: on ? '1.5px solid #FF5500' : '1px solid #ddd',
                          background: on ? '#FFF3E0' : '#fff',
                          color: on ? '#B8621A' : '#333',
                          borderRadius: 20,
                          padding: '6px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </Div>
            ))}
            <Div style={{ fontSize: 12, color: interests.length >= 5 ? '#2F855A' : '#C53030' }}>
              {interests.length >= 5 ? `✓ Выбрано ${interests.length} из ≥5` : `Выбрано ${interests.length} — нужно минимум 5`}
            </Div>
            <Button size="l" stretched disabled={!canGoStep3} onClick={() => { setDiagIndex(0); setStep(4); }}>
              Дальше → Диагностика роли
            </Button>
            <Button size="l" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setStep(2)}>
              ← Назад
            </Button>
          </>
        )}

        {step === 4 && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Диагностика роли</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                Вопрос {diagIndex + 1} из 6
              </p>
            </Div>
            <Div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                {diagQuestions[diagIndex]?.text}
              </div>
              {(diagQuestions[diagIndex]?.options || []).map((opt, oi) => {
                const selected = roleAnswers[diagIndex] === oi;
                return (
                  <div
                    key={oi}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const next = [...roleAnswers];
                      next[diagIndex] = oi;
                      setRoleAnswers(next);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        const next = [...roleAnswers];
                        next[diagIndex] = oi;
                        setRoleAnswers(next);
                      }
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: selected ? '1.5px solid #FF5500' : '1px solid #e5e5e5',
                      background: selected ? '#FFF8F0' : '#fff',
                      marginBottom: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {opt}
                  </div>
                );
              })}
            </Div>
            <Button
              size="l"
              stretched
              disabled={!canGoStep4}
              onClick={() => {
                if (diagIndex < 5) setDiagIndex(diagIndex + 1);
                else setStep('result');
              }}
            >
              {diagIndex < 5 ? 'Следующий вопрос →' : 'Узнать роль →'}
            </Button>
            <Button
              size="l"
              stretched
              mode="secondary"
              style={{ marginTop: 8 }}
              onClick={() => {
                if (diagIndex > 0) setDiagIndex(diagIndex - 1);
                else setStep(3);
              }}
            >
              ← Назад
            </Button>
          </>
        )}

        {step === 'result' && roleMeta && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 12px', fontSize: 20, lineHeight: 1.35 }}>
                Твоя стартовая роль: {roleMeta.name}
              </h2>
              <div
                className="m-card"
                style={{
                  background: 'linear-gradient(135deg,#FFF8E7,#D8F3DC)',
                  border: '1.5px solid #2D6A4F',
                }}
              >
                {roleMeta.quadrant && (
                  <div style={{ fontSize: 12, color: '#B8621A', marginBottom: 10, fontWeight: 600 }}>
                    {roleMeta.quadrant}
                  </div>
                )}
                <div className="pb-lbl">Суть</div>
                <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 12px' }}>{roleMeta.essence}</p>
                <div className="pb-lbl">Проявления</div>
                <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 12px' }}>{roleMeta.inClass}</p>
                <div className="pb-lbl">Ключевые слова</div>
                <p style={{ fontSize: 13, margin: 0, color: '#555' }}>{roleMeta.keywords}</p>
              </div>
            </Div>

            <Div>
              <div className="pb-lbl" style={{ marginBottom: 8 }}>Другие роли в матрице</div>
              <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px', lineHeight: 1.4 }}>
                Листай карточки — так проще увидеть контекст команды.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  margin: '0 -4px',
                  WebkitOverflowScrolling: 'touch',
                  scrollSnapType: 'x mandatory',
                }}
              >
                {otherRoles.map(r => (
                  <div
                    key={r.roleKey}
                    className="m-card"
                    style={{
                      minWidth: 240,
                      maxWidth: 260,
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{r.name}</div>
                    {r.quadrant && (
                      <div style={{ fontSize: 11, color: '#B8621A', marginTop: 4 }}>{r.quadrant}</div>
                    )}
                    <p style={{ fontSize: 12, color: '#555', margin: '8px 0 0', lineHeight: 1.4 }}>
                      {r.essence}
                    </p>
                    <p style={{ fontSize: 11, color: '#888', margin: '6px 0 0' }}>{r.keywords}</p>
                  </div>
                ))}
              </div>
            </Div>

            <Button size="l" stretched onClick={() => setStep('confirm')}>
              Дальше
            </Button>
            <Button size="l" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => { setDiagIndex(0); setStep(4); }}>
              ← Пересмотреть диагностику
            </Button>
          </>
        )}

        {step === 'confirm' && roleMeta && (
          <>
            <Div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Проверь данные</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                После подтверждения регистрация сохранится и откроется главная.
              </p>
            </Div>
            <Div className="m-card" style={{ fontSize: 13, lineHeight: 1.5 }}>
              <div><b>ФИО:</b> {firstName} {lastName}</div>
              <div><b>Возраст:</b> {age}</div>
              <div><b>Направление:</b> {directions.find(d => d.id === directionId)?.name || '—'}</div>
              <div><b>Место работы:</b> {workplace}</div>
              <div><b>Должность:</b> {position}</div>
              {groupAssignMode === 'list' && (
                <div><b>Группа:</b> {groups.find(g => g.id === groupId)?.name || 'авто'}</div>
              )}
              <div style={{ marginTop: 8 }}><b>Стартовая роль:</b> {roleMeta.name}</div>
              <div style={{ marginTop: 8 }}><b>Интересы:</b> {interests.join(', ')}</div>
              <div style={{ marginTop: 8 }}><b>Точка А:</b></div>
              {goalAnswers.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  {i + 1}. {a.slice(0, 120)}{a.length > 120 ? '…' : ''}
                </div>
              ))}
            </Div>
            <Button size="l" stretched loading={loading} onClick={handleFinish}>
              Подтвердить и начать смену →
            </Button>
            <Button size="l" stretched mode="secondary" style={{ marginTop: 8 }} onClick={() => setStep('result')}>
              ← Назад к ролям
            </Button>
          </>
        )}
      </Group>

      {error && (
        <Snackbar onClose={() => setError(null)} onClosed={() => setError(null)}>
          {error}
        </Snackbar>
      )}
    </Panel>
  );
};
