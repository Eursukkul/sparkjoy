export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="flex items-center justify-between text-sm">
      <p className="text-slate-500">
        Page {page} of {totalPages} · {total.toLocaleString()} posts
      </p>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
