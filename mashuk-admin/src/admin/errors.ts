export function translateApiError(message: string): string {
  if (message.includes('No token in response')) return 'Сервер не вернул токен';
  if (message.includes('Not authenticated')) return 'Не авторизован';
  if (message.includes('Session expired')) return 'Сессия истекла. Войдите снова.';
  if (message.includes('Tag has links')) {
    return 'Интерес используется в событиях, материалах или у участников. Удалите принудительно или объедините с другим.';
  }
  if (message.includes('Insufficient permissions')) {
    return 'Недостаточно прав для этого действия.';
  }
  if (message.includes('VITE_API_URL is not set')) {
    return 'Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.';
  }
  if (message.includes('API returned HTML instead of JSON')) {
    return 'API вернул HTML вместо JSON. Проверьте VITE_API_URL в Timeweb Apps и пересоберите админку.';
  }
  if (message.startsWith('HTTP ')) return `Ошибка сервера: ${message}`;
  return message;
}
