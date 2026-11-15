import React, { useState, useEffect } from 'react';
import { X, Upload, RotateCcw } from 'lucide-react';
import type { User } from '../types/travel';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest } from '../utils/api';

interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onSaved: (updated: User) => void;
}

/**
 * Component #6: EditProfileModal
 * Chỉnh sửa trang cá nhân (Họ tên, Username, Thành phố, Tiểu sử & Ảnh đại diện)
 * có xem trước bằng URL.createObjectURL + thu hồi khi unmount, hỗ trợ VI/EN.
 */
export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  user,
  onClose,
  onSaved,
}) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(user.fullName || '');
  const [username, setUsername] = useState(user.username || '');
  const [homeCity, setHomeCity] = useState(user.homeCity || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(
    user.avatar || `/api/media/avatar/${encodeURIComponent(user.fullName || 'VN')}`
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(
        t(
          'Ảnh đại diện không được vượt quá 5MB.',
          'Avatar image must not exceed 5MB.'
        )
      );
      return;
    }
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setPreviewObjectUrl(objUrl);
    setSelectedFile(file);
    setError('');
  };

  const handleUseDefaultAvatar = () => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
    }
    setSelectedFile(null);
    const seed = fullName.trim() || username.trim() || 'VN';
    setAvatarUrl(`/api/media/avatar/${encodeURIComponent(seed)}`);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setError(
        t(
          'Họ và tên cần tối thiểu 2 ký tự.',
          'Full name must be at least 2 characters.'
        )
      );
      return;
    }
    if (!/^[a-zA-Z0-9._]{3,24}$/.test(trimmedUsername)) {
      setError(
        t(
          'Username cần từ 3-24 ký tự, chỉ gồm chữ cái, số, dấu chấm hoặc gạch dưới.',
          'Username must be 3-24 characters (letters, numbers, dots, or underscores).'
        )
      );
      return;
    }
    if (bio.length > 300) {
      setError(
        t(
          'Giới thiệu bản thân tối đa 300 ký tự.',
          'Bio must be at most 300 characters.'
        )
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      let finalAvatar = avatarUrl;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('images', selectedFile);
        const uploadRes = await apiRequest<{ urls: string[] }>('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.urls[0]) {
          finalAvatar = uploadRes.urls[0];
        }
      }

      const res = await apiRequest<{ user: User }>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: trimmedName,
          username: trimmedUsername,
          homeCity: homeCity.trim() || 'Việt Nam',
          bio: bio.trim(),
          avatar: finalAvatar,
        }),
      });
      onSaved(res.user);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Cập nhật hồ sơ thất bại.', 'Could not update profile.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3
            id="edit-profile-title"
            className="text-lg font-semibold text-zinc-900 dark:text-white"
          >
            {t('Chỉnh sửa hồ sơ cá nhân', 'Edit Personal Profile')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Đóng cửa sổ chỉnh sửa hồ sơ', 'Close edit profile modal')}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={previewObjectUrl || avatarUrl}
              alt={fullName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const fallback = `/api/media/avatar/${encodeURIComponent(
                  fullName.trim() || 'VN'
                )}`;
                if (e.currentTarget.src !== window.location.origin + fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
              className="w-16 h-16 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
            />
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="avatar-upload-input"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                  <span>
                    {t('Tải ảnh mới (tối đa 5MB)', 'Upload avatar (max 5MB)')}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleUseDefaultAvatar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                  <span>{t('Ảnh chữ cái', 'Initials avatar')}</span>
                </button>
              </div>
              <input
                id="avatar-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileChange}
                className="hidden"
              />
              <p className="text-xs text-zinc-500">
                {t(
                  'Hỗ trợ JPG, PNG, WEBP, SVG có xem trước tức thì.',
                  'Supports JPG, PNG, WEBP, SVG with instant preview.'
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-fullname"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                {t('Họ và tên hiển thị', 'Display name')}
              </label>
              <input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="profile-username"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                {t('Tên định danh (@username)', 'Username (@handle)')}
              </label>
              <input
                id="profile-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-city"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              {t('Thành phố sinh sống', 'Current city')}
            </label>
            <input
              id="profile-city"
              type="text"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="profile-bio"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              {t(
                `Giới thiệu hành trình (${bio.length}/300)`,
                `Travel bio (${bio.length}/300)`
              )}
            </label>
            <textarea
              id="profile-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer"
            >
              {t('Hủy', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving
                ? t('Đang lưu...', 'Saving...')
                : t('Lưu thay đổi', 'Save changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
