import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CornerDownRight,
  Trash2,
  ImagePlus,
  Smile,
  AtSign,
  Send,
  X,
  Check,
} from 'lucide-react';
import type { CommentThread, User } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest, formatVietnameseDate } from '../utils/api';
import {
  extractMentionedUsernames,
  searchUsersByQuery,
} from '../utils/travelRules';
import { ImageLightboxModal } from './ImageLightboxModal';

interface CommentSectionProps {
  postId: string;
  threads: CommentThread[];
  onThreadsUpdated: (nextThreads: CommentThread[], count: number) => void;
  compact?: boolean;
}

interface AttachedPreview {
  file: File;
  previewUrl: string;
}

const QUICK_EMOJIS = ['❤️', '😍', '🔥', '👏', '✈️', '🏝️', '📸', '🍜', '🥰', '✨'];

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

/**
 * Component #8: CommentSection
 * Hệ thống bình luận & trả lời 1 cấp nâng cao:
 * - Gửi kèm hình ảnh (tối đa 3 ảnh/bình luận) có xem trước & phóng to Lightbox
 * - Gắn thẻ đồng thời nhiều @username (qua nút @Tag hoặc gõ @ trực tiếp) kèm chip hiển thị & thông báo tự động
 * - Bộ chọn biểu tượng cảm xúc (Emoji Picker phân nhóm + Thanh Emoji nhanh)
 */
