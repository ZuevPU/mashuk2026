import { vkProfileUrl } from '../labels/ru';

export function VkProfileLink({ vkId }: { vkId?: string | number | null }) {
  if (vkId == null || vkId === '') return <>—</>;
  const href = vkProfileUrl(vkId);
  if (!href) return <>{vkId}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="adm-vk-link"
      title="Открыть профиль ВКонтакте"
      onClick={e => e.stopPropagation()}
    >
      {vkId}
    </a>
  );
}
