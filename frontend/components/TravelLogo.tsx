import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface TravelLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

/**
 * Custom Component: TravelLogo (Minimalist Monochrome Threads-Style)
 * Sử dụng cố định Mẫu số 2 (Ghim tọa độ lồng vòng tròn Đỉnh núi tối giản — Pin & Mountain)
 * làm biểu tượng nhận diện chính thức duy nhất của Lữ Hành Việt.
 */
export const TravelLogo: React.FC<TravelLogoProps> = ({
  size = 'md',
  showSubtitle = true,
}) => {
  const { t } = useLanguage();

  const dimensions =
    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-10 h-10' : 'w-9 h-9';

  return (
    <div className="inline-flex items-center gap-3 select-none group">
      <div
        className={`${dimensions} relative shrink-0 rounded-xl flex items-center justify-center bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 transition-transform duration-200 group-hover:scale-105`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 120 120"
          fill="none"
          className="w-6 h-6"
          aria-hidden="true"
        >
          {/* Logo chính thức (Mẫu 2): Ghim tọa độ lồng vòng tròn Đỉnh núi tối giản */}
          <path
            d="M60 14C37.9 14 20 31.9 20 54C20 80.5 60 106 60 106C60 106 100 80.5 100 54C100 31.9 82.1 14 60 14Z"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="60"
            cy="53"
            r="24"
            stroke="currentColor"
            strokeWidth="6.5"
          />
          <path
            d="M40 62L52 48L60 56L70 43L80 60"
            stroke="currentColor"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-tight text-zinc-950 dark:text-white">
          Lữ Hành Việt
        </span>
        {showSubtitle && (
          <span className="text-[11px] font-medium tracking-wide text-zinc-500 dark:text-zinc-400 mt-1">
            {t('Nhật ký du lịch', 'Travel Journal')}
          </span>
        )}
      </div>
    </div>
  );
};

