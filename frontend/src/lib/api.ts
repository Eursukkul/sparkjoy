// Thin fetch wrapper for the backend API (proxied through /api by Next rewrites).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  // Session expired or token invalid → backend is the source of truth.
  if (response.status === 401 && window.location.pathname !== '/login') {
    // Clear the stale cookie first (logout is public), otherwise the Next
    // middleware sees a cookie on /login and bounces us straight back → loop.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(response.status, message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}

// --- API response types (mirror backend DTOs) ---

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface PostListItem {
  id: string;
  title: string;
  excerpt: string;
  postedAt: string;
  postedBy: string;
  tags: string[];
}

export interface PostDetail extends PostListItem {
  content: string;
}

export interface PostListResponse {
  items: PostListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface TagItem {
  name: string;
  postCount: number;
}