export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  threads,
  onThreadsUpdated,
  compact = false,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Danh sách thành viên để gợi ý khi gõ @ hoặc bấm nút @ Tag
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Trạng thái khung bình luận gốc (Root comment)
  const [rootContent, setRootContent] = useState('');
  const [rootAttachments, setRootAttachments] = useState<AttachedPreview[]>([]);
  const [rootTaggedUsers, setRootTaggedUsers] = useState<string[]>([]);
  const [showRootEmojiPicker, setShowRootEmojiPicker] = useState(false);
  const [showRootMentionPicker, setShowRootMentionPicker] = useState(false);
  const [rootMentionFilter, setRootMentionFilter] = useState('');
  const [activeEmojiTab, setActiveEmojiTab] = useState<string>('smileys');

  // Trạng thái khung trả lời 1 cấp (Reply comment)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<AttachedPreview[]>([]);
  const [replyTaggedUsers, setReplyTaggedUsers] = useState<string[]>([]);
  const [showReplyEmojiPicker, setShowReplyEmojiPicker] = useState(false);
  const [showReplyMentionPicker, setShowReplyMentionPicker] = useState(false);
  const [replyMentionFilter, setReplyMentionFilter] = useState('');

  // Lightbox xem ảnh đính kèm trong bình luận
  const [lightboxData, setLightboxData] = useState<{
    images: string[];
    index: number;
    title: string;
  } | null>(null);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const rootInputRef = useRef<HTMLTextAreaElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const rootFileInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);

  // Tải danh sách thành viên để phục vụ autocomplete @username
  useEffect(() => {
    let active = true;
    apiRequest<{ users: User[] }>('/api/users')
      .then((res) => {
        if (active && Array.isArray(res.users)) {
          setAllUsers(res.users);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Thu hồi ObjectURL khi unmount
  useEffect(() => {
    return () => {
      rootAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      replyAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userByUsernameMap = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      map.set(u.username.toLowerCase(), u);
    });
    return map;
  }, [allUsers]);

  // Phát hiện từ khóa sau ký tự @ cuối cùng khi người dùng đang gõ
  const detectActiveMentionQuery = (text: string): string | null => {
    const match = /(?:^|\s)@([^\s@]{0,24})$/.exec(text);
    return match ? match[1].toLowerCase() : null;
  };

  const handleRootTextChange = (val: string) => {
    setRootContent(val);
    const mentionQuery = detectActiveMentionQuery(val);
    if (mentionQuery !== null) {
      setRootMentionFilter(mentionQuery);
      setShowRootMentionPicker(true);
      setShowRootEmojiPicker(false);
    } else {
      setShowRootMentionPicker(false);
    }
  };

  const handleReplyTextChange = (val: string) => {
    setReplyContent(val);
    const mentionQuery = detectActiveMentionQuery(val);
    if (mentionQuery !== null) {
      setReplyMentionFilter(mentionQuery);
      setShowReplyMentionPicker(true);
      setShowReplyEmojiPicker(false);
    } else {
      setShowReplyMentionPicker(false);
    }
  };

  const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const insertMentionIntoText = (
    currentText: string,
    username: string,
    isReply: boolean
  ) => {
    const cleanHandle = username.toLowerCase();
    const hasTrailingAtQuery = /(?:^|\s)@([^\s@]{0,24})$/.test(currentText);
    const alreadyContainsHandle = new RegExp(
      `(?:^|\\s)@${escapeRegExp(cleanHandle)}(?=\\s|$)`,
      'i'
    ).test(currentText);

    const replaced = hasTrailingAtQuery
      ? currentText.replace(/@([^\s@]{0,24})$/, `@${username} `)
      : alreadyContainsHandle
      ? currentText
      : `${currentText}${currentText.endsWith(' ') || !currentText ? '' : ' '}@${username} `;

    if (isReply) {
      setReplyContent(replaced);
      setReplyTaggedUsers((prev) =>
        prev.includes(cleanHandle) ? prev : [...prev, cleanHandle]
      );
      setShowReplyMentionPicker(false);
      setReplyMentionFilter('');
      replyInputRef.current?.focus();
    } else {
      setRootContent(replaced);
      setRootTaggedUsers((prev) =>
        prev.includes(cleanHandle) ? prev : [...prev, cleanHandle]
      );
      setShowRootMentionPicker(false);
      setRootMentionFilter('');
      rootInputRef.current?.focus();
    }
  };

  const removeTaggedUserChip = (username: string, isReply: boolean) => {
    const cleanHandle = username.toLowerCase();
    const regex = new RegExp(
      `(^|\\s)@${escapeRegExp(cleanHandle)}(?=\\s|$)`,
      'gi'
    );
    if (isReply) {
      setReplyTaggedUsers((prev) => prev.filter((u) => u !== cleanHandle));
      setReplyContent((prev) => prev.replace(regex, ' ').replace(/\s+/g, ' ').trimStart());
    } else {
      setRootTaggedUsers((prev) => prev.filter((u) => u !== cleanHandle));
      setRootContent((prev) => prev.replace(regex, ' ').replace(/\s+/g, ' ').trimStart());
    }
  };

  const insertEmojiIntoText = (emoji: string, isReply: boolean) => {
    if (isReply) {
      setReplyContent((prev) => `${prev}${emoji}`);
      replyInputRef.current?.focus();
    } else {
      setRootContent((prev) => `${prev}${emoji}`);
      rootInputRef.current?.focus();
    }
  };

  const handleSelectFiles = (
    e: React.ChangeEvent<HTMLInputElement>,
    isReply: boolean
  ) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const currentList = isReply ? replyAttachments : rootAttachments;
    if (currentList.length + files.length > 3) {
      setError(
        t(
          'Mỗi bình luận được đính kèm tối đa 3 hình ảnh.',
          'Each comment can include up to 3 images.'
        )
      );
      return;
    }

    const nextPreviews: AttachedPreview[] = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setError(
          t(
            'Mỗi hình ảnh đính kèm không được vượt quá 5MB.',
            'Each attached image must not exceed 5MB.'
          )
        );
        return;
      }
      nextPreviews.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setError('');
    if (isReply) {
      setReplyAttachments((prev) => [...prev, ...nextPreviews]);
    } else {
      setRootAttachments((prev) => [...prev, ...nextPreviews]);
    }
  };

  const handleRemoveAttachment = (idx: number, isReply: boolean) => {
    if (isReply) {
      setReplyAttachments((prev) => {
        const target = prev[idx];
        if (target) URL.revokeObjectURL(target.previewUrl);
        return prev.filter((_, i) => i !== idx);
      });
    } else {
      setRootAttachments((prev) => {
        const target = prev[idx];
        if (target) URL.revokeObjectURL(target.previewUrl);
        return prev.filter((_, i) => i !== idx);
      });
    }
  };

  const filterMentionCandidates = (query: string): User[] => {
    const q = query.trim();
    if (!q) {
      return allUsers.filter((u) => !u.isLocked).slice(0, 8);
    }
    return searchUsersByQuery(allUsers, q, 8);
  };

  const handleAddComment = async (
    e: React.FormEvent,
    parentId: string | null,
    text: string,
    attachments: AttachedPreview[],
    explicitTags: string[]
  ) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    const mergedMentions = extractMentionedUsernames(text, explicitTags);
    if (!text.trim() && attachments.length === 0 && mergedMentions.length === 0) {
      setError(
        t(
          'Vui lòng nhập nội dung, gắn thẻ @thành_viên hoặc đính kèm hình ảnh.',
          'Please enter a comment, @mention a user, or attach an image.'
        )
      );
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      let uploadedUrls: string[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((item) => formData.append('images', item.file));
        const uploadRes = await apiRequest<{ urls: string[] }>('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        uploadedUrls = uploadRes.urls || [];
      }

      const finalContent =
        text.trim() ||
        (mergedMentions.length > 0
          ? mergedMentions.map((m) => `@${m}`).join(' ')
          : '');

      const res = await apiRequest<{
        comments: CommentThread[];
        commentCount: number;
      }>(`/api/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: finalContent,
          parentId,
          images: uploadedUrls,
          mentions: mergedMentions,
        }),
      });

      onThreadsUpdated(res.comments, res.commentCount);
      if (parentId) {
        replyAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        setReplyAttachments([]);
        setReplyTaggedUsers([]);
        setReplyContent('');
        setReplyTargetId(null);
        setShowReplyEmojiPicker(false);
        setShowReplyMentionPicker(false);
      } else {
        rootAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        setRootAttachments([]);
        setRootTaggedUsers([]);
        setRootContent('');
        setShowRootEmojiPicker(false);
        setShowRootMentionPicker(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể gửi bình luận.', 'Could not post comment.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await apiRequest<{
        comments: CommentThread[];
        commentCount: number;
      }>(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      onThreadsUpdated(res.comments, res.commentCount);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể xóa bình luận.', 'Could not delete comment.')
      );
    }
  };

  const handleStartReply = (
    rootThreadId: string,
    targetUsername?: string
  ) => {
    if (replyTargetId === rootThreadId && !targetUsername) {
      setReplyTargetId(null);
      return;
    }
    setReplyTargetId(rootThreadId);
    if (targetUsername) {
      const cleanHandle = targetUsername.toLowerCase();
      const mentionPrefix = `@${targetUsername} `;
      setReplyContent((prev) =>
        prev.startsWith(mentionPrefix) ? prev : mentionPrefix
      );
      setReplyTaggedUsers((prev) =>
        prev.includes(cleanHandle) ? prev : [...prev, cleanHandle]
      );
    }
    window.setTimeout(() => {
      replyInputRef.current?.focus();
    }, 50);
  };

  /**
   * Hiển thị văn bản bình luận có tô nổi bật các thẻ @username và dẫn link tới trang cá nhân,
   * đồng thời hiển thị thêm các thẻ @mentions nếu chưa xuất hiện trong chuỗi văn bản.
   */
  const renderCommentTextWithMentions = (text: string, mentions?: string[]) => {
    const inlineHandles = new Set(
      extractMentionedUsernames(text || '').map((h) => h.toLowerCase())
    );
    const extraMentions = (mentions || []).filter(
      (m) => !inlineHandles.has(m.toLowerCase())
    );

    if (!text && extraMentions.length === 0) return null;
    const parts = (text || '').split(/(@[a-zA-Z0-9._]{3,24})/g);

    return (
      <div className="mt-1 space-y-1">
        {extraMentions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {extraMentions.map((handle) => {
              const rawHandle = handle.toLowerCase();
              const matchedUser = userByUsernameMap.get(rawHandle);
              const profilePath = matchedUser
                ? `/profile/${matchedUser._id}`
                : `/profile/${rawHandle}`;
              return (
                <Link
                  key={rawHandle}
                  to={profilePath}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-200/70 dark:bg-zinc-800 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 px-2 py-0.5 rounded-md transition-colors"
                >
                  <span>@{matchedUser?.username || rawHandle}</span>
                </Link>
              );
            })}
          </div>
        )}
        {text && (
          <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-line break-words">
            {parts.map((part, idx) => {
              if (/^@[a-zA-Z0-9._]{3,24}$/.test(part)) {
                const rawHandle = part.slice(1).toLowerCase();
                const matchedUser = userByUsernameMap.get(rawHandle);
                const profilePath = matchedUser
                  ? `/profile/${matchedUser._id}`
                  : `/profile/${rawHandle}`;
                return (
                  <Link
                    key={`${part}-${idx}`}
                    to={profilePath}
                    className="inline-flex items-center font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-200/70 dark:bg-zinc-800 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded-md transition-colors mx-0.5"
                  >
                    {part}
                  </Link>
                );
              }
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
          </p>
        )}
      </div>
    );
  };

  const renderCommentImages = (images?: string[], authorName?: string) => {
    if (!images || images.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((imgUrl, idx) => (
          <button
            key={imgUrl + idx}
            type="button"
            onClick={() =>
              setLightboxData({
                images,
                index: idx,
                title: authorName
                  ? t(
                      `Ảnh bình luận của ${authorName}`,
                      `Comment photo by ${authorName}`
                    )
                  : t('Ảnh đính kèm bình luận', 'Comment attachment'),
              })
            }
            className="relative group overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 w-28 h-28 sm:w-36 sm:h-28 cursor-pointer"
          >
            <img
              src={imgUrl}
              alt={t(`Ảnh bình luận ${idx + 1}`, `Comment photo ${idx + 1}`)}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </button>
        ))}
      </div>
    );
  };

  const activeRootMentions = useMemo(
    () => extractMentionedUsernames(rootContent, rootTaggedUsers),
    [rootContent, rootTaggedUsers]
  );

  const activeReplyMentions = useMemo(
    () => extractMentionedUsernames(replyContent, replyTaggedUsers),
    [replyContent, replyTaggedUsers]
  );

  const activeCategoryObj =
    EMOJI_CATEGORIES.find((c) => c.id === activeEmojiTab) || EMOJI_CATEGORIES[0];

  return (
    <section
      aria-labelledby={`comments-heading-${postId}`}
      className={
        compact
          ? 'mt-4 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800/80'
          : 'mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <h2
          id={`comments-heading-${postId}`}
          className={`${
            compact ? 'text-sm' : 'text-lg'
          } font-bold text-zinc-900 dark:text-white`}
        >
          {t('Thảo luận hành trình', 'Trip Discussion')} (
          {threads.reduce((acc, th) => acc + 1 + th.replies.length, 0)})
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {t(
            'Hỗ trợ gửi ảnh đồng thời tag @bạn_bè & biểu tượng cảm xúc 😊',
            'Send photos while @tagging friends & emojis 😊'
          )}
        </span>
      </div>

      {/* Root Comment Controlled Form */}
      <form
        onSubmit={(e) =>
          handleAddComment(
            e,
            null,
            rootContent,
            rootAttachments,
            rootTaggedUsers
          )
        }
        className="mb-5 bg-zinc-50/80 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 space-y-3 relative"
      >
        <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <label htmlFor={`new-comment-input-${postId}`} className="font-medium">
            {user
              ? t(
                  `Bình luận với tên ${user.fullName} (@${user.username})`,
                  `Commenting as ${user.fullName} (@${user.username})`
                )
              : t(
                  'Đăng nhập để chia sẻ cảm nghĩ, gửi ảnh hoặc tag @bạn_bè',
                  'Sign in to comment, share photos, or @tag friends'
                )}
          </label>
          <span className="font-mono-num text-[11px] text-zinc-400">
            {rootContent.length}/600
          </span>
        </div>

        <div className="relative">
          <textarea
            ref={rootInputRef}
            id={`new-comment-input-${postId}`}
            rows={compact ? 2 : 2}
            value={rootContent}
            onChange={(e) => handleRootTextChange(e.target.value)}
            placeholder={t(
              'Chia sẻ cảm nhận, đính kèm ảnh và gõ @ để tag bạn bè vào bình luận...',
              'Share your thoughts, attach photos, and type @ to tag friends...'
            )}
            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
          />

          {/* Floating @Mention Autocomplete & Search Dropdown (Root) */}
          {showRootMentionPicker && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-2.5 max-h-64 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                  {t(
                    'Tìm & gắn thẻ thành viên (@tag cùng ảnh)',
                    'Search & @tag members (works with photos)'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRootMentionPicker(false)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="search"
                value={rootMentionFilter}
                onChange={(e) => setRootMentionFilter(e.target.value)}
                placeholder={t(
                  'Nhập tên hoặc @username để tìm người dùng...',
                  'Type name or @username to search users...'
                )}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
              />

              {filterMentionCandidates(rootMentionFilter).length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-zinc-500">
                  {t(
                    'Không tìm thấy thành viên phù hợp.',
                    'No matching members found.'
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filterMentionCandidates(rootMentionFilter).map((candidate) => {
                    const isTagged = activeRootMentions.includes(
                      candidate.username.toLowerCase()
                    );
                    return (
                      <button
                        key={candidate._id}
                        type="button"
                        onClick={() =>
                          insertMentionIntoText(
                            rootContent,
                            candidate.username,
                            false
                          )
                        }
                        className="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={
                              candidate.avatar ||
                              `/api/media/avatar/${encodeURIComponent(
                                candidate.fullName
                              )}`
                            }
                            alt={candidate.fullName}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                              {candidate.fullName}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              @{candidate.username}
                            </div>
                          </div>
                        </div>
                        {isTagged && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            {t('Đã tag', 'Tagged')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Floating Categorized Emoji Picker Popover (Root) */}
          {showRootEmojiPicker && (
            <div className="absolute left-0 top-full mt-1.5 z-30 w-72 sm:w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                <div className="flex items-center gap-1">
                  {EMOJI_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveEmojiTab(cat.id)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        activeEmojiTab === cat.id
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
                  onClick={() => setShowRootEmojiPicker(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {activeCategoryObj.emojis.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertEmojiIntoText(em, false)}
                    className="h-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-base transition-transform hover:scale-110 cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Simultaneous Active @Tagged Users Chips + Attached Image Previews (Root) */}
        {(activeRootMentions.length > 0 || rootAttachments.length > 0) && (
          <div className="space-y-2.5 pt-1">
            {activeRootMentions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {t('Đang gắn thẻ:', 'Tagging:')}
                </span>
                {activeRootMentions.map((handle) => {
                  const matched = userByUsernameMap.get(handle.toLowerCase());
                  return (
                    <span
                      key={handle}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700"
                    >
                      <AtSign className="w-3 h-3" />
                      <span>
                        {matched ? `${matched.fullName} (@${matched.username})` : `@${handle}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTaggedUserChip(handle, false)}
                        aria-label={t(`Bỏ gắn thẻ @${handle}`, `Remove tag @${handle}`)}
                        className="ml-0.5 text-zinc-600 dark:text-zinc-300 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {rootAttachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                {rootAttachments.map((att, idx) => (
                  <div
                    key={att.previewUrl}
                    className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
                  >
                    <img
                      src={att.previewUrl}
                      alt={t(`Ảnh đính kèm ${idx + 1}`, `Attachment ${idx + 1}`)}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx, false)}
                      aria-label={t('Xóa ảnh đính kèm', 'Remove attached image')}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick 1-Tap Emoji Bar + Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Upload Photo Button */}
            <input
              ref={rootFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              multiple
              onChange={(e) => handleSelectFiles(e, false)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => rootFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              <span>
                {t(
                  `Gửi ảnh (${rootAttachments.length}/3)`,
                  `Add photo (${rootAttachments.length}/3)`
                )}
              </span>
            </button>

            {/* @Tag User Button */}
            <button
              type="button"
              onClick={() => {
                setRootMentionFilter('');
                setShowRootMentionPicker((prev) => !prev);
                setShowRootEmojiPicker(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <AtSign className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              <span>
                {activeRootMentions.length > 0
                  ? t(
                      `Tag bạn bè (${activeRootMentions.length})`,
                      `Tag user (${activeRootMentions.length})`
                    )
                  : t('Tag bạn bè', 'Tag user')}
              </span>
            </button>

            {/* Emoji Picker Button */}
            <button
              type="button"
              onClick={() => {
                setShowRootEmojiPicker((prev) => !prev);
                setShowRootMentionPicker(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Smile className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              <span>{t('Cảm xúc', 'Emoji')}</span>
            </button>

            {/* Quick Reaction Emojis */}
            <div className="hidden sm:flex items-center gap-0.5 pl-1 border-l border-zinc-200 dark:border-zinc-800">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmojiIntoText(em, false)}
                  title={t(`Chèn ${em}`, `Insert ${em}`)}
                  className="w-7 h-7 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 flex items-center justify-center text-sm transition-transform hover:scale-110 cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {submitting
                ? t('Đang gửi...', 'Posting...')
                : t('Gửi bình luận', 'Post comment')}
            </span>
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </form>

      {/* Comment Threads List */}
      {threads.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 py-3">
          {t(
            'Chưa có bình luận nào. Hãy là người đầu tiên gửi ảnh, tag @bạn_bè hoặc đặt câu hỏi về hành trình này!',
            'No comments yet. Be the first to share a photo, @tag friends, or ask about this trip!'
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <div
              key={thread._id}
              className="pb-3.5 border-b border-zinc-100 dark:border-zinc-800/70 last:border-none"
            >
              <div className="flex items-start gap-3">
                <Link to={`/profile/${thread.authorId}`} className="shrink-0">
                  <img
                    src={thread.author?.avatar || `/api/media/avatar/${thread.authorId}`}
                    alt={thread.author?.fullName || t('Thành viên', 'Member')}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-800"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Link
                        to={`/profile/${thread.authorId}`}
                        className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
                      >
                        {thread.author?.fullName || t('Thành viên', 'Member')}
                      </Link>
                      {thread.author?.username && (
                        <span className="text-zinc-400 dark:text-zinc-500">
                          @{thread.author.username}
                        </span>
                      )}
                      <span aria-hidden="true" className="text-zinc-400">
                        ·
                      </span>
                      <span className="text-zinc-500 font-mono-num">
                        {formatVietnameseDate(thread.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartReply(
                            thread._id,
                            thread.author?.username
                          )
                        }
                        className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:underline cursor-pointer"
                      >
                        {t('Trả lời', 'Reply')}
                      </button>
                      {user &&
                        (user._id === thread.authorId || user.role === 'admin') && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(thread._id)}
                            aria-label={t(
                              `Xóa bình luận của ${thread.author?.fullName}`,
                              `Delete comment by ${thread.author?.fullName}`
                            )}
                            className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  </div>

                  {renderCommentTextWithMentions(thread.content, thread.mentions)}
                  {renderCommentImages(thread.images, thread.author?.fullName)}

                  {/* 1-Level Replies */}
                  {thread.replies.length > 0 && (
                    <div className="mt-3 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-3">
                      {thread.replies.map((reply) => (
                        <div key={reply._id} className="flex items-start gap-2.5">
                          <CornerDownRight className="w-3.5 h-3.5 text-zinc-400 mt-1 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Link
                                  to={`/profile/${reply.authorId}`}
                                  className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
                                >
                                  {reply.author?.fullName || t('Thành viên', 'Member')}
                                </Link>
                                {reply.author?.username && (
                                  <span className="text-zinc-400 dark:text-zinc-500">
                                    @{reply.author.username}
                                  </span>
                                )}
                                <span aria-hidden="true" className="text-zinc-400">
                                  ·
                                </span>
                                <span className="text-zinc-500 font-mono-num">
                                  {formatVietnameseDate(reply.createdAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartReply(
                                      thread._id,
                                      reply.author?.username
                                    )
                                  }
                                  className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:underline cursor-pointer"
                                >
                                  {t('Tag trả lời', 'Reply')}
                                </button>
                                {user &&
                                  (user._id === reply.authorId ||
                                    user.role === 'admin') && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComment(reply._id)}
                                      aria-label={t(
                                        `Xóa phản hồi của ${reply.author?.fullName}`,
                                        `Delete reply by ${reply.author?.fullName}`
                                      )}
                                      className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                              </div>
                            </div>
                            {renderCommentTextWithMentions(
                              reply.content,
                              reply.mentions
                            )}
                            {renderCommentImages(
                              reply.images,
                              reply.author?.fullName
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline 1-level Reply Form (with simultaneous Image, @Mention & Emoji support) */}
                  {replyTargetId === thread._id && (
                    <form
                      onSubmit={(e) =>
                        handleAddComment(
                          e,
                          thread._id,
                          replyContent,
                          replyAttachments,
                          replyTaggedUsers
                        )
                      }
                      className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5 relative"
                    >
                      <label htmlFor={`reply-input-${thread._id}`} className="sr-only">
                        {t(
                          `Trả lời bình luận của ${thread.author?.fullName}`,
                          `Reply to ${thread.author?.fullName}`
                        )}
                      </label>
                      <div className="flex gap-2">
                        <input
                          ref={replyInputRef}
                          id={`reply-input-${thread._id}`}
                          type="text"
                          value={replyContent}
                          onChange={(e) => handleReplyTextChange(e.target.value)}
                          placeholder={t(
                            `Trả lời @${thread.author?.username || 'member'} (gửi ảnh & gõ @ để tag)...`,
                            `Reply to @${thread.author?.username || 'member'} (add photos & @tag)...`
                          )}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-lg cursor-pointer transition-colors shrink-0"
                        >
                          {t('Gửi trả lời', 'Reply')}
                        </button>
                      </div>

                      {/* Reply Tagged Chips + Attached Previews */}
                      {(activeReplyMentions.length > 0 ||
                        replyAttachments.length > 0) && (
                        <div className="space-y-2 pt-0.5">
                          {activeReplyMentions.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {activeReplyMentions.map((handle) => (
                                <span
                                  key={handle}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700"
                                >
                                  <span>@{handle}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeTaggedUserChip(handle, true)}
                                    className="hover:text-rose-500 cursor-pointer"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {replyAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {replyAttachments.map((att, idx) => (
                                <div
                                  key={att.previewUrl}
                                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700"
                                >
                                  <img
                                    src={att.previewUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAttachment(idx, true)}
                                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 text-white flex items-center justify-center cursor-pointer"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reply Toolbar: Photo, @Mention, Quick Emojis */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            multiple
                            onChange={(e) => handleSelectFiles(e, true)}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => replyFileInputRef.current?.click()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            <ImagePlus className="w-3 h-3 text-zinc-500" />
                            <span>
                              {t(
                                `Ảnh (${replyAttachments.length}/3)`,
                                `Photo (${replyAttachments.length}/3)`
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyMentionFilter('');
                              setShowReplyMentionPicker((prev) => !prev);
                              setShowReplyEmojiPicker(false);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            <AtSign className="w-3 h-3 text-zinc-500" />
                            <span>@Tag</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowReplyEmojiPicker((prev) => !prev);
                              setShowReplyMentionPicker(false);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            <Smile className="w-3 h-3 text-zinc-500" />
                            <span>Emoji</span>
                          </button>
                          <div className="flex items-center gap-0.5 pl-1">
                            {QUICK_EMOJIS.slice(0, 6).map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => insertEmojiIntoText(em, true)}
                                className="w-6 h-6 rounded hover:bg-zinc-200/70 dark:hover:bg-zinc-800 flex items-center justify-center text-xs cursor-pointer"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reply Mention Picker Dropdown */}
                      {showReplyMentionPicker && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1.5">
                          <input
                            type="search"
                            value={replyMentionFilter}
                            onChange={(e) => setReplyMentionFilter(e.target.value)}
                            placeholder={t(
                              'Tìm tên hoặc @username...',
                              'Search name or @username...'
                            )}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                          />
                          {filterMentionCandidates(replyMentionFilter).map(
                            (candidate) => (
                              <button
                                key={candidate._id}
                                type="button"
                                onClick={() =>
                                  insertMentionIntoText(
                                    replyContent,
                                    candidate.username,
                                    true
                                  )
                                }
                                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs cursor-pointer"
                              >
                                <img
                                  src={
                                    candidate.avatar ||
                                    `/api/media/avatar/${encodeURIComponent(
                                      candidate.fullName
                                    )}`
                                  }
                                  alt={candidate.fullName}
                                  referrerPolicy="no-referrer"
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                                <span className="font-semibold text-zinc-900 dark:text-white">
                                  {candidate.fullName}
                                </span>
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  @{candidate.username}
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      )}

                      {/* Reply Emoji Picker */}
                      {showReplyEmojiPicker && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2 grid grid-cols-8 gap-1">
                          {activeCategoryObj.emojis.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => insertEmojiIntoText(em, true)}
                              className="h-7 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-sm cursor-pointer"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      )}
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxData && (
        <ImageLightboxModal
          images={lightboxData.images}
          currentIndex={lightboxData.index}
          title={lightboxData.title}
          onClose={() => setLightboxData(null)}
          onSelectIndex={(nextIdx) =>
            setLightboxData((prev) =>
              prev ? { ...prev, index: nextIdx } : null
            )
          }
        />
      )}
    </section>
  );
};
