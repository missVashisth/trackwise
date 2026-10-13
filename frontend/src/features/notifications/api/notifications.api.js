// API layer for in-app notifications.
//
//   GET   /api/notifications?page&limit        -> { notifications, page, limit, hasMore }
//   GET   /api/notifications/unread-count      -> { count }
//   PATCH /api/notifications/:id/read          -> { notification }
//   PATCH /api/notifications/read-all          -> { updated }
//
//   Notification { _id, type, title, message, metadata, readAt | null, createdAt }

import { http } from "../../../lib/http.js";

const toNotification = ({ _id, ...rest }) => ({ id: _id, ...rest });

export const notificationsApi = {
  async list({ page = 1, limit = 10 } = {}) {
    const result = await http.get(`/notifications?page=${page}&limit=${limit}`);
    return { ...result, notifications: result.notifications.map(toNotification) };
  },
  unreadCount: () => http.get("/notifications/unread-count"),
  markRead: (id) => http.patch(`/notifications/${id}/read`),
  markAllRead: () => http.patch("/notifications/read-all"),
};
