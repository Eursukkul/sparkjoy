'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Pagination } from '@/components/pagination';
import { PostCard } from '@/components/post-card';
import { TagBadge } from '@/components/tag-badge';
import { api, PostListResponse, TagItem } from '@/lib/api';

const SEARCH_DEBOUNCE_MS = 400;

function PostsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL is the single source of truth: back button, refresh and shared links all work.
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const tag = searchParams.get('tag') ?? '';
  const search = searchParams.get('search') ?? '';

  const [searchInput, setSearchInput] = useState(search);

  const updateQuery = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === 1) params.delete(key);
      else params.set(key, String(value));
    }
    // Changing a filter always jumps back to page 1 — page N of the old
    // result set is meaningless in the new one.
    if (!('page' in updates)) params.delete('page');
    router.replace(params.size ? `/?${params}` : '/');
  };

  // Debounced search → URL
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => updateQuery({ search: searchInput || null }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const postsQuery = useQuery({
    queryKey: ['posts', { page, tag, search }],
    // signal → typing fast or paging quickly aborts the superseded request
    // instead of leaving it in flight for a result nobody reads.
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (tag) params.set('tag', tag);
      if (search) params.set('search', search);
      return api<PostListResponse>(`/posts?${params}`, { signal });
    },
    placeholderData: (previous) => previous, // keep the old page visible while the next loads
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api<TagItem[]>('/tags'),
    staleTime: Infinity, // tags are seed data — they never change at runtime
  });

  const toggleTag = (name: string) => updateQuery({ tag: name === tag ? null : name });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <input
          type="search"
          placeholder="Search posts by title…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />

        {tagsQuery.data && (
          <div className="flex flex-wrap gap-1.5">
            {tagsQuery.data.map((t) => (
              <TagBadge key={t.name} tag={`${t.name} (${t.postCount})`} active={t.name === tag} onClick={() => toggleTag(t.name)} />
            ))}
          </div>
        )}

        {postsQuery.isPending && (
          <div className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        )}

        {postsQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Failed to load posts.{' '}
            <button onClick={() => postsQuery.refetch()} className="font-medium underline">
              Retry
            </button>
          </div>
        )}

        {postsQuery.data?.items.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No posts found{tag && ` for tag “${tag}”`}{search && ` matching “${search}”`}.
          </div>
        )}

        {postsQuery.data && postsQuery.data.items.length > 0 && (
          <>
            <div className={`space-y-4 ${postsQuery.isPlaceholderData ? 'opacity-60' : ''}`}>
              {postsQuery.data.items.map((post) => (
                <PostCard key={post.id} post={post} onTagClick={toggleTag} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={postsQuery.data.meta.totalPages}
              total={postsQuery.data.meta.total}
              onPageChange={(next) => updateQuery({ page: next })}
            />
          </>
        )}
      </main>
    </>
  );
}

export default function Page() {
  // useSearchParams requires a Suspense boundary in the app router
  return (
    <Suspense>
      <PostsPage />
    </Suspense>
  );
}
