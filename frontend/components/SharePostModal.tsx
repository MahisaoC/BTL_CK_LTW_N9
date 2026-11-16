import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  QrCode,
  Search,
  Send,
  Share2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { TravelPost, User } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  apiRequest,
  copyTextToClipboard,
  formatVndCurrency,
  getPublicShareOrigin,
} from '../utils/api';
import {
  buildSharedPostMessagePayload,
  buildTripSummaryClipboardText,
  searchUsersByQuery,
} from '../utils/travelRules';

interface SharePostModalProps {
  post: TravelPost;
  onClose: () => void;
  onSharedFeedback?: (message: string) => void;
}

type RecipientFilterMode = 'following' | 'all';

const QUICK_SHARE_NOTES_VI = [
  'Cuối tuần đi chỗ này không?',
  'Lưu lại lịch trình này nhé!',
  'Chi phí hợp lý quá, tham khảo nè!',
  'Sắp tới lập hội đi đây đi!',
];

const QUICK_SHARE_NOTES_EN = [
  'Want to visit this place soon?',
  'Save this itinerary for our trip!',
  'Great budget breakdown, check this out!',
  'Let’s plan a trip here together!',
];

export const SharePostModal: React.FC<SharePostModalProps> = ({
  post,
  onClose,
  onSharedFeedback,
}) => {
  const { user, updateCurrentUser } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<RecipientFilterMode>('following');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [sendingToIds, setSendingToIds] = useState<string[]>([]);
  const [sentUserIds, setSentUserIds] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Bottom bar states: Copy Link, Copy Summary, QR Code
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);

  const shareUrl = useMemo(
    () => `${getPublicShareOrigin()}/posts/${post._id}`,
    [post._id]
  );

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch users for the "Chia sẻ cho người đang theo dõi" section
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoadingUsers(true);
    apiRequest<{ users: User[] }>('/api/users')
      .then((res) => {
        if (!active) return;
        const others = (res.users || []).filter(
          (u) => u._id !== user._id && !u.isLocked
        );
        setAllUsers(others);

        const followingSet = new Set(user.following || []);
        const hasFollowed = others.some((u) => followingSet.has(u._id));
        if (!hasFollowed) {
          setFilterMode('all');
        }
      })
      .catch(() => {
        // Ignore error
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const followingSet = useMemo(
    () => new Set(user?.following || []),
    [user?.following]
  );
  const followersSet = useMemo(
    () => new Set(user?.followers || []),
    [user?.followers]
  );
  const blockedSet = useMemo(
    () => new Set(user?.blockedUsers || []),
    [user?.blockedUsers]
  );

  const followedUsers = useMemo(
    () =>
      allUsers
        .filter((u) => followingSet.has(u._id) && !blockedSet.has(u._id))
        .sort((a, b) => {
          const aMutual = followersSet.has(a._id) ? 1 : 0;
          const bMutual = followersSet.has(b._id) ? 1 : 0;
          return bMutual - aMutual;
        }),
    [allUsers, followingSet, followersSet, blockedSet]
  );

  const availableUsers = useMemo(
    () =>
      allUsers
        .filter((u) => !blockedSet.has(u._id))
        .sort((a, b) => {
          const aFollow = followingSet.has(a._id) ? 1 : 0;
          const bFollow = followingSet.has(b._id) ? 1 : 0;
          if (aFollow !== bFollow) return bFollow - aFollow;
          const aMutual = followersSet.has(a._id) ? 1 : 0;
          const bMutual = followersSet.has(b._id) ? 1 : 0;
          return bMutual - aMutual;
        }),
    [allUsers, followingSet, followersSet, blockedSet]
  );

  const displayedRecipients = useMemo(() => {
    const baseList =
      filterMode === 'following' ? followedUsers : availableUsers;
    if (!searchQuery.trim()) {
      return baseList;
    }
    return searchUsersByQuery(baseList, searchQuery, 20);
  }, [filterMode, followedUsers, availableUsers, searchQuery]);

  const toggleSelectRecipient = (targetUserId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(targetUserId)
        ? prev.filter((id) => id !== targetUserId)
        : [...prev, targetUserId]
    );
  };

  // Send shared post message to one specific user
  const handleSendToSingleUser = async (targetUser: User) => {
    if (!user || sendingToIds.includes(targetUser._id)) return;
    setSendError(null);
    setSendingToIds((prev) => [...prev, targetUser._id]);

    try {
      const payload = buildSharedPostMessagePayload(post, shareUrl, customNote);
      await apiRequest(`/api/messages/${targetUser._id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSentUserIds((prev) =>
        prev.includes(targetUser._id) ? prev : [...prev, targetUser._id]
      );
      setSelectedUserIds((prev) => prev.filter((id) => id !== targetUser._id));

      const msg = t(
        `Đã gửi bài viết cho @${targetUser.username}!`,
        `Sent post to @${targetUser.username}!`
      );
      setStatusBanner(msg);
      onSharedFeedback?.(msg);
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : t(
              `Không thể gửi tin nhắn tới @${targetUser.username}.`,
              `Could not send message to @${targetUser.username}.`
            )
      );
    } finally {
      setSendingToIds((prev) => prev.filter((id) => id !== targetUser._id));
    }
  };

  // Batch send shared post message to all selected users
  const handleSendToSelectedUsers = async () => {
    if (!user || selectedUserIds.length === 0) return;
    setSendError(null);

    const targets = allUsers.filter((u) => selectedUserIds.includes(u._id));
    if (targets.length === 0) return;

    setSendingToIds((prev) => [
      ...new Set([...prev, ...targets.map((u) => u._id)]),
    ]);

    const payload = buildSharedPostMessagePayload(post, shareUrl, customNote);
    let successCount = 0;
    let firstError: string | null = null;
    const newlySentIds: string[] = [];

    for (const target of targets) {
      try {
        await apiRequest(`/api/messages/${target._id}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        successCount += 1;
        newlySentIds.push(target._id);
      } catch (err) {
        if (!firstError) {
          firstError =
            err instanceof Error
              ? err.message
              : t(
                  `Không thể gửi tin nhắn cho @${target.username}.`,
                  `Could not send message to @${target.username}.`
                );
        }
      }
    }

    setSendingToIds((prev) =>
      prev.filter((id) => !targets.some((tUser) => tUser._id === id))
    );

    if (newlySentIds.length > 0) {
      setSentUserIds((prev) => [...new Set([...prev, ...newlySentIds])]);
      setSelectedUserIds((prev) =>
        prev.filter((id) => !newlySentIds.includes(id))
      );
    }

    if (successCount > 0) {
      const msg = t(
        `Đã chia sẻ bài viết và lời nhắn tới ${successCount} người dùng!`,
        `Shared post and message with ${successCount} user(s)!`
      );
      setStatusBanner(msg);
      onSharedFeedback?.(msg);
    }
    if (firstError) {
      setSendError(firstError);
    }
  };

  const handleQuickFollowToggle = async (targetUser: User) => {
    if (!user || followBusyId) return;
    setFollowBusyId(targetUser._id);
    try {
      const res = await apiRequest<{
        following: boolean;
        currentUser: User;
        targetUser: User;
      }>(`/api/users/${targetUser._id}/follow`, { method: 'POST' });
      updateCurrentUser(res.currentUser);
      setAllUsers((prev) =>
        prev.map((u) => (u._id === targetUser._id ? res.targetUser : u))
      );
    } catch {
      // Ignore error
    } finally {
      setFollowBusyId(null);
    }
  };

  const handleCopyPostLink = async () => {
    await copyTextToClipboard(shareUrl);
    setCopiedLink(true);
    const msg = t(
      'Đã sao chép liên kết bài viết vào bộ nhớ tạm!',
      'Post link copied to clipboard!'
    );
    setStatusBanner(msg);
    onSharedFeedback?.(msg);
    window.setTimeout(() => setCopiedLink(false), 2600);
  };

  const handleCopyTripSummary = async () => {
    const summaryText = buildTripSummaryClipboardText(post, shareUrl);
    await copyTextToClipboard(summaryText);
    setCopiedSummary(true);
    const msg = t(
      'Đã sao chép bản tóm tắt lịch trình & chi phí kèm liên kết!',
      'Copied full trip summary & link!'
    );
    setStatusBanner(msg);
    onSharedFeedback?.(msg);
    window.setTimeout(() => setCopiedSummary(false), 2600);
  };

  const handleNativeOrEmailShare = async () => {
    const summaryText = buildTripSummaryClipboardText(post, shareUrl);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: post.title,
          text: summaryText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copying summary if user cancels or iframe blocks Web Share
      }
    }
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(
      `[Lữ Hành Việt] ${post.title} - ${post.location}`
    )}&body=${encodeURIComponent(summaryText)}`;
    window.location.href = mailtoUrl;
  };

  const quickNotes =
    language === 'vi' ? QUICK_SHARE_NOTES_VI : QUICK_SHARE_NOTES_EN;

  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(
    shareUrl
  )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('Chia sẻ bài viết hành trình', 'Share travel post')}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#161616] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-950 dark:text-white">
                {t('Chia sẻ bài viết hành trình', 'Share Travel Post')}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t(
                  'Gửi trực tiếp cho người đang theo dõi hoặc sao chép liên kết',
                  'Send to people you follow or copy post link'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('Đóng cửa sổ chia sẻ', 'Close share modal')}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Upper Body: Post Preview + Send to Followed Users + Message Note */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3.5">
          {/* Compact Post Preview Card */}
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#1e1e1e] border border-zinc-200/80 dark:border-zinc-800">
            {post.images?.[0] && (
              <img
                src={post.images[0]}
                alt={post.title}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-700"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  @{post.author?.username || 'wanderer'}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {post.location}
                </span>
              </div>
              <h3 className="text-xs font-bold text-zinc-950 dark:text-white truncate mt-0.5">
                {post.title}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-num mt-0.5">
                {post.durationDays} {t('ngày', 'days')} ·{' '}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatVndCurrency(post.cost)}
                </span>
              </p>
            </div>
          </div>

          {/* SECTION 1: Chia sẻ cho người mình Follow + Nhắn gửi */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                  {t(
                    'Gửi cho người đang theo dõi',
                    'Send to people you follow'
                  )}
                </span>
              </div>

              {user && (
                <div className="inline-flex items-center p-0.5 rounded-xl bg-zinc-100 dark:bg-[#222222] border border-zinc-200/70 dark:border-zinc-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterMode('following')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      filterMode === 'following'
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {t(
                      `Đang theo dõi (${followedUsers.length})`,
                      `Following (${followedUsers.length})`
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {t(
                      `Gợi ý thêm (${availableUsers.length})`,
                      `All members (${availableUsers.length})`
                    )}
                  </button>
                </div>
              )}
            </div>

            {!user ? (
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#1c1c1c] border border-zinc-200 dark:border-zinc-800 text-center space-y-2.5">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t(
                    'Đăng nhập để gửi trực tiếp bài viết này kèm lời nhắn cho những người bạn đang theo dõi.',
                    'Log in to send this post with a note directly to people you follow.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/login');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  {t('Đăng nhập ngay', 'Log in now')}
                </button>
              </div>
            ) : (
              <>
                {/* Search Following Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(
                      'Tìm người đang theo dõi theo tên hoặc @username...',
                      'Search followed users by name or @username...'
                    )}
                    className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-[#1e1e1e] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Recipient List */}
                <div className="max-h-44 overflow-y-auto custom-scrollbar divide-y divide-zinc-100 dark:divide-zinc-800/70 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818]">
                  {loadingUsers ? (
                    <div className="py-7 text-center text-xs text-zinc-500">
                      {t(
                        'Đang tải danh sách người đang theo dõi...',
                        'Loading followed users...'
                      )}
                    </div>
                  ) : displayedRecipients.length === 0 ? (
                    <div className="py-6 px-4 text-center space-y-2">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {filterMode === 'following'
                          ? t(
                              'Bạn chưa theo dõi thành viên nào khớp với tìm kiếm.',
                              'No followed members match your search.'
                            )
                          : t(
                              'Không tìm thấy thành viên phù hợp.',
                              'No matching members found.'
                            )}
                      </p>
                      {filterMode === 'following' && (
                        <button
                          type="button"
                          onClick={() => setFilterMode('all')}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          {t(
                            'Xem danh sách gợi ý để Follow & chia sẻ',
                            'Browse suggested members to Follow & share'
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    displayedRecipients.map((recipient) => {
                      const isFollowing = followingSet.has(recipient._id);
                      const isMutual =
                        isFollowing && followersSet.has(recipient._id);
                      const isSelected = selectedUserIds.includes(recipient._id);
                      const isSending = sendingToIds.includes(recipient._id);
                      const isSent = sentUserIds.includes(recipient._id);
                      const requiresMutualLock =
                        recipient.messagePrivacy === 'mutual' && !isMutual;

                      return (
                        <div
                          key={recipient._id}
                          className={`px-3.5 py-2 flex items-center justify-between gap-3 transition-colors ${
                            isSelected
                              ? 'bg-zinc-100/80 dark:bg-zinc-800/50'
                              : 'hover:bg-zinc-50 dark:hover:bg-[#202020]'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={requiresMutualLock}
                            onClick={() => toggleSelectRecipient(recipient._id)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <div className="relative shrink-0">
                              <img
                                src={
                                  recipient.avatar ||
                                  `/api/media/avatar/${encodeURIComponent(
                                    recipient.fullName
                                  )}`
                                }
                                alt={recipient.fullName}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                              />
                              {isSelected && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center border border-white dark:border-zinc-900">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                                  {recipient.fullName}
                                </span>
                                {isMutual ? (
                                  <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
                                    {t('Bạn bè Follow', 'Mutual')}
                                  </span>
                                ) : isFollowing ? (
                                  <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                                    {t('Đang theo dõi', 'Following')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                @{recipient.username}
                                {recipient.homeCity
                                  ? ` · ${recipient.homeCity}`
                                  : ''}
                              </div>
                              {requiresMutualLock && (
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  {t(
                                    'Chỉ nhận tin nhắn từ bạn bè Follow lẫn nhau',
                                    'Only accepts messages from mutual followers'
                                  )}
                                </div>
                              )}
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isFollowing && (
                              <button
                                type="button"
                                disabled={followBusyId === recipient._id}
                                onClick={() => handleQuickFollowToggle(recipient)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>{t('Follow', 'Follow')}</span>
                              </button>
                            )}

                            {isSent ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <Check className="w-3 h-3" />
                                  {t('Đã gửi', 'Sent')}
                                </span>
                                <Link
                                  to={`/messages/${encodeURIComponent(
                                    recipient._id
                                  )}`}
                                  onClick={onClose}
                                  title={t(
                                    'Mở cuộc trò chuyện',
                                    'Open conversation'
                                  )}
                                  className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isSending || requiresMutualLock}
                                onClick={() => handleSendToSingleUser(recipient)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>
                                  {isSending
                                    ? t('Đang gửi...', 'Sending...')
                                    : t('Gửi', 'Send')}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Message Note Input + Quick Chips */}
                <div className="p-3 rounded-2xl bg-zinc-50/80 dark:bg-[#1b1b1b] border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                  <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {t(
                      'Nhắn gửi kèm bài viết (tùy chọn):',
                      'Add a personal message (optional):'
                    )}
                  </label>
                  <input
                    type="text"
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    maxLength={300}
                    placeholder={t(
                      'Nhập lời nhắn gửi cho bạn đồng hành...',
                      'Write a note to send with this post...'
                    )}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#141414] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-400"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {quickNotes.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setCustomNote(chip)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          customNote === chip
                            ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white'
                            : 'bg-white dark:bg-[#222222] text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                        }`}
                      >
                        “{chip}”
                      </button>
                    ))}
                  </div>
                </div>

                {/* Batch Send Button when multiple users are selected */}
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    disabled={sendingToIds.length > 0}
                    onClick={handleSendToSelectedUsers}
                    className="w-full py-2.5 px-4 rounded-2xl text-xs font-bold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {t(
                        `Gửi bài viết & lời nhắn cho ${selectedUserIds.length} người đã chọn`,
                        `Send post & note to ${selectedUserIds.length} selected user(s)`
                      )}
                    </span>
                  </button>
                )}
              </>
            )}

            {sendError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
                {sendError}
              </p>
            )}
          </div>

          {/* Optional QR Code Drawer inside scrollable area when toggled */}
          {showQrCode && (
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#1d1d1d] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3.5">
              <div className="p-1.5 rounded-xl bg-white border border-zinc-200 shrink-0">
                <img
                  src={qrCodeImageUrl}
                  alt={t('Mã QR bài viết', 'Post QR code')}
                  className="w-20 h-20 object-contain"
                />
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-bold text-zinc-900 dark:text-white">
                  {t('Quét mã QR để mở nhanh hành trình', 'Scan QR to open trip')}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t(
                    'Bạn đồng hành có thể dùng camera điện thoại quét mã này để xem ngay vị trí, chi phí và hình ảnh chuyến đi.',
                    'Travel companions can scan this QR code with their phone camera to view this trip immediately.'
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2 (Pinned Footer phía dưới): Sao chép liên kết (Copy Link) & Tiện ích chia sẻ */}
        <div className="shrink-0 px-5 py-3.5 bg-zinc-50/70 dark:bg-[#141414] border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
              {t('Sao chép liên kết & Tiện ích chia sẻ', 'Copy Link & Share Options')}
            </span>
          </div>

          {/* Copy Link Box */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#1e1e1e] border border-zinc-200 dark:border-zinc-800">
            <div className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate select-all">
              {shareUrl}
            </div>
            <button
              type="button"
              onClick={handleCopyPostLink}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                copiedLink
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90'
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('Đã sao chép', 'Copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('Sao chép liên kết', 'Copy link')}</span>
                </>
              )}
            </button>
          </div>

          {/* Extra Complete Share Utilities Grid */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopyTripSummary}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white dark:bg-[#1c1c1c] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              {copiedSummary ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300 shrink-0" />
              )}
              <span className="text-[11px] font-semibold truncate">
                {copiedSummary
                  ? t('Đã chép tóm tắt', 'Copied summary')
                  : t('Chép tóm tắt', 'Copy summary')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrCode((prev) => !prev)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border transition-colors cursor-pointer ${
                showQrCode
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white'
                  : 'bg-white dark:bg-[#1c1c1c] hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-semibold truncate">
                {t('Mã QR bài viết', 'Post QR Code')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleNativeOrEmailShare}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white dark:bg-[#1c1c1c] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300 shrink-0" />
              <span className="text-[11px] font-semibold truncate">
                {t('Email / Khác', 'Email / More')}
              </span>
            </button>
          </div>

          {statusBanner && (
            <div
              role="status"
              className="px-3 py-1.5 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/90 text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between gap-2"
            >
              <span className="truncate">{statusBanner}</span>
              {sentUserIds.length > 0 && (
                <Link
                  to="/messages"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[11px] underline shrink-0 hover:opacity-80"
                >
                  <MessageCircle className="w-3 h-3" />
                  {t('Xem hộp thư', 'Open inbox')}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
