export const ROLE_OPTIONS: { key: string; name: string }[] = [
  { key: 'meaning_researcher', name: 'Исследователь смыслов' },
  { key: 'practice_realizer', name: 'Реализатор практики' },
  { key: 'communication_guide', name: 'Проводник коммуникации' },
  { key: 'content_packer', name: 'Упаковщик содержания' },
  { key: 'process_navigator', name: 'Навигатор процесса' },
  { key: 'environment_keeper', name: 'Хранитель среды' },
];

export function roleName(key: string): string {
  return ROLE_OPTIONS.find(r => r.key === key)?.name ?? key;
}
