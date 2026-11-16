import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  Bookmark,
  MoreHorizontal,
  TrendingUp,
  Plus,
  Lock,
} from 'lucide-react';
import type { CommentThread, TravelPost } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch } from '../store/store';
import { optimisticToggleLike, syncPostLikes } from '../store/feedSlice';
import {
  apiRequest,
  formatVietnameseDate,
  formatVndCurrency,
} from '../utils/api';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ReportPostModal } from './ReportPostModal';
import { CommentSection } from './CommentSection';
import { SharePostModal } from './SharePostModal';

interface PostCardProps {
  post: TravelPost;
  isTrending?: boolean;
  onHashtagClick?: (tag: string) => void;
  onPostUpdated?: (updatedPost: TravelPost) => void;
}

/**
 * Component #7: PostCard (Threads Feed Row Style)
 * Thiết kế chuẩn phong cách Threads kết hợp tông màu Xanh Đại Dương (Sky) & Ngọc Lục Bảo (Teal),
 * hỗ trợ bình luận trực tiếp kèm gửi ảnh và tag @người_dùng ngay trên bảng tin.
 */
export const PostCard: React.FC<PostCardProps> = ({
  post,
  isTrending = false,
  onHashtagClick,
  onPostUpdated,
}) => {
  const { user, updateCurrentUser } = useAuth();
  const { t } = useLanguage();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [likePending, setLikePending] = useState(false);

  // Inline comment drawer state so users can comment + send images + @tag directly from the Feed
  const [showInlineComments, setShowInlineComments] = useState(false);
  const [inlineThreads, setInlineThreads] = useState<CommentThread[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState<number>(
    post.commentCount ?? 0
  );

  useEffect(() => {
    setLocalCommentCount(post.commentCount ?? 0);
  }, [post.commentCount]);

  const isLiked = user ? post.likes.includes(user._id) : false;
  const isSaved = user ? user.savedPosts.includes(post._id) : false;

  const handleToggleInlineComments = async () => {
    const nextOpen = !showInlineComments;
    setShowInlineComments(nextOpen);
    if (nextOpen && inlineThreads.length === 0) {
      setLoadingComments(true);
      try {
        const res = await apiRequest<{
          post: TravelPost;
          comments: CommentThread[];
        }>(`/api/posts/${post._id}`);
        setInlineThreads(res.comments || []);
      } catch {
        // Ignore error
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const handleLikeClick = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (likePending) return;

    const previousLikes = [...post.likes];
    setLikePending(true);

    dispatch(optimisticToggleLike({ postId: post._id, userId: user._id }));
    if (onPostUpdated) {
      const nextLikes = isLiked
        ? post.likes.filter((id) => id !== user._id)
        : [...post.likes, user._id];
      onPostUpdated({ ...post, likes: nextLikes });
    }

    try {
      const res = await apiRequest<{ likes: string[]; liked: boolean }>(
        `/api/posts/${post._id}/like`,
        {
          method: 'POST',
          body: JSON.stringify({ intent: 'toggle' }),
        }
      );
      dispatch(syncPostLikes({ postId: post._id, likes: res.likes }));
      if (onPostUpdated) {
        onPostUpdated({ ...post, likes: res.likes });
      }
    } catch (err) {
      dispatch(syncPostLikes({ postId: post._id, likes: previousLikes }));
      if (onPostUpdated) {
        onPostUpdated({ ...post, likes: previousLikes });
      }
      setFeedbackMsg(
        err instanceof Error
          ? err.message
          : t('Không thể thích bài viết, đã hoàn tác.', 'Could not like post, reverted.')
      );
    } finally {
      setLikePending(false);
    }
  };

  const handleBookmarkClick = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean; savedPosts: string[] }>(
        `/api/posts/${post._id}/bookmark`,
        { method: 'POST' }
      );
      updateCurrentUser({ ...user, savedPosts: res.savedPosts });
      setFeedbackMsg(
        res.saved
          ? t('Đã lưu vào danh sách yêu thích.', 'Saved to bookmarks.')
          : t('Đã bỏ lưu bài viết.', 'Removed from bookmarks.')
      );
      window.setTimeout(() => setFeedbackMsg(null), 2200);
    } catch {
      // Ignore error
    }
  };

  const handleSharePostClick = () => {
    setShowShareModal(true);
  };

  const displayImages = post.images.slice(0, 6);

  return (
    <article className="px-5 py-4 hover:bg-zinc-50/50 dark:hover:bg-[#1c1c1c]/60 transition-colors">
      {/* Trending Location Row (Soft Muted Yellow) */}
      {isTrending && (
        <div className="inline-flex items-center gap-1.5 mb-2.5 ml-12 px-2.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/25 text-xs text-yellow-700 dark:text-yellow-300 font-semibold">
          <TrendingUp className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-300" />
          <span>
            {t('Điểm đến nổi bật:', 'Trending:')} {post.location}
          </span>
        </div>
      )}

      <div className="flex gap-3.5">
        {/* Left Column: Avatar with "+" badge + Vertical Thread Line */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative">
            <Link to={`/profile/${post.authorId}`} className="block">
              <img
                src={post.author?.avatar || `/api/media/avatar/${post.authorId}`}
                alt={post.author?.fullName || t('Tác giả', 'Author')}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-800"
              />
            </Link>
            <Link
              to={`/profile/${post.authorId}`}
              aria-label={t(
                `Xem hồ sơ ${post.author?.username || post.authorId}`,
                `View profile ${post.author?.username || post.authorId}`
              )}
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center border-2 border-white dark:border-[#181818]"
            >
              <Plus className="w-2.5 h-2.5 stroke-[3]" />
            </Link>
          </div>

          <div className="w-0.5 flex-1 bg-zinc-200 dark:bg-[#2a2a2a] my-2 rounded-full" />
        </div>

        {/* Right Column: Thread Header, Content, Gallery & Action Icons */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-sm min-w-0">
              <Link
                to={`/profile/${post.authorId}`}
                className="font-semibold text-zinc-950 dark:text-white hover:underline truncate"
              >
                {post.author?.username || post.author?.fullName || 'wanderer'}
              </Link>
              <span className="text-zinc-400 dark:text-zinc-500 text-xs">&gt;</span>
              <Link
                to="/map"
                className="font-semibold text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:underline truncate transition-colors"
              >
                {post.location}
              </Link>
              <span className="text-zinc-400 dark:text-zinc-500 text-xs">
                {formatVietnameseDate(post.tripDate)}
              </span>
              {post.visibility === 'followers' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                  <Lock className="w-3 h-3" />
                  {t('Chỉ người theo dõi', 'Followers only')}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                user && user._id !== post.authorId
                  ? setShowReportModal(true)
                  : navigate(`/posts/${post._id}`)
              }
              aria-label={t(
                `Tùy chọn cho bài viết ${post.title}`,
                `Options for post ${post.title}`
              )}
              className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-full cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Post Title & Story Body */}
          <div className="mt-1">
            <Link to={`/posts/${post._id}`} className="block group">
              <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 group-hover:underline transition-colors leading-snug">
                {post.title}
              </h3>
            </Link>
            <p className="mt-1.5 text-[14px] text-zinc-700 dark:text-[#e4e4e7] leading-relaxed whitespace-pre-line">
              {post.content}{' '}
              <Link
                to={`/posts/${post._id}`}
                className="text-zinc-900 dark:text-white hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2 text-xs ml-1 font-semibold transition-colors"
              >
                {t('Xem chi tiết', 'Read more')}
              </Link>
            </p>
          </div>

          {/* Unboxed Trip Metadata Line */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
            <span>{post.provinceOrCountry}</span>
            <span aria-hidden="true">·</span>
            <span>
              {post.durationDays} {t('ngày', 'days')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
              {t('Chi phí', 'Cost')} {formatVndCurrency(post.cost)}
            </span>
            {post.hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onHashtagClick?.(tag)}
                className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:underline cursor-pointer font-sans font-medium"
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Multi-Image Carousel / Grid (1..6 Images) */}
          {displayImages.length > 0 && (
            <div
              className={`mt-3 grid gap-2 rounded-2xl overflow-hidden ${
                displayImages.length === 1
                  ? 'grid-cols-1'
                  : displayImages.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-3'
              }`}
            >
              {displayImages.map((imgUrl, idx) => (
                <button
                  key={imgUrl + idx}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  aria-label={t(
                    `Phóng to ảnh ${idx + 1} của ${post.title}`,
                    `Zoom photo ${idx + 1} of ${post.title}`
                  )}
                  className={`relative group overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-[#2a2a2a] rounded-xl cursor-pointer ${
                    displayImages.length === 1
                      ? 'aspect-16/9 max-h-80'
                      : 'aspect-4/3'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={`${post.title} - ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-200"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Action Bar: Heart, Comment (Toggle inline composer), Repost, Share, Bookmark */}
          <div className="mt-3 flex items-center gap-5 text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={handleLikeClick}
              aria-label={
                isLiked
                  ? t(
                      `Bỏ thích ${post.title} (${post.likes.length} lượt thích)`,
                      `Unlike ${post.title} (${post.likes.length} likes)`
                    )
                  : t(
                      `Thích ${post.title} (${post.likes.length} lượt thích)`,
                      `Like ${post.title} (${post.likes.length} likes)`
                    )
              }
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isLiked
                  ? 'text-rose-500'
                  : 'hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Heart className={`w-[18px] h-[18px] ${isLiked ? 'fill-current' : ''}`} />
              <span className="font-mono-num">{post.likes.length}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleInlineComments}
              aria-label={t(
                `${localCommentCount} bình luận - Bấm để mở khung bình luận, gửi ảnh & tag bạn bè`,
                `${localCommentCount} comments - Click to comment, send photos & tag friends`
              )}
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                showInlineComments
                  ? 'text-zinc-950 dark:text-white font-semibold'
                  : 'hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              <span className="font-mono-num">{localCommentCount}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/posts/${post._id}`)}
              aria-label={t('Xem chi tiết chuyến đi', 'View trip details')}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Repeat2 className="w-[18px] h-[18px]" />
            </button>

            <button
              type="button"
              onClick={handleSharePostClick}
              aria-label={t(
                `Chia sẻ liên kết bài viết ${post.title}`,
                `Share link to ${post.title}`
              )}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Send className="w-[17px] h-[17px]" />
            </button>

            <button
              type="button"
              onClick={handleBookmarkClick}
              aria-label={
                isSaved
                  ? t(`Bỏ lưu ${post.title}`, `Remove bookmark ${post.title}`)
                  : t(`Lưu bài viết ${post.title}`, `Bookmark ${post.title}`)
              }
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isSaved
                  ? 'text-zinc-950 dark:text-white'
                  : 'hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Bookmark className={`w-[17px] h-[17px] ${isSaved ? 'fill-current' : ''}`} />
            </button>
          </div>

          {feedbackMsg && (
            <p role="status" className="mt-2 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
              {feedbackMsg}
            </p>
          )}

          {/* Inline Comment Drawer (Supports Image Upload + @User Tagging directly on Feed/Profile) */}
          {showInlineComments && (
            <div className="mt-2">
              {loadingComments ? (
                <p className="py-3 text-xs text-zinc-500">
                  {t('Đang tải bình luận...', 'Loading comments...')}
                </p>
              ) : (
                <CommentSection
                  compact
                  postId={post._id}
                  threads={inlineThreads}
                  onThreadsUpdated={(nextThreads, count) => {
                    setInlineThreads(nextThreads);
                    setLocalCommentCount(count);
                    if (onPostUpdated) {
                      onPostUpdated({ ...post, commentCount: count });
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightboxModal
          images={displayImages}
          currentIndex={lightboxIndex}
          title={post.title}
          onClose={() => setLightboxIndex(null)}
          onSelectIndex={setLightboxIndex}
        />
      )}

      {showReportModal && (
        <ReportPostModal
          postId={post._id}
          postTitle={post.title}
          onClose={() => setShowReportModal(false)}
          onReported={(msg) => {
            setFeedbackMsg(msg);
            window.setTimeout(() => setFeedbackMsg(null), 3500);
          }}
        />
      )}

      {showShareModal && (
        <SharePostModal
          post={post}
          onClose={() => setShowShareModal(false)}
          onSharedFeedback={(msg) => {
            setFeedbackMsg(msg);
            window.setTimeout(() => setFeedbackMsg(null), 3000);
          }}
        />
      )}
    </article>
  );
};
