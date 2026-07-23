import Link from 'next/link';
import { PostListItem } from '@/lib/api';
import { TagBadge } from './tag-badge';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function PostCard({ post, onTagClick }: { post: PostListItem; onTagClick: (tag: string) => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <Link href={`/posts/${post.id}`}>
        <h2 className="text-lg font-semibold hover:underline">{post.title}</h2>
      </Link>
      <p className="mt-1 text-xs text-slate-500">
        {post.postedBy} · {dateFormat.format(new Date(post.postedAt))}
      </p>
      <p className="mt-2 line-clamp-3 text-sm text-slate-700">{post.excerpt}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {post.tags.map((tag) => (
          <TagBadge key={tag} tag={tag} onClick={() => onTagClick(tag)} />
        ))}
      </div>
    </article>
  );
}
