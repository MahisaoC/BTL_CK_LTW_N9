import { Router, type Response } from 'express';
import { db } from '../db.ts';
import {
  requireAuth,
  resolveTokenToUser,
} from '../middleware/authMiddleware.ts';
import { deleteMessageFromMongo } from '../models/mongooseSchemas.ts';
import type {
  ConversationSummary,
  DirectMessage,
} from '../../frontend/types/travel.ts';
import { evaluateUserOnlineVisibility } from '../../frontend/utils/travelRules.ts';

export const messageRouter = Router();

const generateMessageId = (): string =>
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Quản lý kết nối Server-Sent Events (SSE) và thời điểm hoạt động thực tế (Online Presence) theo userId.
 * Chỉ những tài khoản đang mở phiên kết nối thực tế (SSE) hoặc vừa tương tác API xác thực trong 90 giây
 * mới được ghi nhận là Đang hoạt động (Online).
 */
const sseClientsByUser = new Map<string, Set<Response>>();
const lastActiveByUser = new Map<string, number>();
const ONLINE_RECENT_WINDOW_MS = 90_000;

export const markUserActivePresence = (userId: string) => {
  if (!userId) return;
  lastActiveByUser.set(userId, Date.now());
};

export const clearUserActivePresence = (userId: string) => {
  if (!userId) return;
  lastActiveByUser.delete(userId);
  const existing = sseClientsByUser.get(userId);
  if (existing) {
    sseClientsByUser.delete(userId);
  }
  broadcastPresenceUpdate(userId);
};

const isUserActivelyConnectedOrRecent = (userId: string): boolean => {
  const activeStreams = sseClientsByUser.get(userId)?.size ?? 0;
  if (activeStreams > 0) {
    return true;
  }
  const lastSeen = lastActiveByUser.get(userId);
  if (!lastSeen) {
    return false;
  }
  return Date.now() - lastSeen <= ONLINE_RECENT_WINDOW_MS;
};

const broadcastPresenceUpdate = (changedUserId: string) => {
  const allConnectedViewerIds = [...sseClientsByUser.keys()];
  if (allConnectedViewerIds.length === 0) return;

  const targetUser = db.state.users.find((u) => u._id === changedUserId);
  if (!targetUser) return;

  for (const viewerId of allConnectedViewerIds) {
    const viewerUser = db.state.users.find((u) => u._id === viewerId);
    if (!viewerUser) continue;
    const presence = computePartnerOnlineState(viewerUser, targetUser);
    emitMessageEventToUsers([viewerId], 'presence:updated', {
      userId: changedUserId,
      isOnline: presence.isOnline,
      lastActiveAt: presence.lastActiveAt,
    });
  }
};

const registerSseClient = (userId: string, res: Response) => {
  const wasConnected = (sseClientsByUser.get(userId)?.size ?? 0) > 0;
  const existing = sseClientsByUser.get(userId) ?? new Set<Response>();
  existing.add(res);
  sseClientsByUser.set(userId, existing);
  markUserActivePresence(userId);
  if (!wasConnected) {
    broadcastPresenceUpdate(userId);
  }
};

const unregisterSseClient = (userId: string, res: Response) => {
  const existing = sseClientsByUser.get(userId);
  if (!existing) return;
  existing.delete(res);
  if (existing.size === 0) {
    sseClientsByUser.delete(userId);
    lastActiveByUser.set(userId, Date.now());
    broadcastPresenceUpdate(userId);
  }
};

export const emitMessageEventToUsers = (
  userIds: string[],
  eventType:
    | 'message:new'
    | 'message:read'
    | 'message:deleted'
    | 'message:updated'
    | 'presence:updated',
  payload: unknown
) => {
  const dataString = `data: ${JSON.stringify({ type: eventType, payload })}\n\n`;
  for (const uid of new Set(userIds)) {
    const clients = sseClientsByUser.get(uid);
    if (!clients) continue;
    for (const clientRes of clients) {
      try {
        clientRes.write(dataString);
      } catch {
        // Ignore broken pipe
      }
    }
  }
};

