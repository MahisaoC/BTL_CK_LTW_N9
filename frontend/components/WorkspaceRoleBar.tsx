import React, { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Share2,
  Copy,
  Check,
  X,
  Globe,
  Users,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { copyTextToClipboard, getPublicShareOrigin } from '../utils/api';

/**
 * Component #2: WorkspaceRoleBar
 * Thanh trạng thái tài khoản, bộ chuyển đổi ngôn ngữ VI/EN & Nút Chia sẻ Link Web công khai.
 */
export const WorkspaceRoleBar: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurrentPage, setCopiedCurrentPage] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const publicOrigin = getPublicShareOrigin();
  const currentPath =
    location.pathname && location.pathname !== '/'
      ? `${location.pathname}${location.search}`
      : '';
  const currentPageShareUrl = `${publicOrigin}${currentPath}`;

  const handleCopyShareUrl = async () => {
    urlInputRef.current?.select();
    await copyTextToClipboard(publicOrigin);
    setCopiedUrl(true);
    window.setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleCopyCurrentPageUrl = async () => {
    await copyTextToClipboard(currentPageShareUrl);
    setCopiedCurrentPage(true);
    window.setTimeout(() => setCopiedCurrentPage(false), 2500);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Lữ Hành Việt — Nhật ký du lịch',
          text: t(
            'Cùng khám phá và chia sẻ nhật ký hành trình trên Lữ Hành Việt!',
            'Explore and share travel journals on Lữ Hành Việt!'
          ),
          url: currentPageShareUrl,
        });
        return;
      } catch {
        // Fallback sang sao chép liên kết nếu người dùng đóng hộp thoại hoặc trình duyệt chặn
      }
    }
    await handleCopyShareUrl();
  };

  return (
    <>
      <div className="bg-zinc-100/90 dark:bg-[#121212] border-b border-zinc-200 dark:border-[#1e1e1e] text-xs py-1.5">
        <div className="w-full px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <div className="text-zinc-500 dark:text-zinc-400">
            {user ? (
              <span>
                {t('Xin chào,', 'Welcome,')}{' '}
                <strong className="text-zinc-900 dark:text-zinc-200">
                  {user.fullName}
                </strong>{' '}
                (@{user.username})
              </span>
            ) : (
              <span>
                {t(
                  'Cộng đồng chia sẻ nhật ký hành trình & khám phá điểm đến Việt Nam',
                  'Community for sharing travel journals & discovering destinations in Vietnam'
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!user && (
              <Link
                to="/login"
                className="text-zinc-700 dark:text-zinc-300 hover:underline font-medium whitespace-nowrap"
              >
                {t('Đăng nhập', 'Log in')}
              </Link>
            )}

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 font-semibold cursor-pointer transition-opacity whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{t('Chia sẻ Web', 'Share App')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Share Live Public Web Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-web-title"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#181818] border border-zinc-200 dark:border-[#262626] rounded-3xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-900 dark:text-white">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="share-web-title"
                    className="text-base font-bold text-zinc-950 dark:text-white"
                  >
                    {t(
                      'Mời bạn bè cùng tham gia Lữ Hành Việt',
                      'Invite friends to join Lữ Hành Việt'
                    )}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {t(
                      'Đường dẫn công khai (Public Link) để mọi người truy cập trực tiếp mà không bị chặn quyền',
                      'Public link so anyone can access directly without permission blocks'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                aria-label={t('Đóng', 'Close')}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#101010] border border-zinc-200 dark:border-[#262626] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {t('Đường dẫn trang web công khai:', 'Public web application URL:')}
                </span>
                <a
                  href={publicOrigin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-white hover:underline"
                >
                  <span>{t('Mở trong tab mới', 'Open in new tab')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={urlInputRef}
                  type="text"
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                  value={publicOrigin}
                  aria-label={t('Đường dẫn trang web công khai', 'Public web application URL')}
                  className="flex-1 px-3 py-2 text-xs font-mono-num rounded-xl bg-white dark:bg-[#181818] border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 cursor-pointer shrink-0 transition-colors"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{t('Đã chép Link', 'Copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t('Sao chép Link', 'Copy Link')}</span>
                    </>
                  )}
                </button>
              </div>

              {currentPath && (
                <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500 truncate">
                    {t('Trang hiện tại:', 'Current page:')} {currentPath}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCurrentPageUrl}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
                  >
                    {copiedCurrentPage ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>{t('Đã chép trang này', 'Page copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{t('Chép link trang này', 'Copy this page')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-[#262626] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
                  <Users className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  <span>{t('Đăng nhập nhanh chóng', 'Fast sign-in')}</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  {t(
                    'Hỗ trợ đăng nhập một chạm bằng tài khoản Google hoặc tạo tài khoản cá nhân mới.',
                    'One-click sign-in with Google or create a personal account.'
                  )}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-[#262626] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
                  <ImageIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  <span>{t('Chia sẻ hình ảnh thực tế', 'Real trip photos')}</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  {t(
                    'Tải ảnh trực tiếp từ điện thoại hoặc máy tính kèm lịch trình và chi phí chuyến đi.',
                    'Upload photos directly from your phone or computer with itinerary and trip costs.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('Chia sẻ qua thiết bị', 'Share via device')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
              >
                {t('Đóng', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
