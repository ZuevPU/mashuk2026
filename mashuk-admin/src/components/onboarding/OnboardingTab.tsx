import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import {
  cloneDiagQuestions,
  DEFAULT_DIAG_MATRIX,
  DEFAULT_DIAG_QUESTIONS,
  DEFAULT_GOAL_QUESTIONS,
  DEFAULT_INTEREST_GROUPS,
} from './constants';
import { DayAdviceEditor, type AdviceForm } from './DayAdviceEditor';
import { GoalsStepEditor } from './GoalsStepEditor';
import { InterestsStepEditor } from './InterestsStepEditor';
import { OnboardingPreview } from './OnboardingPreview';
import { RoleCatalogEditor } from './RoleCatalogEditor';
import { RoleDiagnosticEditor } from './RoleDiagnosticEditor';
import {
  ONBOARDING_STEPS,
  type AdminRole,
  type DayExperiment,
  type OnboardingStep,
  type RoleDiagnosticsConfig,
} from './types';

function snapshotConfig(cfg: RoleDiagnosticsConfig): string {
  return JSON.stringify(cfg);
}

export function OnboardingTab({ adminFetch, act, reloadKey, onOpenProgram }: AdminTabProps & { onOpenProgram?: () => void }) {
  const [step, setStep] = useState<OnboardingStep>('goals');
  const [loading, setLoading] = useState(true);

  const [goalQuestions, setGoalQuestions] = useState<string[]>([...DEFAULT_GOAL_QUESTIONS]);
  const [interestGroups, setInterestGroups] = useState(
    () => DEFAULT_INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] })),
  );
  const [diagQuestions, setDiagQuestions] = useState(() => cloneDiagQuestions(DEFAULT_DIAG_QUESTIONS));
  const [diagMatrix, setDiagMatrix] = useState<string[][]>(() => DEFAULT_DIAG_MATRIX.map(r => [...r]));
  const [savedConfigJson, setSavedConfigJson] = useState('');

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [dayExperiments, setDayExperiments] = useState<DayExperiment[]>([]);
  const [expForm, setExpForm] = useState<AdviceForm>({
    dayNumber: 2,
    roleKey: 'meaning_researcher',
    title: '',
    body: '',
    hint: '',
  });

  const currentConfig = useMemo((): RoleDiagnosticsConfig => ({
    goalQuestions,
    interestGroups,
    questions: diagQuestions,
    optionToRole: diagMatrix,
  }), [goalQuestions, interestGroups, diagQuestions, diagMatrix]);

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
      return JSON.stringify(saved.interestGroups) !== JSON.stringify(interestGroups);
    } catch {
      return configDirty;
    }
  }, [savedConfigJson, interestGroups, configDirty]);

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
      const [rolesRes, expRes, fs] = await Promise.all([
        adminFetch('/roles'),
        adminFetch('/day-experiments'),
        adminFetch('/forum-settings'),
      ]);
      setRoles(rolesRes.roles || []);
      setDayExperiments(expRes.experiments || []);

      const cfg = fs.settings?.roleDiagnosticsConfig || {};
      const matrix = cfg.optionToRole;
      const dm = Array.isArray(matrix) && matrix.length === 6
        ? matrix.map((r: string[]) => [...r])
        : DEFAULT_DIAG_MATRIX.map(r => [...r]);
      const gq = Array.isArray(cfg.goalQuestions) && cfg.goalQuestions.length === 5
        ? [...cfg.goalQuestions]
        : [...DEFAULT_GOAL_QUESTIONS];
      const dq = Array.isArray(cfg.questions) && cfg.questions.length === 6
        ? cloneDiagQuestions(cfg.questions)
        : cloneDiagQuestions(DEFAULT_DIAG_QUESTIONS);
      const ig = Array.isArray(cfg.interestGroups) && cfg.interestGroups.length > 0
        ? cfg.interestGroups.map((g: { title: string; tags: string[] }) => ({
          title: g.title,
          tags: [...g.tags],
        }))
        : DEFAULT_INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] }));

      setDiagMatrix(dm);
      setGoalQuestions(gq);
      setDiagQuestions(dq);
      setInterestGroups(ig);
      setSavedConfigJson(snapshotConfig({
        goalQuestions: gq,
        interestGroups: ig,
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

  const saveConfig = (msg: string) =>
    act(async () => {
      await adminFetch('/forum-settings', {
        method: 'PATCH',
        body: JSON.stringify({ roleDiagnosticsConfig: currentConfig }),
      });
      setSavedConfigJson(snapshotConfig(currentConfig));
    }, msg);

  const saveAllConfig = () => saveConfig('Весь онбординг (config) сохранён');

  const refreshExperiments = async () => {
    const expRes = await adminFetch('/day-experiments');
    setDayExperiments(expRes.experiments || []);
  };

  const stepDirty = (id: OnboardingStep) => {
    if (id === 'goals') return goalsDirty;
    if (id === 'interests') return interestsDirty;
    if (id === 'diag') return diagDirty;
    return false;
  };

  if (loading) {
    return <p className="adm-muted">Загрузка конструктора онбординга…</p>;
  }

  return (
    <div className="adm-forum adm-onboarding">
      <div className="adm-forum-hero card">
        <h2 className="adm-forum-hero-title">Конструктор онбординга</h2>
        <p className="adm-forum-hint">
          Порядок для участника: регистрация → цели (Точка А) → интересы → диагностика роли → дальше приложение.
        </p>
        <div className="adm-seg adm-forum-day-seg adm-onboarding-seg">
          {ONBOARDING_STEPS.map(s => (
            <button
              key={s.id}
              type="button"
              className={step === s.id ? 'on' : ''}
              onClick={() => setStep(s.id)}
            >
              {s.label}{stepDirty(s.id) ? ' •' : ''}
            </button>
          ))}
        </div>
        {configDirty && (
          <div className="adm-forum-actions" style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn" onClick={saveAllConfig}>
              Сохранить всё (config) •
            </button>
          </div>
        )}
      </div>

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
          onChange={setInterestGroups}
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
        <RoleCatalogEditor
          roles={roles}
          adminFetch={adminFetch}
          act={(fn, msg) => act(fn, msg)}
          onRolesUpdated={setRoles}
        />
      )}
      {step === 'advice' && (
        <DayAdviceEditor
          experiments={dayExperiments}
          form={expForm}
          onFormChange={setExpForm}
          onSave={() => act(async () => {
            await adminFetch('/day-experiments', {
              method: 'POST',
              body: JSON.stringify(expForm),
            });
            await refreshExperiments();
          }, 'Совет сохранён')}
          onDelete={id => act(async () => {
            await adminFetch(`/day-experiments/${id}`, { method: 'DELETE' });
            await refreshExperiments();
          }, 'Удалено')}
          onEditLoad={e => setExpForm({
            dayNumber: e.dayNumber,
            roleKey: e.roleKey,
            title: e.title,
            body: e.body || '',
            hint: e.hint || '',
          })}
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
    </div>
  );
}
