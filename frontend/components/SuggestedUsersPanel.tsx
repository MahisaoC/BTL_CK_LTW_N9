import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import type { User } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest } from '../utils/api';

/**
 * Component #9: SuggestedUsersPanel
 * Hiển thị danh sách gợi ý theo dõi bên cột phải hỗ trợ chuyển đổi ngôn ngữ VI/EN.
 */
export const SuggestedUsersPanel: React.FC = () => {
  const { user, updateCurrentUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [suggested, setSuggested] = useState<User[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ users: User[] }>('/api/users?suggested=true')
      .then((res) => {
        if (active) setSuggested(res.users);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?._id, user?.following.length]);

  const handleToggleFollow = async (targetUser: User) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setPendingId(targetUser._id);
    try {
      const res = await apiRequest<{
        following: boolean;
        targetFollowers: string[];
        userFollowing: string[];
      }>(`/api/users/${targetUser._id}/follow`, { method: 'POST' });

      updateCurrentUser({ ...user, following: res.userFollowing });
      setSuggested((prev) =>
        prev.map((u) =>
          u._id === targetUser._id ? { ...u, followers: res.targetFollowers } : u
        )
      );
    } finally {
      setPendingId(null);
    }
  };

  if (suggested.length === 0) return null;

  return (
    <section
      aria-labelledby="follow-suggestions-heading"
      className="pt-5 border-t border-zinc-200 dark:border-[#222222]"
    >
      <h2
        id="follow-suggestions-heading"
        className="text-sm font-bold text-zinc-900 dark:text-white mb-4"
      >
        {t('Gợi ý theo dõi', 'Suggested travelers')}
      </h2>

      <div className="space-y-4">
        {suggested.map((member) => {
          const isFollowing = user ? user.following.includes(member._id) : false;
          return (
            <div
              key={member._id}
              className="flex items-start justify-between gap-2.5"
            >
              <Link
                to={`/profile/${member._id}`}
                className="flex items-start gap-3 min-w-0 group"
              >
                <img
                  src={member.avatar}
                  alt={member.fullName}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-800 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-zinc-950 dark:text-white group-hover:underline transition-colors truncate">
                    {member.username}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {member.fullName}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-1">
                    {member.bio}
                  </p>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 font-mono-num whitespace-nowrap truncate">
                    {member.followers.length} {t('người theo dõi', 'followers')} ·{' '}
                    {member.homeCity}
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    navigate(user ? `/messages/${member._id}` : '/login')
                  }
                  title={t(
                    `Nhắn tin cho ${member.fullName}`,
                    `Message ${member.fullName}`
                  )}
                  aria-label={t(
                    `Nhắn tin cho ${member.fullName}`,
                    `Message ${member.fullName}`
                  )}
                  className="p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={pendingId === member._id}
                  onClick={() => handleToggleFollow(member)}
                  aria-label={
                    isFollowing
                      ? t(`Bỏ theo dõi ${member.fullName}`, `Unfollow ${member.fullName}`)
                      : t(`Theo dõi ${member.fullName}`, `Follow ${member.fullName}`)
                  }
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isFollowing
                      ? 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                      : 'border-zinc-950 dark:border-white bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90'
                  }`}
                >
                  {isFollowing
                    ? t('Đang theo dõi', 'Following')
                    : t('Theo dõi', 'Follow')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
