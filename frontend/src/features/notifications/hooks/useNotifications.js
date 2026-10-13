// Hooks layer for the notification bell. Only the bell uses this state, so it lives in the hook
// rather than in an app-wide store.

import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi } from "../api/notifications.api.js";
import { errorMessage } from "../../../lib/errors.js";

const PAGE_SIZE = 10;
// Light polling for the badge; skipped while the tab is hidden.
const POLL_INTERVAL_MS = 60_000;

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await notificationsApi.unreadCount();
      if (mounted.current) setUnreadCount(count);
    } catch {
      // The badge is best-effort; the list shows errors when opened.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    // First fetch right after mount, then light polling.
    const first = setTimeout(refreshIfVisible, 0);
    const timer = setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      mounted.current = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [refreshCount]);

  const loadFirstPage = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [result] = await Promise.all([notificationsApi.list({ page: 1, limit: PAGE_SIZE }), refreshCount()]);
      setItems(result.notifications);
      setPage(1);
      setHasMore(result.hasMore);
      setStatus("ready");
    } catch (err) {
      setError(errorMessage(err));
      setStatus("error");
    }
  }, [refreshCount]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await notificationsApi.list({ page: page + 1, limit: PAGE_SIZE });
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...result.notifications.filter((n) => !seen.has(n.id))];
      });
      setPage(page + 1);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const markRead = useCallback(
    async (notification) => {
      if (notification.readAt) return;
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await notificationsApi.markRead(notification.id);
      } catch (err) {
        setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: null } : n)));
        setError(errorMessage(err));
        refreshCount();
      }
    },
    [refreshCount],
  );

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const previous = items;
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
    } catch (err) {
      setItems(previous);
      setError(errorMessage(err));
      refreshCount();
    }
  }, [items, refreshCount]);

  return {
    unreadCount,
    items,
    hasMore,
    status,
    loadingMore,
    error,
    loadFirstPage,
    loadMore,
    markRead,
    markAllRead,
    clearError: () => setError(null),
  };
}
