import { FormItem, Radio, Checkbox, Textarea, Input } from '@vkontakte/vkui';
import {
  type GoalQuestion,
  parseMultiGoalAnswer,
  joinMultiGoalAnswer,
  isGoalQuestionVisible,
  pruneHiddenGoalAnswers,
  isOtherGoalAnswer,
} from '../../data/onboarding';

type Props = {
  questions: GoalQuestion[];
  answers: string[];
  onChange: (next: string[]) => void;
  openPlaceholder?: string;
};

export function GoalQuestionsFields({
  questions,
  answers,
  onChange,
  openPlaceholder = 'Ответь свободно, 1–2 предложения',
}: Props) {
  const setAnswer = (index: number, value: string) => {
    const next = [...answers];
    while (next.length < questions.length) next.push('');
    next[index] = value;
    onChange(pruneHiddenGoalAnswers(questions, next));
  };

  let visibleOrdinal = 0;

  return (
    <>
      {questions.map((q, i) => {
        if (!isGoalQuestionVisible(questions, answers, i)) return null;
        visibleOrdinal += 1;
        const title = `${visibleOrdinal}. ${q.text.trim() || 'Вопрос'}`;
        const otherLabel = q.otherLabel || 'Свой вариант';
        const answer = answers[i] || '';

        if (q.type === 'choice') {
          const otherOn = isOtherGoalAnswer(q, answer);
          const otherText = otherOn ? answer : '';
          return (
            <FormItem key={q.id} top={title} topMultiline>
              {q.options.map(opt => (
                <Radio
                  key={opt}
                  checked={!otherOn && answer === opt}
                  onChange={() => setAnswer(i, opt)}
                  style={{ marginBottom: 6 }}
                >
                  {opt}
                </Radio>
              ))}
              {q.allowOther && (
                <>
                  <Radio
                    checked={otherOn}
                    onChange={() => setAnswer(i, otherText || ' ')}
                    style={{ marginBottom: 6 }}
                  >
                    {otherLabel}
                  </Radio>
                  {otherOn && (
                    <Textarea
                      value={otherText.trim() ? otherText : ''}
                      onChange={e => setAnswer(i, e.target.value)}
                      placeholder="Введите свой вариант…"
                      style={{ marginTop: 4 }}
                    />
                  )}
                </>
              )}
            </FormItem>
          );
        }

        if (q.type === 'multi') {
          const selected = parseMultiGoalAnswer(answer);
          const customParts = selected.filter(p => !q.options.includes(p));
          const otherOn = customParts.length > 0;
          const otherText = customParts[0] || '';
          const toggleOpt = (opt: string) => {
            const withoutCustom = selected.filter(p => q.options.includes(p));
            const nextSel = withoutCustom.includes(opt)
              ? withoutCustom.filter(v => v !== opt)
              : [...withoutCustom, opt];
            if (otherOn && otherText.trim()) nextSel.push(otherText.trim());
            setAnswer(i, joinMultiGoalAnswer(nextSel));
          };
          return (
            <FormItem key={q.id} top={`${title} (можно несколько)`} topMultiline>
              {q.options.map(opt => (
                <Checkbox
                  key={opt}
                  checked={selected.includes(opt)}
                  onChange={() => toggleOpt(opt)}
                  style={{ marginBottom: 6 }}
                >
                  {opt}
                </Checkbox>
              ))}
              {q.allowOther && (
                <>
                  <Checkbox
                    checked={otherOn}
                    onChange={() => {
                      const base = selected.filter(p => q.options.includes(p));
                      if (otherOn) setAnswer(i, joinMultiGoalAnswer(base));
                      else setAnswer(i, joinMultiGoalAnswer([...base, ' ']));
                    }}
                    style={{ marginBottom: 6 }}
                  >
                    {otherLabel}
                  </Checkbox>
                  {otherOn && (
                    <Input
                      value={otherText.trim() ? otherText : ''}
                      onChange={e => {
                        const base = selected.filter(p => q.options.includes(p));
                        const t = e.target.value;
                        setAnswer(i, joinMultiGoalAnswer(t.trim() ? [...base, t] : base));
                      }}
                      placeholder="Введите свой вариант…"
                    />
                  )}
                </>
              )}
            </FormItem>
          );
        }

        return (
          <FormItem key={q.id} top={title} topMultiline>
            <Textarea
              value={answer}
              onChange={e => setAnswer(i, e.target.value)}
              placeholder={openPlaceholder}
            />
          </FormItem>
        );
      })}
    </>
  );
}
