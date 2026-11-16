import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  SlidersHorizontal,
  Image as ImageIcon,
  Compass,
  Users,
  UserPlus,
  UserCheck,
  MapPin,
  MessageCircle,
  TrendingUp,
  Navigation,
  LocateFixed,
} from 'lucide-react';
import type { LocationStat, TravelPost, User } from '../types/travel';
import {
  VIETNAM_CITY_HUBS,
  calculateGeoDistance,
  resolveReferenceOrigin,
  type GeoCoordinates,
} from '../utils/travelRules';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch, useAppSelector } from '../store/store';
import {
  appendFeedPage,
  setActiveHashtag,
  setFeedInitialPage,
  setFeedLoading,
  setSearchQuery,
} from '../store/feedSlice';
import { useDebounce } from '../hooks/useDebounce';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { apiRequest, formatVndCurrency } from '../utils/api';
import { PostCard } from '../components/PostCard';
import { SuggestedUsersPanel } from '../components/SuggestedUsersPanel';
import { openNewPostModal } from './PostFormPage';

interface FeedPageProps {
  mode: 'public' | 'following';
}

const POPULAR_HASHTAGS = [
  'oceanpark',
  'hagiang',
  'dalat',
  'hoian',
  'phuquoc',
  'ninhbinh',
  'halong',
  'travel',
];

/**
 * Component #11: FeedPage (Threads 2-Column Center Feed + Right Trending Sidebar)
 * Tích hợp tìm kiếm người dùng (@username, họ tên, tỉnh/thành phố) đồng thời với tìm bài viết, địa điểm & #hashtag.
 */
