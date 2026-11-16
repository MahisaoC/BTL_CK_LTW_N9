import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { ShieldAlert, Users, BarChart3, Lock, Unlock, EyeOff, CheckCircle2 } from 'lucide-react';
import type { LocationStat, PostReport, User } from '../types/travel';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest, formatVietnameseDate, formatVndCurrency } from '../utils/api';

/**
 * Component #17: AdminLayout (Nested Routes + <Outlet />)
 */
export const AdminLayout: React.FC = () => {
  const { t } = useLanguage();
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
    }`;

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 2xl:px-10 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            {t('Bảng điều khiển Quản trị viên', 'Administrator Dashboard')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white font-editorial mt-1">
            {t(
              'Quản trị nội dung & thống kê điểm đến',
              'Content Moderation & Destination Analytics'
            )}
          </h1>
        </div>

        <nav
          aria-label={t('Menu quản trị', 'Admin menu')}
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          <NavLink to="/admin/reports" className={tabClass}>
            <ShieldAlert className="w-4 h-4" />
            <span>{t('Báo cáo bài viết', 'Reported Posts')}</span>
          </NavLink>
          <NavLink to="/admin/users" className={tabClass}>
            <Users className="w-4 h-4" />
            <span>{t('Quản lý tài khoản', 'User Accounts')}</span>
          </NavLink>
          <NavLink to="/admin/stats" className={tabClass}>
            <BarChart3 className="w-4 h-4" />
            <span>{t('Thống kê địa điểm', 'Destination Stats')}</span>
          </NavLink>
        </nav>
      </div>

      <Outlet />
    </div>
  );
};

/**
 * Component #18: AdminReportsTab
 */
export const AdminReportsTab: React.FC = () => {
  const { t } = useLanguage();
  const [reports, setReports] = useState<PostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadReports = () => {
    setLoading(true);
    apiRequest<{ reports: PostReport[] }>('/api/reports')
      .then((res) => setReports(res.reports))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleAction = async (
    reportId: string,
    action: 'hide_post' | 'restore_post' | 'dismiss'
  ) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      setFeedback(res.message);
      loadReports();
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : t('Thao tác thất bại.', 'Action failed.')
      );
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          {t(
            `Danh sách bài viết bị báo cáo (${reports.length})`,
            `Reported Posts (${reports.length})`
          )}
        </h2>
        {feedback && (
          <span role="status" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {feedback}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            {t('Đang tải danh sách báo cáo...', 'Loading reports...')}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            {t('Không có báo cáo vi phạm nào.', 'No violation reports found.')}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {reports.map((report) => (
              <div
                key={report._id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 font-mono-num">
                    <span>
                      {t('Trạng thái:', 'Status:')}{' '}
                      <strong className="text-zinc-900 dark:text-white">
                        {report.status === 'pending'
                          ? t('Chờ xử lý', 'Pending')
                          : report.status === 'resolved'
                          ? t('Đã ẩn bài viết', 'Post hidden')
                          : t('Đã bỏ qua', 'Dismissed')}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('Người báo cáo:', 'Reporter:')} {report.reporter?.fullName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('Ngày gửi:', 'Submitted:')} {formatVietnameseDate(report.createdAt)}
                    </span>
                  </div>

                  <div className="text-sm font-bold text-zinc-900 dark:text-white">
                    {t('Bài viết:', 'Post:')}{' '}
                    {report.post ? (
                      <Link
                        to={`/posts/${report.post._id}`}
                        className="text-zinc-800 dark:text-zinc-200 hover:underline"
                      >
                        {report.post.title}
                      </Link>
                    ) : (
                      t('Bài viết đã xóa', 'Deleted post')
                    )}{' '}
                    {report.post?.status === 'hidden' && (
                      <span className="text-xs text-rose-600 font-normal">
                        ({t('Đang bị ẩn khỏi bảng tin', 'Currently hidden from feed')})
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-700 dark:text-zinc-300">
                    {t('Lý do:', 'Reason:')} <strong>{report.reason}</strong>
                    {report.details ? ` — ${report.details}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {report.post?.status !== 'hidden' ? (
                    <button
                      type="button"
                      onClick={() => handleAction(report._id, 'hide_post')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>{t('Ẩn bài viết vi phạm', 'Hide post')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAction(report._id, 'restore_post')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('Khôi phục hiển thị', 'Restore post')}</span>
                    </button>
                  )}

                  {report.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleAction(report._id, 'dismiss')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      {t('Bỏ qua báo cáo', 'Dismiss')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * Component #19: AdminUsersTab
 */
export const AdminUsersTab: React.FC = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ users: User[] }>('/api/users')
      .then((res) => setUsers(res.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggleLock = async (target: User) => {
    try {
      const res = await apiRequest<{ user: User; message: string }>(
        `/api/users/${target._id}/lock`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isLocked: !target.isLocked }),
        }
      );
      setUsers((prev) =>
        prev.map((u) => (u._id === target._id ? res.user : u))
      );
      setFeedback(res.message);
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : t('Không thể thay đổi trạng thái.', 'Could not update status.')
      );
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          {t(
            `Quản lý tài khoản thành viên (${users.length})`,
            `Member Accounts (${users.length})`
          )}
        </h2>
        {feedback && (
          <span role="status" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {feedback}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            {t('Đang tải danh sách thành viên...', 'Loading members...')}
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
                <th className="py-3.5 px-5 font-semibold">
                  {t('Thành viên', 'Member')}
                </th>
                <th className="py-3.5 px-4 font-semibold">Email</th>
                <th className="py-3.5 px-4 font-semibold">
                  {t('Vai trò', 'Role')}
                </th>
                <th className="py-3.5 px-4 font-semibold">
                  {t('Người theo dõi', 'Followers')}
                </th>
                <th className="py-3.5 px-4 font-semibold">
                  {t('Trạng thái', 'Status')}
                </th>
                <th className="py-3.5 px-5 font-semibold text-right">
                  {t('Thao tác', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {users.map((u) => (
                <tr key={u._id}>
                  <td className="py-3.5 px-5">
                    <Link
                      to={`/profile/${u._id}`}
                      className="font-semibold text-zinc-900 dark:text-white hover:underline"
                    >
                      {u.fullName}
                    </Link>
                    <div className="text-xs text-zinc-500">@{u.username}</div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-zinc-600 dark:text-zinc-400 font-mono-num">
                    {u.email}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium">
                    {u.role === 'admin'
                      ? 'Admin'
                      : t('Thành viên', 'Member')}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-mono-num">
                    {u.followers.length}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium">
                    {u.isLocked ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        {t('Đã khóa tài khoản', 'Locked')}
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {t('Đang hoạt động', 'Active')}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    {u.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleToggleLock(u)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          u.isLocked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                        }`}
                      >
                        {u.isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>{t('Mở khóa', 'Unlock')}</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>{t('Khóa tài khoản', 'Lock account')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};

/**
 * Component #20: AdminStatsTab
 */
export const AdminStatsTab: React.FC = () => {
  const { t } = useLanguage();
  const [locations, setLocations] = useState<LocationStat[]>([]);

  useEffect(() => {
    apiRequest<{ locations: LocationStat[] }>('/api/stats/locations?limit=10')
      .then((res) => {
        setLocations(res.locations);
      })
      .catch(() => {});
  }, []);

  const maxCount = Math.max(1, ...locations.map((l) => l.postCount));

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
        {t(
          'Xếp hạng địa điểm được nhắc đến nhiều nhất',
          'Most Mentioned Destinations Ranking'
        )}
      </h2>
      <p className="text-xs text-zinc-500">
        {t(
          'Thống kê tự động dựa trên số lượng bài viết công khai và mức độ tương tác của cộng đồng.',
          'Automatically aggregated based on public post counts and community engagement.'
        )}
      </p>

      <div className="space-y-4 pt-2">
        {locations.map((loc, index) => {
          const widthPercent = Math.round((loc.postCount / maxCount) * 100);
          return (
            <div key={loc.location} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-900 dark:text-white">
                  0{index + 1}. {loc.location} ({loc.provinceOrCountry})
                </span>
                <span className="font-mono-num text-zinc-600 dark:text-zinc-400">
                  {loc.postCount} {t('bài viết', 'posts')} · {loc.totalLikes}{' '}
                  {t('lượt thích', 'likes')} · {t('Chi phí TB', 'Avg cost')}{' '}
                  {formatVndCurrency(loc.avgCost)}
                </span>
              </div>
              <div className="w-full h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