// GET /api/messages/stream?token=... - Kết nối SSE nhận tin nhắn realtime tức thì
messageRouter.get('/stream', async (req, res) => {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  const queryToken =
    typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const token = headerToken || queryToken;

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Thiếu token kết nối luồng tin nhắn thời gian thực.',
    });
    return;
  }

  try {
    const foundUser = await resolveTokenToUser(token);
    if (!foundUser || foundUser.isLocked) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Tài khoản không hợp lệ hoặc đã bị khóa.',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const userId = foundUser._id;
    registerSseClient(userId, res);

    // Gửi gói khởi tạo kết nối
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        userId,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        markUserActivePresence(userId);
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unregisterSseClient(userId, res);
    });
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Không thể xác thực luồng tin nhắn thời gian thực.',
    });
  }
});

// Helper kiểm tra 2 người dùng có follow lẫn nhau (Mutual Follow) hay không
const checkMutualFollow = (
  userA: { _id: string; followers?: string[]; following?: string[] },
  userB: { _id: string; followers?: string[]; following?: string[] }
): boolean => {
  const aFollowsB =
    (userA.following || []).includes(userB._id) ||
    (userB.followers || []).includes(userA._id);
  const bFollowsA =
    (userB.following || []).includes(userA._id) ||
    (userA.followers || []).includes(userB._id);
  return aFollowsB && bFollowsA;
};

// Helper tính trạng thái hoạt động (isOnline & lastActiveAt) của đối phương đối với người xem hiện tại
export const computePartnerOnlineState = (
  viewerUser: {
    _id: string;
    followers?: string[];
    following?: string[];
    blockedUsers?: string[];
    settings?: { onlineStatus?: 'everyone' | 'followers' | 'mutual' | 'no_one' };
  },
  targetUser: {
    _id: string;
    isLocked?: boolean;
    followers?: string[];
    following?: string[];
    blockedUsers?: string[];
    settings?: { onlineStatus?: 'everyone' | 'followers' | 'mutual' | 'no_one' };
  }
): { isOnline: boolean; lastActiveAt: string | null } => {
  if (targetUser.isLocked) {
    return { isOnline: false, lastActiveAt: null };
  }
  const isBlockedEitherWay =
    (viewerUser.blockedUsers || []).includes(targetUser._id) ||
    (targetUser.blockedUsers || []).includes(viewerUser._id);
  const isViewerFollowingTarget =
    (viewerUser.following || []).includes(targetUser._id) ||
    (targetUser.followers || []).includes(viewerUser._id);
  const isTargetFollowingViewer =
    (targetUser.following || []).includes(viewerUser._id) ||
    (viewerUser.followers || []).includes(targetUser._id);

  const canSeePresence = evaluateUserOnlineVisibility({
    isTargetConnectedOrRecent: true,
    isBlockedEitherWay,
    targetOnlinePolicy: targetUser.settings?.onlineStatus ?? 'everyone',
    viewerOnlinePolicy: viewerUser.settings?.onlineStatus ?? 'everyone',
    isViewerFollowingTarget,
    isTargetFollowingViewer,
  });

  if (!canSeePresence) {
    return { isOnline: false, lastActiveAt: null };
  }

  const isOnline = isUserActivelyConnectedOrRecent(targetUser._id);
  const lastSeenMs = lastActiveByUser.get(targetUser._id);
  const lastActiveAt = lastSeenMs ? new Date(lastSeenMs).toISOString() : null;

  return { isOnline, lastActiveAt };
};

