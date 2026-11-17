import { Router } from 'express';
import { db } from '../db.ts';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';
import {
  canViewPost,
  computeSuggestedUsers,
  searchUsersByQuery,
} from '../../frontend/utils/travelRules.ts';
import type { NotificationItem } from '../../frontend/types/travel.ts';

export const userRouter = Router();

// GET /api/users - List users, search users (?q=...), or get suggested users (?suggested=true)
userRouter.get('/', optionalAuth, (req, res, next) => {
  try {
    const suggestedOnly = req.query.suggested === 'true';
    const searchQuery = String(req.query.q || '').trim();
    const sanitizedUsers = db.state.users.map((u) => db.sanitizeUser(u));

    if (searchQuery) {
      const matched = searchUsersByQuery(sanitizedUsers, searchQuery, 20);
      res.status(200).json({ users: matched });
      return;
    }

    if (suggestedOnly) {
      const suggestions = computeSuggestedUsers(
        sanitizedUsers,
        req.user?.sub ?? null,
        5
      );
      res.status(200).json({ users: suggestions });
      return;
    }

    res.status(200).json({ users: sanitizedUsers });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/profile - Update current user's profile and avatar
userRouter.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const userRecord = db.state.users.find((u) => u._id === req.user!.sub);
    if (!userRecord) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }

    const { fullName, username, bio, homeCity, avatar } = req.body ?? {};
    if (fullName !== undefined && String(fullName).trim().length < 2) {
      throw new HttpError(400, 'Họ và tên cần tối thiểu 2 ký tự.');
    }

    let nextUsername = userRecord.username;
    if (username !== undefined) {
      const normalizedUsername = String(username).trim().toLowerCase();
      if (!/^[a-zA-Z0-9._]{3,24}$/.test(normalizedUsername)) {
        throw new HttpError(
          400,
          'Tên người dùng (username) cần từ 3-24 ký tự, chỉ gồm chữ cái, số, dấu chấm hoặc gạch dưới.'
        );
      }
      const duplicateUser = db.state.users.find(
        (u) =>
          u._id !== userRecord._id &&
          u.username.toLowerCase() === normalizedUsername
      );
      if (duplicateUser) {
        throw new HttpError(400, 'Tên người dùng (username) này đã được sử dụng.');
      }
      nextUsername = normalizedUsername;
    }

    if (bio !== undefined && String(bio).length > 300) {
      throw new HttpError(400, 'Giới thiệu bản thân tối đa 300 ký tự.');
    }

    const nextFullName =
      fullName !== undefined ? String(fullName).trim() : userRecord.fullName;
    const nextHomeCity =
      homeCity !== undefined
        ? String(homeCity).trim() || 'Việt Nam'
        : userRecord.homeCity;
    const nextBio = bio !== undefined ? String(bio).trim() : userRecord.bio;
    const nextAvatar =
      avatar !== undefined && String(avatar).trim()
        ? String(avatar).trim()
        : userRecord.avatar || `/api/media/avatar/${encodeURIComponent(nextFullName)}`;

    const updatedUser = {
      ...userRecord,
      fullName: nextFullName,
      username: nextUsername,
      bio: nextBio,
      homeCity: nextHomeCity,
      avatar: nextAvatar,
    };

    db.state.users = db.state.users.map((u) =>
      u._id === userRecord._id ? updatedUser : u
    );
    await db.saveAsync();

    res.status(200).json({
      user: db.sanitizeUser(updatedUser),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/settings - Lưu cấu hình Cài đặt (Privacy, Content preferences, Supervision, Security)
userRouter.put('/settings', requireAuth, async (req, res, next) => {
  try {
    const userIdx = db.state.users.findIndex((u) => u._id === req.user!.sub);
    if (userIdx < 0) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }

    const currentUser = db.state.users[userIdx];
    const body = req.body ?? {};
    const prevSettings = currentUser.settings ?? {
      privateProfile: false,
      tagsAndMentions: 'everyone',
      onlineStatus: 'everyone',
      restrictedProfiles: [],
      privateLikes: false,
      hiddenWords: [],
      hideLikeAndShareCounts: false,
      yourAlgoTopics: ['Du lịch biển đảo', 'Ẩm thực bản địa', 'Leo núi & Trekking', 'Văn hóa di sản'],
      sensitiveContent: 'standard',
      politicalContent: false,
      teenSupervisionEnabled: false,
      dailyTimeLimitMinutes: 0,
      sleepModeEnabled: false,
      twoFactorEmailOtp: false,
      loginAlerts: true,
    };

    const nextSettings = {
      ...prevSettings,
      ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
    };

    const nextMessagePrivacy =
      body.messagePrivacy === 'mutual' || body.messagePrivacy === 'everyone'
        ? body.messagePrivacy
        : currentUser.messagePrivacy ?? 'everyone';

    const nextBlockedUsers = Array.isArray(body.blockedUsers)
      ? body.blockedUsers.map(String)
      : currentUser.blockedUsers ?? [];

    const nextMutedConversations = Array.isArray(body.mutedConversations)
      ? body.mutedConversations.map(String)
      : currentUser.mutedConversations ?? [];

    const updatedUser = {
      ...currentUser,
      messagePrivacy: nextMessagePrivacy,
      blockedUsers: nextBlockedUsers,
      mutedConversations: nextMutedConversations,
      settings: nextSettings,
    };

    db.state.users[userIdx] = updatedUser;
    await db.saveAsync();

    res.status(200).json({
      user: db.sanitizeUser(updatedUser),
      message: 'Đã lưu cài đặt tài khoản.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id - Get member profile + visible posts
userRouter.get('/:id', optionalAuth, (req, res, next) => {
  try {
    const targetUser = db.state.users.find(
      (u) => u._id === req.params.id || u.username === req.params.id
    );
    if (!targetUser) {
      throw new HttpError(404, 'Không tìm thấy trang cá nhân của thành viên này.');
    }

    const viewerId = req.user?.sub ?? null;
    const viewerRole = req.user?.role ?? null;

    const visiblePosts = db.state.posts
      .filter(
        (p) =>
          p.authorId === targetUser._id &&
          canViewPost(p, targetUser.followers, viewerId, viewerRole)
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((p) => db.populatePost(p));

    const mapMemberDetail = (fid: string) => {
      const found = db.state.users.find((u) => u._id === fid);
      if (found) return db.sanitizeUser(found);
      const brief = db.getAuthorBrief(fid);
      return {
        ...brief,
        email: '',
        bio: '',
        homeCity: 'Việt Nam',
        followers: [],
        following: [],
        createdAt: new Date().toISOString(),
      };
    };

    const followersList = targetUser.followers.map(mapMemberDetail);
    const followingList = targetUser.following.map(mapMemberDetail);

    res.status(200).json({
      user: db.sanitizeUser(targetUser),
      posts: visiblePosts,
      followersList,
      followingList,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/follow - Follow or Unfollow a member
userRouter.post('/:id/follow', requireAuth, (req, res, next) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.user!.sub;

    if (targetId === currentUserId) {
      throw new HttpError(400, 'Bạn không thể tự theo dõi chính mình.');
    }

    const targetUser = db.state.users.find((u) => u._id === targetId);
    const currentUser = db.state.users.find((u) => u._id === currentUserId);

    if (!targetUser || !currentUser) {
      throw new HttpError(404, 'Không tìm thấy thành viên.');
    }

    const isCurrentlyFollowing = currentUser.following.includes(targetUser._id);

    const nextFollowing = isCurrentlyFollowing
      ? currentUser.following.filter((id) => id !== targetUser._id)
      : [...new Set([...currentUser.following, targetUser._id])];

    const nextFollowers = isCurrentlyFollowing
      ? targetUser.followers.filter((id) => id !== currentUserId)
      : [...new Set([...targetUser.followers, currentUserId])];

    db.state.users = db.state.users.map((u) => {
      if (u._id === currentUserId) return { ...u, following: nextFollowing };
      if (u._id === targetUser._id) return { ...u, followers: nextFollowers };
      return u;
    });

    if (!isCurrentlyFollowing) {
      const notif: NotificationItem = {
        _id: `n_${Date.now()}_f`,
        recipientId: targetUser._id,
        senderId: currentUserId,
        type: 'follow',
        message: 'đã bắt đầu theo dõi nhật ký hành trình của bạn.',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      db.state.notifications = [notif, ...db.state.notifications];
    }

    db.save();

    res.status(200).json({
      following: !isCurrentlyFollowing,
      targetFollowers: nextFollowers,
      userFollowing: nextFollowing,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/lock - Admin locks or unlocks user account
userRouter.patch('/:id/lock', requireAdmin, (req, res, next) => {
  try {
    const targetUser = db.state.users.find((u) => u._id === req.params.id);
    if (!targetUser) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }
    if (targetUser.role === 'admin') {
      throw new HttpError(400, 'Không thể khóa tài khoản Quản trị viên.');
    }

    const nextLocked =
      req.body?.isLocked !== undefined
        ? Boolean(req.body.isLocked)
        : !targetUser.isLocked;

    const updatedUser = {
      ...targetUser,
      isLocked: nextLocked,
    };

    db.state.users = db.state.users.map((u) =>
      u._id === targetUser._id ? updatedUser : u
    );
    db.save();

    res.status(200).json({
      user: db.sanitizeUser(updatedUser),
      message: nextLocked
        ? `Đã khóa tài khoản @${targetUser.username}.`
        : `Đã mở khóa tài khoản @${targetUser.username}.`,
    });
  } catch (err) {
    next(err);
  }
});
