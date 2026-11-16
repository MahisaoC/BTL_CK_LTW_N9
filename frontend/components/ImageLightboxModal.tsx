import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface ImageLightboxModalProps {
  images: string[];
  currentIndex: number;
  title: string;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
}

/**
 * Component #4: ImageLightboxModal
 * Xem ảnh phóng to toàn màn hình + lắng nghe phím Escape/Arrow có cleanup khi unmount, hỗ trợ VI/EN.
 */
export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  images,
  currentIndex,
  title,
  onClose,
  onSelectIndex,
}) => {
  const { t } = useLanguage();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && images.length > 1) {
        onSelectIndex((currentIndex + 1) % images.length);
      }
      if (e.key === 'ArrowLeft' && images.length > 1) {
        onSelectIndex((currentIndex - 1 + images.length) % images.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentIndex, images.length, onClose, onSelectIndex]);

  if (images.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(`Trình xem ảnh: ${title}`, `Photo viewer: ${title}`)}
      className="fixed inset-0 z-50 bg-black/92 flex flex-col justify-between p-6"
    >
      <div className="flex items-center justify-between text-white">
        <div className="text-sm font-medium truncate max-w-xl">
          <span>{title}</span>
          <span className="mx-2 opacity-50">·</span>
          <span className="font-mono-num text-zinc-400">
            {t('Ảnh', 'Photo')} {currentIndex + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Đóng trình xem ảnh', 'Close photo viewer')}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden">
        {images.length > 1 && (
          <button
            type="button"
            onClick={() =>
              onSelectIndex((currentIndex - 1 + images.length) % images.length)
            }
            aria-label={t('Ảnh trước', 'Previous photo')}
            className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img
          src={images[currentIndex]}
          alt={`${title} - ${currentIndex + 1}`}
          referrerPolicy="no-referrer"
          className="max-h-[76vh] max-w-full object-contain rounded-lg shadow-2xl"
        />

        {images.length > 1 && (
          <button
            type="button"
            onClick={() => onSelectIndex((currentIndex + 1) % images.length)}
            aria-label={t('Ảnh tiếp theo', 'Next photo')}
            className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
          {images.map((imgUrl, idx) => (
            <button
              key={imgUrl + idx}
              type="button"
              onClick={() => onSelectIndex(idx)}
              aria-label={t(`Chọn ảnh ${idx + 1}`, `Select photo ${idx + 1}`)}
              className={`w-16 h-11 rounded overflow-hidden border-2 transition-opacity cursor-pointer ${
                idx === currentIndex
                  ? 'border-white opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={imgUrl}
                alt={`${idx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