// Helper lấy lịch sử tin nhắn hiển thị đối với currentUser (đã tính mốc xóa hội thoại deletedConversationsAt)
const getVisibleMessagesForUser = (
  currentUser: { _id: string; deletedConversationsAt?: Record<string, string> },
  partnerId: string,
  allMessages: DirectMessage[]
): DirectMessage[] => {
  const deletedAtIso = currentUser.deletedConversationsAt?.[partnerId];
  const deletedAtTime = deletedAtIso ? new Date(deletedAtIso).getTime() : 0;

  return allMessages
    .filter((m) => {
      const isBetweenPair =
        (m.senderId === currentUser._id && m.recipientId === partnerId) ||
        (m.senderId === partnerId && m.recipientId === currentUser._id);
      if (!isBetweenPair) return false;
      if (deletedAtTime > 0) {
        const msgTime = new Date(m.createdAt).getTime();
        if (msgTime <= deletedAtTime) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
};

// Helper kiểm tra quyền gửi tin nhắn giữa sender và recipient
const evaluateMessagingPermission = (
  sender: {
    _id: string;
    followers?: string[];
    following?: string[];
    blockedUsers?: string[];
  },
  recipient: {
    _id: string;
    username: string;
    followers?: string[];
    following?: string[];
    blockedUsers?: string[];
    messagePrivacy?: 'everyone' | 'mutual';
  }
): {
  canSendMessage: boolean;
  restrictionCode: 'none' | 'blocked_by_me' | 'blocked_by_partner' | 'mutual_only';
  restrictionReason: string | null;
} => {
  if ((sender.blockedUsers || []).includes(recipient._id)) {
    return {
      canSendMessage: false,
      restrictionCode: 'blocked_by_me',
      restrictionReason: `Bạn đã chặn @${recipient.username}. Hãy bỏ chặn để tiếp tục gửi và nhận tin nhắn.`,
    };
  }
  if ((recipient.blockedUsers || []).includes(sender._id)) {
    return {
      canSendMessage: false,
      restrictionCode: 'blocked_by_partner',
      restrictionReason: `Bạn không thể gửi tin nhắn cho @${recipient.username} do cài đặt chặn của người dùng này.`,
    };
  }
  const privacy = recipient.messagePrivacy || 'everyone';
  if (privacy === 'mutual' && !checkMutualFollow(sender, recipient)) {
    return {
      canSendMessage: false,
      restrictionCode: 'mutual_only',
      restrictionReason: `@${recipient.username} đang bật chế độ Tránh làm phiền: Chỉ nhận tin nhắn từ người đã theo dõi và được theo dõi lại (Follow lẫn nhau).`,
    };
  }
  return {
    canSendMessage: true,
    restrictionCode: 'none',
    restrictionReason: null,
  };
};

// GET /api/messages/unread-count - Lấy tổng số tin nhắn chưa đọc của người dùng hiện tại (trừ hội thoại đã tắt thông báo/chặn/đã xóa)
messageRouter.get('/unread-count', requireAuth, (req, res) => {
  const currentUserId = req.user!.sub;
  const currentUser = db.state.users.find((u) => u._id === currentUserId);
  const mutedSet = new Set(currentUser?.mutedConversations ?? []);
  const blockedSet = new Set(currentUser?.blockedUsers ?? []);
  const deletedMap = currentUser?.deletedConversationsAt ?? {};

  const unreadCount = db.state.messages.filter((m) => {
    if (m.recipientId !== currentUserId || m.isRead) return false;
    if (mutedSet.has(m.senderId) || blockedSet.has(m.senderId)) return false;
    const deletedAtIso = deletedMap[m.senderId];
    if (deletedAtIso) {
      const msgTime = new Date(m.createdAt).getTime();
      if (msgTime <= new Date(deletedAtIso).getTime()) return false;
    }
    return true;
  }).length;

  res.json({ unreadCount });
});

// GET /api/messages/conversations - Lấy danh sách hội thoại ĐÃ CÓ TIN NHẮN (không hiển thị tài khoản chưa nhắn tin)
messageRouter.get('/conversations', requireAuth, (req, res) => {
  const currentUserId = req.user!.sub;
  const currentUser = db.state.users.find((u) => u._id === currentUserId);
  if (!currentUser) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy tài khoản người dùng.',
    });
    return;
  }

  const pinnedSet = new Set(currentUser.pinnedConversations ?? []);
  const archivedSet = new Set(currentUser.archivedConversations ?? []);
  const mutedSet = new Set(currentUser.mutedConversations ?? []);
  const blockedByMeSet = new Set(currentUser.blockedUsers ?? []);

  const conversations: ConversationSummary[] = [];

  for (const userRecord of db.state.users) {
    if (userRecord._id === currentUserId || userRecord.isLocked) continue;

    const history = getVisibleMessagesForUser(
      currentUser,
      userRecord._id,
      db.state.messages
    );

    // CHỈ hiển thị những tài khoản đã thực sự có tin nhắn trong hộp thư
    if (history.length === 0) continue;

    const lastMessage = history[history.length - 1];
    const unreadCount = history.filter(
      (m) => m.recipientId === currentUserId && !m.isRead
    ).length;

    const isPinned = pinnedSet.has(userRecord._id);
    const isArchived = archivedSet.has(userRecord._id);
    const isMuted = mutedSet.has(userRecord._id);
    const isBlockedByMe = blockedByMeSet.has(userRecord._id);
    const isBlockingMe = (userRecord.blockedUsers || []).includes(currentUserId);
    const isMutualFollow = checkMutualFollow(currentUser, userRecord);
    const presence = computePartnerOnlineState(currentUser, userRecord);

    conversations.push({
      partner: {
        ...db.sanitizeUser(userRecord),
        isOnline: presence.isOnline,
        lastActiveAt: presence.lastActiveAt,
      },
      lastMessage,
      unreadCount,
      isOnline: presence.isOnline,
      lastActiveAt: presence.lastActiveAt,
      isPinned,
      isArchived,
      isMuted,
      isBlockedByMe,
      isBlockingMe,
      isMutualFollow,
    });
  }

  // Sắp xếp: Ưu tiên hội thoại đã Ghim (isPinned) lên đầu -> sau đó theo thời gian tin nhắn mới nhất
  conversations.sort((a, b) => {
    const aPin = a.isPinned ? 1 : 0;
    const bPin = b.isPinned ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;

    const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  const totalUnreadCount = conversations
    .filter((c) => !c.isMuted && !c.isBlockedByMe)
    .reduce((sum, c) => sum + c.unreadCount, 0);

  const blockedProfiles = (currentUser.blockedUsers ?? [])
    .map((bid) => db.state.users.find((u) => u._id === bid))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => db.sanitizeUser(u));

  res.json({
    conversations,
    totalUnreadCount,
    settings: {
      messagePrivacy: currentUser.messagePrivacy ?? 'everyone',
      pinnedConversations: currentUser.pinnedConversations ?? [],
      archivedConversations: currentUser.archivedConversations ?? [],
      mutedConversations: currentUser.mutedConversations ?? [],
      blockedUsers: currentUser.blockedUsers ?? [],
    },
    blockedProfiles,
  });
});

// PUT /api/messages/settings/privacy - Cập nhật cài đặt bảo mật & tránh làm phiền (everyone | mutual)
messageRouter.put('/settings/privacy', requireAuth, async (req, res) => {
  const currentUserId = req.user!.sub;
  const rawPrivacy = String(req.body?.messagePrivacy || 'everyone').trim();
  const messagePrivacy: 'everyone' | 'mutual' =
    rawPrivacy === 'mutual' ? 'mutual' : 'everyone';

  const currentUser = db.state.users.find((u) => u._id === currentUserId);
  if (!currentUser) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy tài khoản người dùng.',
    });
    return;
  }

  const updatedUser = {
    ...currentUser,
    messagePrivacy,
  };

  db.state.users = db.state.users.map((u) =>
    u._id === currentUserId ? updatedUser : u
  );
  await db.saveAsync();

  res.json({
    messagePrivacy,
    user: db.sanitizeUser(updatedUser),
  });
});

