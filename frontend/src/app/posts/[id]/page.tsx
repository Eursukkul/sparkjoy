'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/components/header';
import { TagBadge } from '@/components/tag-badge';
import { api, ApiError, PostDetail } from '@/lib/api';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' });

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: post, isPending, error } = useQuery({
    queryKey: ['post', id],
    queryFn: () => api<PostDetail>(`/posts/${id}`),
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Back to posts
        </Link>

        {isPending && (
          <div className="mt-4 space-y-3">
            <div className="h-8 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            {error instanceof ApiError && error.status === 404
              ? 'This post does not exist.'
              : 'Failed to load the post.'}
          </div>
        )}

        {post && (
          <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-bold sm:text-3xl">{post.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {post.postedBy} · {dateFormat.format(new Date(post.postedAt))}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}>
                  <TagBadge tag={tag} />
                </Link>
              ))}
            </div>
            {/* Safe by design: content was sanitized server-side at seed time
                (script tags, event handlers and javascript: URLs are stripped
                before the HTML ever reaches the database). */}
            <div
              className="prose prose-slate mt-6 max-w-none"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        )}
      </main>
    </>
  );
}
