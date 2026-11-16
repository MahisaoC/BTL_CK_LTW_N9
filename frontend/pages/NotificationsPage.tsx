import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch, useAppSelector } from '../store/store';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../store/notificationSlice';
import { formatVietnameseDate } from '../utils/api';

/**
 * Component #16: NotificationsPage
 * Trang quản lý thông báo lấy dữ liệu từ Redux store (notificationSlice),
 * hỗ trợ chuyển đổi ngôn ngữ Tiếng Việt / Tiếng Anh.
 */
export const NotificationsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const dispatch = useAppDispatch();
  const { items, unreadCount, loading, lastPolledAt } = useAppSelector(
    (state) => state.notifications
  );

  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white font-editorial">
            {t(
              `Thông báo tương tác (${unreadCount} chưa đọc)`,
              `Activity Notifications (${unreadCount} unread)`
            )}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-mono-num">
            {t(
              'Đồng bộ tự động từ Redux Store mỗi 30 giây',
              'Auto-synced from Redux Store every 30 seconds'
            )}
            {lastPolledAt
              ? ` · ${t('Cập nhật lúc', 'Updated at')} ${new Date(
                  lastPolledAt
                ).toLocaleTimeString(language === 'en' ? 'en-US' : 'vi-VN')}`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch(fetchNotifications())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('Làm mới', 'Refresh')}</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => dispatch(markAllNotificationsRead())}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-lg cursor-pointer transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{t('Đánh dấu đã đọc tất cả', 'Mark all as read')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500 space-y-2">
            <Bell className="w-6 h-6 mx-auto text-zinc-400" />
            <p>
              {t('Hiện chưa có thông báo mới nào.', 'No notifications yet.')}
            </p>
          </div>
        ) : (
          items.map((notif) => (
            <div
              key={notif._id}
              className={`p-5 flex items-start justify-between gap-4 transition-colors ${
                notif.isRead
                  ? 'bg-transparent'
                  : 'bg-zinc-50/90 dark:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <img
                  src={
                    notif.sender?.avatar || `/api/media/avatar/${notif.senderId}`
                  }
                  alt={notif.sender?.fullName || t('Thành viên', 'Member')}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
                <div>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">
                    <Link
                      to={`/profile/${notif.senderId}`}
                      className="font-semibold text-zinc-950 dark:text-white hover:underline"
                    >
                      {notif.sender?.fullName || t('Thành viên', 'Member')}
                    </Link>{' '}
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 font-mono-num">
                    <span>{formatVietnameseDate(notif.createdAt)}</span>
                    {notif.postId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <Link
                          to={`/posts/${notif.postId}`}
                          className="text-zinc-900 dark:text-white font-semibold hover:underline"
                        >
                          {t('Xem bài viết →', 'View post →')}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {!notif.isRead && (
                <button
                  type="button"
                  onClick={() => dispatch(markNotificationRead(notif._id))}
                  className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t('Đánh dấu đã đọc', 'Mark read')}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