// POST /api/messages/conversation/:partnerId/action - Thực hiện các thao tác: ghim, xóa hội thoại, lưu trữ, tắt thông báo, chặn
messageRouter.post(
  '/conversation/:partnerId/action',
  requireAuth,
  async (req, res) => {
    const currentUserId = req.user!.sub;
    const rawPartnerId = String(req.params.partnerId || '').trim();
    const action = String(req.body?.action || '').trim();

    const currentUser = db.state.users.find((u) => u._id === currentUserId);
    const partnerRecord = db.state.users.find(
      (u) =>
        u._id === rawPartnerId ||
        u.username.toLowerCase() === rawPartnerId.replace(/^@/, '').toLowerCase()
    );

    if (!currentUser || !partnerRecord) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Không tìm thấy cuộc trò chuyện hoặc người dùng.',
      });
      return;
    }

    const partnerId = partnerRecord._id;
    let nextPinned = [...(currentUser.pinnedConversations ?? [])];
    let nextArchived = [...(currentUser.archivedConversations ?? [])];
    let nextMuted = [...(currentUser.mutedConversations ?? [])];
    let nextBlocked = [...(currentUser.blockedUsers ?? [])];
    let nextDeletedMap = { ...(currentUser.deletedConversationsAt ?? {}) };

    switch (action) {
      case 'pin':
        if (!nextPinned.includes(partnerId)) nextPinned.push(partnerId);
        break;
      case 'unpin':
        nextPinned = nextPinned.filter((id) => id !== partnerId);
        break;
      case 'archive':
        if (!nextArchived.includes(partnerId)) nextArchived.push(partnerId);
        nextPinned = nextPinned.filter((id) => id !== partnerId);
        break;
      case 'unarchive':
        nextArchived = nextArchived.filter((id) => id !== partnerId);
        break;
      case 'mute':
        if (!nextMuted.includes(partnerId)) nextMuted.push(partnerId);
        break;
      case 'unmute':
        nextMuted = nextMuted.filter((id) => id !== partnerId);
        break;
      case 'delete':
        nextDeletedMap[partnerId] = new Date().toISOString();
        nextPinned = nextPinned.filter((id) => id !== partnerId);
        nextArchived = nextArchived.filter((id) => id !== partnerId);
        // Đánh dấu đã đọc các tin nhắn cũ để không còn badge chưa đọc
        db.state.messages = db.state.messages.map((m) =>
          m.senderId === partnerId && m.recipientId === currentUserId && !m.isRead
            ? { ...m, isRead: true }
            : m
        );
        break;
      case 'block':
        if (!nextBlocked.includes(partnerId)) nextBlocked.push(partnerId);
        nextPinned = nextPinned.filter((id) => id !== partnerId);
        break;
      case 'unblock':
        nextBlocked = nextBlocked.filter((id) => id !== partnerId);
        break;
      default:
        res.status(400).json({
          error: 'ValidationError',
          message: 'Thao tác hội thoại không hợp lệ.',
        });
        return;
    }

    let updatedCurrentUser = {
      ...currentUser,
      pinnedConversations: nextPinned,
      archivedConversations: nextArchived,
      mutedConversations: nextMuted,
      blockedUsers: nextBlocked,
      deletedConversationsAt: nextDeletedMap,
    };

    // Nếu chặn người dùng, tự động hủy theo dõi 2 chiều để đảm bảo an toàn
    if (action === 'block') {
      updatedCurrentUser = {
        ...updatedCurrentUser,
        following: (updatedCurrentUser.following || []).filter(
          (id) => id !== partnerId
        ),
        followers: (updatedCurrentUser.followers || []).filter(
          (id) => id !== partnerId
        ),
      };
    }

    db.state.users = db.state.users.map((u) => {
      if (u._id === currentUserId) return updatedCurrentUser;
      if (action === 'block' && u._id === partnerId) {
        return {
          ...u,
          following: (u.following || []).filter((id) => id !== currentUserId),
          followers: (u.followers || []).filter((id) => id !== currentUserId),
        };
      }
      return u;
    });

    await db.saveAsync();

    res.json({
      success: true,
      action,
      partnerId,
      user: db.sanitizeUser(updatedCurrentUser),
    });
  }
);

