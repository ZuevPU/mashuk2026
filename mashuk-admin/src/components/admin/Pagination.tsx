type Props = {
  page: number;
  total: number;
  limit?: number;
  setPage: (p: number) => void;
};

export function Pagination({ page, total, limit = 50, setPage }: Props) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div className="adm-crud-pagination">
      <button type="button" className="adm-btn adm-btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
      <span className="adm-muted">Страница {page} из {pages} (всего: {total})</span>
      <button type="button" className="adm-btn adm-btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Вперед</button>
    </div>
  );
}
