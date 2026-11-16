import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';

export const notificationRouter = Router();

// GET /api/notifications - Fetch user's notifications & unread count (polled every 30s)
notificationRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const userNotifs = db.state.notifications
      .filter((n) => n.recipientId === req.user!.sub)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((n) => ({
        ...n,
        sender: db.getAuthorBrief(n.senderId),
      }));

    const unreadCount = userNotifs.filter((n) => !n.isRead).length;

    res.status(200).json({
      notifications: userNotifs,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all - Mark all notifications as read
notificationRouter.patch('/read-all', requireAuth, (req, res, next) => {
  try {
    db.state.notifications = db.state.notifications.map((n) =>
      n.recipientId === req.user!.sub ? { ...n, isRead: true } : n
    );
    db.save();

    res.status(200).json({
      unreadCount: 0,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
notificationRouter.patch('/:id/read', requireAuth, (req, res, next) => {
  try {
    const notif = db.state.notifications.find(
      (n) => n._id === req.params.id && n.recipientId === req.user!.sub
    );
    if (!notif) {
      throw new HttpError(404, 'Không tìm thấy thông báo.');
    }

    db.state.notifications = db.state.notifications.map((n) =>
      n._id === notif._id ? { ...n, isRead: true } : n
    );
    db.save();

    const unreadCount = db.state.notifications.filter(
      (n) => n.recipientId === req.user!.sub && !n.isRead
    ).length;

    res.status(200).json({
      notification: { ...notif, isRead: true },
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});