// POST /api/messages/conversation/:partnerId/report - Báo cáo cuộc trò chuyện / người dùng vi phạm
messageRouter.post(
  '/conversation/:partnerId/report',
  requireAuth,
  async (req, res) => {
    const currentUserId = req.user!.sub;
    const rawPartnerId = String(req.params.partnerId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const details = String(req.body?.details || '').trim();
    const alsoBlock = Boolean(req.body?.alsoBlock);

    if (!reason) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Vui lòng chọn lý do báo cáo cuộc trò chuyện.',
      });
      return;
    }

    const currentUser = db.state.users.find((u) => u._id === currentUserId);
    const partnerRecord = db.state.users.find(
      (u) =>
        u._id === rawPartnerId ||
        u.username.toLowerCase() === rawPartnerId.replace(/^@/, '').toLowerCase()
    );

    if (!currentUser || !partnerRecord) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Không tìm thấy người dùng bị báo cáo.',
      });
      return;
    }

    const newReport = {
      _id: `rep_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      postId: `chat_${partnerRecord._id}`,
      reporterId: currentUserId,
      reason: `[Tin nhắn @${partnerRecord.username}] ${reason}`,
      details:
        details ||
        `Báo cáo cuộc trò chuyện trực tiếp với @${partnerRecord.username} (${partnerRecord.fullName}).`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    db.state.reports = [newReport, ...db.state.reports];

    let updatedCurrentUser = currentUser;
    if (alsoBlock) {
      const nextBlocked = Array.from(
        new Set([...(currentUser.blockedUsers ?? []), partnerRecord._id])
      );
      updatedCurrentUser = {
        ...currentUser,
        blockedUsers: nextBlocked,
        pinnedConversations: (currentUser.pinnedConversations ?? []).filter(
          (id) => id !== partnerRecord._id
        ),
        following: (currentUser.following ?? []).filter(
          (id) => id !== partnerRecord._id
        ),
        followers: (currentUser.followers ?? []).filter(
          (id) => id !== partnerRecord._id
        ),
      };
      db.state.users = db.state.users.map((u) => {
        if (u._id === currentUserId) return updatedCurrentUser;
        if (u._id === partnerRecord._id) {
          return {
            ...u,
            following: (u.following ?? []).filter((id) => id !== currentUserId),
            followers: (u.followers ?? []).filter((id) => id !== currentUserId),
          };
        }
        return u;
      });
    }

    await db.saveAsync();

    res.status(201).json({
      success: true,
      reportId: newReport._id,
      alsoBlocked: alsoBlock,
      user: db.sanitizeUser(updatedCurrentUser),
      message: alsoBlock
        ? `Đã gửi báo cáo và chặn @${partnerRecord.username}.`
        : `Đã gửi báo cáo cuộc trò chuyện với @${partnerRecord.username} tới Quản trị viên.`,
    });
  }
);

// GET /api/messages/:partnerId - Lấy lịch sử tin nhắn 1-1 với một người dùng và đánh dấu đã đọc
messageRouter.get('/:partnerId', requireAuth, (req, res) => {
  const currentUserId = req.user!.sub;
  const rawPartnerId = String(req.params.partnerId || '').trim();
  const normalizedUsername = rawPartnerId.replace(/^@/, '').toLowerCase();

  const currentUser = db.state.users.find((u) => u._id === currentUserId);
  const partnerRecord = db.state.users.find(
    (u) =>
      u._id === rawPartnerId || u.username.toLowerCase() === normalizedUsername
  );

  if (!currentUser || !partnerRecord) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy người dùng để trò chuyện.',
    });
    return;
  }

  let markedReadCount = 0;
  db.state.messages = db.state.messages.map((m) => {
    if (
      m.senderId === partnerRecord._id &&
      m.recipientId === currentUserId &&
      !m.isRead
    ) {
      markedReadCount += 1;
      return { ...m, isRead: true };
    }
    return m;
  });

  if (markedReadCount > 0) {
    db.save();
    emitMessageEventToUsers([partnerRecord._id, currentUserId], 'message:read', {
      readerId: currentUserId,
      partnerId: partnerRecord._id,
    });
  }

  const messages = getVisibleMessagesForUser(
    currentUser,
    partnerRecord._id,
    db.state.messages
  );

  const permission = evaluateMessagingPermission(currentUser, partnerRecord);
  const presence = computePartnerOnlineState(currentUser, partnerRecord);

  res.json({
    partner: {
      ...db.sanitizeUser(partnerRecord),
      isOnline: presence.isOnline,
      lastActiveAt: presence.lastActiveAt,
    },
    messages,
    conversationMeta: {
      isOnline: presence.isOnline,
      lastActiveAt: presence.lastActiveAt,
      isPinned: (currentUser.pinnedConversations ?? []).includes(partnerRecord._id),
      isArchived: (currentUser.archivedConversations ?? []).includes(
        partnerRecord._id
      ),
      isMuted: (currentUser.mutedConversations ?? []).includes(partnerRecord._id),
      isBlockedByMe: (currentUser.blockedUsers ?? []).includes(partnerRecord._id),
      isBlockingMe: (partnerRecord.blockedUsers ?? []).includes(currentUserId),
      isMutualFollow: checkMutualFollow(currentUser, partnerRecord),
      ...permission,
    },
  });
});

// POST /api/messages/:partnerId - Gửi tin nhắn văn bản hoặc kèm ảnh cho người dùng khác
messageRouter.post('/:partnerId', requireAuth, (req, res) => {
  const currentUserId = req.user!.sub;
  const rawPartnerId = String(req.params.partnerId || '').trim();
  const normalizedUsername = rawPartnerId.replace(/^@/, '').toLowerCase();

  const currentUser = db.state.users.find((u) => u._id === currentUserId);
  const partnerRecord = db.state.users.find(
    (u) =>
      u._id === rawPartnerId || u.username.toLowerCase() === normalizedUsername
  );

  if (!currentUser || !partnerRecord) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy người nhận tin nhắn.',
    });
    return;
  }

  if (partnerRecord._id === currentUserId) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Bạn không thể tự gửi tin nhắn cho chính mình.',
    });
    return;
  }

  // Kiểm tra điều kiện Chặn & Quyền riêng tư Tránh làm phiền (Mutual Follow)
  const permission = evaluateMessagingPermission(currentUser, partnerRecord);
  if (!permission.canSendMessage) {
    res.status(403).json({
      error: 'Forbidden',
      code: permission.restrictionCode,
      message:
        permission.restrictionReason ||
        'Không thể gửi tin nhắn cho người dùng này.',
    });
    return;
  }

  const content = String(req.body?.content ?? '').trim();
  const rawImages = Array.isArray(req.body?.images) ? req.body.images : [];
  const images = rawImages
    .map((img: unknown) => String(img ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!content && images.length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Vui lòng nhập nội dung tin nhắn hoặc đính kèm ít nhất 1 hình ảnh.',
    });
    return;
  }

  if (content.length > 2000) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự.',
    });
    return;
  }

  const replyToMessageId =
    typeof req.body?.replyToMessageId === 'string' &&
    req.body.replyToMessageId.trim()
      ? req.body.replyToMessageId.trim()
      : null;

  let replyTo: DirectMessage['replyTo'] = null;
  if (replyToMessageId) {
    const targetMsg = db.state.messages.find(
      (m) =>
        m._id === replyToMessageId &&
        ((m.senderId === currentUserId && m.recipientId === partnerRecord._id) ||
          (m.senderId === partnerRecord._id && m.recipientId === currentUserId))
    );
    if (targetMsg) {
      const targetSender =
        targetMsg.senderId === currentUserId ? currentUser : partnerRecord;
      const hasImages = Boolean(targetMsg.images && targetMsg.images.length > 0);
      replyTo = {
        _id: targetMsg._id,
        senderId: targetMsg.senderId,
        senderName: targetSender.fullName || targetSender.username,
        content:
          targetMsg.content ||
          (hasImages
            ? `[Đã gửi ${targetMsg.images?.length || 1} hình ảnh]`
            : ''),
        hasImages,
      };
    }
  }

  const isForwarded = Boolean(req.body?.isForwarded);

  const newMessage: DirectMessage = {
    _id: generateMessageId(),
    senderId: currentUserId,
    recipientId: partnerRecord._id,
    content,
    images,
    replyToMessageId: replyTo ? replyTo._id : null,
    replyTo,
    isPinned: false,
    pinnedAt: null,
    pinnedBy: null,
    reactions: {},
    isForwarded,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  db.state.messages = [...db.state.messages, newMessage];
  db.save();

  // Phát sự kiện realtime qua SSE cho cả người nhận và các tab của người gửi
  emitMessageEventToUsers(
    [partnerRecord._id, currentUserId],
    'message:new',
    newMessage
  );

  res.status(201).json({
    message: newMessage,
  });
});

// POST /api/messages/item/:messageId/pin - Ghim hoặc bỏ ghim một tin nhắn trong đoạn chat
messageRouter.post('/item/:messageId/pin', requireAuth, async (req, res) => {
  const currentUserId = req.user!.sub;
  const messageId = String(req.params.messageId || '').trim();

  const existing = db.state.messages.find((m) => m._id === messageId);
  if (!existing) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy tin nhắn để ghim.',
    });
    return;
  }

  if (
    existing.senderId !== currentUserId &&
    existing.recipientId !== currentUserId &&
    req.user!.role !== 'admin'
  ) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Bạn không có quyền ghim tin nhắn trong đoạn chat này.',
    });
    return;
  }

  const nextPinned =
    typeof req.body?.pin === 'boolean' ? req.body.pin : !existing.isPinned;

  const updatedMessage: DirectMessage = {
    ...existing,
    isPinned: nextPinned,
    pinnedAt: nextPinned ? new Date().toISOString() : null,
    pinnedBy: nextPinned ? currentUserId : null,
  };

  db.state.messages = db.state.messages.map((m) =>
    m._id === messageId ? updatedMessage : m
  );
  await db.saveAsync();

  emitMessageEventToUsers(
    [existing.senderId, existing.recipientId],
    'message:updated',
    { message: updatedMessage }
  );

  res.json({
    message: updatedMessage,
    isPinned: nextPinned,
  });
});

// POST /api/messages/item/:messageId/react - Thả hoặc gỡ biểu tượng cảm xúc (reaction) trên tin nhắn
messageRouter.post('/item/:messageId/react', requireAuth, async (req, res) => {
  const currentUserId = req.user!.sub;
  const messageId = String(req.params.messageId || '').trim();
  const emoji =
    typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';

  const existing = db.state.messages.find((m) => m._id === messageId);
  if (!existing) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy tin nhắn để thả cảm xúc.',
    });
    return;
  }

  if (
    existing.senderId !== currentUserId &&
    existing.recipientId !== currentUserId &&
    req.user!.role !== 'admin'
  ) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Bạn không có quyền thả cảm xúc cho tin nhắn này.',
    });
    return;
  }

  const prevReactions = { ...(existing.reactions ?? {}) };
  if (!emoji || prevReactions[currentUserId] === emoji) {
    delete prevReactions[currentUserId];
  } else {
    prevReactions[currentUserId] = emoji;
  }

  const updatedMessage: DirectMessage = {
    ...existing,
    reactions: prevReactions,
  };

  db.state.messages = db.state.messages.map((m) =>
    m._id === messageId ? updatedMessage : m
  );
  await db.saveAsync();

  emitMessageEventToUsers(
    [existing.senderId, existing.recipientId],
    'message:updated',
    { message: updatedMessage }
  );

  res.json({
    message: updatedMessage,
    reactions: prevReactions,
  });
});

// DELETE /api/messages/item/:messageId - Thu hồi / xóa tin nhắn đã gửi
messageRouter.delete('/item/:messageId', requireAuth, async (req, res) => {
  const currentUserId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const messageId = String(req.params.messageId || '').trim();

  const existing = db.state.messages.find((m) => m._id === messageId);
  if (!existing) {
    res.status(404).json({
      error: 'NotFound',
      message: 'Không tìm thấy tin nhắn cần thu hồi.',
    });
    return;
  }

  if (existing.senderId !== currentUserId && !isAdmin) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Bạn chỉ có thể thu hồi tin nhắn do chính mình gửi.',
    });
    return;
  }

  db.state.messages = db.state.messages.filter((m) => m._id !== messageId);
  db.save();
  await deleteMessageFromMongo(messageId);

  emitMessageEventToUsers(
    [existing.senderId, existing.recipientId],
    'message:deleted',
    {
      messageId,
      senderId: existing.senderId,
      recipientId: existing.recipientId,
    }
  );

  res.json({ deleted: true, messageId });
});

