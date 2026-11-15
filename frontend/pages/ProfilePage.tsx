import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  MapPin,
  UserPlus,
  UserCheck,
  Settings,
  MessageCircle,
  X,
  Search,
  Users,
} from 'lucide-react';
import type { TravelPost, User } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest, formatVndCurrency } from '../utils/api';
import { PostCard } from '../components/PostCard';
import { EditProfileModal } from '../components/EditProfileModal';

/**
 * Component #14: ProfilePage
 * Trang cá nhân của thành viên (/profile/:id) dùng useParams + useMemo tính tổng thống kê chuyến đi,
 * hỗ trợ chuyển đổi ngôn ngữ Tiếng Việt / Tiếng Anh và cửa sổ nổi (Modal) xem danh sách Người theo dõi / Đang theo dõi.
 */
export const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser, updateCurrentUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<TravelPost[]>([]);
  const [followersList, setFollowersList] = useState<User[]>([]);
  const [followingList, setFollowingList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  // Floating modal state for Followers / Following (Threads style)
  const [followModalTab, setFollowModalTab] = useState<'followers' | 'following' | null>(null);
  const [followModalSearch, setFollowModalSearch] = useState('');
  const [memberFollowPendingId, setMemberFollowPendingId] = useState<string | null>(null);

  const fetchProfileData = async (targetId: string, showSpinner: boolean) => {
    if (showSpinner) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await apiRequest<{
        user: User;
        posts: TravelPost[];
        followersList?: User[];
        followingList?: User[];
      }>(`/api/users/${targetId}`);
      setProfileUser(res.user);
      setPosts(res.posts);
      setFollowersList(res.followersList || []);
      setFollowingList(res.followingList || []);
    } catch (err) {
      if (showSpinner) {
        setError(
          err instanceof Error
            ? err.message
            : t('Không tìm thấy trang cá nhân.', 'Profile not found.')
        );
      }
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!id) return;
    setFollowModalTab(null);
    setFollowModalSearch('');
    void fetchProfileData(id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentUser?._id]);

  // Close follow modal on Escape key & lock body scroll when modal is open
  useEffect(() => {
    if (!followModalTab) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFollowModalTab(null);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [followModalTab]);

  const travelStats = useMemo(() => {
    const totalDays = posts.reduce((sum, p) => sum + p.durationDays, 0);
    const totalCost = posts.reduce((sum, p) => sum + p.cost, 0);
    const totalLikes = posts.reduce((sum, p) => sum + p.likes.length, 0);
    const uniqueLocations = new Set(posts.map((p) => p.location.toLowerCase())).size;
    return { totalDays, totalCost, totalLikes, uniqueLocations };
  }, [posts]);

  const handleFollowToggle = async () => {
    if (!profileUser) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setFollowPending(true);
    try {
      const res = await apiRequest<{
        following: boolean;
        targetFollowers: string[];
        userFollowing: string[];
      }>(`/api/users/${profileUser._id}/follow`, { method: 'POST' });

      setProfileUser({ ...profileUser, followers: res.targetFollowers });
      updateCurrentUser({ ...currentUser, following: res.userFollowing });
      if (id) {
        void fetchProfileData(id, false);
      }
    } finally {
      setFollowPending(false);
    }
  };

  const handleMemberFollowToggle = async (targetMember: User) => {
    if (!currentUser) {
      setFollowModalTab(null);
      navigate('/login');
      return;
    }
    if (targetMember._id === currentUser._id) return;

    setMemberFollowPendingId(targetMember._id);
    try {
      const res = await apiRequest<{
        following: boolean;
        targetFollowers: string[];
        userFollowing: string[];
      }>(`/api/users/${targetMember._id}/follow`, { method: 'POST' });

      updateCurrentUser({ ...currentUser, following: res.userFollowing });

      // Update member's followers inside modal lists immediately
      const updateMemberInList = (list: User[]) =>
        list.map((u) =>
          u._id === targetMember._id ? { ...u, followers: res.targetFollowers } : u
        );
      setFollowersList((prev) => updateMemberInList(prev));
      setFollowingList((prev) => updateMemberInList(prev));

      // Refresh profile data silently in background so counts/lists stay in sync
      if (id) {
        void fetchProfileData(id, false);
      }
    } finally {
      setMemberFollowPendingId(null);
    }
  };

  const filteredModalMembers = useMemo(() => {
    const activeList = followModalTab === 'followers' ? followersList : followingList;
    const q = followModalSearch.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        (m.homeCity || '').toLowerCase().includes(q) ||
        (m.bio || '').toLowerCase().includes(q)
    );
  }, [followModalTab, followersList, followingList, followModalSearch]);

  if (loading) {
    return (
      <div className="w-full max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-10 py-16 text-center text-sm text-zinc-500">
        {t('Đang tải trang cá nhân...', 'Loading profile...')}
      </div>
    );
  }

  if (error || !profileUser) {
    return (
      <div className="w-full max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-base font-semibold text-rose-600">
          {error || t('Không tìm thấy thành viên.', 'Member not found.')}
        </p>
      </div>
    );
  }

  const isOwnProfile = currentUser?._id === profileUser._id;
  const isFollowing = currentUser
    ? profileUser.followers.includes(currentUser._id)
    : false;

  return (
    <div className="w-full max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-10 py-6 sm:py-8 space-y-8">
      {/* Profile Header Card */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src={profileUser.avatar}
              alt={profileUser.fullName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const fallback = `/api/media/avatar/${encodeURIComponent(
                  profileUser.fullName || 'VN'
                )}`;
                if (e.currentTarget.src !== window.location.origin + fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-zinc-300 dark:border-zinc-700 shrink-0"
            />
            <div>
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-white font-editorial">
                {profileUser.fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>@{profileUser.username}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                  {profileUser.homeCity}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {t('Vai trò:', 'Role:')}{' '}
                  {profileUser.role === 'admin'
                    ? t('Quản trị viên', 'Administrator')
                    : t('Thành viên', 'Member')}
                </span>
              </div>
              <p className="mt-2.5 text-sm text-zinc-700 dark:text-zinc-300 max-w-2xl">
                {profileUser.bio}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isOwnProfile ? (
              <>
                <Link
                  to="/messages"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t('Hộp thư tin nhắn', 'Messages inbox')}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                  <span>
                    {t('Sửa trang cá nhân & ảnh đại diện', 'Edit profile & avatar')}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      currentUser ? `/messages/${profileUser._id}` : '/login'
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t('Nhắn tin', 'Message')}</span>
                </button>

                <button
                  type="button"
                  disabled={followPending}
                  onClick={handleFollowToggle}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    isFollowing
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>{t('Đang theo dõi (Bỏ theo dõi)', 'Following (Unfollow)')}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>{t('Theo dõi hành trình', 'Follow')}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabular Stats Strip */}
        <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center sm:text-left font-mono-num">
          <button
            type="button"
            id="open-followers-modal-btn"
            onClick={() => {
              setFollowModalSearch('');
              setFollowModalTab('followers');
            }}
            aria-label={t(
              `Xem danh sách ${profileUser.followers.length} người theo dõi`,
              `View ${profileUser.followers.length} followers`
            )}
            className="group text-center sm:text-left rounded-xl px-3 py-2 -mx-3 -my-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <div className="text-xs text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 group-hover:underline underline-offset-4 transition-colors">
              {t('Người theo dõi', 'Followers')}
            </div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              {profileUser.followers.length}
            </div>
          </button>

          <button
            type="button"
            id="open-following-modal-btn"
            onClick={() => {
              setFollowModalSearch('');
              setFollowModalTab('following');
            }}
            aria-label={t(
              `Xem danh sách đang theo dõi ${profileUser.following.length} người`,
              `View ${profileUser.following.length} following`
            )}
            className="group text-center sm:text-left rounded-xl px-3 py-2 -mx-3 -my-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <div className="text-xs text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 group-hover:underline underline-offset-4 transition-colors">
              {t('Đang theo dõi', 'Following')}
            </div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              {profileUser.following.length}
            </div>
          </button>

          <div>
            <div className="text-xs text-zinc-500">
              {t('Chuyến đi hiển thị', 'Published trips')}
            </div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              {posts.length} ({travelStats.uniqueLocations}{' '}
              {t('điểm đến', 'places')})
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">
              {t('Tổng ngày rong ruổi', 'Total travel days')}
            </div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              {travelStats.totalDays} {t('ngày', 'days')}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">
              {t('Tổng chi phí chia sẻ', 'Total shared cost')}
            </div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              {formatVndCurrency(travelStats.totalCost)}
            </div>
          </div>
        </div>
      </section>

      {/* Member's Travel Posts */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            {t(
              `Nhật ký chuyến đi của ${profileUser.fullName} (${posts.length})`,
              `${profileUser.fullName}'s Travel Journals (${posts.length})`
            )}
          </h2>
          {!isOwnProfile && !isFollowing && (
            <span className="text-xs text-zinc-500">
              {t(
                `Theo dõi ${profileUser.fullName} để mở khóa các bài viết chế độ "Chỉ người theo dõi"`,
                `Follow ${profileUser.fullName} to unlock followers-only posts`
              )}
            </span>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
            {t(
              'Thành viên này chưa có bài viết công khai nào.',
              'This member has not published any public posts yet.'
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#262626] rounded-3xl overflow-hidden divide-y divide-zinc-200 dark:divide-[#262626]">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                onPostUpdated={(updated) =>
                  setPosts((prev) =>
                    prev.map((item) => (item._id === updated._id ? updated : item))
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Threads-style Floating Modal for Followers & Following */}
      {followModalTab !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            followModalTab === 'followers'
              ? t('Danh sách người theo dõi', 'Followers list')
              : t('Danh sách đang theo dõi', 'Following list')
          }
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setFollowModalTab(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2c2c2c] rounded-3xl w-full max-w-[520px] max-h-[82vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
            {/* Modal Top Header with Tabs */}
            <div className="relative flex items-center border-b border-zinc-200 dark:border-[#2a2a2a] px-2 pt-1">
              <button
                type="button"
                id="modal-tab-followers"
                onClick={() => setFollowModalTab('followers')}
                className={`flex-1 py-3.5 text-center text-sm font-bold transition-colors relative cursor-pointer ${
                  followModalTab === 'followers'
                    ? 'text-zinc-950 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                <span>{t('Người theo dõi', 'Followers')}</span>
                <span className="ml-1.5 text-xs font-mono-num px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {followersList.length}
                </span>
                {followModalTab === 'followers' && (
                  <span className="absolute bottom-0 inset-x-6 h-0.5 bg-zinc-950 dark:bg-white rounded-full" />
                )}
              </button>

              <button
                type="button"
                id="modal-tab-following"
                onClick={() => setFollowModalTab('following')}
                className={`flex-1 py-3.5 text-center text-sm font-bold transition-colors relative cursor-pointer ${
                  followModalTab === 'following'
                    ? 'text-zinc-950 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                <span>{t('Đang theo dõi', 'Following')}</span>
                <span className="ml-1.5 text-xs font-mono-num px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {followingList.length}
                </span>
                {followModalTab === 'following' && (
                  <span className="absolute bottom-0 inset-x-6 h-0.5 bg-zinc-950 dark:bg-white rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setFollowModalTab(null)}
                aria-label={t('Đóng cửa sổ', 'Close modal')}
                className="p-2 mr-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Filter Bar */}
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-[#242424] bg-zinc-50/60 dark:bg-[#141414]">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={followModalSearch}
                  onChange={(e) => setFollowModalSearch(e.target.value)}
                  placeholder={t(
                    'Tìm theo tên, @username hoặc thành phố...',
                    'Search by name, @username or city...'
                  )}
                  aria-label={t('Tìm kiếm thành viên', 'Search members')}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-[#1f1f1f] border border-zinc-200 dark:border-[#2e2e2e] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                />
                {followModalSearch && (
                  <button
                    type="button"
                    onClick={() => setFollowModalSearch('')}
                    aria-label={t('Xóa từ khóa tìm kiếm', 'Clear search')}
                    className="absolute right-2.5 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Member List Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-[#242424]">
              {filteredModalMembers.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2">
                  <div className="w-11 h-11 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-zinc-400 flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {followModalSearch
                      ? t(
                          'Không tìm thấy thành viên phù hợp.',
                          'No matching members found.'
                        )
                      : followModalTab === 'followers'
                        ? t(
                            'Chưa có người theo dõi nào.',
                            'No followers yet.'
                          )
                        : t(
                            'Chưa theo dõi thành viên nào.',
                            'Not following anyone yet.'
                          )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {followModalTab === 'followers'
                      ? t(
                          `Khi có người theo dõi ${profileUser.fullName}, danh sách sẽ hiển thị tại đây.`,
                          `When people follow ${profileUser.fullName}, they will appear here.`
                        )
                      : t(
                          `Các thành viên mà ${profileUser.fullName} theo dõi sẽ hiển thị tại đây.`,
                          `Accounts followed by ${profileUser.fullName} will appear here.`
                        )}
                  </p>
                </div>
              ) : (
                filteredModalMembers.map((member) => {
                  const isMe = currentUser?._id === member._id;
                  const amIFollowingMember = currentUser
                    ? currentUser.following.includes(member._id)
                    : false;

                  return (
                    <div
                      key={member._id}
                      className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-[#1f1f1f]/70 transition-colors"
                    >
                      <Link
                        to={`/profile/${member._id}`}
                        onClick={() => setFollowModalTab(null)}
                        className="flex items-start gap-3 min-w-0 flex-1 group"
                      >
                        <img
                          src={member.avatar}
                          alt={member.fullName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = `/api/media/avatar/${encodeURIComponent(
                              member.fullName || 'VN'
                            )}`;
                            if (
                              e.currentTarget.src !==
                              window.location.origin + fallback
                            ) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                          className="w-11 h-11 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0 mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:underline truncate">
                              {member.fullName}
                            </span>
                            {member.role === 'admin' && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            <span>@{member.username}</span>
                            {member.homeCity && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 truncate">
                                  <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                                  {member.homeCity}
                                </span>
                              </>
                            )}
                          </div>
                          {member.bio && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-1">
                              {member.bio}
                            </p>
                          )}
                        </div>
                      </Link>

                      <div className="flex items-center gap-2 shrink-0">
                        {isMe ? (
                          <span className="text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                            {t('Bạn', 'You')}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setFollowModalTab(null);
                                navigate(
                                  currentUser
                                    ? `/messages/${member._id}`
                                    : '/login'
                                );
                              }}
                              title={t('Nhắn tin riêng', 'Direct message')}
                              aria-label={t(
                                `Nhắn tin cho ${member.fullName}`,
                                `Message ${member.fullName}`
                              )}
                              className="p-2 rounded-xl border border-zinc-200 dark:border-[#343434] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              disabled={memberFollowPendingId === member._id}
                              onClick={() => handleMemberFollowToggle(member)}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                                amIFollowingMember
                                  ? 'border border-zinc-300 dark:border-[#363636] bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                  : 'bg-zinc-950 dark:bg-white text-white dark:text-black hover:opacity-90'
                              }`}
                            >
                              {amIFollowingMember
                                ? t('Đang theo dõi', 'Following')
                                : t('Theo dõi', 'Follow')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <EditProfileModal
          user={profileUser}
          onClose={() => setShowEditModal(false)}
          onSaved={(updatedUser) => {
            setProfileUser(updatedUser);
            setPosts((prev) =>
              prev.map((post) =>
                post.authorId === updatedUser._id
                  ? {
                      ...post,
                      author: {
                        _id: updatedUser._id,
                        fullName: updatedUser.fullName,
                        username: updatedUser.username,
                        avatar: updatedUser.avatar,
                        role: updatedUser.role,
                      },
                    }
                  : post
              )
            );
            if (isOwnProfile) {
              updateCurrentUser(updatedUser);
            }
            if (id === profileUser.username && updatedUser.username !== profileUser.username) {
              navigate(`/profile/${updatedUser._id}`, { replace: true });
            }
          }}
        />
      )}
    </div>
  );
};

