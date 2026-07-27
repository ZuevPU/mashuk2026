import { label } from '../../labels/ru';

export function EnumOptions({ values }: { values: string[] }) {
  return (
    <>
      {values.map(v => (
        <option key={v} value={v}>{label(v)}</option>
      ))}
    </>
  );
}
