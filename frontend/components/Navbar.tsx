import React, { useEffect, useState, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Home,
  Plus,
  Compass,
  Heart,
  MessageCircle,
  User as UserIcon,
  Bookmark,
  Shield,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch, useAppSelector } from '../store/store';
import { clearNotifications, fetchNotifications } from '../store/notificationSlice';
import { apiRequest, copyTextToClipboard, getPublicShareOrigin } from '../utils/api';
import { openNewPostModal } from '../pages/PostFormPage';
import { TravelLogo } from './TravelLogo';

/**
 * Icon 2 thanh ngang chuẩn phong cách nút "= More" của Threads
 */
const ThreadsMoreLinesIcon: React.FC<{ className?: string }> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="14" y2="15" />
  </svg>
);

/**
 * Component #1: Navbar (Threads-Style Left Sidebar on Desktop + Responsive Mobile Bar)
 * Gộp các chức năng Giao diện (Appearance), Ngôn ngữ (Language), Cài đặt (Settings),
 * Đã lưu, Chia sẻ Web và Đăng xuất (Log out) vào menu nổi "= More" chuẩn thiết kế Threads.
 */
export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const unreadCount = useAppSelector((state) => state.notifications.unreadCount);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSubView, setMoreSubView] = useState<
    'main' | 'appearance' | 'language'
  >('main');
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const desktopMoreRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      dispatch(clearNotifications());
      setUnreadMessagesCount(0);
      return;
    }

    const fetchUnreadMsgCount = () => {
      apiRequest<{ unreadCount: number }>('/api/messages/unread-count')
        .then((res) => setUnreadMessagesCount(res.unreadCount || 0))
        .catch(() => {});
    };

    dispatch(fetchNotifications());
    fetchUnreadMsgCount();

    const intervalId = window.setInterval(() => {
      dispatch(fetchNotifications());
      fetchUnreadMsgCount();
    }, 30_000);

    const handleMessagesUpdated = () => fetchUnreadMsgCount();
    window.addEventListener('travel:messages-updated', handleMessagesUpdated);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('travel:messages-updated', handleMessagesUpdated);
    };
  }, [user, dispatch]);

  // Đóng menu More khi bấm ra ngoài hoặc nhấn phím Escape
  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = desktopMoreRef.current?.contains(target);
      const inMobile = mobileMoreRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setMoreOpen(false);
        setMoreSubView('main');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setMoreSubView('main');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const handleToggleMoreMenu = () => {
    setMoreOpen((prev) => {
      const next = !prev;
      if (!next) setMoreSubView('main');
      return next;
    });
  };

  const handleCloseMoreMenu = () => {
    setMoreOpen(false);
    setMoreSubView('main');
  };

  const handleCopyShareApp = async () => {
    const shareUrl = `${getPublicShareOrigin()}/`;
    await copyTextToClipboard(shareUrl);
    setCopiedShareLink(true);
    window.setTimeout(() => {
      setCopiedShareLink(false);
      handleCloseMoreMenu();
    }, 1200);
  };

  const sidebarLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold shadow-2xs'
        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#181818] hover:text-zinc-950 dark:hover:text-white'
    }`;

  /**
   * Nội dung Popover Menu "More" chuẩn phong cách Threads (Ảnh 2)
   */
  const renderMorePopoverContent = () => {
    if (moreSubView === 'appearance') {
      return (
        <div className="p-2 space-y-1.5">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-200/80 dark:border-[#2a2a2a]">
            <button
              type="button"
              onClick={() => setMoreSubView('main')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('Giao diện', 'Appearance')}</span>
            </button>
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-zinc-300" />
            ) : (
              <Sun className="w-4 h-4 text-zinc-600" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-[#101010] rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (theme !== 'light') toggleTheme();
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200/80'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>{t('Sáng', 'Light')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (theme !== 'dark') toggleTheme();
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[#242424] text-white shadow-xs border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>{t('Tối', 'Dark')}</span>
            </button>
          </div>
        </div>
      );
    }

    if (moreSubView === 'language') {
      return (
        <div className="p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-200/80 dark:border-[#2a2a2a]">
            <button
              type="button"
              onClick={() => setMoreSubView('main')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('Ngôn ngữ hiển thị', 'Language')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setLanguage('vi');
              setMoreSubView('main');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <span>Tiếng Việt</span>
            {language === 'vi' && <Check className="w-4 h-4 text-zinc-900 dark:text-white" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setLanguage('en');
              setMoreSubView('main');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <span>English</span>
            {language === 'en' && <Check className="w-4 h-4 text-zinc-900 dark:text-white" />}
          </button>
        </div>
      );
    }

    return (
      <div className="divide-y divide-zinc-200/80 dark:divide-[#2a2a2a]">
        {/* Nhóm 1: Giao diện (Appearance), Ngôn ngữ (Language) & Cài đặt (Settings) */}
        <div className="p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => setMoreSubView('appearance')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <span>{t('Giao diện', 'Appearance')}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <span>
                {theme === 'dark' ? t('Tối', 'Dark') : t('Sáng', 'Light')}
              </span>
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMoreSubView('language')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <span>{t('Ngôn ngữ', 'Language')}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <span>{language === 'vi' ? 'Tiếng Việt' : 'English'}</span>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </span>
          </button>

          <button
            type="button"
            data-testid="navbar-settings-btn"
            onClick={() => {
              handleCloseMoreMenu();
              navigate(user ? '/settings' : '/login');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors text-left cursor-pointer"
          >
            <span>{t('Cài đặt', 'Settings')}</span>
          </button>
        </div>

        {/* Nhóm 2: Đã lưu / Đang theo dõi / Quản trị */}
        <div className="p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              handleCloseMoreMenu();
              navigate(user ? `/profile/${user._id}` : '/login');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors text-left cursor-pointer"
          >
            <span>{t('Đã lưu & Yêu thích', 'Liked & Saved')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleCloseMoreMenu();
              navigate('/following');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors text-left cursor-pointer"
          >
            <span>{t('Bảng tin đang theo dõi', 'Following feed')}</span>
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                handleCloseMoreMenu();
                navigate('/admin');
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors text-left cursor-pointer"
            >
              <span>{t('Quản trị hệ thống', 'Admin dashboard')}</span>
            </button>
          )}
        </div>

        {/* Nhóm 3: Chia sẻ Web & Đăng xuất (Log out màu đỏ như Ảnh 2) */}
        <div className="p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={handleCopyShareApp}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors text-left cursor-pointer"
          >
            <span>
              {copiedShareLink
                ? t('Đã sao chép liên kết Web!', 'Link copied!')
                : t('Chia sẻ Web', 'Share app')}
            </span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => {
                handleCloseMoreMenu();
                logout();
                navigate('/');
              }}
              aria-label={t('Đăng xuất tài khoản', 'Log out')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
            >
              <span className="truncate">
                {t(`Đăng xuất (@${user.username})`, `Log out (@${user.username})`)}
              </span>
            </button>
          ) : (
            <Link
              to="/login"
              onClick={handleCloseMoreMenu}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-semibold text-zinc-950 dark:text-white hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors"
            >
              <span>{t('Đăng nhập / Đăng ký', 'Log in / Sign up')}</span>
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside
        aria-label={t('Thanh điều hướng chính', 'Primary navigation sidebar')}
        className="hidden md:flex flex-col justify-between w-60 shrink-0 h-screen sticky top-0 px-4 py-5 border-r border-zinc-200 dark:border-[#1e1e1e] bg-white dark:bg-[#0a0a0a] select-none z-30"
      >
        <div className="space-y-6">
          <Link to="/" className="block px-2 py-1">
            <TravelLogo size="md" showSubtitle={true} />
          </Link>

          {/* Primary Navigation Links */}
          <nav aria-label={t('Điều hướng chính', 'Main navigation')} className="space-y-1">
            <NavLink to="/" end className={sidebarLinkClass}>
              <Home className="w-5 h-5 shrink-0" />
              <span>{t('Dành cho bạn', 'For you')}</span>
            </NavLink>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  navigate('/login');
                } else {
                  openNewPostModal();
                }
              }}
              className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#181818] hover:text-zinc-950 dark:hover:text-white cursor-pointer"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span>{t('Đăng bài mới', 'New post')}</span>
            </button>

            <NavLink to="/map" className={sidebarLinkClass}>
              <Compass className="w-5 h-5 shrink-0" />
              <span>{t('Bản đồ hành trình', 'Travel map')}</span>
            </NavLink>

            <NavLink
              to="/messages"
              className={sidebarLinkClass}
            >
              <div className="relative">
                <MessageCircle className="w-5 h-5 shrink-0" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                    {unreadMessagesCount}
                  </span>
                )}
              </div>
              <span>
                {unreadMessagesCount > 0
                  ? t(
                      `Tin nhắn (${unreadMessagesCount})`,
                      `Messages (${unreadMessagesCount})`
                    )
                  : t('Tin nhắn', 'Messages')}
              </span>
            </NavLink>

            <NavLink
              to="/notifications"
              className={sidebarLinkClass}
            >
              <div className="relative">
                <Heart className="w-5 h-5 shrink-0" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span>
                {unreadCount > 0
                  ? t(`Thông báo (${unreadCount})`, `Notifications (${unreadCount})`)
                  : t('Thông báo', 'Notifications')}
              </span>
            </NavLink>

            <NavLink
              to={user ? `/profile/${user._id}` : '/login'}
              className={({ isActive }) =>
                sidebarLinkClass({ isActive: isActive && Boolean(user) })
              }
            >
              <UserIcon className="w-5 h-5 shrink-0" />
              <span>{t('Trang cá nhân', 'Profile')}</span>
            </NavLink>

            {user?.role === 'admin' && (
              <NavLink to="/admin" className={sidebarLinkClass}>
                <Shield className="w-5 h-5 shrink-0 text-zinc-600 dark:text-zinc-400" />
                <span>{t('Quản trị hệ thống', 'Admin')}</span>
              </NavLink>
            )}
          </nav>

          {/* Feeds Sub-section */}
          <div className="pt-4 border-t border-zinc-200 dark:border-[#222222] space-y-1">
            <div className="px-3.5 pb-1 flex items-center justify-between text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              <span>{t('Bảng tin', 'Feeds')}</span>
              <span>{t('Lọc', 'Filter')}</span>
            </div>
            <NavLink to="/following" className={sidebarLinkClass}>
              <Bookmark className="w-4 h-4 shrink-0" />
              <span>{t('Đang theo dõi', 'Following')}</span>
            </NavLink>
          </div>
        </div>

        {/* Bottom-Left Threads-Style "= More" Button & Floating Popover Menu */}
        <div ref={desktopMoreRef} className="relative pt-3">
          {moreOpen && (
            <div
              role="menu"
              aria-label={t('Menu tùy chọn mở rộng', 'More options menu')}
              className="absolute bottom-full left-0 mb-2.5 w-60 rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2a2a2a] shadow-2xl overflow-hidden z-50"
            >
              {renderMorePopoverContent()}
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleMoreMenu}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-colors cursor-pointer ${
              moreOpen
                ? 'bg-zinc-100 dark:bg-[#1c1c1c] text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#181818] hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <ThreadsMoreLinesIcon className="w-5 h-5 shrink-0" />
            <span>{t('Xem thêm', 'More')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar & Bottom Navigation (<768px) */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur border-b border-zinc-200 dark:border-[#222222] px-4 py-2.5 flex items-center justify-between">
        <Link to="/">
          <TravelLogo size="sm" showSubtitle={true} />
        </Link>

        <div ref={mobileMoreRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!user) {
                navigate('/login');
              } else {
                openNewPostModal();
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
          >
            {user ? t('+ Đăng bài', '+ New post') : t('Đăng nhập', 'Log in')}
          </button>

          <button
            type="button"
            onClick={handleToggleMoreMenu}
            aria-label={t('Xem thêm tùy chọn', 'More options')}
            aria-expanded={moreOpen}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#181818] cursor-pointer"
          >
            <ThreadsMoreLinesIcon className="w-5 h-5" />
          </button>

          {moreOpen && (
            <div
              role="menu"
              aria-label={t('Menu tùy chọn mở rộng', 'More options menu')}
              className="absolute top-full right-0 mt-2 w-60 rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#2a2a2a] shadow-2xl overflow-hidden z-50"
            >
              {renderMorePopoverContent()}
            </div>
          )}
        </div>
      </header>

      <nav
        aria-label={t('Điều hướng di động', 'Mobile navigation')}
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur border-t border-zinc-200 dark:border-[#222222] flex items-center justify-around py-2.5 px-2"
      >
        <NavLink
          to="/"
          end
          aria-label={t('Trang chủ', 'Home')}
          className="p-2 text-zinc-600 dark:text-zinc-300"
        >
          <Home className="w-5 h-5" />
        </NavLink>
        <NavLink
          to="/map"
          aria-label={t('Bản đồ', 'Map')}
          className="p-2 text-zinc-600 dark:text-zinc-300"
        >
          <Compass className="w-5 h-5" />
        </NavLink>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              navigate('/login');
            } else {
              openNewPostModal();
            }
          }}
          aria-label={t('Đăng bài mới', 'New post')}
          className="p-2 text-zinc-600 dark:text-zinc-300 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
        <NavLink
          to={user ? '/messages' : '/login'}
          aria-label={t('Tin nhắn', 'Messages')}
          className="p-2 text-zinc-600 dark:text-zinc-300 relative"
        >
          <MessageCircle className="w-5 h-5" />
          {unreadMessagesCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </NavLink>
        <NavLink
          to="/notifications"
          aria-label={t('Thông báo', 'Notifications')}
          className="p-2 text-zinc-600 dark:text-zinc-300 relative"
        >
          <Heart className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </NavLink>
        <NavLink
          to={user ? `/profile/${user._id}` : '/login'}
          aria-label={t('Cá nhân', 'Profile')}
          className="p-2 text-zinc-600 dark:text-zinc-300"
        >
          <UserIcon className="w-5 h-5" />
        </NavLink>
      </nav>
    </>
  );
};
