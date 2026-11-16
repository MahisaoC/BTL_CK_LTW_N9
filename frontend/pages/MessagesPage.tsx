import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Search,
  Send,
  Image as ImageIcon,
  X,
  Trash2,
  ArrowLeft,
  MessageCircle,
  CheckCheck,
  Check,
  MapPin,
  User as UserIcon,
  Shield,
  Pin,
  Archive,
  BellOff,
  Bell,
  Ban,
  Flag,
  MoreHorizontal,
  Users,
  ShieldAlert,
  Unlock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  Smile,
  CornerUpLeft,
  ImagePlus,
  MoreVertical,
  Share2,
} from 'lucide-react';
import type {
  ConversationSummary,
  DirectMessage,
  MessagePrivacySetting,
  User,
} from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  apiRequest,
  formatRelativeTimeVi,
  getStoredToken,
  uploadImagesToServer,
} from '../utils/api';
import {
  extractSharedPostInfoFromMessage,
  filterMessagesByContentQuery,
  getPinnedMessagesInChat,
  normalizeSearchText,
} from '../utils/travelRules';
import { ImageLightboxModal } from '../components/ImageLightboxModal';

const QUICK_MESSAGE_REACTIONS = ['❤️', '😆', '😮', '😢', '😡', '👍'];

const EMOJI_CATEGORIES: Array<{
  id: string;
  icon: string;
  labelVi: string;
  labelEn: string;
  emojis: string[];
}> = [
  {
    id: 'smileys',
    icon: '😊',
    labelVi: 'Cảm xúc',
    labelEn: 'Smileys',
    emojis: [
      '😀', '😄', '😁', '🥰', '😍', '🤩', '😎', '🥳',
      '🤗', '🤭', '🥹', '😮', '🙌', '👏', '👍', '💖',
    ],
  },
  {
    id: 'travel',
    icon: '✈️',
    labelVi: 'Du lịch',
    labelEn: 'Travel',
    emojis: [
      '✈️', '🏝️', '🏔️', '🏖️', '🏕️', '🗺️', '🧭', '⛵',
      '🚂', '🛵', '🎒', '📸', '🌅', '🌄', '🌉', '🗽',
    ],
  },
  {
    id: 'food',
    icon: '🍜',
    labelVi: 'Ẩm thực',
    labelEn: 'Food',
    emojis: [
      '🍜', '🍲', '🥖', '🧋', '☕', '🍻', '🍹', '🦞',
      '🦀', '🍢', '🍰', '🥥', '🥭', '🍉', '🥐', '🍕',
    ],
  },
  {
    id: 'nature',
    icon: '🌸',
    labelVi: 'Thiên nhiên',
    labelEn: 'Nature',
    emojis: [
      '🌸', '🌺', '🌻', '🌴', '🌲', '🌊', '☀️', '🌈',
      '⛅', '❄️', '🔥', '✨', '⭐', '🌙', '🦋', '🐬',
    ],
  },
];

interface ConversationMetaState {
  isOnline?: boolean;
  lastActiveAt?: string | null;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  isBlockedByMe: boolean;
  isBlockingMe: boolean;
  isMutualFollow: boolean;
  canSendMessage: boolean;
  restrictionCode: 'none' | 'blocked_by_me' | 'blocked_by_partner' | 'mutual_only';
  restrictionReason: string | null;
}

/**
 * Component: MessagesPage (Hệ thống Nhắn tin trực tiếp 1-1 thời gian thực kết nối MongoDB Atlas)
 * - Hộp thư chỉ hiển thị các tài khoản đã có tin nhắn (tài khoản chưa nhắn tin không tự hiện trong hộp thư).
 * - Bảo mật & Tránh làm phiền: Tùy chọn chỉ nhận tin nhắn từ người đã follow và được mình follow lại (Mutual Follow).
 * - 6 thao tác quản lý hội thoại: Ghim hội thoại, Xóa hội thoại, Lưu trữ, Tắt thông báo, Chặn và Báo cáo.
 */
