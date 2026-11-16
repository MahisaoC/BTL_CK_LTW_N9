import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Edit3,
  Trash2,
  MapPin,
  Lock,
  Globe,
  Flag,
  Share2,
  Check,
} from 'lucide-react';
import type { CommentThread, TravelPost } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch } from '../store/store';
import {
  optimisticToggleLike,
  removePostFromFeed,
  syncPostLikes,
} from '../store/feedSlice';
import {
  apiRequest,
  formatVietnameseDate,
  formatVndCurrency,
  type ApiError,
} from '../utils/api';
import { CommentSection } from '../components/CommentSection';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { ReportPostModal } from '../components/ReportPostModal';
import { SharePostModal } from '../components/SharePostModal';

/**
 * Component #12: PostDetailPage
 * Dynamic route (/posts/:id) sử dụng useParams + useNavigate sau khi xóa,
 * hiển thị bộ ảnh (tối đa 6 ảnh), Optimistic Like, bình luận 1 cấp, hỗ trợ VI/EN.
 */
export const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [post, setPost] = useState<TravelPost | null>(null);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedPostLink, setCopiedPostLink] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    apiRequest<{ post: TravelPost; comments: CommentThread[] }>(`/api/posts/${id}`)
      .then((res) => {
        if (!active) return;
        setPost(res.post);
        setComments(res.comments);
      })
      .catch((err: ApiError) => {
        if (!active) return;
        setErrorStatus(err.status || 500);
        setErrorMessage(
          err.message || t('Không thể tải bài viết.', 'Could not load post.')
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, user?._id, t]);

  const handleOptimisticLike = async () => {
    if (!post) return;
    if (!user) {
      navigate('/login');
      return;
    }

    const prevLikes = [...post.likes];
    const isLiked = prevLikes.includes(user._id);
    const nextLikes = isLiked
      ? prevLikes.filter((uid) => uid !== user._id)
      : [...prevLikes, user._id];

    setPost({ ...post, likes: nextLikes });
    dispatch(optimisticToggleLike({ postId: post._id, userId: user._id }));

    try {
      const res = await apiRequest<{ likes: string[] }>(
        `/api/posts/${post._id}/like`,
        {
          method: 'POST',
          body: JSON.stringify({ intent: 'toggle' }),
        }
      );
      setPost((current) => (current ? { ...current, likes: res.likes } : null));
      dispatch(syncPostLikes({ postId: post._id, likes: res.likes }));
    } catch {
      setPost((current) => (current ? { ...current, likes: prevLikes } : null));
      dispatch(syncPostLikes({ postId: post._id, likes: prevLikes }));
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    try {
      await apiRequest(`/api/posts/${post._id}`, { method: 'DELETE' });
      dispatch(removePostFromFeed(post._id));
      navigate('/');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : t('Không thể xóa bài viết.', 'Could not delete post.')
      );
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
        {t('Đang tải chi tiết hành trình...', 'Loading trip details...')}
      </div>
    );
  }

  if (errorMessage || !post) {
    return (
      <div className="w-full max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white font-editorial">
            {errorStatus === 403
              ? t(
                  'Bài viết giới hạn Chỉ người theo dõi (HTTP 403)',
                  'Followers-only Post (HTTP 403)'
                )
              : t(
                  'Không tìm thấy bài viết (HTTP 404)',
                  'Post Not Found (HTTP 404)'
                )}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto">
            {errorMessage}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              to="/"
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-lg transition-colors"
            >
              {t('Quay về bảng tin Khám phá', 'Back to Explore Feed')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwnerOrAdmin =
    user && (user._id === post.authorId || user.role === 'admin');
  const isLiked = user ? post.likes.includes(user._id) : false;

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('Quay lại bảng tin', 'Back to feed')}</span>
        </Link>

        {isOwnerOrAdmin && (
          <div className="flex items-center gap-2">
            <Link
              to={`/posts/${post._id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('Sửa bài viết', 'Edit post')}</span>
            </Link>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 border border-rose-200 dark:border-rose-900/60 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('Xóa bài', 'Delete')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDeletePost}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                >
                  {t('Xác nhận xóa', 'Confirm delete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer"
                >
                  {t('Hủy', 'Cancel')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <article className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8">
        {/* Metadata Header */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
          <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-white">
            <MapPin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            {post.location} ({post.provinceOrCountry})
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t('Ngày đi', 'Trip date')} {formatVietnameseDate(post.tripDate)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {post.durationDays} {t('ngày', 'days')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
            {t('Tổng chi phí', 'Total cost')} {formatVndCurrency(post.cost)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            {post.visibility === 'followers' ? (
              <>
                <Lock className="w-3 h-3 text-zinc-600 dark:text-zinc-400" />
                <span>{t('Chỉ người theo dõi', 'Followers only')}</span>
              </>
            ) : (
              <>
                <Globe className="w-3 h-3 text-zinc-600 dark:text-zinc-300" />
                <span>{t('Công khai', 'Public')}</span>
              </>
            )}
          </span>
        </div>

        <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white font-editorial leading-tight">
          {post.title}
        </h1>

        {/* Author Row */}
        <div className="mt-4 flex items-center justify-between pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <Link
            to={`/profile/${post.authorId}`}
            className="flex items-center gap-3 group"
          >
            <img
              src={post.author?.avatar || `/api/media/avatar/${post.authorId}`}
              alt={post.author?.fullName || t('Tác giả', 'Author')}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
            />
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:underline transition-colors">
                {post.author?.fullName}
              </div>
              <div className="text-xs text-zinc-500">
                @{post.author?.username} · {t('Đăng ngày', 'Posted on')}{' '}
                {formatVietnameseDate(post.createdAt)}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOptimisticLike}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                isLiked
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  : 'bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-rose-400'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              <span className="font-mono-num">
                {post.likes.length} {t('lượt thích', 'likes')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              {copiedPostLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t('Đã chia sẻ', 'Shared')}</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{t('Chia sẻ', 'Share')}</span>
                </>
              )}
            </button>

            {user && user._id !== post.authorId && (
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                aria-label={t('Báo cáo bài viết này', 'Report this post')}
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-600 cursor-pointer"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Multi-Photo Gallery */}
        {post.images.length > 0 && (
          <div
            className={`mt-6 grid gap-3 ${
              post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {post.images.map((imgUrl, idx) => (
              <button
                key={imgUrl + idx}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className={`relative rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer ${
                  post.images.length === 3 && idx === 0
                    ? 'sm:col-span-2 aspect-16/9'
                    : 'aspect-16/10'
                }`}
              >
                <img
                  src={imgUrl}
                  alt={`${post.title} - ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover hover:scale-102 transition-transform duration-200"
                />
              </button>
            ))}
          </div>
        )}

        {/* Full Story Content */}
        <div className="mt-6 text-base text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-line">
          {post.content}
        </div>

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {post.hashtags.map((tag) => (
              <Link key={tag} to={`/?hashtag=${tag}`} className="hover:text-zinc-950 dark:hover:text-white hover:underline">
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* 1-Level Comments Section */}
        <CommentSection
          postId={post._id}
          threads={comments}
          onThreadsUpdated={(nextThreads, count) => {
            setComments(nextThreads);
            setPost((current) =>
              current ? { ...current, commentCount: count } : null
            );
          }}
        />
      </article>

      {lightboxIndex !== null && (
        <ImageLightboxModal
          images={post.images}
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
          onReported={() => {}}
        />
      )}

      {showShareModal && (
        <SharePostModal
          post={post}
          onClose={() => setShowShareModal(false)}
          onSharedFeedback={() => {
            setCopiedPostLink(true);
            window.setTimeout(() => setCopiedPostLink(false), 2500);
          }}
        />
      )}
    </div>
  );
};
