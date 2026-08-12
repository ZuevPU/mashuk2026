import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import {
  cloneDiagQuestions,
  DEFAULT_DIAG_MATRIX,
  DEFAULT_DIAG_QUESTIONS,
  coerceGoalQuestions,
  DEFAULT_GOAL_QUESTIONS,
  DEFAULT_INTEREST_GROUPS,
} from './constants';
import { AdviceCatalogSection } from './AdviceCatalogSection';
import { GoalsStepEditor } from './GoalsStepEditor';
import { InterestsStepEditor } from './InterestsStepEditor';
import { OnboardingPreview } from './OnboardingPreview';
import { RolesListSection } from './RolesListSection';
import { RoleDiagnosticEditor } from './RoleDiagnosticEditor';
import {
  ONBOARDING_STEPS,
  type AdminRole,
  type GoalQuestion,
  type OnboardingStep,
  type RoleDiagnosticsConfig,
} from './types';

const ONBOARDING_NAV: HubNavItem[] = [
  { id: 'onboarding-hero', label: 'Обзор' },
  { id: 'onboarding-content', label: 'Шаг' },
];

function snapshotConfig(cfg: RoleDiagnosticsConfig): string {
  return JSON.stringify(cfg);
}

export function OnboardingTab({ adminFetch, act, reloadKey, onOpenProgram }: AdminTabProps & { onOpenProgram?: () => void }) {
  const [step, setStep] = useState<OnboardingStep>('goals');
  const [loading, setLoading] = useState(true);

  const [goalQuestions, setGoalQuestions] = useState<GoalQuestion[]>(() => (
    DEFAULT_GOAL_QUESTIONS.map(q => ({ ...q, options: [...q.options] }))
  ));
  const [interestGroups, setInterestGroups] = useState(
    () => DEFAULT_INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] })),
  );
  const [interestMin, setInterestMin] = useState(5);
  const [interestMax, setInterestMax] = useState(8);
  const [diagQuestions, setDiagQuestions] = useState(() => cloneDiagQuestions(DEFAULT_DIAG_QUESTIONS));
  const [diagMatrix, setDiagMatrix] = useState<string[][]>(() => DEFAULT_DIAG_MATRIX.map(r => [...r]));
  const [savedConfigJson, setSavedConfigJson] = useState('');

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [adviceRoleFilter, setAdviceRoleFilter] = useState('');
  const [adviceFilterVersion, setAdviceFilterVersion] = useState(0);

  const currentConfig = useMemo((): RoleDiagnosticsConfig => ({
    goalQuestions,
    interestGroups,
    interestMin,
    interestMax,
    questions: diagQuestions,
    optionToRole: diagMatrix,
  }), [goalQuestions, interestGroups, interestMin, interestMax, diagQuestions, diagMatrix]);

  const configDirty = snapshotConfig(currentConfig) !== savedConfigJson;

  const goalsDirty = useMemo(() => {
    if (!savedConfigJson) return false;
    try {
      const saved = JSON.parse(savedConfigJson) as RoleDiagnosticsConfig;
      return JSON.stringify(saved.goalQuestions) !== JSON.stringify(goalQuestions);
    } catch {
      return configDirty;
    }
  }, [savedConfigJson, goalQuestions, configDirty]);

  const interestsDirty = useMemo(() => {
    if (!savedConfigJson) return false;
    try {
      const saved = JSON.parse(savedConfigJson) as RoleDiagnosticsConfig;
      return JSON.stringify(saved.interestGroups) !== JSON.stringify(interestGroups)
        || (saved.interestMin ?? 5) !== interestMin
        || (saved.interestMax ?? 8) !== interestMax;
    } catch {
      return configDirty;
    }
  }, [savedConfigJson, interestGroups, interestMin, interestMax, configDirty]);

  const diagDirty = useMemo(() => {
    if (!savedConfigJson) return false;
    try {
      const saved = JSON.parse(savedConfigJson) as RoleDiagnosticsConfig;
      return JSON.stringify(saved.questions) !== JSON.stringify(diagQuestions)
        || JSON.stringify(saved.optionToRole) !== JSON.stringify(diagMatrix);
    } catch {
      return configDirty;
    }
  }, [savedConfigJson, diagQuestions, diagMatrix, configDirty]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, fs] = await Promise.all([
        adminFetch('/roles'),
        adminFetch('/forum-settings'),
      ]);
      setRoles(rolesRes.roles || []);

      const cfg = fs.settings?.roleDiagnosticsConfig || {};
      const gq = coerceGoalQuestions(cfg.goalQuestions);
      const legacyDiag = Array.isArray(cfg.questions)
        && cfg.questions.length === 6
        && cfg.questions.every((q: { options?: unknown }) => Array.isArray(q?.options) && q.options.length === 4);
      const dq = !legacyDiag && Array.isArray(cfg.questions) && cfg.questions.length >= 1
        ? cloneDiagQuestions(cfg.questions)
        : cloneDiagQuestions(DEFAULT_DIAG_QUESTIONS);
      const matrix = legacyDiag ? DEFAULT_DIAG_MATRIX : cfg.optionToRole;
      const dm = dq.map((q, qi) => {
        const row = Array.isArray(matrix?.[qi]) ? [...matrix[qi]] : [...(DEFAULT_DIAG_MATRIX[qi] || DEFAULT_DIAG_MATRIX[0])];
        while (row.length < q.options.length) {
          row.push(DEFAULT_DIAG_MATRIX[qi]?.[row.length % 6] || 'meaning_researcher');
        }
        return row.slice(0, q.options.length);
      });
      const ig = Array.isArray(cfg.interestGroups) && cfg.interestGroups.length > 0
        ? cfg.interestGroups.map((g: { title: string; tags: string[] }) => ({
          title: g.title,
          tags: [...g.tags],
        }))
        : DEFAULT_INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] }));
      let imin = Number(cfg.interestMin);
      let imax = Number(cfg.interestMax);
      if (!Number.isFinite(imin)) imin = 5;
      if (!Number.isFinite(imax)) imax = 8;
      imin = Math.max(1, Math.min(20, Math.floor(imin)));
      imax = Math.max(1, Math.min(30, Math.floor(imax)));
      if (imin > imax) [imin, imax] = [imax, imin];

      setDiagMatrix(dm);
      setGoalQuestions(gq);
      setDiagQuestions(dq);
      setInterestGroups(ig);
      setInterestMin(imin);
      setInterestMax(imax);
      setSavedConfigJson(snapshotConfig({
        goalQuestions: gq,
        interestGroups: ig,
        interestMin: imin,
        interestMax: imax,
        questions: dq,
        optionToRole: dm,
      }));
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const goalsValid = goalQuestions.every((q) => {
    if (!q.text.trim()) return false;
    if (q.type === 'choice' || q.type === 'multi') {
      return q.options.map(o => o.trim()).filter(Boolean).length >= 2;
    }
    return true;
  });

  const saveConfig = (msg: string) =>
    act(async () => {
      if (!goalsValid) {
        throw new Error('В целях: у каждого вопроса нужен текст; для выбора — минимум 2 варианта ответа');
      }
      const payload: RoleDiagnosticsConfig = {
        ...currentConfig,
        goalQuestions: goalQuestions.map(q => ({
          id: q.id,
          text: q.text.trim(),
          type: q.type,
          options: q.type === 'open'
            ? []
            : q.options.map(o => o.trim()).filter(Boolean),
          allowOther: q.type !== 'open' && q.allowOther ? true : undefined,
          otherLabel: q.type !== 'open' && q.allowOther
            ? (q.otherLabel?.trim() || 'Свой вариант')
            : undefined,
          showWhen: q.showWhen?.questionId && q.showWhen.options?.length
            ? {
              questionId: q.showWhen.questionId,
              options: q.showWhen.options,
            }
            : null,
        })),
      };
      await adminFetch('/forum-settings', {
        method: 'PATCH',
        body: JSON.stringify({ roleDiagnosticsConfig: payload }),
      });
      setGoalQuestions(payload.goalQuestions);
      setSavedConfigJson(snapshotConfig(payload));
    }, msg);

  const saveAllConfig = () => saveConfig('Вся регистрация (config) сохранена');

  const openAdviceForRole = (roleKey: string) => {
    setAdviceRoleFilter(roleKey);
    setAdviceFilterVersion(v => v + 1);
    setStep('advice');
  };

  const stepDirty = (id: OnboardingStep) => {
    if (id === 'goals') return goalsDirty;
    if (id === 'interests') return interestsDirty;
    if (id === 'diag') return diagDirty;
    return false;
  };

  if (loading) {
    return <p className="adm-muted">Загрузка конструктора регистрации…</p>;
  }

  return (
    <HubLensLayout className="adm-forum adm-onboarding adm-kb" items={ONBOARDING_NAV} navLabel="Разделы регистрации">
      <section id="onboarding-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Регистрация"
          hint="Порядок для участника: регистрация → цели → интересы → диагностика роли → приложение."
        >
          <div className="adm-forum-seg">
            {ONBOARDING_STEPS.map(s => (
              <button
                key={s.id}
                type="button"
                className={step === s.id ? 'on' : ''}
                onClick={() => setStep(s.id)}
              >
                {s.label}{stepDirty(s.id) ? ' ·' : ''}
              </button>
            ))}
          </div>
          {configDirty && (
            <div className="adm-forum-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button
                type="button"
                className="adm-btn adm-btn-primary adm-btn-sm"
                disabled={!goalsValid}
                onClick={saveAllConfig}
                title={goalsValid ? undefined : 'Сначала исправьте вопросы в шаге «Цели»'}
              >
                Сохранить всё
              </button>
            </div>
          )}
        </AdminPageHero>
      </section>

      <section id="onboarding-content" className="adm-forum-anchor">
        {step === 'goals' && (
          <GoalsStepEditor
            questions={goalQuestions}
            onChange={setGoalQuestions}
            onSave={() => saveConfig('Цели сохранены')}
            dirty={goalsDirty}
          />
        )}
        {step === 'interests' && (
          <InterestsStepEditor
            groups={interestGroups}
            interestMin={interestMin}
            interestMax={interestMax}
            onChange={setInterestGroups}
            onLimitsChange={(min, max) => {
              setInterestMin(min);
              setInterestMax(max);
            }}
            onSave={() => saveConfig('Интересы сохранены')}
            dirty={interestsDirty}
            onOpenProgram={onOpenProgram}
          />
        )}
        {step === 'diag' && (
          <RoleDiagnosticEditor
            questions={diagQuestions}
            matrix={diagMatrix}
            onQuestionsChange={setDiagQuestions}
            onMatrixChange={setDiagMatrix}
            onSave={() => saveConfig('Диагностика сохранена')}
            dirty={diagDirty}
          />
        )}
        {step === 'roles' && (
          <RolesListSection
            roles={roles}
            adminFetch={adminFetch}
            act={(fn, msg) => act(fn, msg)}
            onRolesUpdated={setRoles}
            onViewAdviceForRole={openAdviceForRole}
          />
        )}
        {step === 'advice' && (
          <AdviceCatalogSection
            adminFetch={adminFetch}
            act={(fn, msg) => act(fn, msg)}
            initialRoleFilter={adviceRoleFilter}
            filterVersion={adviceFilterVersion}
          />
        )}
        {step === 'preview' && (
          <OnboardingPreview
            goalQuestions={goalQuestions}
            interestGroups={interestGroups}
            diagQuestions={diagQuestions}
            roles={roles}
          />
        )}
      </section>
    </HubLensLayout>
  );
}