export const MessagesPage: React.FC = () => {
  const { userId: routePartnerId } = useParams<{ userId?: string }>();
  const { user, updateCurrentUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activePartner, setActivePartner] = useState<User | null>(null);
  const [activeMeta, setActiveMeta] = useState<ConversationMetaState | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [directoryMatches, setDirectoryMatches] = useState<User[]>([]);
  const [inboxFilter, setInboxFilter] = useState<
    'all' | 'unread' | 'pinned' | 'archived'
  >('all');

  // Cài đặt Bảo mật & Tránh làm phiền
  const [messagePrivacy, setMessagePrivacy] =
    useState<MessagePrivacySetting>('everyone');
  const [blockedProfiles, setBlockedProfiles] = useState<User[]>([]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Menu 6 chức năng trên từng dòng hội thoại & Bảng thông tin đoạn chat bên phải
  const [openMenuPartnerId, setOpenMenuPartnerId] = useState<string | null>(null);
  const [showHeaderActionsMenu, setShowHeaderActionsMenu] = useState(false);
  const [showInboxFilterMenu, setShowInboxFilterMenu] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [openChatInfoSec, setOpenChatInfoSec] = useState<{
    info: boolean;
    custom: boolean;
    media: boolean;
    privacy: boolean;
  }>({
    info: true,
    custom: false,
    media: true,
    privacy: false,
  });
  const [activeMediaSubTab, setActiveMediaSubTab] = useState<
    'none' | 'photos' | 'files'
  >('none');
  const [showPinPickerInDrawer, setShowPinPickerInDrawer] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Trả lời tin nhắn, Ghim tin nhắn, Menu 3 chấm từng tin nhắn (Thu hồi, Chuyển tiếp, Ghim, Báo cáo) & Thả cảm xúc
  const [replyingToMessage, setReplyingToMessage] =
    useState<DirectMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [showChatEmojiPicker, setShowChatEmojiPicker] = useState(false);
  const [activeChatEmojiTab, setActiveChatEmojiTab] =
    useState<string>('smileys');
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(
    null
  );
  const [openMessageReactionId, setOpenMessageReactionId] = useState<
    string | null
  >(null);
  const [forwardingMessage, setForwardingMessage] =
    useState<DirectMessage | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [allForwardUsers, setAllForwardUsers] = useState<User[]>([]);
  const [forwardedUserIds, setForwardedUserIds] = useState<
    Record<string, boolean>
  >({});
  const [forwardingBusyId, setForwardingBusyId] = useState<string | null>(null);

  // Cửa sổ nổi Báo cáo cuộc trò chuyện / người dùng
  const [reportTargetUser, setReportTargetUser] = useState<
    Pick<User, '_id' | 'fullName' | 'username' | 'avatar'> | null
  >(null);
  const [reportReason, setReportReason] = useState(
    'Làm phiền hoặc gửi tin nhắn rác (Spam)'
  );
  const [reportDetails, setReportDetails] = useState('');
  const [reportAlsoBlock, setReportAlsoBlock] = useState(true);
  const [submittingReport, setSubmittingReport] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lightboxImage, setLightboxImage] = useState<{
    images: string[];
    currentIndex: number;
    title: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement | null>(null);
  const activePartnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePartnerIdRef.current = activePartner?._id ?? null;
  }, [activePartner]);

  const showToastFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => {
      setActionFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const notifyNavbarBadgeUpdate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('travel:messages-updated'));
  }, []);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setLoadingConversations(true);
      try {
        const res = await apiRequest<{
          conversations: ConversationSummary[];
          totalUnreadCount: number;
          settings?: {
            messagePrivacy: MessagePrivacySetting;
            pinnedConversations: string[];
            archivedConversations: string[];
            mutedConversations: string[];
            blockedUsers: string[];
          };
          blockedProfiles?: User[];
        }>('/api/messages/conversations');

        setConversations(res.conversations);
        if (res.settings) {
          setMessagePrivacy(res.settings.messagePrivacy);
        }
        if (res.blockedProfiles) {
          setBlockedProfiles(res.blockedProfiles);
        }
        notifyNavbarBadgeUpdate();

        // Nếu chưa chọn người nhận trên desktop và không có routePartnerId, tự động chọn cuộc trò chuyện đầu tiên chưa lưu trữ
        if (
          !routePartnerId &&
          !activePartnerIdRef.current &&
          res.conversations.length > 0
        ) {
          const firstActive =
            res.conversations.find((c) => !c.isArchived) || res.conversations[0];
          if (firstActive && window.innerWidth >= 768) {
            navigate(`/messages/${firstActive.partner._id}`, { replace: true });
          }
        }
      } catch {
        // Ignore silent errors
      } finally {
        if (!silent) setLoadingConversations(false);
      }
    },
    [user, routePartnerId, navigate, notifyNavbarBadgeUpdate]
  );

  const fetchPartnerMessages = useCallback(
    async (partnerIdentifier: string, silent = false) => {
      if (!user || !partnerIdentifier) return;
      if (!silent) setLoadingMessages(true);
      setError(null);
      try {
        const res = await apiRequest<{
          partner: User;
          messages: DirectMessage[];
          conversationMeta?: ConversationMetaState;
        }>(`/api/messages/${encodeURIComponent(partnerIdentifier)}`);
        setActivePartner(res.partner);
        setMessages(res.messages);
        if (res.conversationMeta) {
          setActiveMeta(res.conversationMeta);
        }

        // Cập nhật unreadCount = 0 cho cuộc hội thoại vừa mở
        setConversations((prev) =>
          prev.map((c) =>
            c.partner._id === res.partner._id ? { ...c, unreadCount: 0 } : c
          )
        );
        notifyNavbarBadgeUpdate();
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : t(
                  'Không thể tải lịch sử trò chuyện.',
                  'Could not load conversation history.'
                )
          );
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [user, notifyNavbarBadgeUpdate, t]
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    setOpenMenuPartnerId(null);
    setReplyingToMessage(null);
    setShowChatEmojiPicker(false);
    setShowPinPickerInDrawer(false);
    if (routePartnerId) {
      fetchPartnerMessages(routePartnerId);
    } else {
      setActivePartner(null);
      setActiveMeta(null);
      setMessages([]);
    }
  }, [routePartnerId, fetchPartnerMessages]);

  // Đóng các cửa sổ nổi (Bảo mật, Báo cáo) khi nhấn phím Escape
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPrivacyModal(false);
        setReportTargetUser(null);
        setOpenMenuPartnerId(null);
        setShowChatEmojiPicker(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Khi người dùng gõ từ khóa tìm kiếm, tìm thêm các thành viên chưa có trong hộp thư để có thể bắt đầu cuộc trò chuyện mới
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setDirectoryMatches([]);
      return;
    }
    let cancelled = false;
    apiRequest<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (cancelled) return;
        const existingPartnerIds = new Set(
          conversations.map((c) => c.partner._id)
        );
        const others = (res.users || []).filter(
          (u) => u._id !== user?._id && !existingPartnerIds.has(u._id)
        );
        setDirectoryMatches(others.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setDirectoryMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, conversations, user?._id]);

  // Tự động cuộn xuống tin nhắn mới nhất khi danh sách tin nhắn thay đổi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activePartner?._id]);

  // Kết nối Server-Sent Events (SSE) để nhận tin nhắn thời gian thực
  useEffect(() => {
    if (!user) return;
    const token = getStoredToken();
    if (!token) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(
        `/api/messages/stream?token=${encodeURIComponent(token)}`
      );

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type: string;
            payload?: unknown;
          };

          if (parsed.type === 'message:new' && parsed.payload) {
            const incoming = parsed.payload as DirectMessage;
            const currentPartnerId = activePartnerIdRef.current;

            const isForActiveChat =
              currentPartnerId &&
              ((incoming.senderId === user._id &&
                incoming.recipientId === currentPartnerId) ||
                (incoming.senderId === currentPartnerId &&
                  incoming.recipientId === user._id));

            if (isForActiveChat) {
              setMessages((prev) => {
                if (prev.some((m) => m._id === incoming._id)) return prev;
                return [...prev, incoming];
              });

              if (incoming.senderId === currentPartnerId) {
                apiRequest(`/api/messages/${encodeURIComponent(currentPartnerId)}`)
                  .then(() => notifyNavbarBadgeUpdate())
                  .catch(() => {});
              }
            }

            fetchConversations(true);
          } else if (parsed.type === 'message:read' && parsed.payload) {
            const readData = parsed.payload as {
              readerId: string;
              partnerId: string;
            };
            if (
              readData.readerId === activePartnerIdRef.current &&
              readData.partnerId === user._id
            ) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.senderId === user._id ? { ...m, isRead: true } : m
                )
              );
            }
            fetchConversations(true);
          } else if (parsed.type === 'message:deleted' && parsed.payload) {
            const delData = parsed.payload as { messageId: string };
            setMessages((prev) =>
              prev.filter((m) => m._id !== delData.messageId)
            );
            fetchConversations(true);
          } else if (parsed.type === 'message:updated' && parsed.payload) {
            const updData = parsed.payload as { message: DirectMessage };
            if (updData.message) {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === updData.message._id ? updData.message : m
                )
              );
            }
          } else if (parsed.type === 'presence:updated' && parsed.payload) {
            const presData = parsed.payload as {
              userId: string;
              isOnline: boolean;
              lastActiveAt: string | null;
            };
            if (presData.userId) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.partner._id === presData.userId
                    ? {
                        ...c,
                        isOnline: presData.isOnline,
                        lastActiveAt: presData.lastActiveAt,
                        partner: {
                          ...c.partner,
                          isOnline: presData.isOnline,
                          lastActiveAt: presData.lastActiveAt,
                        },
                      }
                    : c
                )
              );
              if (activePartnerIdRef.current === presData.userId) {
                setActivePartner((prev) =>
                  prev
                    ? {
                        ...prev,
                        isOnline: presData.isOnline,
                        lastActiveAt: presData.lastActiveAt,
                      }
                    : prev
                );
                setActiveMeta((prev) =>
                  prev
                    ? {
                        ...prev,
                        isOnline: presData.isOnline,
                        lastActiveAt: presData.lastActiveAt,
                      }
                    : prev
                );
              }
            }
          }
        } catch {
          // Ignore malformed SSE event
        }
      };
    } catch {
      // Fallback polling below handles environments where EventSource is interrupted
    }

    const pollInterval = window.setInterval(() => {
      fetchConversations(true);
      if (activePartnerIdRef.current) {
        fetchPartnerMessages(activePartnerIdRef.current, true);
      }
    }, 30_000);

    return () => {
      eventSource?.close();
      window.clearInterval(pollInterval);
    };
  }, [user, fetchConversations, fetchPartnerMessages, notifyNavbarBadgeUpdate]);

  const activeInboxCount = useMemo(
    () => conversations.filter((c) => !c.isArchived).length,
    [conversations]
  );

  const archivedCount = useMemo(
    () => conversations.filter((c) => Boolean(c.isArchived)).length,
    [conversations]
  );

  const pinnedCount = useMemo(
    () => conversations.filter((c) => Boolean(c.isPinned) && !c.isArchived).length,
    [conversations]
  );

  const totalUnread = useMemo(
    () =>
      conversations
        .filter((c) => !c.isMuted && !c.isBlockedByMe)
        .reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  const filteredConversations = useMemo(() => {
    const rawQ = searchQuery.trim().replace(/^@/, '');
    const normQ = normalizeSearchText(rawQ);
    const tokens = normQ.split(/\s+/).filter(Boolean);

    return conversations.filter((item) => {
      // Nếu không tìm kiếm thì phân loại theo tab Lưu trữ / Chính
      if (!normQ) {
        if (inboxFilter === 'archived') {
          return Boolean(item.isArchived);
        }
        if (item.isArchived) return false;
        if (inboxFilter === 'unread' && item.unreadCount === 0) return false;
        if (inboxFilter === 'pinned' && !item.isPinned) return false;
        return true;
      }

      const uNorm = normalizeSearchText(item.partner.username);
      const fNorm = normalizeSearchText(item.partner.fullName);
      const cNorm = normalizeSearchText(item.partner.homeCity || '');
      const lastMsgNorm = normalizeSearchText(item.lastMessage?.content || '');

      if (
        uNorm.includes(normQ) ||
        fNorm.includes(normQ) ||
        cNorm.includes(normQ) ||
        lastMsgNorm.includes(normQ)
      ) {
        return true;
      }

      return (
        tokens.length > 1 &&
        tokens.every((tok) => fNorm.includes(tok) || uNorm.includes(tok))
      );
    });
  }, [conversations, searchQuery, inboxFilter]);

  const handleUpdatePrivacy = async (nextPrivacy: MessagePrivacySetting) => {
    setSavingPrivacy(true);
    try {
      const res = await apiRequest<{
        messagePrivacy: MessagePrivacySetting;
        user: User;
      }>('/api/messages/settings/privacy', {
        method: 'PUT',
        body: JSON.stringify({ messagePrivacy: nextPrivacy }),
      });
      setMessagePrivacy(res.messagePrivacy);
      updateCurrentUser(res.user);
      showToastFeedback(
        res.messagePrivacy === 'mutual'
          ? t(
              'Đã bật chế độ Tránh làm phiền: Chỉ nhận tin nhắn từ người follow lẫn nhau.',
              'Anti-spam enabled: Only mutual followers can message you.'
            )
          : t(
              'Đã cho phép mọi thành viên gửi tin nhắn cho bạn.',
              'Everyone can now send you messages.'
            )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể lưu cài đặt quyền riêng tư.', 'Could not save privacy setting.')
      );
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleConversationAction = async (
    targetPartnerId: string,
    action:
      | 'pin'
      | 'unpin'
      | 'archive'
      | 'unarchive'
      | 'mute'
      | 'unmute'
      | 'delete'
      | 'block'
      | 'unblock'
  ) => {
    // Khi ấn tắt/bật thông báo thì KHÔNG ẩn/đóng menu dấu 3 chấm
    if (action !== 'mute' && action !== 'unmute') {
      setOpenMenuPartnerId(null);
    }
    if (action === 'delete') {
      setShowHeaderActionsMenu(false);
    }
    try {
      const res = await apiRequest<{
        success: boolean;
        action: string;
        partnerId: string;
        user: User;
      }>(`/api/messages/conversation/${encodeURIComponent(targetPartnerId)}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });

      updateCurrentUser(res.user);
      await fetchConversations(true);

      if (action === 'delete') {
        showToastFeedback(
          t('Đã xóa cuộc trò chuyện khỏi hộp thư.', 'Conversation deleted.')
        );
        if (activePartner?._id === targetPartnerId) {
          setMessages([]);
          navigate('/messages');
        }
        return;
      }

      if (activePartner?._id === targetPartnerId) {
        await fetchPartnerMessages(targetPartnerId, true);
      }

      const feedbackLabels: Record<string, string> = {
        pin: t('Đã ghim cuộc trò chuyện lên đầu hộp thư.', 'Conversation pinned.'),
        unpin: t('Đã bỏ ghim cuộc trò chuyện.', 'Conversation unpinned.'),
        archive: t(
          'Đã chuyển cuộc trò chuyện vào mục Lưu trữ.',
          'Conversation archived.'
        ),
        unarchive: t(
          'Đã khôi phục cuộc trò chuyện về Hộp thư.',
          'Conversation unarchived.'
        ),
        mute: t(
          'Đã tắt thông báo cho cuộc trò chuyện này.',
          'Notifications muted for this chat.'
        ),
        unmute: t(
          'Đã bật lại thông báo cho cuộc trò chuyện.',
          'Notifications unmuted.'
        ),
        block: t('Đã chặn người dùng này.', 'User blocked.'),
        unblock: t('Đã bỏ chặn người dùng.', 'User unblocked.'),
      };
      if (feedbackLabels[action]) {
        showToastFeedback(feedbackLabels[action]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể thực hiện thao tác.', 'Action failed.')
      );
    }
  };

  const handleSubmitConversationReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTargetUser || submittingReport) return;
    setSubmittingReport(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        user: User;
      }>(
        `/api/messages/conversation/${encodeURIComponent(
          reportTargetUser._id
        )}/report`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: reportReason,
            details: reportDetails,
            alsoBlock: reportAlsoBlock,
          }),
        }
      );
      updateCurrentUser(res.user);
      setReportTargetUser(null);
      setReportDetails('');
      await fetchConversations(true);
      if (activePartner?._id === reportTargetUser._id) {
        await fetchPartnerMessages(reportTargetUser._id, true);
      }
      showToastFeedback(res.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Gửi báo cáo thất bại.', 'Could not submit report.')
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 3 - draftImages.length);
    if (remainingSlots === 0) {
      setError(
        t(
          'Mỗi tin nhắn đính kèm tối đa 3 hình ảnh.',
          'Each message supports up to 3 photos.'
        )
      );
      return;
    }

    setUploadingImages(true);
    setError(null);
    try {
      const uploadedUrls = await uploadImagesToServer(
        files.slice(0, remainingSlots)
      );
      setDraftImages((prev) => [...prev, ...uploadedUrls].slice(0, 3));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Tải ảnh thất bại.', 'Failed to upload photos.')
      );
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    if (!activePartner || sending) return;
    const contentToSend = (
      typeof customText === 'string' ? customText : draftText
    ).trim();
    const imagesToSend = typeof customText === 'string' ? [] : draftImages;

    if (!contentToSend && imagesToSend.length === 0) return;

    setSending(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: DirectMessage }>(
        `/api/messages/${encodeURIComponent(activePartner._id)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: contentToSend,
            images: imagesToSend,
            replyToMessageId:
              typeof customText === 'string'
                ? null
                : replyingToMessage?._id || null,
          }),
        }
      );

      setMessages((prev) => {
        if (prev.some((m) => m._id === res.message._id)) return prev;
        return [...prev, res.message];
      });

      if (typeof customText !== 'string') {
        setDraftText('');
        setDraftImages([]);
        setReplyingToMessage(null);
        setShowChatEmojiPicker(false);
      }

      fetchConversations(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Gửi tin nhắn thất bại.', 'Could not send message.')
      );
    } finally {
      setSending(false);
    }
  };

  const handleTogglePinMessage = async (
    messageId: string,
    explicitPin?: boolean
  ) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m._id !== messageId) return m;
        const nextPin =
          typeof explicitPin === 'boolean' ? explicitPin : !m.isPinned;
        return {
          ...m,
          isPinned: nextPin,
          pinnedAt: nextPin ? new Date().toISOString() : null,
        };
      })
    );
    try {
      const res = await apiRequest<{
        message: DirectMessage;
        isPinned: boolean;
      }>(`/api/messages/item/${encodeURIComponent(messageId)}/pin`, {
        method: 'POST',
        body: JSON.stringify(
          typeof explicitPin === 'boolean' ? { pin: explicitPin } : {}
        ),
      });

      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? res.message : m))
      );

      showToastFeedback(
        res.isPinned
          ? t(
              'Đã ghim tin nhắn vào Thông tin về đoạn chat.',
              'Message pinned to Chat info.'
            )
          : t('Đã bỏ ghim tin nhắn.', 'Message unpinned.')
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể ghim tin nhắn.', 'Could not pin message.')
      );
    }
  };

  const scrollToMessageInChat = useCallback((messageId: string) => {
    const el = document.getElementById(`chat-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      window.setTimeout(() => {
        setHighlightedMessageId((prev) => (prev === messageId ? null : prev));
      }, 2200);
    }
  }, []);

  const handleDeleteMessage = async (messageId: string, canRecallForAll = true) => {
    setOpenMessageMenuId(null);
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
    if (replyingToMessage?._id === messageId) {
      setReplyingToMessage(null);
    }
    if (!canRecallForAll) {
      showToastFeedback(
        t('Đã gỡ tin nhắn ở phía bạn.', 'Message removed for you.')
      );
      return;
    }
    try {
      await apiRequest(`/api/messages/item/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      });
      showToastFeedback(
        t('Đã thu hồi tin nhắn.', 'Message unsent.')
      );
      fetchConversations(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể thu hồi tin nhắn.', 'Could not unsend message.')
      );
    }
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    setOpenMessageReactionId(null);
    if (user?._id) {
      const myId = user._id;
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== messageId) return m;
          const nextReactions = { ...(m.reactions ?? {}) };
          if (!emoji || nextReactions[myId] === emoji) {
            delete nextReactions[myId];
          } else {
            nextReactions[myId] = emoji;
          }
          return { ...m, reactions: nextReactions };
        })
      );
    }
    try {
      const res = await apiRequest<{
        message: DirectMessage;
        reactions: Record<string, string>;
      }>(`/api/messages/item/${encodeURIComponent(messageId)}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? res.message : m))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể thả cảm xúc.', 'Could not react to message.')
      );
    }
  };

  const handleOpenForwardModal = async (msg: DirectMessage) => {
    setOpenMessageMenuId(null);
    setForwardingMessage(msg);
    setForwardSearchQuery('');
    setForwardedUserIds({});
    try {
      const res = await apiRequest<{ users: User[] }>('/api/users');
      setAllForwardUsers(
        (res.users || []).filter((u) => u._id !== user?._id && !u.isLocked)
      );
    } catch {
      // Fallback to conversation partners if directory fetch fails
      setAllForwardUsers(
        conversations.map((c) => c.partner as User)
      );
    }
  };

  const handleForwardMessageToUser = async (targetUserId: string) => {
    if (!forwardingMessage || forwardingBusyId) return;
    setForwardingBusyId(targetUserId);
    try {
      const res = await apiRequest<{ message: DirectMessage }>(
        `/api/messages/${encodeURIComponent(targetUserId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: forwardingMessage.content || '',
            images: forwardingMessage.images || [],
            isForwarded: true,
          }),
        }
      );
      setForwardedUserIds((prev) => ({ ...prev, [targetUserId]: true }));
      if (activePartner?._id === targetUserId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.message._id)) return prev;
          return [...prev, res.message];
        });
      }
      fetchConversations(true);
      showToastFeedback(
        t('Đã chuyển tiếp tin nhắn thành công.', 'Message forwarded.')
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể chuyển tiếp tin nhắn.', 'Could not forward message.')
      );
    } finally {
      setForwardingBusyId(null);
    }
  };

  const filteredForwardTargets = useMemo(() => {
    const q = normalizeSearchText(forwardSearchQuery.trim().replace(/^@/, ''));
    if (!q) return allForwardUsers;
    return allForwardUsers.filter(
      (u) =>
        normalizeSearchText(u.fullName).includes(q) ||
        normalizeSearchText(u.username).includes(q) ||
        normalizeSearchText(u.homeCity || '').includes(q)
    );
  }, [allForwardUsers, forwardSearchQuery]);

  useEffect(() => {
    if (!openMessageMenuId && !openMessageReactionId) return;
    const handleOutsideClick = () => {
      setOpenMessageMenuId(null);
      setOpenMessageReactionId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [openMessageMenuId, openMessageReactionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const pinnedMessagesInChat = useMemo(
    () => getPinnedMessagesInChat(messages),
    [messages]
  );

  const matchedSearchMessages = useMemo(
    () =>
      chatSearchQuery.trim()
        ? filterMessagesByContentQuery(messages, chatSearchQuery)
        : [],
    [messages, chatSearchQuery]
  );

  const activeEmojiCategoryObj = useMemo(
    () =>
      EMOJI_CATEGORIES.find((c) => c.id === activeChatEmojiTab) ||
      EMOJI_CATEGORIES[0],
    [activeChatEmojiTab]
  );

  // Đồng bộ cờ trạng thái cho cuộc hội thoại đang mở
  const currentConvSummary = useMemo(
    () => conversations.find((c) => c.partner._id === activePartner?._id),
    [conversations, activePartner?._id]
  );

  const isCurrentPinned = Boolean(
    currentConvSummary?.isPinned ?? activeMeta?.isPinned
  );
  const isCurrentArchived = Boolean(
    currentConvSummary?.isArchived ?? activeMeta?.isArchived
  );
  const isCurrentMuted = Boolean(
    currentConvSummary?.isMuted ?? activeMeta?.isMuted
  );
  const isCurrentBlockedByMe = Boolean(
    currentConvSummary?.isBlockedByMe ?? activeMeta?.isBlockedByMe
  );
  const isCurrentPartnerOnline =
    !isCurrentBlockedByMe &&
    Boolean(
      currentConvSummary?.isOnline ??
        activeMeta?.isOnline ??
        activePartner?.isOnline
    );
  const currentPartnerLastActiveAt =
    currentConvSummary?.lastActiveAt ??
    activeMeta?.lastActiveAt ??
    activePartner?.lastActiveAt ??
    null;
  const canSendToActivePartner = activeMeta ? activeMeta.canSendMessage : true;

  return (
    <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-6 lg:px-8 2xl:px-10 py-2.5 sm:py-4">
      <div className="bg-white dark:bg-[#141414] border border-zinc-200 dark:border-[#262626] rounded-3xl shadow-xl overflow-hidden flex h-[calc(100vh-7rem)] md:h-[calc(100vh-4.5rem)] min-h-[560px]">
        {/* Cột trái: Danh sách hội thoại đã có tin nhắn & bộ lọc quản lý */}
        <aside
          aria-label={t('Danh sách cuộc trò chuyện', 'Conversations list')}
          className={`${
            activePartner ? 'hidden md:flex' : 'flex'
          } w-full md:w-[300px] lg:w-[340px] xl:w-[380px] shrink-0 flex-col border-r border-zinc-200 dark:border-[#262626] bg-zinc-50/50 dark:bg-[#121212] transition-[width] duration-200`}
        >
          {/* Header Hộp thư + Dấu 3 chấm lọc Hộp thư / Chưa đọc / Ghim / Lưu trữ */}
          <div className="p-4 border-b border-zinc-200 dark:border-[#262626] space-y-3">
            <div className="flex items-center justify-between gap-2 relative">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <MessageCircle className="w-5 h-5 text-zinc-900 dark:text-white shrink-0" />
                <h1 className="text-base font-extrabold text-zinc-900 dark:text-white truncate">
                  {t('Tin nhắn', 'Messages')}
                </h1>
                {totalUnread > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500 text-white font-mono-num">
                    {totalUnread}
                  </span>
                )}
                {inboxFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setInboxFilter('all')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                  >
                    <span>
                      {inboxFilter === 'unread'
                        ? t(`Chưa đọc (${totalUnread})`, `Unread (${totalUnread})`)
                        : inboxFilter === 'pinned'
                          ? t(`Ghim (${pinnedCount})`, `Pinned (${pinnedCount})`)
                          : t(`Lưu trữ (${archivedCount})`, `Archived (${archivedCount})`)}
                    </span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Nút dấu 3 chấm chứa các chức năng lọc: Hộp thư, Chưa đọc, Ghim, Lưu trữ */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  id="inbox-filter-more-btn"
                  onClick={() => setShowInboxFilterMenu((prev) => !prev)}
                  title={t(
                    'Lọc hộp thư (Hộp thư, Chưa đọc, Ghim, Lưu trữ)',
                    'Filter inbox (Inbox, Unread, Pinned, Archived)'
                  )}
                  aria-label={t('Mở menu lọc hộp thư', 'Open inbox filter menu')}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    showInboxFilterMenu || inboxFilter !== 'all'
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1c1c1c] text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showInboxFilterMenu && (
                  <div
                    role="menu"
                    aria-label={t('Danh mục lọc tin nhắn', 'Message filter menu')}
                    className="absolute right-0 mt-2 w-52 rounded-2xl bg-white dark:bg-[#1c1c1c] border border-zinc-200 dark:border-[#303030] shadow-2xl py-1.5 z-40 text-xs font-semibold text-zinc-800 dark:text-zinc-100"
                  >
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('Bộ lọc hộp thư', 'Inbox Filters')}
                    </div>

                    <button
                      type="button"
                      id="inbox-tab-all"
                      onClick={() => {
                        setInboxFilter('all');
                        setShowInboxFilterMenu(false);
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {t(
                            `Hộp thư (${activeInboxCount})`,
                            `Inbox (${activeInboxCount})`
                          )}
                        </span>
                      </span>
                      {inboxFilter === 'all' && (
                        <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      id="inbox-tab-unread"
                      onClick={() => {
                        setInboxFilter('unread');
                        setShowInboxFilterMenu(false);
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5 text-rose-500" />
                        <span>
                          {t(`Chưa đọc (${totalUnread})`, `Unread (${totalUnread})`)}
                        </span>
                      </span>
                      {inboxFilter === 'unread' && (
                        <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      id="inbox-tab-pinned"
                      onClick={() => {
                        setInboxFilter('pinned');
                        setShowInboxFilterMenu(false);
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Pin className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {t(`Ghim (${pinnedCount})`, `Pinned (${pinnedCount})`)}
                        </span>
                      </span>
                      {inboxFilter === 'pinned' && (
                        <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      id="inbox-tab-archived"
                      onClick={() => {
                        setInboxFilter('archived');
                        setShowInboxFilterMenu(false);
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Archive className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {t(
                            `Lưu trữ (${archivedCount})`,
                            `Archived (${archivedCount})`
                          )}
                        </span>
                      </span>
                      {inboxFilter === 'archived' && (
                        <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ô tìm kiếm cuộc trò chuyện hoặc tìm thành viên mới để nhắn tin */}
            <div className="relative">
              <label htmlFor="messages-user-search" className="sr-only">
                {t(
                  'Tìm cuộc trò chuyện hoặc @username để nhắn tin mới',
                  'Search conversations or @username to start a new chat'
                )}
              </label>
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="messages-user-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  'Tìm hội thoại hoặc @username để nhắn mới...',
                  'Search chats or @username to message...'
                )}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1c1c1c] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('Xóa tìm kiếm', 'Clear search')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Danh sách cuộc trò chuyện (Chỉ hiện những tài khoản đã có tin nhắn) */}
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-zinc-200/60 dark:divide-[#202020]">
            {loadingConversations && conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                {t('Đang tải hộp thư tin nhắn...', 'Loading conversations...')}
              </div>
            ) : filteredConversations.length === 0 &&
              directoryMatches.length === 0 ? (
              <div className="p-6 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {inboxFilter === 'archived'
                    ? t(
                        'Chưa có cuộc trò chuyện nào trong mục Lưu trữ.',
                        'No archived conversations.'
                      )
                    : inboxFilter === 'pinned'
                      ? t(
                          'Chưa có cuộc trò chuyện nào được ghim.',
                          'No pinned conversations.'
                        )
                      : inboxFilter === 'unread'
                        ? t(
                            'Bạn đã đọc tất cả tin nhắn.',
                            'You have read all messages.'
                          )
                        : t(
                            'Chưa có cuộc trò chuyện nào trong hộp thư.',
                            'No conversations in your inbox yet.'
                          )}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t(
                    'Những tài khoản chưa nhắn tin sẽ không tự động hiện trong hộp thư. Hãy gõ @username vào ô tìm kiếm phía trên hoặc bấm "Nhắn tin" từ trang cá nhân thành viên để bắt đầu.',
                    'Accounts without messages are hidden from your inbox. Search @username above or click "Message" on a profile to start chatting.'
                  )}
                </p>
                {inboxFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setInboxFilter('all')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                  >
                    {t('Quay về Hộp thư chính', 'Back to main inbox')}
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredConversations.map((conv) => {
                  const isSelected = activePartner?._id === conv.partner._id;
                  const lastMsg = conv.lastMessage;
                  const isMyLastMsg = lastMsg?.senderId === user?._id;
                  const isMenuOpen = openMenuPartnerId === conv.partner._id;

                  let previewText = '';
                  if (lastMsg) {
                    const imgCount = lastMsg.images?.length ?? 0;
                    if (lastMsg.content) {
                      previewText = `${isMyLastMsg ? t('Bạn: ', 'You: ') : ''}${lastMsg.content}`;
                    } else if (imgCount > 0) {
                      previewText = `${isMyLastMsg ? t('Bạn: ', 'You: ') : ''}${t(
                        `[Đã gửi ${imgCount} ảnh]`,
                        `[Sent ${imgCount} photo(s)]`
                      )}`;
                    }
                  }

                  return (
                    <div
                      key={conv.partner._id}
                      className={`relative group flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-zinc-200/80 dark:bg-zinc-800/80'
                          : 'hover:bg-zinc-100 dark:hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/messages/${conv.partner._id}`)}
                        className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0 cursor-pointer"
                      >
                        <div className="relative shrink-0">
                          <img
                            src={
                              conv.partner.avatar ||
                              `/api/media/avatar/${encodeURIComponent(
                                conv.partner.fullName
                              )}`
                            }
                            alt={conv.partner.fullName}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                          />
                          {conv.isBlockedByMe ? (
                            <span
                              title={t('Đã chặn', 'Blocked')}
                              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-rose-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-[#121212]"
                            >
                              <Ban className="w-2.5 h-2.5" />
                            </span>
                          ) : conv.isOnline ? (
                            <span
                              title={t('Đang hoạt động', 'Active now')}
                              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121212]"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1 pr-8">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`text-xs truncate ${
                                  conv.unreadCount > 0 && !conv.isMuted
                                    ? 'font-extrabold text-zinc-950 dark:text-white'
                                    : 'font-bold text-zinc-900 dark:text-zinc-100'
                                }`}
                              >
                                {conv.partner.fullName}
                              </span>
                              {conv.isPinned && (
                                <Pin
                                  className="w-3 h-3 text-zinc-600 dark:text-zinc-300 shrink-0"
                                  aria-label={t('Đã ghim', 'Pinned')}
                                />
                              )}
                              {conv.isMuted && (
                                <BellOff
                                  className="w-3 h-3 text-zinc-400 shrink-0"
                                  aria-label={t('Đã tắt thông báo', 'Muted')}
                                />
                              )}
                              {conv.isArchived && (
                                <Archive
                                  className="w-3 h-3 text-zinc-400 shrink-0"
                                  aria-label={t('Đã lưu trữ', 'Archived')}
                                />
                              )}
                            </div>
                            {lastMsg && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                                {formatRelativeTimeVi(lastMsg.createdAt)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            <span>@{conv.partner.username}</span>
                            {conv.isMutualFollow && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                · {t('Bạn bè Follow', 'Mutual')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p
                              className={`text-xs truncate ${
                                conv.unreadCount > 0 && !conv.isMuted
                                  ? 'font-bold text-zinc-900 dark:text-white'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {previewText}
                            </p>
                            {conv.unreadCount > 0 && (
                              <span
                                className={`px-1.5 min-w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 font-mono-num ${
                                  conv.isMuted ? 'bg-zinc-500' : 'bg-rose-500'
                                }`}
                              >
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Nút ••• luôn hiển thị rõ ràng, không bị ẩn mất khi ấn Tắt thông báo */}
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuPartnerId((prev) =>
                              prev === conv.partner._id ? null : conv.partner._id
                            );
                          }}
                          aria-label={t(
                            `Tùy chọn hội thoại với ${conv.partner.fullName}`,
                            `Conversation options for ${conv.partner.fullName}`
                          )}
                          className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                            isMenuOpen
                              ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white shadow-sm'
                              : 'bg-white/95 dark:bg-[#1f1f1f]/95 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white shadow-xs'
                          }`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            aria-label={t(
                              'Menu quản lý hội thoại',
                              'Conversation actions menu'
                            )}
                            className="absolute right-0 mt-1.5 w-52 rounded-2xl bg-white dark:bg-[#1c1c1c] border border-zinc-200 dark:border-[#303030] shadow-2xl py-1.5 z-40 text-xs font-semibold text-zinc-800 dark:text-zinc-100"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  conv.partner._id,
                                  conv.isPinned ? 'unpin' : 'pin'
                                )
                              }
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                            >
                              <Pin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                              <span>
                                {conv.isPinned
                                  ? t('Bỏ ghim hội thoại', 'Unpin conversation')
                                  : t('Ghim hội thoại', 'Pin conversation')}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  conv.partner._id,
                                  conv.isMuted ? 'unmute' : 'mute'
                                )
                              }
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                            >
                              {conv.isMuted ? (
                                <Bell className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                              ) : (
                                <BellOff className="w-3.5 h-3.5 text-zinc-500" />
                              )}
                              <span>
                                {conv.isMuted
                                  ? t('Bật thông báo', 'Unmute notifications')
                                  : t('Tắt thông báo', 'Mute notifications')}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  conv.partner._id,
                                  conv.isArchived ? 'unarchive' : 'archive'
                                )
                              }
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5 text-zinc-500" />
                              <span>
                                {conv.isArchived
                                  ? t('Bỏ lưu trữ', 'Unarchive conversation')
                                  : t('Lưu trữ hội thoại', 'Archive conversation')}
                              </span>
                            </button>

                            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(conv.partner._id, 'delete')
                              }
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{t('Xóa hội thoại', 'Delete conversation')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  conv.partner._id,
                                  conv.isBlockedByMe ? 'unblock' : 'block'
                                )
                              }
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              {conv.isBlockedByMe ? (
                                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {conv.isBlockedByMe
                                  ? t(
                                      `Bỏ chặn @${conv.partner.username}`,
                                      `Unblock @${conv.partner.username}`
                                    )
                                  : t(
                                      `Chặn @${conv.partner.username}`,
                                      `Block @${conv.partner.username}`
                                    )}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuPartnerId(null);
                                setReportTargetUser(conv.partner);
                              }}
                              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                              <span>{t('Báo cáo người dùng', 'Report user')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Kết quả tìm kiếm thành viên chưa có tin nhắn (chỉ hiện khi người dùng chủ động gõ tìm kiếm) */}
                {searchQuery.trim() && directoryMatches.length > 0 && (
                  <div className="pt-2 pb-3">
                    <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      <span>
                        {t(
                          'Bắt đầu cuộc trò chuyện mới',
                          'Start a new conversation'
                        )}
                      </span>
                    </div>
                    {directoryMatches.map((member) => (
                      <button
                        key={member._id}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          navigate(`/messages/${member._id}`);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                      >
                        <img
                          src={
                            member.avatar ||
                            `/api/media/avatar/${encodeURIComponent(
                              member.fullName
                            )}`
                          }
                          alt={member.fullName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {member.fullName}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            @{member.username} · {member.homeCity}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Cột phải: Cửa sổ Chat 1-1 */}
        <section
          aria-label={t('Nội dung cuộc trò chuyện', 'Chat window')}
          className={`${
            activePartner ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col bg-white dark:bg-[#141414] min-w-0`}
        >
          {!activePartner ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white flex items-center justify-center">
                <MessageCircle className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                {t(
                  'Chọn một cuộc trò chuyện hoặc tìm thành viên để nhắn tin',
                  'Select a conversation or search a member to start messaging'
                )}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                {t(
                  'Hộp thư chỉ hiển thị những người bạn đã từng nhắn tin để tránh làm phiền. Bạn có thể tùy chỉnh quyền nhận tin nhắn trong phần Cài đặt.',
                  'Your inbox only shows active chats. You can manage message privacy preferences inside Settings.'
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Header của cuộc trò chuyện + Các nút chức năng Ghim, Lưu trữ, Tắt thông báo, Xóa, Chặn, Báo cáo */}
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-[#262626] flex items-center justify-between gap-2 bg-white/95 dark:bg-[#141414]/95 backdrop-blur relative z-30">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate('/messages')}
                    aria-label={t('Quay lại danh sách tin nhắn', 'Back to inbox')}
                    className="md:hidden p-2 -ml-1 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <Link
                    to={`/profile/${activePartner._id}`}
                    className="flex items-center gap-3 min-w-0 group"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={
                          activePartner.avatar ||
                          `/api/media/avatar/${encodeURIComponent(
                            activePartner.fullName
                          )}`
                        }
                        alt={activePartner.fullName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                      />
                      {isCurrentPartnerOnline && (
                        <span
                          title={t('Đang hoạt động', 'Active now')}
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#141414]"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:underline truncate">
                          {activePartner.fullName}
                        </span>
                        {activePartner.role === 'admin' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
                            Admin
                          </span>
                        )}
                        {isCurrentPinned && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            <Pin className="w-2.5 h-2.5" />
                            {t('Đã ghim', 'Pinned')}
                          </span>
                        )}
                        {isCurrentMuted && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-500/15 text-zinc-500 dark:text-zinc-400">
                            <BellOff className="w-2.5 h-2.5" />
                            {t('Tắt TB', 'Muted')}
                          </span>
                        )}
                        {isCurrentArchived && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            <Archive className="w-2.5 h-2.5" />
                            {t('Lưu trữ', 'Archived')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        <span className="font-medium">
                          @{activePartner.username}
                        </span>
                        <span>·</span>
                        {isCurrentPartnerOnline ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                            {t('Đang hoạt động', 'Active now')}
                          </span>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400 truncate">
                            {currentPartnerLastActiveAt
                              ? t(
                                  `Hoạt động ${formatRelativeTimeVi(currentPartnerLastActiveAt)}`,
                                  `Active ${formatRelativeTimeVi(currentPartnerLastActiveAt)}`
                                )
                              : t('Không hoạt động', 'Offline')}
                          </span>
                        )}
                        {activePartner.homeCity && (
                          <span className="hidden sm:inline-flex items-center gap-0.5 truncate">
                            · <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                            {activePartner.homeCity}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>

                {/* Chỉ để lại duy nhất nút Dấu 3 chấm (...) trên Header Chat; toàn bộ Ghim, Thông báo, Hồ sơ được đưa vào Bảng thông tin đoạn chat */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    id="chat-header-more-btn"
                    onClick={() => setShowHeaderActionsMenu((prev) => !prev)}
                    title={t(
                      'Mở thông tin & tùy chỉnh đoạn chat',
                      'Open chat info & settings'
                    )}
                    aria-label={t(
                      'Mở menu quản lý hội thoại',
                      'Open conversation actions menu'
                    )}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                      showHeaderActionsMenu
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Thanh tìm kiếm nội dung tin nhắn trong đoạn chat (hiện khi bấm nút "Tìm kiếm") */}
              {showChatSearch && (
                <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#181818] space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      ref={chatSearchInputRef}
                      id="chat-content-search-input"
                      type="search"
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      placeholder={t(
                        'Tìm kiếm nội dung tin nhắn trong đoạn chat này...',
                        'Search message content in this conversation...'
                      )}
                      className="flex-1 bg-transparent text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
                    />
                    {chatSearchQuery.trim() && (
                      <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 shrink-0 font-mono-num">
                        {t(
                          `${matchedSearchMessages.length} kết quả`,
                          `${matchedSearchMessages.length} matches`
                        )}
                      </span>
                    )}
                    {chatSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setChatSearchQuery('')}
                        className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        {t('Xóa', 'Clear')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowChatSearch(false);
                        setChatSearchQuery('');
                      }}
                      aria-label={t('Đóng tìm kiếm trong đoạn chat', 'Close chat search')}
                      className="p-1 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {chatSearchQuery.trim() && (
                    <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                      {matchedSearchMessages.length === 0 ? (
                        <div className="text-[11px] text-zinc-500 py-1">
                          {t(
                            `Không tìm thấy tin nhắn nào chứa "${chatSearchQuery}".`,
                            `No messages found matching "${chatSearchQuery}".`
                          )}
                        </div>
                      ) : (
                        matchedSearchMessages.map((matchMsg) => {
                          const isMineMatch = matchMsg.senderId === user?._id;
                          return (
                            <button
                              key={`search-hit-${matchMsg._id}`}
                              type="button"
                              onClick={() => scrollToMessageInChat(matchMsg._id)}
                              className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#222222] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between gap-2 text-left cursor-pointer"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-zinc-900 dark:text-white mr-1.5">
                                  {isMineMatch
                                    ? t('Bạn:', 'You:')
                                    : `${activePartner.fullName}:`}
                                </span>
                                <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                                  {matchMsg.content ||
                                    t('[Hình ảnh đính kèm]', '[Attached photo]')}
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-400 shrink-0">
                                {formatRelativeTimeVi(matchMsg.createdAt)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Thanh hiển thị nhanh Tin nhắn đã ghim ngay đầu khung chat (nếu có tin nhắn đã ghim) */}
              {pinnedMessagesInChat.length > 0 && (
                <div className="px-4 py-2 border-b border-zinc-200 dark:border-[#262626] bg-zinc-50/90 dark:bg-[#191919] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      scrollToMessageInChat(pinnedMessagesInChat[0]._id)
                    }
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                  >
                    <span className="w-6 h-6 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center shrink-0">
                      <Pin className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span>
                          {t(
                            `Tin nhắn đã ghim (${pinnedMessagesInChat.length})`,
                            `Pinned messages (${pinnedMessagesInChat.length})`
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate group-hover:underline">
                        {pinnedMessagesInChat[0].content ||
                          t('[Hình ảnh đính kèm]', '[Attached photo]')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHeaderActionsMenu(true);
                      setOpenChatInfoSec((prev) => ({ ...prev, info: true }));
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 shrink-0 cursor-pointer"
                  >
                    {t('Xem tất cả', 'View all')}
                  </button>
                </div>
              )}

              {/* Khu vực thân cuộc trò chuyện + Bảng thông tin đoạn chat bên phải (khi bấm dấu 3 chấm) */}
              <div className="flex-1 flex min-h-0 overflow-hidden relative">
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                  {/* Danh sách tin nhắn */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-zinc-50/40 dark:bg-[#0f0f0f]">
                    {/* Thẻ giới thiệu đầu cuộc trò chuyện */}
                    <div className="py-4 px-3 text-center space-y-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60 mb-3">
                      <img
                        src={
                          activePartner.avatar ||
                          `/api/media/avatar/${encodeURIComponent(
                            activePartner.fullName
                          )}`
                        }
                        alt={activePartner.fullName}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full object-cover mx-auto border-2 border-zinc-300 dark:border-zinc-700"
                      />
                      <div className="text-sm font-bold text-zinc-900 dark:text-white">
                        {activePartner.fullName}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        @{activePartner.username}
                      </div>
                      {activePartner.bio && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                          {activePartner.bio}
                        </p>
                      )}
                    </div>

                    {loadingMessages && messages.length === 0 ? (
                      <div className="py-12 text-center text-xs text-zinc-500">
                        {t('Đang tải tin nhắn...', 'Loading messages...')}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="py-8 px-4 text-center">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {t(
                            'Chưa có tin nhắn nào trong đoạn chat này. Hãy nhập tin nhắn ở khung bên dưới để bắt đầu trò chuyện.',
                            'No messages yet. Type a message below to start the conversation.'
                          )}
                        </p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isMine = msg.senderId === user?._id;
                        const canDelete = isMine || user?.role === 'admin';
                        const sharedPostInfo = extractSharedPostInfoFromMessage(
                          msg.content || ''
                        );
                        const isHighlighted = highlightedMessageId === msg._id;
                        const isSearchMatch =
                          Boolean(chatSearchQuery.trim()) &&
                          normalizeSearchText(msg.content || '').includes(
                            normalizeSearchText(chatSearchQuery)
                          );

                        const isMenuOpen = openMessageMenuId === msg._id;
                        const isReactionOpen = openMessageReactionId === msg._id;
                        const reactionEntries = Object.entries(
                          msg.reactions ?? {}
                        ).filter(([, em]) => Boolean(em));
                        const myReaction = user?._id
                          ? msg.reactions?.[user._id]
                          : undefined;

                        const renderMessageActionCluster = () => (
                          <div
                            className={`relative flex items-center gap-0.5 transition-opacity shrink-0 self-center ${
                              isMenuOpen || isReactionOpen
                                ? 'opacity-100'
                                : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
                            } ${isMine ? 'flex-row' : 'flex-row-reverse'}`}
                          >
                            {/* 1. Nút Dấu 3 chấm dọc (⋮) mở menu: Thu hồi, Chuyển tiếp, Ghim, Báo cáo */}
                            <div className="relative">
                              <button
                                type="button"
                                id={`msg-more-btn-${msg._id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMessageReactionId(null);
                                  setOpenMessageMenuId((prev) =>
                                    prev === msg._id ? null : msg._id
                                  );
                                }}
                                title={t('Xem thêm', 'More actions')}
                                aria-label={t(
                                  'Tùy chọn tin nhắn',
                                  'Message options'
                                )}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                  isMenuOpen
                                    ? 'bg-zinc-200 dark:bg-[#2f2f2f] text-zinc-950 dark:text-white'
                                    : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-[#2a2a2a]'
                                }`}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {/* Hộp menu nổi (Thu hồi / Chuyển tiếp / Ghim / Báo cáo) đúng kiểu ảnh mẫu */}
                              {isMenuOpen && (
                                <div
                                  role="menu"
                                  aria-label={t(
                                    'Menu thao tác tin nhắn',
                                    'Message actions menu'
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute bottom-full mb-2.5 z-40 w-36 rounded-2xl bg-zinc-900 dark:bg-[#222222] text-white border border-zinc-800 dark:border-[#333333] p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.68)] ${
                                    isMine ? 'left-1/2 -translate-x-1/2' : 'left-1/2 -translate-x-1/2'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() =>
                                      handleDeleteMessage(msg._id, canDelete)
                                    }
                                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-left text-white hover:bg-white/10 dark:hover:bg-[#343434] transition-colors cursor-pointer"
                                  >
                                    {t('Thu hồi', 'Unsend')}
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleOpenForwardModal(msg)}
                                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-left text-white hover:bg-white/10 dark:hover:bg-[#343434] transition-colors cursor-pointer"
                                  >
                                    {t('Chuyển tiếp', 'Forward')}
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMessageMenuId(null);
                                      handleTogglePinMessage(msg._id);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-left text-white hover:bg-white/10 dark:hover:bg-[#343434] transition-colors cursor-pointer"
                                  >
                                    {msg.isPinned
                                      ? t('Bỏ ghim', 'Unpin')
                                      : t('Ghim', 'Pin')}
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMessageMenuId(null);
                                      setReportDetails(
                                        msg.content
                                          ? `${t('Nội dung tin nhắn bị báo cáo:', 'Reported message:')} "${msg.content.slice(0, 120)}"`
                                          : ''
                                      );
                                      setReportTargetUser(activePartner);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-left text-white hover:bg-white/10 dark:hover:bg-[#343434] transition-colors cursor-pointer"
                                  >
                                    {t('Báo cáo', 'Report')}
                                  </button>

                                  {/* Mũi tên nhọn hướng xuống nút 3 chấm giống ảnh mẫu */}
                                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900 dark:bg-[#222222] border-r border-b border-zinc-800 dark:border-[#333333] rotate-45 pointer-events-none" />
                                </div>
                              )}
                            </div>

                            {/* 2. Nút Mũi tên trả lời (↩) */}
                            <button
                              type="button"
                              id={`msg-reply-btn-${msg._id}`}
                              onClick={() => {
                                setOpenMessageMenuId(null);
                                setOpenMessageReactionId(null);
                                setReplyingToMessage(msg);
                                messageInputRef.current?.focus();
                              }}
                              title={t(
                                'Trả lời tin nhắn này',
                                'Reply to this message'
                              )}
                              aria-label={t(
                                'Trả lời tin nhắn',
                                'Reply to message'
                              )}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                            >
                              <CornerUpLeft className="w-4 h-4" />
                            </button>

                            {/* 3. Nút Mặt cảm xúc (😊) thả biểu tượng cảm xúc cho tin nhắn */}
                            <div className="relative">
                              <button
                                type="button"
                                id={`msg-react-btn-${msg._id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMessageMenuId(null);
                                  setOpenMessageReactionId((prev) =>
                                    prev === msg._id ? null : msg._id
                                  );
                                }}
                                title={t(
                                  'Bày tỏ cảm xúc',
                                  'React to message'
                                )}
                                aria-label={t(
                                  'Bày tỏ cảm xúc',
                                  'React to message'
                                )}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                  isReactionOpen || myReaction
                                    ? 'bg-zinc-200 dark:bg-[#2f2f2f] text-zinc-950 dark:text-white'
                                    : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-[#2a2a2a]'
                                }`}
                              >
                                <Smile className="w-4 h-4" />
                              </button>

                              {/* Thanh chọn nhanh 6 cảm xúc (❤️ 😆 😮 😢 😡 👍) */}
                              {isReactionOpen && (
                                <div
                                  role="dialog"
                                  aria-label={t(
                                    'Chọn cảm xúc cho tin nhắn',
                                    'Choose message reaction'
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute bottom-full mb-2.5 z-40 rounded-full bg-zinc-900 dark:bg-[#222222] border border-zinc-800 dark:border-[#333333] px-2.5 py-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.68)] flex items-center gap-1 ${
                                    isMine
                                      ? 'right-0 sm:left-1/2 sm:-translate-x-1/2'
                                      : 'left-0 sm:left-1/2 sm:-translate-x-1/2'
                                  }`}
                                >
                                  {QUICK_MESSAGE_REACTIONS.map((em) => (
                                    <button
                                      key={em}
                                      type="button"
                                      onClick={() =>
                                        handleReactToMessage(msg._id, em)
                                      }
                                      className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-transform hover:scale-125 cursor-pointer ${
                                        myReaction === em
                                          ? 'bg-white/20 ring-1 ring-white/40'
                                          : 'hover:bg-white/10'
                                      }`}
                                    >
                                      {em}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );

                        return (
                          <div
                            key={msg._id}
                            id={`chat-msg-${msg._id}`}
                            className={`flex flex-col ${
                              isMine ? 'items-end' : 'items-start'
                            } transition-all rounded-2xl ${
                              isHighlighted || isSearchMatch
                                ? 'ring-2 ring-zinc-900 dark:ring-white bg-zinc-200/40 dark:bg-zinc-800/40 p-1.5 -mx-1.5'
                                : ''
                            }`}
                          >
                            {/* Nhãn Đã ghim hoặc Đã chuyển tiếp trên tin nhắn */}
                            {(msg.isPinned || msg.isForwarded) && (
                              <div
                                className={`flex items-center gap-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1 ${
                                  isMine ? 'pr-1' : 'pl-9'
                                }`}
                              >
                                {msg.isPinned && (
                                  <span className="inline-flex items-center gap-1">
                                    <Pin className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                                    <span>
                                      {t('Tin nhắn đã ghim', 'Pinned message')}
                                    </span>
                                  </span>
                                )}
                                {msg.isForwarded && (
                                  <span className="inline-flex items-center gap-1">
                                    <Share2 className="w-3 h-3 text-zinc-500" />
                                    <span>
                                      {t('Đã chuyển tiếp', 'Forwarded')}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}

                            <div
                              className={`flex items-end gap-2 group w-full ${
                                isMine ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              {!isMine && (
                                <img
                                  src={
                                    activePartner.avatar ||
                                    `/api/media/avatar/${encodeURIComponent(
                                      activePartner.fullName
                                    )}`
                                  }
                                  alt={activePartner.fullName}
                                  referrerPolicy="no-referrer"
                                  className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
                                />
                              )}

                              {/* Cụm 3 nút thao tác bên trái bong bóng (nếu là tin nhắn của mình): [⋮] [↩] [😊] */}
                              {isMine && renderMessageActionCluster()}

                              <div
                                className={`relative max-w-[78%] sm:max-w-[68%] rounded-2xl px-3.5 py-2.5 space-y-2 shadow-xs ${
                                  reactionEntries.length > 0 ? 'mb-2.5' : ''
                                } ${
                                  isMine
                                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 rounded-br-sm'
                                    : 'bg-white dark:bg-[#1e1e1e] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-800 rounded-bl-sm'
                                }`}
                              >
                                {/* Khung trích dẫn tin nhắn được trả lời (Reply Preview) */}
                                {msg.replyTo && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      scrollToMessageInChat(msg.replyTo!._id)
                                    }
                                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-[11px] flex flex-col gap-0.5 transition-opacity hover:opacity-90 cursor-pointer ${
                                      isMine
                                        ? 'bg-white/15 text-zinc-100 dark:bg-zinc-900/10 dark:text-zinc-800'
                                        : 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    <span className="font-bold flex items-center gap-1">
                                      <CornerUpLeft className="w-3 h-3 shrink-0" />
                                      <span>
                                        {t('Trả lời', 'Replying to')}{' '}
                                        {msg.replyTo.senderId === user?._id
                                          ? t('chính bạn', 'yourself')
                                          : msg.replyTo.senderName ||
                                            activePartner.fullName}
                                      </span>
                                    </span>
                                    <span className="truncate opacity-90">
                                      {msg.replyTo.content}
                                    </span>
                                  </button>
                                )}

                                {msg.content && (
                                  <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.content}
                                  </p>
                                )}

                                {sharedPostInfo && (
                                  <Link
                                    to={sharedPostInfo.matchedUrl}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                                      isMine
                                        ? 'bg-white/15 hover:bg-white/25 text-white dark:bg-zinc-900/10 dark:hover:bg-zinc-900/20 dark:text-zinc-950'
                                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white'
                                    }`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                      {t(
                                        'Mở xem bài viết hành trình',
                                        'Open shared travel post'
                                      )}
                                    </span>
                                  </Link>
                                )}

                                {msg.images && msg.images.length > 0 && (
                                  <div
                                    className={`grid gap-1.5 ${
                                      msg.images.length === 1
                                        ? 'grid-cols-1'
                                        : 'grid-cols-2'
                                    }`}
                                  >
                                    {msg.images.map((imgUrl, idx) => (
                                      <button
                                        key={`${msg._id}-img-${idx}`}
                                        type="button"
                                        onClick={() =>
                                          setLightboxImage({
                                            images: msg.images || [imgUrl],
                                            currentIndex: idx,
                                            title: t(
                                              'Ảnh tin nhắn',
                                              'Message photo'
                                            ),
                                          })
                                        }
                                        className="block overflow-hidden rounded-xl border border-black/10 dark:border-white/10 cursor-zoom-in"
                                      >
                                        <img
                                          src={imgUrl}
                                          alt={t(
                                            'Ảnh đính kèm',
                                            'Attached photo'
                                          )}
                                          className="max-h-52 w-full object-cover hover:scale-[1.02] transition-transform"
                                        />
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <div
                                  className={`flex items-center justify-end gap-1 text-[10px] ${
                                    isMine
                                      ? 'text-zinc-400 dark:text-zinc-500'
                                      : 'text-zinc-400 dark:text-zinc-500'
                                  }`}
                                >
                                  <span>
                                    {formatRelativeTimeVi(msg.createdAt)}
                                  </span>
                                  {isMine &&
                                    (msg.isRead ? (
                                      <span
                                        title={t('Đã xem', 'Seen')}
                                        className="inline-flex items-center gap-0.5 font-semibold"
                                      >
                                        <CheckCheck className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      <span
                                        title={t('Đã gửi', 'Sent')}
                                        className="inline-flex items-center gap-0.5"
                                      >
                                        <Check className="w-3 h-3" />
                                      </span>
                                    ))}
                                </div>

                                {/* Huy hiệu biểu tượng cảm xúc đã thả trên bong bóng tin nhắn */}
                                {reactionEntries.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      myReaction
                                        ? handleReactToMessage(
                                            msg._id,
                                            myReaction
                                          )
                                        : setOpenMessageReactionId(msg._id)
                                    }
                                    title={t(
                                      'Cảm xúc trên tin nhắn',
                                      'Message reactions'
                                    )}
                                    className={`absolute -bottom-3 ${
                                      isMine ? 'right-2' : 'left-2'
                                    } inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#252525] border border-zinc-200 dark:border-zinc-700 shadow-md text-xs cursor-pointer`}
                                  >
                                    {Array.from(
                                      new Set(
                                        reactionEntries.map(([, em]) => em)
                                      )
                                    ).map((em) => (
                                      <span key={em}>{em}</span>
                                    ))}
                                    {reactionEntries.length > 1 && (
                                      <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200 pl-0.5">
                                        {reactionEntries.length}
                                      </span>
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* Cụm 3 nút thao tác bên phải bong bóng (nếu là tin nhắn của đối phương): [😊] [↩] [⋮] */}
                              {!isMine && renderMessageActionCluster()}
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Khung soạn thảo tin nhắn hiện đại (Đã bỏ hàng emoji nổi, thêm nút mặt cảm xúc giống bình luận & thanh trả lời tin nhắn) */}
                  <div className="p-3 sm:p-3.5 border-t border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#141414] space-y-2 relative">
                    {error && (
                      <div
                        role="alert"
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs flex items-center justify-between"
                      >
                        <span>{error}</span>
                        <button
                          type="button"
                          onClick={() => setError(null)}
                          className="text-rose-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {!canSendToActivePartner && activeMeta ? (
                      <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-[#1c1c1c] border border-zinc-200 dark:border-[#2e2e2e] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                        <div className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                          <ShieldAlert className="w-5 h-5 text-zinc-600 dark:text-zinc-400 shrink-0" />
                          <span>{activeMeta.restrictionReason}</span>
                        </div>
                        {activeMeta.restrictionCode === 'blocked_by_me' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleConversationAction(
                                activePartner._id,
                                'unblock'
                              )
                            }
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 cursor-pointer shrink-0"
                          >
                            {t('Bỏ chặn ngay', 'Unblock now')}
                          </button>
                        )}
                        {activeMeta.restrictionCode === 'mutual_only' && (
                          <Link
                            to={`/profile/${activePartner._id}`}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shrink-0"
                          >
                            {t('Xem hồ sơ & Follow', 'View Profile & Follow')}
                          </Link>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Thanh hiển thị trạng thái Đang trả lời tin nhắn */}
                        {replyingToMessage && (
                          <div className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-[#1e1e1e] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span>
                                  {t('Đang trả lời', 'Replying to')}{' '}
                                  {replyingToMessage.senderId === user?._id
                                    ? t('chính bạn', 'yourself')
                                    : activePartner.fullName}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                {replyingToMessage.content ||
                                  t('[Hình ảnh đính kèm]', '[Attached photo]')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReplyingToMessage(null)}
                              aria-label={t('Hủy trả lời', 'Cancel reply')}
                              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {/* Khay xem trước ảnh đính kèm */}
                        {draftImages.length > 0 && (
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                            {draftImages.map((img, idx) => (
                              <div
                                key={`${img}-${idx}`}
                                className="relative w-16 h-16 rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700 shrink-0"
                              >
                                <img
                                  src={img}
                                  alt={t('Ảnh đính kèm', 'Draft attachment')}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftImages((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                  aria-label={t(
                                    'Xóa ảnh đính kèm',
                                    'Remove photo'
                                  )}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Dòng nhập tin nhắn đồng nhất: [Ảnh] [Mặt cảm xúc 😊] [Ô nhập tin nhắn gọn đẹp không thanh cuộn] [Gửi] */}
                        <div className="relative flex items-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-[#1c1c1c] px-2 py-1.5 focus-within:border-zinc-900 dark:focus-within:border-zinc-300 transition-colors">
                          {/* Cửa sổ nổi chọn biểu tượng cảm xúc phân nhóm (giống hệt trả lời bình luận) */}
                          {showChatEmojiPicker && (
                            <div
                              role="dialog"
                              aria-label={t(
                                'Bảng chọn biểu tượng cảm xúc',
                                'Emoji picker'
                              )}
                              className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 space-y-2.5"
                            >
                              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {EMOJI_CATEGORIES.map((cat) => (
                                    <button
                                      key={cat.id}
                                      type="button"
                                      onClick={() =>
                                        setActiveChatEmojiTab(cat.id)
                                      }
                                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                        activeChatEmojiTab === cat.id
                                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold'
                                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                      }`}
                                    >
                                      {cat.icon} {t(cat.labelVi, cat.labelEn)}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowChatEmojiPicker(false)}
                                  aria-label={t(
                                    'Đóng bảng cảm xúc',
                                    'Close emoji picker'
                                  )}
                                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="grid grid-cols-8 gap-1">
                                {activeEmojiCategoryObj.emojis.map((em) => (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => {
                                      setDraftText((prev) => `${prev}${em}`);
                                      messageInputRef.current?.focus();
                                    }}
                                    className="h-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-base transition-transform hover:scale-110 cursor-pointer"
                                  >
                                    {em}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleUploadPhotos}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={uploadingImages || draftImages.length >= 3}
                            onClick={() => fileInputRef.current?.click()}
                            title={t(
                              'Đính kèm ảnh (tối đa 3 ảnh)',
                              'Attach photos (max 3)'
                            )}
                            aria-label={t('Đính kèm ảnh', 'Attach photo')}
                            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            <ImagePlus className="w-4 h-4" />
                          </button>

                          {/* Nút dấu mặt cảm xúc (Smile) giống phần trả lời bình luận */}
                          <button
                            type="button"
                            id="chat-emoji-picker-btn"
                            onClick={() =>
                              setShowChatEmojiPicker((prev) => !prev)
                            }
                            title={t(
                              'Chọn biểu tượng cảm xúc',
                              'Choose emoji'
                            )}
                            aria-label={t(
                              'Chọn biểu tượng cảm xúc',
                              'Choose emoji'
                            )}
                            className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                              showChatEmojiPicker
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <Smile className="w-4 h-4" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor="direct-message-input"
                              className="sr-only"
                            >
                              {t('Nhập nội dung tin nhắn', 'Type a message')}
                            </label>
                            <input
                              ref={messageInputRef}
                              id="direct-message-input"
                              type="text"
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              onKeyDown={handleKeyDown}
                              placeholder={t(
                                `Nhắn tin cho @${activePartner.username}...`,
                                `Message @${activePartner.username}...`
                              )}
                              className="w-full px-2 py-1.5 text-xs sm:text-sm bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none truncate"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={
                              sending ||
                              uploadingImages ||
                              (!draftText.trim() && draftImages.length === 0)
                            }
                            onClick={() => handleSendMessage()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 disabled:opacity-40 text-white transition-colors cursor-pointer shrink-0"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{t('Gửi', 'Send')}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* BẢNG THÔNG TIN ĐOẠN CHAT BÊN PHẢI (Mở khi bấm nút Dấu 3 chấm trên Header Chat) */}
                {showHeaderActionsMenu && (
                  <aside
                    aria-label={t('Thông tin về đoạn chat', 'Chat information')}
                    className="w-72 sm:w-80 shrink-0 border-l border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#181818] overflow-y-auto custom-scrollbar flex flex-col select-none z-20"
                  >
                    {/* Khối Avatar + Tên + Trạng thái + Mã hóa + 3 nút tròn (Trang cá nhân, Tắt thông báo, Tìm kiếm) */}
                    <div className="px-5 pt-6 pb-4 flex flex-col items-center text-center space-y-2">
                      <div className="relative">
                        <img
                          src={
                            activePartner.avatar ||
                            `/api/media/avatar/${encodeURIComponent(
                              activePartner.fullName
                            )}`
                          }
                          alt={activePartner.fullName}
                          referrerPolicy="no-referrer"
                          className="w-20 h-20 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700"
                        />
                        {isCurrentPartnerOnline ? (
                          <span
                            title={t('Đang hoạt động', 'Active now')}
                            className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#181818]"
                          />
                        ) : (
                          <span
                            title={t('Không hoạt động', 'Offline')}
                            className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-zinc-400 dark:bg-zinc-600 ring-2 ring-white dark:ring-[#181818]"
                          />
                        )}
                      </div>

                      <div className="pt-1">
                        <h3 className="text-base font-bold text-zinc-950 dark:text-white">
                          {activePartner.fullName}
                        </h3>
                        <p
                          className={`text-xs mt-0.5 ${
                            isCurrentPartnerOnline
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {isCurrentPartnerOnline
                            ? t('Đang hoạt động', 'Active now')
                            : currentPartnerLastActiveAt
                              ? t(
                                  `Hoạt động ${formatRelativeTimeVi(currentPartnerLastActiveAt)}`,
                                  `Active ${formatRelativeTimeVi(currentPartnerLastActiveAt)}`
                                )
                              : t('Không hoạt động', 'Offline')}
                        </p>
                      </div>

                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-[#262626] text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                        <Lock className="w-3 h-3" />
                        <span>
                          {t('Được mã hóa đầu cuối', 'End-to-end encrypted')}
                        </span>
                      </div>

                      {/* 3 Nút Tròn: Trang cá nhân | Tắt thông báo | Tìm kiếm */}
                      <div className="pt-3 flex items-start justify-center gap-5 w-full">
                        <Link
                          to={`/profile/${activePartner._id}`}
                          className="flex flex-col items-center gap-1.5 w-20 group"
                        >
                          <span className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-[#2a2a2a] group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 flex items-center justify-center text-zinc-900 dark:text-white transition-colors">
                            <UserIcon className="w-4 h-4" />
                          </span>
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight text-center">
                            {t('Trang cá nhân', 'Profile')}
                          </span>
                        </Link>

                        <button
                          type="button"
                          id="drawer-mute-toggle-btn"
                          onClick={() =>
                            handleConversationAction(
                              activePartner._id,
                              isCurrentMuted ? 'unmute' : 'mute'
                            )
                          }
                          className="flex flex-col items-center gap-1.5 w-20 group cursor-pointer"
                        >
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              isCurrentMuted
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                                : 'bg-zinc-100 dark:bg-[#2a2a2a] group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 text-zinc-900 dark:text-white'
                            }`}
                          >
                            {isCurrentMuted ? (
                              <BellOff className="w-4 h-4" />
                            ) : (
                              <Bell className="w-4 h-4" />
                            )}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight text-center">
                            {isCurrentMuted
                              ? t('Bật thông báo', 'Unmute')
                              : t('Tắt thông báo', 'Mute')}
                          </span>
                        </button>

                        <button
                          type="button"
                          id="drawer-search-toggle-btn"
                          onClick={() => {
                            setShowChatSearch((prev) => {
                              const next = !prev;
                              if (next) {
                                window.setTimeout(() => {
                                  chatSearchInputRef.current?.focus();
                                }, 50);
                              }
                              return next;
                            });
                          }}
                          className="flex flex-col items-center gap-1.5 w-20 group cursor-pointer"
                        >
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              showChatSearch
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                                : 'bg-zinc-100 dark:bg-[#2a2a2a] group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 text-zinc-900 dark:text-white'
                            }`}
                          >
                            <Search className="w-4 h-4" />
                          </span>
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight text-center">
                            {t('Tìm kiếm', 'Search')}
                          </span>
                        </button>
                      </div>

                      {/* Khung tìm kiếm nội dung trong đoạn chat ngay trong bảng 3 chấm khi bấm Tìm kiếm */}
                      {showChatSearch && (
                        <div className="w-full pt-2 text-left space-y-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="search"
                              value={chatSearchQuery}
                              onChange={(e) =>
                                setChatSearchQuery(e.target.value)
                              }
                              placeholder={t(
                                'Nhập từ khóa tìm trong đoạn chat...',
                                'Search content in this chat...'
                              )}
                              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#242424] border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none"
                            />
                            {chatSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setChatSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4 Mục Accordion chuẩn bố cục ảnh mẫu */}
                    <div className="px-2 pb-4 space-y-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {/* 1. Thông tin về đoạn chat (Chứa Tin nhắn đã ghim + Ghim/Lưu trữ đoạn chat) */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenChatInfoSec((prev) => ({
                              ...prev,
                              info: !prev.info,
                            }))
                          }
                          className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <span>
                              {t('Thông tin về đoạn chat', 'Chat info')}
                            </span>
                            {pinnedMessagesInChat.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono-num">
                                {pinnedMessagesInChat.length}
                              </span>
                            )}
                          </span>
                          {openChatInfoSec.info ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>

                        {openChatInfoSec.info && (
                          <div className="pl-2 pr-1 py-1.5 space-y-2">
                            {/* Hộp Tin nhắn đã ghim trong đoạn chat */}
                            <div className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-800 dark:text-zinc-100">
                                  <Pin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                                  <span>
                                    {t(
                                      `Tin nhắn đã ghim (${pinnedMessagesInChat.length})`,
                                      `Pinned messages (${pinnedMessagesInChat.length})`
                                    )}
                                  </span>
                                </span>

                                {messages.length > 0 && (
                                  <button
                                    type="button"
                                    id="drawer-add-pin-msg-btn"
                                    onClick={() =>
                                      setShowPinPickerInDrawer((prev) => !prev)
                                    }
                                    className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer"
                                  >
                                    {showPinPickerInDrawer
                                      ? t('Đóng', 'Close')
                                      : t('+ Ghim tin nhắn', '+ Pin message')}
                                  </button>
                                )}
                              </div>

                              {pinnedMessagesInChat.length === 0 ? (
                                <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                  {t(
                                    'Chưa có tin nhắn nào được ghim. Hãy bấm biểu tượng 📌 cạnh tin nhắn trong đoạn chat hoặc nút "+ Ghim tin nhắn" ở trên.',
                                    'No pinned messages yet. Click the 📌 icon next to any message in chat or "+ Pin message" above.'
                                  )}
                                </p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {pinnedMessagesInChat.map((pMsg) => {
                                    const isMyPin =
                                      pMsg.senderId === user?._id;
                                    return (
                                      <div
                                        key={`pinned-drawer-${pMsg._id}`}
                                        className="p-2 rounded-xl bg-white dark:bg-[#161616] border border-zinc-200/70 dark:border-zinc-800 space-y-1"
                                      >
                                        <div className="flex items-center justify-between gap-1.5 text-[10px] text-zinc-500">
                                          <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate">
                                            {isMyPin
                                              ? t('Bạn', 'You')
                                              : activePartner.fullName}
                                          </span>
                                          <span>
                                            {formatRelativeTimeVi(
                                              pMsg.createdAt
                                            )}
                                          </span>
                                        </div>
                                        <p className="text-xs font-normal text-zinc-700 dark:text-zinc-200 line-clamp-2 break-words">
                                          {pMsg.content ||
                                            t(
                                              '[Hình ảnh đính kèm]',
                                              '[Attached photo]'
                                            )}
                                        </p>
                                        <div className="flex items-center justify-end gap-2 pt-0.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              scrollToMessageInChat(pMsg._id)
                                            }
                                            className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer"
                                          >
                                            {t('Xem trong chat', 'Jump to message')}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleTogglePinMessage(
                                                pMsg._id,
                                                false
                                              )
                                            }
                                            className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                                          >
                                            {t('Bỏ ghim', 'Unpin')}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Danh sách chọn nhanh tin nhắn trong đoạn chat để ghim */}
                              {showPinPickerInDrawer && messages.length > 0 && (
                                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                                  <div className="text-[10px] font-semibold text-zinc-500">
                                    {t(
                                      'Chọn tin nhắn trong đoạn chat để ghim:',
                                      'Select a message in chat to pin:'
                                    )}
                                  </div>
                                  {messages
                                    .slice()
                                    .reverse()
                                    .map((cand) => (
                                      <button
                                        key={`cand-pin-${cand._id}`}
                                        type="button"
                                        onClick={() =>
                                          handleTogglePinMessage(
                                            cand._id,
                                            !cand.isPinned
                                          )
                                        }
                                        className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#161616] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between gap-2 text-left cursor-pointer"
                                      >
                                        <span className="text-[11px] font-normal text-zinc-700 dark:text-zinc-200 truncate">
                                          {cand.content ||
                                            t(
                                              '[Hình ảnh đính kèm]',
                                              '[Attached photo]'
                                            )}
                                        </span>
                                        <span className="text-[10px] font-bold text-zinc-900 dark:text-white shrink-0">
                                          {cand.isPinned
                                            ? t('Bỏ ghim', 'Unpin')
                                            : t('Ghim', 'Pin')}
                                        </span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  activePartner._id,
                                  isCurrentPinned ? 'unpin' : 'pin'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-[#242424] text-left cursor-pointer"
                            >
                              <span className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#2a2a2a] flex items-center justify-center shrink-0">
                                <Pin className="w-3.5 h-3.5" />
                              </span>
                              <span>
                                {isCurrentPinned
                                  ? t('Bỏ ghim đoạn chat', 'Unpin chat')
                                  : t('Ghim đoạn chat', 'Pin chat')}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  activePartner._id,
                                  isCurrentArchived ? 'unarchive' : 'archive'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-[#242424] text-left cursor-pointer"
                            >
                              <span className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#2a2a2a] flex items-center justify-center shrink-0">
                                <Archive className="w-3.5 h-3.5" />
                              </span>
                              <span>
                                {isCurrentArchived
                                  ? t('Bỏ lưu trữ đoạn chat', 'Unarchive chat')
                                  : t('Lưu trữ đoạn chat', 'Archive chat')}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. Tùy chỉnh đoạn chat */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenChatInfoSec((prev) => ({
                              ...prev,
                              custom: !prev.custom,
                            }))
                          }
                          className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                        >
                          <span>
                            {t('Tùy chỉnh đoạn chat', 'Customize chat')}
                          </span>
                          {openChatInfoSec.custom ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>

                        {openChatInfoSec.custom && (
                          <div className="pl-2 pr-1 py-1 space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setShowChatEmojiPicker(true);
                                messageInputRef.current?.focus();
                              }}
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-[#242424] text-left cursor-pointer"
                            >
                              <span className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#2a2a2a] flex items-center justify-center shrink-0">
                                <Smile className="w-3.5 h-3.5" />
                              </span>
                              <span>
                                {t(
                                  'Mở bộ chọn biểu tượng cảm xúc',
                                  'Open emoji picker'
                                )}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. File phương tiện và file (Mở sẵn giống ảnh mẫu) */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenChatInfoSec((prev) => ({
                              ...prev,
                              media: !prev.media,
                            }))
                          }
                          className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                        >
                          <span>
                            {t('File phương tiện và file', 'Media and files')}
                          </span>
                          {openChatInfoSec.media ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>

                        {openChatInfoSec.media && (
                          <div className="pl-2 pr-1 py-1 space-y-1">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveMediaSubTab((prev) =>
                                  prev === 'photos' ? 'none' : 'photos'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-[#242424] text-left cursor-pointer"
                            >
                              <ImageIcon className="w-4 h-4 text-zinc-700 dark:text-zinc-200 shrink-0" />
                              <span>{t('File phương tiện', 'Media')}</span>
                            </button>

                            {activeMediaSubTab === 'photos' && (
                              <div className="px-3 py-2">
                                {messages.flatMap((m) => m.images || [])
                                  .length === 0 ? (
                                  <p className="text-[11px] font-normal text-zinc-500">
                                    {t(
                                      'Chưa có ảnh nào được gửi trong đoạn chat này.',
                                      'No photos shared in this chat yet.'
                                    )}
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {messages
                                      .flatMap((m) => m.images || [])
                                      .map((imgUrl, idx, arr) => (
                                        <button
                                          key={`${imgUrl}-${idx}`}
                                          type="button"
                                          onClick={() =>
                                            setLightboxImage({
                                              images: arr,
                                              currentIndex: idx,
                                              title: t(
                                                'File phương tiện',
                                                'Shared media'
                                              ),
                                            })
                                          }
                                          className="aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                                        >
                                          <img
                                            src={imgUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                          />
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setActiveMediaSubTab((prev) =>
                                  prev === 'files' ? 'none' : 'files'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-[#242424] text-left cursor-pointer"
                            >
                              <FileText className="w-4 h-4 text-zinc-700 dark:text-zinc-200 shrink-0" />
                              <span>{t('File', 'Files')}</span>
                            </button>

                            {activeMediaSubTab === 'files' && (
                              <div className="px-3 py-2 space-y-1.5">
                                {messages.filter((m) =>
                                  Boolean(
                                    extractSharedPostInfoFromMessage(
                                      m.content || ''
                                    )
                                  )
                                ).length === 0 ? (
                                  <p className="text-[11px] font-normal text-zinc-500">
                                    {t(
                                      'Chưa có liên kết hoặc bài viết đính kèm.',
                                      'No shared files or links yet.'
                                    )}
                                  </p>
                                ) : (
                                  messages
                                    .map((m) =>
                                      extractSharedPostInfoFromMessage(
                                        m.content || ''
                                      )
                                    )
                                    .filter(
                                      (
                                        item
                                      ): item is {
                                        postId: string;
                                        matchedUrl: string;
                                      } => Boolean(item)
                                    )
                                    .map((item, idx) => (
                                      <Link
                                        key={`${item.postId}-${idx}`}
                                        to={item.matchedUrl}
                                        className="flex items-center gap-2 p-2 rounded-xl bg-zinc-100 dark:bg-[#242424] hover:opacity-90 text-[11px]"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">
                                          {t(
                                            `Bài viết hành trình #${item.postId}`,
                                            `Shared post #${item.postId}`
                                          )}
                                        </span>
                                      </Link>
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 4. Quyền riêng tư và hỗ trợ */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenChatInfoSec((prev) => ({
                              ...prev,
                              privacy: !prev.privacy,
                            }))
                          }
                          className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                        >
                          <span>
                            {t(
                              'Quyền riêng tư và hỗ trợ',
                              'Privacy and support'
                            )}
                          </span>
                          {openChatInfoSec.privacy ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>

                        {openChatInfoSec.privacy && (
                          <div className="pl-2 pr-1 py-1 space-y-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  activePartner._id,
                                  'delete'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 shrink-0" />
                              <span>{t('Xóa đoạn chat', 'Delete chat')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleConversationAction(
                                  activePartner._id,
                                  isCurrentBlockedByMe ? 'unblock' : 'block'
                                )
                              }
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              {isCurrentBlockedByMe ? (
                                <Unlock className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Ban className="w-4 h-4 shrink-0" />
                              )}
                              <span>
                                {isCurrentBlockedByMe
                                  ? t(
                                      `Bỏ chặn @${activePartner.username}`,
                                      `Unblock @${activePartner.username}`
                                    )
                                  : t(
                                      `Chặn @${activePartner.username}`,
                                      `Block @${activePartner.username}`
                                    )}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setReportTargetUser(activePartner);
                              }}
                              className="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left cursor-pointer"
                            >
                              <Flag className="w-4 h-4 shrink-0" />
                              <span>
                                {t(
                                  'Báo cáo cuộc trò chuyện',
                                  'Report conversation'
                                )}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>
                )}
              </div>
            </>
      )}
    </section>
  </div>

      {/* CỬA SỔ NỔI 1: Cài đặt Bảo mật & Tránh làm phiền (Làm mờ nền xung quanh kiểu Threads) */}
      {showPrivacyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(
            'Cài đặt bảo mật và tránh làm phiền tin nhắn',
            'Message privacy and anti-spam settings'
          )}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrivacyModal(false);
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2c2c2c] rounded-3xl w-full max-w-[520px] max-h-[85vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                <h2 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white">
                  {t(
                    'Bảo mật tin nhắn & Tránh làm phiền',
                    'Message Privacy & Anti-Spam'
                  )}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                aria-label={t('Đóng cửa sổ', 'Close modal')}
                className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('Ai có thể gửi tin nhắn cho bạn?', 'Who can message you?')}
                </div>

                {/* Lựa chọn 1: Mọi thành viên */}
                <button
                  type="button"
                  id="privacy-option-everyone"
                  disabled={savingPrivacy}
                  onClick={() => handleUpdatePrivacy('everyone')}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    messagePrivacy === 'everyone'
                      ? 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800/60'
                      : 'border-zinc-200 dark:border-[#2c2c2c] hover:bg-zinc-50 dark:hover:bg-[#202020]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                      {t(
                        'Mọi thành viên trên Lữ Hành Việt',
                        'Everyone on Lữ Hành Việt'
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {t(
                        'Bất kỳ thành viên nào (trừ người bị chặn) đều có thể gửi tin nhắn trao đổi lịch trình với bạn.',
                        'Any member (except blocked accounts) can send you direct messages.'
                      )}
                    </p>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      messagePrivacy === 'everyone'
                        ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                        : 'border-zinc-400'
                    }`}
                  >
                    {messagePrivacy === 'everyone' && (
                      <Check className="w-3 h-3" />
                    )}
                  </span>
                </button>

                {/* Lựa chọn 2: Chỉ nhận tin nhắn từ người đã follow và được mình follow lại */}
                <button
                  type="button"
                  id="privacy-option-mutual"
                  disabled={savingPrivacy}
                  onClick={() => handleUpdatePrivacy('mutual')}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    messagePrivacy === 'mutual'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-200 dark:border-[#2c2c2c] hover:bg-zinc-50 dark:hover:bg-[#202020]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                        {t(
                          'Chỉ người đã Follow và được mình Follow lại',
                          'Mutual followers only (Follow each other)'
                        )}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                        {t('Chống làm phiền', 'Anti-spam')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {t(
                        'Chỉ những người đã theo dõi bạn VÀ được bạn theo dõi lại (bạn bè 2 chiều) mới có thể gửi tin nhắn cho bạn. Người lạ sẽ bị chặn gửi tin nhắn làm phiền.',
                        'Only users who follow you AND whom you follow back can send you messages.'
                      )}
                    </p>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      messagePrivacy === 'mutual'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-zinc-400'
                    }`}
                  >
                    {messagePrivacy === 'mutual' && (
                      <Check className="w-3 h-3" />
                    )}
                  </span>
                </button>
              </div>

              {/* Danh sách tài khoản đã chặn */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-200 dark:border-[#2a2a2a]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {t(
                      `Danh sách đã chặn (${blockedProfiles.length})`,
                      `Blocked accounts (${blockedProfiles.length})`
                    )}
                  </span>
                </div>

                {blockedProfiles.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">
                    {t(
                      'Bạn chưa chặn tài khoản nào.',
                      'You have not blocked any accounts.'
                    )}
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-[#262626] rounded-2xl border border-zinc-200 dark:border-[#2c2c2c] overflow-hidden">
                    {blockedProfiles.map((bp) => (
                      <div
                        key={bp._id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-[#141414]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={
                              bp.avatar ||
                              `/api/media/avatar/${encodeURIComponent(
                                bp.fullName
                              )}`
                            }
                            alt={bp.fullName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                              {bp.fullName}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              @{bp.username}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleConversationAction(bp._id, 'unblock')
                          }
                          className="px-3 py-1 rounded-xl text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 cursor-pointer shrink-0"
                        >
                          {t('Bỏ chặn', 'Unblock')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CỬA SỔ NỔI 2: Báo cáo cuộc trò chuyện / người dùng (Làm mờ nền xung quanh kiểu Threads) */}
      {reportTargetUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Báo cáo người dùng', 'Report user')}
          onClick={(e) => {
            if (e.target === e.currentTarget) setReportTargetUser(null);
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <form
            onSubmit={handleSubmitConversationReport}
            className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2c2c2c] rounded-3xl w-full max-w-[460px] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Flag className="w-4 h-4" />
                <h2 className="text-sm font-extrabold">
                  {t(
                    `Báo cáo @${reportTargetUser.username}`,
                    `Report @${reportTargetUser.username}`
                  )}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReportTargetUser(null)}
                aria-label={t('Đóng cửa sổ', 'Close modal')}
                className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  {t('Chọn lý do báo cáo', 'Select a reason')}
                </label>
                {[
                  t(
                    'Làm phiền hoặc gửi tin nhắn rác (Spam)',
                    'Unwanted messages or spam'
                  ),
                  t(
                    'Lừa đảo dịch vụ du lịch / booking giả mạo',
                    'Travel scam or fake booking'
                  ),
                  t(
                    'Ngôn từ quấy rối, xúc phạm hoặc không phù hợp',
                    'Harassment or inappropriate language'
                  ),
                  t(
                    'Giả mạo danh tính thành viên khác',
                    'Impersonating another member'
                  ),
                ].map((reasonOption) => (
                  <label
                    key={reasonOption}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium cursor-pointer ${
                      reportReason === reasonOption
                        ? 'border-rose-500 bg-rose-500/10 text-zinc-900 dark:text-white font-bold'
                        : 'border-zinc-200 dark:border-[#2c2c2c] text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reasonOption}
                      checked={reportReason === reasonOption}
                      onChange={() => setReportReason(reasonOption)}
                      className="accent-rose-600"
                    />
                    <span>{reasonOption}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  {t('Chi tiết bổ sung (tùy chọn)', 'Additional details (optional)')}
                </label>
                <textarea
                  rows={2}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder={t(
                    'Mô tả thêm nội dung vi phạm để Quản trị viên xử lý...',
                    'Provide context for moderators...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-[#2c2c2c] bg-zinc-50 dark:bg-[#141414] text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportAlsoBlock}
                  onChange={(e) => setReportAlsoBlock(e.target.checked)}
                  className="rounded accent-rose-600"
                />
                <span>
                  {t(
                    `Đồng thời chặn @${reportTargetUser.username} không cho nhắn tin nữa`,
                    `Also block @${reportTargetUser.username} from messaging me`
                  )}
                </span>
              </label>
            </div>

            <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-[#2a2a2a] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTargetUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submittingReport}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
              >
                {submittingReport
                  ? t('Đang gửi...', 'Submitting...')
                  : t('Gửi báo cáo', 'Submit report')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CỬA SỔ NỔI 3: Chuyển tiếp tin nhắn tới thành viên khác */}
      {forwardingMessage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Chuyển tiếp tin nhắn', 'Forward message')}
          onClick={(e) => {
            if (e.target === e.currentTarget) setForwardingMessage(null);
          }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2c2c2c] rounded-3xl w-full max-w-[440px] max-h-[82vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <h2 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white">
                  {t('Chuyển tiếp tin nhắn', 'Forward message')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                aria-label={t('Đóng cửa sổ', 'Close modal')}
                className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-zinc-100 dark:border-[#242424] space-y-2.5">
              <div className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-[#222222] text-xs text-zinc-700 dark:text-zinc-300 truncate">
                <span className="font-bold text-zinc-900 dark:text-white mr-1.5">
                  {t('Nội dung:', 'Message:')}
                </span>
                {forwardingMessage.content ||
                  t('[Hình ảnh đính kèm]', '[Attached photo]')}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                  placeholder={t(
                    'Tìm thành viên theo tên hoặc @username...',
                    'Search member by name or @username...'
                  )}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#141414] text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredForwardTargets.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  {t(
                    'Không tìm thấy thành viên phù hợp.',
                    'No matching members found.'
                  )}
                </div>
              ) : (
                filteredForwardTargets.map((targetUser) => {
                  const isSent = Boolean(forwardedUserIds[targetUser._id]);
                  const isBusy = forwardingBusyId === targetUser._id;
                  return (
                    <div
                      key={targetUser._id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-[#202020] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={
                            targetUser.avatar ||
                            `/api/media/avatar/${encodeURIComponent(
                              targetUser.fullName
                            )}`
                          }
                          alt={targetUser.fullName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {targetUser.fullName}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            @{targetUser.username}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isSent || isBusy}
                        onClick={() =>
                          handleForwardMessageToUser(targetUser._id)
                        }
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                          isSent
                            ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-default'
                            : 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
                        }`}
                      >
                        {isSent
                          ? t('Đã gửi', 'Sent')
                          : isBusy
                          ? t('Đang gửi...', 'Sending...')
                          : t('Gửi', 'Send')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <ImageLightboxModal
          images={lightboxImage.images}
          currentIndex={lightboxImage.currentIndex}
          title={lightboxImage.title}
          onSelectIndex={(idx) =>
            setLightboxImage((prev) =>
              prev ? { ...prev, currentIndex: idx } : null
            )
          }
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
};


