import { Router } from 'express';
import { db } from '../db.ts';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';
import { aggregateTopLocations } from '../../frontend/utils/travelRules.ts';
import type { PostReport } from '../../frontend/types/travel.ts';

export const reportRouter = Router();
export const statsRouter = Router();

// POST /api/reports - Member reports a post
reportRouter.post('/', requireAuth, (req, res, next) => {
  try {
    const { postId, reason, details } = req.body ?? {};
    if (!postId || !reason || String(reason).trim().length < 3) {
      throw new HttpError(400, 'Vui lòng chọn lý do báo cáo bài viết.');
    }

    const post = db.state.posts.find((p) => p._id === String(postId));
    if (!post) {
      throw new HttpError(404, 'Không tìm thấy bài viết cần báo cáo.');
    }

    const newReport: PostReport = {
      _id: `r_${Date.now()}`,
      postId: post._id,
      reporterId: req.user!.sub,
      reason: String(reason).trim(),
      details: details ? String(details).trim() : '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    db.state.reports = [newReport, ...db.state.reports];
    db.save();

    res.status(201).json({
      report: newReport,
      message: 'Đã gửi báo cáo tới Ban quản trị để xem xét.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports - Admin lists reported posts
reportRouter.get('/', requireAdmin, (_req, res, next) => {
  try {
    const populated = db.state.reports
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((r) => {
        const post = db.state.posts.find((p) => p._id === r.postId);
        return {
          ...r,
          post: post
            ? {
                _id: post._id,
                title: post.title,
                location: post.location,
                authorId: post.authorId,
                status: post.status,
              }
            : undefined,
          reporter: db.getAuthorBrief(r.reporterId),
        };
      });

    res.status(200).json({ reports: populated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reports/:id - Admin resolves or dismisses a report
reportRouter.patch('/:id', requireAdmin, (req, res, next) => {
  try {
    const report = db.state.reports.find((r) => r._id === req.params.id);
    if (!report) {
      throw new HttpError(404, 'Không tìm thấy báo cáo vi phạm.');
    }

    const action = String(req.body?.action || 'resolve'); // 'hide_post' | 'restore_post' | 'dismiss'
    let nextReportStatus: PostReport['status'] = 'resolved';

    if (action === 'hide_post') {
      db.state.posts = db.state.posts.map((p) =>
        p._id === report.postId ? { ...p, status: 'hidden' } : p
      );
      nextReportStatus = 'resolved';
    } else if (action === 'restore_post') {
      db.state.posts = db.state.posts.map((p) =>
        p._id === report.postId ? { ...p, status: 'active' } : p
      );
      nextReportStatus = 'dismissed';
    } else if (action === 'dismiss') {
      nextReportStatus = 'dismissed';
    }

    const updatedReport: PostReport = {
      ...report,
      status: nextReportStatus,
      resolvedAt: new Date().toISOString(),
    };

    db.state.reports = db.state.reports.map((r) =>
      r._id === report._id ? updatedReport : r
    );
    db.save();

    res.status(200).json({
      report: updatedReport,
      message:
        action === 'hide_post'
          ? 'Đã ẩn bài viết vi phạm và đóng báo cáo.'
          : 'Đã cập nhật trạng thái báo cáo.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/locations - Top mentioned destinations
statsRouter.get('/locations', optionalAuth, (req, res, next) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const locations = aggregateTopLocations(db.state.posts, limit);

    res.status(200).json({
      locations,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/overview - System overview counts
statsRouter.get('/overview', optionalAuth, (_req, res, next) => {
  try {
    const locations = aggregateTopLocations(db.state.posts, 10);
    const totalLikes = db.state.posts.reduce((sum, p) => sum + p.likes.length, 0);

    res.status(200).json({
      counts: {
        users: db.state.users.length,
        posts: db.state.posts.filter((p) => p.status === 'active').length,
        comments: db.state.comments.length,
        notifications: db.state.notifications.length,
        pendingReports: db.state.reports.filter((r) => r.status === 'pending').length,
        totalLikes,
      },
      topLocations: locations,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/database-records - Chỉ Admin mới được truy vấn bản ghi cơ sở dữ liệu
statsRouter.get('/database-records', requireAdmin, (_req, res) => {
  res.status(200).json({
    users: db.state.users.map((u) => db.sanitizeUser(u)),
    posts: db.state.posts,
    comments: db.state.comments,
    notifications: db.state.notifications,
    reports: db.state.reports,
  });
});

// POST /api/stats/reset-seed - Chỉ Admin mới được khôi phục dữ liệu mẫu
statsRouter.post('/reset-seed', requireAdmin, (_req, res, next) => {
  try {
    db.resetToSeed();
    res.status(200).json({
      message: 'Đã khôi phục dữ liệu mẫu (Seed Data) về trạng thái ban đầu.',
    });
  } catch (err) {
    next(err);
  }
});
