'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, User } from '@/lib/api';

export function Header() {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User }>('/auth/me'),
    staleTime: Infinity, // identity doesn't change during a session
  });

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login'; // full reload clears all client caches
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          SparkJoy Posts
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {data && <span className="text-slate-500">{data.user.name}</span>}
          <button
            onClick={logout}
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