export const FeedPage: React.FC<FeedPageProps> = ({ mode }) => {
  const { user, updateCurrentUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { posts, page, hasMore, total, loading, activeHashtag, searchQuery } =
    useAppSelector((state) => state.feed);

  const [savedOnly, setSavedOnly] = useState(false);
  const [maxBudget, setMaxBudget] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [topLocations, setTopLocations] = useState<LocationStat[]>([]);
  const [matchingUsers, setMatchingUsers] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOriginHub, setSelectedOriginHub] = useState<string>('');
  const [liveGpsCoords, setLiveGpsCoords] = useState<GeoCoordinates | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const referenceOrigin = useMemo(
    () => resolveReferenceOrigin(user?.homeCity, selectedOriginHub || null, liveGpsCoords),
    [user?.homeCity, selectedOriginHub, liveGpsCoords]
  );

  const handleLocateMyGps = () => {
    if (!navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setSelectedOriginHub('gps');
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const debouncedQuery = useDebounce(searchQuery, 280);

  useEffect(() => {
    let active = true;
    apiRequest<{ locations: LocationStat[] }>('/api/stats/locations?limit=5')
      .then((res) => {
        if (active) setTopLocations(res.locations);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [posts.length]);

  // Tìm kiếm người dùng khác theo từ khóa (tên, @username, thành phố, tiểu sử)
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setMatchingUsers([]);
      setSearchingUsers(false);
      return;
    }

    let active = true;
    setSearchingUsers(true);
    apiRequest<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (active) {
          setMatchingUsers(Array.isArray(res.users) ? res.users : []);
        }
      })
      .catch(() => {
        if (active) setMatchingUsers([]);
      })
      .finally(() => {
        if (active) setSearchingUsers(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const handleToggleFollowUser = async (targetUserId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (followBusyId) return;
    setFollowBusyId(targetUserId);
    try {
      const res = await apiRequest<{ following: boolean; user: User }>(
        `/api/users/${targetUserId}/follow`,
        { method: 'POST' }
      );
      updateCurrentUser(res.user);
      setMatchingUsers((prev) =>
        prev.map((m) => {
          if (m._id !== targetUserId) return m;
          const nextFollowers = res.following
            ? Array.from(new Set([...m.followers, user._id]))
            : m.followers.filter((id) => id !== user._id);
          return { ...m, followers: nextFollowers };
        })
      );
    } catch {
      // Ignore error
    } finally {
      setFollowBusyId(null);
    }
  };

  const effectiveFeedType = useMemo(() => {
    if (savedOnly && user) return 'saved';
    return mode;
  }, [savedOnly, mode, user]);

  const fetchPage = useCallback(
    async (targetPage: number, isLoadMore: boolean) => {
      dispatch(setFeedLoading(true));
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('limit', '4');
        params.set('feed', effectiveFeedType);
        if (debouncedQuery.trim()) {
          params.set('q', debouncedQuery.trim());
        }
        if (activeHashtag) {
          params.set('hashtag', activeHashtag);
        }
        if (maxBudget && !Number.isNaN(Number(maxBudget))) {
          params.set('maxCost', maxBudget);
        }

        const res = await apiRequest<{
          posts: TravelPost[];
          pagination: {
            page: number;
            limit: number;
            total: number;
            hasMore: boolean;
          };
        }>(`/api/posts?${params.toString()}`);

        if (isLoadMore) {
          dispatch(
            appendFeedPage({
              posts: res.posts,
              page: res.pagination.page,
              hasMore: res.pagination.hasMore,
              total: res.pagination.total,
            })
          );
        } else {
          dispatch(
            setFeedInitialPage({
              posts: res.posts,
              hasMore: res.pagination.hasMore,
              total: res.pagination.total,
            })
          );
        }
      } catch (err) {
        dispatch(setFeedLoading(false));
        setError(
          err instanceof Error
            ? err.message
            : t('Không thể tải danh sách bài viết.', 'Could not load posts.')
        );
      }
    },
    [dispatch, effectiveFeedType, debouncedQuery, activeHashtag, maxBudget, t]
  );

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage, user?._id]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(page + 1, true);
    }
  }, [loading, hasMore, page, fetchPage]);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading,
    onLoadMore: handleLoadMore,
  });

  const handleClearFilters = () => {
    dispatch(setSearchQuery(''));
    dispatch(setActiveHashtag(''));
    setSavedOnly(false);
    setMaxBudget('');
  };

  return (
    <div className="w-full lg:h-[calc(100vh-2.65rem)] lg:overflow-hidden">
      <div className="flex items-start justify-between w-full lg:h-full">
        {/* Khu vực giữa: Giữ đúng khung chuẩn Threads 640px nằm chính giữa (không kéo dài ngang) */}
        <div
          id="feed-scroll-column"
          className="flex-1 min-w-0 lg:h-full lg:overflow-y-auto no-scrollbar px-3 sm:px-6 py-4 flex justify-center"
        >
          <div className="w-full max-w-[640px]">
            {/* Top Center Header Tabs */}
            <div className="sticky top-0 z-20 bg-zinc-100/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xs flex items-center justify-between px-2 pb-3 pt-1">
            <div className="flex items-center gap-6">
              <Link
                to="/"
                onClick={() => setSavedOnly(false)}
                className={`text-[15px] font-bold pb-1.5 transition-colors ${
                  mode === 'public' && !savedOnly
                    ? 'text-zinc-950 dark:text-white border-b-2 border-zinc-950 dark:border-white'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                {t('Dành cho bạn', 'For you')}
              </Link>
              <Link
                to="/following"
                className={`text-[15px] font-bold pb-1.5 transition-colors ${
                  mode === 'following'
                    ? 'text-zinc-950 dark:text-white border-b-2 border-zinc-950 dark:border-white'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                {t('Đang theo dõi', 'Following')}
              </Link>
              {user && (
                <button
                  type="button"
                  onClick={() => setSavedOnly((prev) => !prev)}
                  className={`text-[15px] font-bold pb-1.5 transition-colors cursor-pointer ${
                    savedOnly
                      ? 'text-zinc-950 dark:text-white border-b-2 border-zinc-950 dark:border-white'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  {t('Đã lưu', 'Saved')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                aria-label={t(
                  'Mở bộ lọc tìm kiếm và chi phí',
                  'Open search and budget filters'
                )}
                className="p-2 rounded-full text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1e1e1e] transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <Link
                to="/map"
                aria-label={t('Mở bản đồ hành trình', 'Open travel map')}
                className="p-2 rounded-full text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1e1e1e] transition-colors"
              >
                <Compass className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Main Feed Surface */}
          <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#262626] rounded-3xl overflow-hidden divide-y divide-zinc-200 dark:divide-[#262626] shadow-xl">
            {/* Inline Composer Row */}
            <div className="px-6 py-4.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <img
                  src={user?.avatar || '/api/media/avatar/Guest'}
                  alt={user?.fullName || t('Khách', 'Guest')}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                />
                <button
                  type="button"
                  onClick={() =>
                    user ? openNewPostModal() : navigate('/login')
                  }
                  className="text-left text-[15px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 truncate flex-1 cursor-pointer"
                >
                  {t(
                    'Chia sẻ chuyến đi, tọa độ & khoảnh khắc mới của bạn...',
                    "What's new? Share your trip, coordinates & travel moments..."
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    user ? openNewPostModal() : navigate('/login')
                  }
                  aria-label={t('Tải ảnh chuyến đi', 'Upload trip photos')}
                  className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    user ? openNewPostModal() : navigate('/login')
                  }
                  className="px-4.5 py-2 text-[13px] font-bold rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 transition-colors cursor-pointer"
                >
                  {t('Đăng bài', 'Post')}
                </button>
              </div>
            </div>

            {/* Always-Visible Unified Search Bar (Users @username/name + Locations + #Hashtags) */}
            <div className="px-6 py-4 bg-zinc-50/70 dark:bg-[#141414] space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <label htmlFor="feed-search-input" className="sr-only">
                    {t(
                      'Tìm kiếm người dùng (@username, tên), địa điểm hoặc hashtag',
                      'Search users (@username, name), locations, or hashtags'
                    )}
                  </label>
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="feed-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                    placeholder={t(
                      'Tìm người dùng (@username, họ tên), địa điểm hoặc #hashtag...',
                      'Search users (@username, name), locations or #hashtag...'
                    )}
                    className="w-full pl-10 pr-8 py-2.5 text-[13px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#1e1e1e] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => dispatch(setSearchQuery(''))}
                      aria-label={t('Xóa từ khóa', 'Clear search')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {(showFilters || maxBudget) && (
                  <>
                    <label htmlFor="budget-filter-select" className="sr-only">
                      {t('Lọc theo chi phí tối đa', 'Filter by maximum budget')}
                    </label>
                    <select
                      id="budget-filter-select"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#1e1e1e] text-zinc-800 dark:text-zinc-200"
                    >
                      <option value="">{t('Mọi mức chi phí', 'Any budget')}</option>
                      <option value="2000000">
                        {t('Dưới 2.000.000 ₫', 'Under 2,000,000 ₫')}
                      </option>
                      <option value="3500000">
                        {t('Dưới 3.500.000 ₫', 'Under 3,500,000 ₫')}
                      </option>
                      <option value="5000000">
                        {t('Dưới 5.000.000 ₫', 'Under 5,000,000 ₫')}
                      </option>
                    </select>
                  </>
                )}
              </div>

              {(showFilters || activeHashtag || searchQuery) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => dispatch(setActiveHashtag(''))}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer ${
                      activeHashtag === ''
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {t(`Tất cả (${total})`, `All (${total})`)}
                  </button>
                  {POPULAR_HASHTAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        dispatch(setActiveHashtag(activeHashtag === tag ? '' : tag))
                      }
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer ${
                        activeHashtag === tag
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold'
                          : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Matching Users Search Results Directory */}
              {searchQuery.trim() !== '' && (
                <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
                      <Users className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                      {t(
                        `Thành viên phù hợp (${matchingUsers.length})`,
                        `Matching members (${matchingUsers.length})`
                      )}
                    </span>
                    {searchingUsers && (
                      <span className="text-[11px] text-zinc-400">
                        {t('Đang tìm thành viên...', 'Searching members...')}
                      </span>
                    )}
                  </div>

                  {matchingUsers.length === 0 && !searchingUsers ? (
                    <p className="text-xs text-zinc-500 py-1">
                      {t(
                        `Không tìm thấy thành viên nào khớp với "${searchQuery.trim()}".`,
                        `No members match "${searchQuery.trim()}".`
                      )}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {matchingUsers.map((member) => {
                        const isMe = user?._id === member._id;
                        const isFollowing = user
                          ? user.following.includes(member._id)
                          : false;
                        return (
                          <div
                            key={member._id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white dark:bg-[#1c1c1c] border border-zinc-200/90 dark:border-zinc-800 shadow-xs"
                          >
                            <Link
                              to={`/profile/${member._id}`}
                              className="flex items-center gap-2.5 min-w-0 flex-1 group"
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
                                className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-zinc-900 dark:text-white group-hover:underline truncate">
                                    {member.fullName}
                                  </span>
                                  {member.role === 'admin' && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  @{member.username}
                                </div>
                                {member.homeCity && (
                                  <div className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">{member.homeCity}</span>
                                  </div>
                                )}
                              </div>
                            </Link>

                            {isMe ? (
                              <Link
                                to={`/profile/${member._id}`}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0"
                              >
                                {t('Hồ sơ của bạn', 'Your profile')}
                              </Link>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      user ? `/messages/${member._id}` : '/login'
                                    )
                                  }
                                  title={t(
                                    `Nhắn tin cho ${member.fullName}`,
                                    `Message ${member.fullName}`
                                  )}
                                  aria-label={t(
                                    `Nhắn tin cho ${member.fullName}`,
                                    `Message ${member.fullName}`
                                  )}
                                  className="p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={followBusyId === member._id}
                                  onClick={() => handleToggleFollowUser(member._id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                                    isFollowing
                                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-rose-500/15 hover:text-rose-500'
                                      : 'bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950'
                                  }`}
                                >
                                  {isFollowing ? (
                                    <>
                                      <UserCheck className="w-3 h-3" />
                                      <span>{t('Đang theo dõi', 'Following')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="w-3 h-3" />
                                      <span>{t('Theo dõi', 'Follow')}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="p-4 text-xs text-rose-500 bg-rose-950/20"
              >
                {error}
              </div>
            )}

            {/* Threads Feed Posts List */}
            {posts.length === 0 && !loading ? (
              <div className="p-12 text-center space-y-3">
                {searchQuery || activeHashtag || maxBudget || savedOnly ? (
                  <>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {matchingUsers.length > 0
                        ? t(
                            'Thành viên phù hợp được hiển thị ở trên. Chưa có bài viết du lịch nào khớp với từ khóa này.',
                            'Matching members are shown above. No travel posts match this keyword yet.'
                          )
                        : t(
                            'Không tìm thấy bài viết nào khớp với bộ lọc.',
                            'No posts match the current filters.'
                          )}
                    </p>
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                    >
                      {t('Đặt lại bộ lọc', 'Reset filters')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {t(
                        'Chưa có bài viết nào trong bảng tin.',
                        'No posts in the feed yet.'
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {t(
                        'Hãy là người đầu tiên chia sẻ chuyến đi và khoảnh khắc du lịch của bạn!',
                        'Be the first to share your travel itinerary and moments!'
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        user ? openNewPostModal() : navigate('/login')
                      }
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                    >
                      {t('Đăng chuyến đi đầu tiên', 'Share your first trip')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              posts.map((post, idx) => (
                <PostCard
                  key={post._id}
                  post={post}
                  isTrending={idx === 0 || idx === 1}
                  onHashtagClick={(tag) => dispatch(setActiveHashtag(tag))}
                />
              ))
            )}

            {/* Infinite Scroll Sentinel */}
            <div
              ref={sentinelRef}
              className="py-5 flex flex-col items-center justify-center gap-2 text-xs text-zinc-500"
            >
              {loading && (
                <span>
                  {t('Đang tải thêm bài viết...', 'Loading more posts...')}
                </span>
              )}
              {!loading && hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  {t(`Xem thêm (Trang ${page + 1})`, `Load more (Page ${page + 1})`)}
                </button>
              )}
              {!loading && !hasMore && posts.length > 0 && (
                <span>
                  {t(
                    `Đã hiển thị toàn bộ ${total} bài viết.`,
                    `Showing all ${total} posts.`
                  )}
                </span>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Đẩy sát vào mép phải trình duyệt như Threads (thanh cuộn nằm sát rìa phải màn hình) */}
        <aside
          id="trending-scroll-column"
          aria-label={t(
            'Xu hướng và gợi ý theo dõi',
            'Trending destinations and follow suggestions'
          )}
          className="hidden lg:block w-[350px] xl:w-[380px] shrink-0 lg:h-full lg:overflow-y-auto custom-scrollbar pl-3 pr-4 py-4 space-y-5"
        >
          {/* Search Input Box (Users + Locations + #Hashtags) */}
          <div className="space-y-2">
            <div className="relative">
              <label htmlFor="sidebar-search-input" className="sr-only">
                {t(
                  'Tìm người dùng, địa điểm hoặc hashtag',
                  'Search users, locations or hashtags'
                )}
              </label>
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="sidebar-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                placeholder={t(
                  'Tìm @người_dùng, địa điểm, #hashtag...',
                  'Search @users, locations, #hashtag...'
                )}
                className="w-full pl-10 pr-8 py-2.5 text-xs rounded-2xl border border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#181818] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => dispatch(setSearchQuery(''))}
                  aria-label={t('Xóa tìm kiếm', 'Clear search')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {searchQuery.trim() !== '' && matchingUsers.length > 0 && (
              <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#262626] rounded-2xl p-2.5 space-y-1.5 shadow-lg">
                <div className="text-[11px] font-bold text-zinc-900 dark:text-white px-1">
                  {t('Thành viên tìm thấy', 'Matching members')}
                </div>
                {matchingUsers.slice(0, 5).map((member) => (
                  <Link
                    key={member._id}
                    to={`/profile/${member._id}`}
                    className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
                  >
                    <img
                      src={
                        member.avatar ||
                        `/api/media/avatar/${encodeURIComponent(member.fullName)}`
                      }
                      alt={member.fullName}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                        {member.fullName}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        @{member.username}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Trending Destinations Block (Threads-style clean sidebar layout with Soft Yellow Trending Accent) */}
          <section
            aria-labelledby="trending-now-heading"
            className="px-1 space-y-3.5"
          >
            <div className="space-y-2.5">
              <div>
                <div className="inline-flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-yellow-600 dark:text-yellow-300" />
                  <h2
                    id="trending-now-heading"
                    className="text-sm font-bold text-yellow-600 dark:text-yellow-300"
                  >
                    {t('Điểm đến thịnh hành', 'Trending now')}
                  </h2>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t(
                    'Xem vị trí chuẩn và khoảng cách địa lý ước tính',
                    'View coordinates and estimated geographical distance'
                  )}
                </p>
              </div>

              {/* Origin Selector for Distance Calculation */}
              <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#262626]">
                <label
                  htmlFor="trending-origin-select"
                  className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0"
                >
                  {t('Từ:', 'From:')}
                </label>
                <select
                  id="trending-origin-select"
                  value={referenceOrigin.key}
                  onChange={(e) => setSelectedOriginHub(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[11px] font-bold text-zinc-900 dark:text-white focus:outline-none cursor-pointer truncate"
                >
                  {liveGpsCoords && (
                    <option value="gps" className="bg-white dark:bg-zinc-900">
                      {t('Vị trí GPS của bạn', 'Your live GPS')}
                    </option>
                  )}
                  {VIETNAM_CITY_HUBS.map((hub) => (
                    <option
                      key={hub.key}
                      value={hub.key}
                      className="bg-white dark:bg-zinc-900"
                    >
                      {t(hub.labelVi, hub.labelEn)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLocateMyGps}
                  disabled={locatingGps}
                  title={t(
                    'Đo khoảng cách từ vị trí GPS hiện tại của bạn',
                    'Calculate distance from your current GPS'
                  )}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-[10px] font-bold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>{locatingGps ? '...' : 'GPS'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3.5">
              {topLocations.slice(0, 4).map((loc, idx) => {
                const distance = calculateGeoDistance(
                  referenceOrigin.coordinates,
                  loc.coordinates
                );

                return (
                  <div
                    key={loc.location}
                    className="flex items-start gap-2.5 pb-3.5 last:pb-0 border-b last:border-b-0 border-zinc-200/70 dark:border-[#222222]"
                  >
                    <span className="mt-0.5 px-1.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/25 text-[10px] font-mono-num font-bold text-yellow-700 dark:text-yellow-300 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => dispatch(setSearchQuery(loc.location))}
                        className="text-left block group cursor-pointer w-full"
                      >
                        <div className="text-xs font-bold text-zinc-950 dark:text-white group-hover:underline transition-colors leading-snug">
                          {loc.location} ({loc.provinceOrCountry})
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-num mt-0.5">
                          GPS: {loc.coordinates.lat.toFixed(4)}°N,{' '}
                          {loc.coordinates.lng.toFixed(4)}°E
                        </div>
                      </button>

                      {/* Geographical Distance Badge */}
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-200/70 dark:bg-[#181818] border border-zinc-300/60 dark:border-[#262626] text-[11px] font-mono-num text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        <Navigation className="w-3 h-3 text-zinc-500 dark:text-zinc-400 shrink-0" />
                        <span>
                          {t(
                            `Cách ${referenceOrigin.labelVi}: ${distance.straightKm} km (Đường bộ ~${distance.roadEstimateKm} km)`,
                            `${distance.straightKm} km from ${referenceOrigin.labelEn} (~${distance.roadEstimateKm} km road)`
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-num font-medium whitespace-nowrap">
                        <span>
                          {loc.postCount} {t('bài viết', 'posts')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {loc.totalLikes} {t('lượt thích', 'likes')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                          {formatVndCurrency(loc.avgCost)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Link
              to="/map"
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:underline"
            >
              {t('Xem trên Bản đồ hành trình →', 'Explore on Travel Map →')}
            </Link>
          </section>

          {/* Follow Suggestions Block */}
          <SuggestedUsersPanel />
        </aside>
      </div>
    </div>
  );
};
