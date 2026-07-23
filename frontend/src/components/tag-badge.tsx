export function TagBadge({
  tag,
  active = false,
  onClick,
}: {
  tag: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
  }`;

  // No onClick → render a span so the badge can live inside a <Link>
  // (a <button> inside an <a> is invalid HTML).
  if (!onClick) return <span className={className}>{tag}</span>;

  return (
    <button onClick={onClick} className={className}>
      {tag}
    </button>
  );
}
