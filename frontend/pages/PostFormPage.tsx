import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  X,
  MapPin,
  Image as ImageIcon,
  Smile,
  Hash,
  AlignLeft,
  FileText,
  Music,
  SlidersHorizontal,
  MoreHorizontal,
  ChevronRight,
  Globe,
  Users,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { PostVisibility, TravelPost } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useAppDispatch } from '../store/store';
import { prependOrUpdatePostInFeed } from '../store/feedSlice';
import { validateImageFileMeta, validatePostInput } from '../utils/travelRules';
import { useDebounce } from '../hooks/useDebounce';
import { apiRequest } from '../utils/api';

interface LocalPreviewFile {
  id: string;
  file: File;
  previewUrl: string;
}

const DRAFT_STORAGE_KEY = 'luhanhviet_new_thread_draft_v1';

const QUICK_EMOJIS = [
  '✈️',
  '🏝️',
  '🏔️',
  '🍜',
  '📸',
  '🌅',
  '🏕️',
  '🌊',
  '❤️',
  '🔥',
  '✨',
  '😍',
  '🙌',
  '☕',
  '🛵',
  '🌸',
];

const QUICK_HASHTAGS = [
  'dalat',
  'phuquoc',
  'hagiang',
  'hoian',
  'ninhbinh',
  'halong',
  'oceanpark',
  'travel',
];

const TRAVEL_VIBES = [
  { id: 'chill', labelVi: '🎵 Chill Acoustic giữa thiên nhiên', labelEn: '🎵 Chill Acoustic vibes' },
  { id: 'roadtrip', labelVi: '🛵 Phượt cung đường đèo', labelEn: '🛵 Mountain pass roadtrip' },
  { id: 'beach', labelVi: '🌊 Biển xanh nắng vàng', labelEn: '🌊 Sunny beach getaway' },
  { id: 'foodie', labelVi: '🍜 Foodtour khám phá ẩm thực', labelEn: '🍜 Local foodie tour' },
];

const PRESET_TRAVEL_PHOTOS: Array<{
  labelVi: string;
  labelEn: string;
  locationVi: string;
  url: string;
}> = [
  {
    labelVi: 'Vịnh Hạ Long',
    labelEn: 'Ha Long Bay',
    locationVi: 'Vịnh Hạ Long, Quảng Ninh',
    url: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80',
  },
  {
    labelVi: 'Đà Lạt săn mây',
    labelEn: 'Da Lat Cloud Hunting',
    locationVi: 'Đà Lạt, Lâm Đồng',
    url: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1200&q=80',
  },
  {
    labelVi: 'Phố cổ Hội An',
    labelEn: 'Hoi An Ancient Town',
    locationVi: 'Phố cổ Hội An, Quảng Nam',
    url: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    labelVi: 'Biển Phú Quốc',
    labelEn: 'Phu Quoc Island',
    locationVi: 'Phú Quốc, Kiên Giang',
    url: 'https://images.unsplash.com/photo-1540202404-a2f29016b523?auto=format&fit=crop&w=1200&q=80',
  },
];

/**
 * Hàm tiện ích mở cửa sổ Modal "New thread / Đăng bài mới" ngay trên trang hiện tại
 */
export const openNewPostModal = (editPostId?: string) => {
  window.dispatchEvent(
    new CustomEvent('travel:open-post-modal', {
      detail: { postId: editPostId ?? null },
    })
  );
};

interface PostModalProps {
  editPostId?: string | null;
  onClose?: () => void;
}

/**
 * Component #13: PostFormPage / Threads New Thread Modal
 * Thiết kế chuẩn cửa sổ nổi "New thread" của Threads với nền mờ (backdrop-blur) phía dưới:
 * - Header: Cancel | New thread | Draft icon & More (...) icon
 * - Body: Avatar + đường kẻ dọc nối chuỗi (Add to thread) + username > Community or topic + What's new?
 * - Thanh 8 icon chức năng dưới ô nhập: Ảnh, Kho ảnh mẫu/GIF, Emoji, Hashtag, Mẫu lịch trình, Chi phí & Ngày đi, Định vị GPS, Cảm xúc âm nhạc
 * - Footer: Post Options (chọn quyền riêng tư Công khai / Người theo dõi) + nút Post
 */
export const PostFormPage: React.FC<PostModalProps> = ({
  editPostId: propEditId,
  onClose,
}) => {
  const { id: routeParamId } = useParams<{ id: string }>();
  const id = propEditId !== undefined ? propEditId || undefined : routeParamId;
  const isEditMode = Boolean(id);

  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const dispatch = useAppDispatch();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subThreads, setSubThreads] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [provinceOrCountry, setProvinceOrCountry] = useState('Việt Nam');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [tripDate, setTripDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [durationDays, setDurationDays] = useState('3');
  const [cost, setCost] = useState('2500000');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [selectedVibe, setSelectedVibe] = useState<string>('');

  // Các khay công cụ bật/tắt bên trong Modal
  const [activeToolPanel, setActiveToolPanel] = useState<
    null | 'presets' | 'emoji' | 'hashtags' | 'tripMeta' | 'location' | 'vibe'
  >(null);
  const [showPostOptions, setShowPostOptions] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalPreviewFile[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const debouncedLocation = useDebounce(location, 420);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urlsSet = objectUrlsRef.current;
    return () => {
      urlsSet.forEach((url) => URL.revokeObjectURL(url));
      urlsSet.clear();
    };
  }, []);

  // Đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, routerLocation.pathname]);

  // Nạp dữ liệu khi ở chế độ Chỉnh sửa bài viết
  useEffect(() => {
    if (!id) return;
    apiRequest<{ post: TravelPost }>(`/api/posts/${id}`)
      .then(({ post }) => {
        setTitle(post.title);
        setContent(post.content);
        setLocation(post.location);
        setProvinceOrCountry(post.provinceOrCountry);
        setCoordinates(post.coordinates);
        setTripDate(post.tripDate);
        setDurationDays(String(post.durationDays));
        setCost(String(post.cost));
        setHashtagsInput(post.hashtags.map((tItem) => `#${tItem}`).join(' '));
        setVisibility(post.visibility);
        setExistingImages(post.images);
      })
      .catch((err) => {
        setSubmitError(
          err instanceof Error
            ? err.message
            : t(
                'Không thể tải bài viết để chỉnh sửa.',
                'Could not load post for editing.'
              )
        );
      });
  }, [id, t]);

  // Tự động định vị tọa độ bản đồ khi người dùng nhập Địa điểm / Topic
  useEffect(() => {
    const clean = debouncedLocation.trim();
    if (clean.length < 2) {
      setCoordinates(null);
      return;
    }

    let active = true;
    setGeocoding(true);
    apiRequest<{
      coordinates: { lat: number; lng: number };
      province: string;
    }>(`/api/posts/geocode?q=${encodeURIComponent(clean)}`)
      .then((res) => {
        if (!active) return;
        setCoordinates(res.coordinates);
        if (
          res.province &&
          (!provinceOrCountry.trim() ||
            provinceOrCountry.trim().toLowerCase() === 'việt nam')
        ) {
          setProvinceOrCountry(res.province);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setGeocoding(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedLocation, provinceOrCountry]);

  const handleCloseModal = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (
      routerLocation.pathname === '/posts/new' ||
      routerLocation.pathname.endsWith('/edit')
    ) {
      navigate('/');
    } else {
      navigate(-1);
    }
  };

  const handleSaveOrLoadDraft = () => {
    try {
      const hasInput =
        content.trim() ||
        title.trim() ||
        location.trim() ||
        existingImages.length > 0;
      if (hasInput) {
        const draftPayload = {
          title,
          content,
          subThreads,
          location,
          provinceOrCountry,
          tripDate,
          durationDays,
          cost,
          hashtagsInput,
          visibility,
          existingImages,
        };
        window.localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify(draftPayload)
        );
        setDraftNotice(t('Đã lưu vào bản nháp!', 'Draft saved!'));
      } else {
        const savedRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          setTitle(parsed.title || '');
          setContent(parsed.content || '');
          setSubThreads(Array.isArray(parsed.subThreads) ? parsed.subThreads : []);
          setLocation(parsed.location || '');
          setProvinceOrCountry(parsed.provinceOrCountry || 'Việt Nam');
          setTripDate(parsed.tripDate || new Date().toISOString().slice(0, 10));
          setDurationDays(parsed.durationDays || '3');
          setCost(parsed.cost || '2500000');
          setHashtagsInput(parsed.hashtagsInput || '');
          setVisibility(parsed.visibility || 'public');
          setExistingImages(
            Array.isArray(parsed.existingImages) ? parsed.existingImages : []
          );
          setDraftNotice(t('Đã khôi phục bản nháp!', 'Draft restored!'));
        } else {
          setDraftNotice(t('Chưa có bản nháp nào được lưu.', 'No saved draft found.'));
        }
      }
    } catch {
      // Ignore storage error
    }
    window.setTimeout(() => setDraftNotice(null), 2200);
  };

  const handleInsertItineraryTemplate = () => {
    const template = t(
      `📍 Lịch trình khám phá:\n• Ngày 1: Di chuyển, nhận phòng & dạo phố ẩm thực\n• Ngày 2: Check-in các tọa độ nổi bật & ngắm hoàng hôn\n• Ngày 3: Thưởng thức cà phê sáng & mua quà lưu niệm\n💡 Lưu ý & kinh nghiệm: `,
      `📍 Trip Itinerary:\n• Day 1: Arrival, check-in & street food walk\n• Day 2: Explore top spots & sunset view\n• Day 3: Morning coffee & local souvenirs\n💡 Practical tips: `
    );
    setContent((prev) => (prev.trim() ? `${prev}\n\n${template}` : template));
    setActiveToolPanel(null);
    contentTextareaRef.current?.focus();
  };

  const handleToggleHashtag = (tag: string) => {
    const cleanTag = `#${tag.replace(/^#/, '')}`;
    if (hashtagsInput.toLowerCase().includes(cleanTag.toLowerCase())) {
      setHashtagsInput((prev) =>
        prev
          .split(/\s+/)
          .filter((item) => item.toLowerCase() !== cleanTag.toLowerCase())
          .join(' ')
      );
    } else {
      setHashtagsInput((prev) => `${prev.trim()} ${cleanTag}`.trim());
    }
  };

  const handleAddSubThread = () => {
    if (subThreads.length >= 4) return;
    setSubThreads((prev) => [...prev, '']);
  };

  const handleUpdateSubThread = (idx: number, val: string) => {
    setSubThreads((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const handleRemoveSubThread = (idx: number) => {
    setSubThreads((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalImagesCount = existingImages.length + localFiles.length;

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const selectedArray = Array.from(filesList);
    if (totalImagesCount + selectedArray.length > 6) {
      setFieldErrors((prev) => ({
        ...prev,
        images: t(
          'Tổng số ảnh của một bài viết không được vượt quá 6 ảnh.',
          'Maximum 6 images allowed per post.'
        ),
      }));
      return;
    }

    const newLocalPreviews: LocalPreviewFile[] = [];
    for (const file of selectedArray) {
      const check = validateImageFileMeta(file.type, file.size);
      if (!check.valid) {
        setFieldErrors((prev) => ({
          ...prev,
          images: check.error || t('File ảnh không hợp lệ.', 'Invalid image file.'),
        }));
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      newLocalPreviews.push({
        id: `${file.name}_${Date.now()}_${Math.random()}`,
        file,
        previewUrl,
      });
    }

    setLocalFiles((prev) => [...prev, ...newLocalPreviews]);
    setFieldErrors((prev) => ({ ...prev, images: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLocalFile = (item: LocalPreviewFile) => {
    URL.revokeObjectURL(item.previewUrl);
    objectUrlsRef.current.delete(item.previewUrl);
    setLocalFiles((prev) => prev.filter((f) => f.id !== item.id));
  };

  const handleRemoveExistingImage = (imgUrl: string) => {
    setExistingImages((prev) => prev.filter((u) => u !== imgUrl));
  };

  const handleAddPresetPhoto = (preset: {
    url: string;
    locationVi: string;
  }) => {
    if (totalImagesCount >= 6) return;
    if (!existingImages.includes(preset.url)) {
      setExistingImages((prev) => [...prev, preset.url]);
      setFieldErrors((prev) => ({ ...prev, images: '' }));
    }
    if (!location.trim()) {
      setLocation(preset.locationVi);
    }
    setActiveToolPanel(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Kết hợp nội dung chính + các đoạn sub-thread + vibe nếu có
    const nonEmptyThreads = subThreads.map((s) => s.trim()).filter(Boolean);
    const combinedBodyParts = [content.trim(), ...nonEmptyThreads].filter(Boolean);
    if (selectedVibe) {
      combinedBodyParts.push(selectedVibe);
    }
    const rawMergedContent = combinedBodyParts.join('\n\n');

    // Tự động suy luận Tiêu đề nếu người dùng gõ theo phong cách nhanh của Threads
    const firstLine = rawMergedContent.split('\n')[0]?.trim() || '';
    const effectiveLocation = location.trim() || 'Việt Nam';
    let effectiveTitle = title.trim();
    if (!effectiveTitle) {
      if (firstLine.length >= 5) {
        effectiveTitle = firstLine.slice(0, 90);
      } else {
        effectiveTitle = `Hành trình khám phá ${effectiveLocation}`;
      }
    } else if (effectiveTitle.length < 5) {
      effectiveTitle = `${effectiveTitle} - ${effectiveLocation}`;
    }

    // Đảm bảo nội dung đủ độ dài tối thiểu 20 ký tự theo quy tắc validatePostInput
    let effectiveContent = rawMergedContent;
    if (effectiveContent.length > 0 && effectiveContent.length < 20) {
      effectiveContent = `${effectiveContent} — Chuyến đi đáng nhớ tại ${effectiveLocation}.`;
    }

    const combinedPlaceholderImages = [
      ...existingImages,
      ...localFiles.map((f) => f.previewUrl),
    ];

    const validation = validatePostInput({
      title: effectiveTitle,
      content: effectiveContent,
      location: effectiveLocation,
      tripDate,
      cost: Number(cost),
      images: combinedPlaceholderImages,
      visibility,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      if (validation.errors.images) {
        setActiveToolPanel('presets');
      }
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      let uploadedUrls: string[] = [];
      if (localFiles.length > 0) {
        const formData = new FormData();
        localFiles.forEach((item) => {
          formData.append('images', item.file);
        });
        const uploadRes = await apiRequest<{ urls: string[] }>('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        uploadedUrls = uploadRes.urls;
      }

      const finalImages = [...existingImages, ...uploadedUrls].slice(0, 6);
      const payload = {
        title: effectiveTitle,
        content: effectiveContent,
        location: effectiveLocation,
        provinceOrCountry: provinceOrCountry.trim() || 'Việt Nam',
        coordinates: coordinates ?? undefined,
        tripDate,
        durationDays: Math.max(1, Number(durationDays) || 3),
        cost: Number(cost),
        hashtags: hashtagsInput,
        visibility,
        images: finalImages,
      };

      const res = await apiRequest<{ post: TravelPost }>(
        isEditMode ? `/api/posts/${id}` : '/api/posts',
        {
          method: isEditMode ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      dispatch(prependOrUpdatePostInFeed(res.post));
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }

      if (onClose) {
        onClose();
      } else {
        navigate(`/posts/${res.post._id}`);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : t('Không thể lưu bài viết.', 'Could not save post.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canPostReady =
    (content.trim().length > 0 || title.trim().length > 0) &&
    totalImagesCount > 0 &&
    !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        isEditMode
          ? t('Chỉnh sửa bài viết', 'Edit thread')
          : t('Bài viết mới', 'New thread')
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCloseModal();
        }
      }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
    >
      {/* Threads Modal Window */}
      <div className="w-full max-w-[620px] rounded-3xl bg-white dark:bg-[#181818] border border-zinc-200/90 dark:border-[#2f2f2f] shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100 my-auto">
        {/* Modal Top Header Bar: Cancel | New thread | Draft + More */}
        <div className="px-5 py-3.5 border-b border-zinc-200/80 dark:border-[#2a2a2a] flex items-center justify-between relative">
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-[15px] font-medium text-zinc-800 dark:text-zinc-100 hover:opacity-75 transition-opacity cursor-pointer"
          >
            {t('Hủy', 'Cancel')}
          </button>

          <h2 className="text-[15px] font-bold text-zinc-950 dark:text-white tracking-tight">
            {isEditMode
              ? t('Chỉnh sửa bài viết', 'Edit thread')
              : t('Bài viết mới', 'New thread')}
          </h2>

          <div className="flex items-center gap-2 relative">
            {/* Nút Lưu / Mở Bản nháp giống hệt icon tờ giấy gấp góc trên ảnh Threads */}
            <button
              type="button"
              onClick={handleSaveOrLoadDraft}
              title={t('Lưu hoặc khôi phục bản nháp', 'Save or restore draft')}
              aria-label={t('Bản nháp', 'Drafts')}
              className="p-1.5 rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
            >
              <FileText className="w-5 h-5" />
            </button>

            {/* Nút More (...) trong vòng tròn góc phải trên */}
            <button
              type="button"
              onClick={() => setShowHeaderMenu((prev) => !prev)}
              title={t('Tùy chọn soạn thảo', 'Composer options')}
              aria-label={t('Tùy chọn soạn thảo', 'Composer options')}
              className="w-7 h-7 rounded-full border border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#252525] transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showHeaderMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#202020] border border-zinc-200 dark:border-[#333333] shadow-2xl p-1.5 z-30 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    handleInsertItineraryTemplate();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                >
                  {t('Chèn mẫu lịch trình gợi ý', 'Insert itinerary template')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSaveOrLoadDraft();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                >
                  {t('Lưu / Khôi phục bản nháp', 'Save / Restore draft')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitle('');
                    setContent('');
                    setSubThreads([]);
                    setLocation('');
                    setHashtagsInput('');
                    setSelectedVibe('');
                    setExistingImages([]);
                    setLocalFiles([]);
                    setFieldErrors({});
                    setShowHeaderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  {t('Xóa trắng nội dung đang nhập', 'Clear composer')}
                </button>
              </div>
            )}
          </div>
        </div>

        {draftNotice && (
          <div className="px-5 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-between">
            <span>{draftNotice}</span>
            <Check className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-4">
            {/* Khối Thread Chính: Avatar + Đường kẻ dọc + Nội dung */}
            <div className="flex gap-3.5">
              {/* Cột trái: Avatar + Thanh dọc nối tới Add to thread */}
              <div className="flex flex-col items-center shrink-0">
                <img
                  src={user?.avatar || '/api/media/avatar/VN'}
                  alt={user?.fullName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                />
                <div className="w-[2px] flex-1 bg-zinc-200 dark:bg-[#2e2e2e] my-2 rounded-full min-h-[44px]" />
              </div>

              {/* Cột phải: Username > Community or topic + What's new + 8 Icons */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Dòng 1: username > Community or topic (Địa điểm / Chủ đề) */}
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-bold text-zinc-950 dark:text-white">
                    {user?.username || 'traveler'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input
                    ref={locationInputRef}
                    id="post-location-input"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t(
                      'Thêm địa điểm hoặc chủ đề (VD: Đà Lạt, Vịnh Hạ Long...)',
                      'Community or topic (e.g. Da Lat, Ha Long Bay...)'
                    )}
                    className="flex-1 min-w-[180px] text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 bg-transparent focus:outline-none"
                  />
                </div>

                {/* Hiển thị tọa độ GPS tự động khi đã nhập địa điểm */}
                {location.trim().length >= 2 && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300 font-mono-num">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {geocoding
                        ? t('Đang định vị tọa độ...', 'Locating coordinates...')
                        : coordinates
                        ? `${location.trim()} (${coordinates.lat.toFixed(3)}°N, ${coordinates.lng.toFixed(3)}°E)`
                        : location.trim()}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {provinceOrCountry}
                    </span>
                  </div>
                )}

                {/* Dòng Tiêu đề ngắn gọn (tùy chọn, tự động lấy từ dòng đầu nếu để trống) */}
                <input
                  id="post-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t(
                    'Tiêu đề chuyến đi (hoặc viết thẳng nội dung bên dưới)...',
                    'Trip title (optional — auto-filled from your story)...'
                  )}
                  className="w-full text-sm font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 bg-transparent focus:outline-none"
                />

                {/* Ô nhập chính: What's new? */}
                <div>
                  <label htmlFor="post-content-textarea" className="sr-only">
                    {t('Nội dung bài viết', "What's new?")}
                  </label>
                  <textarea
                    ref={contentTextareaRef}
                    id="post-content-textarea"
                    rows={3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t(
                      'Có gì mới? Chia sẻ trải nghiệm, lịch trình & khoảnh khắc chuyến đi...',
                      "What's new?"
                    )}
                    className="w-full text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 bg-transparent focus:outline-none resize-none"
                  />
                </div>

                {/* Thanh chỉnh sửa trực tiếp Thời gian đi (Số ngày) & Giá tiền (VNĐ) + Hashtag / Vibe */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <div
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'tripMeta' ? prev : 'tripMeta'
                      )
                    }
                    title={t(
                      'Nhấn để nhập trực tiếp số ngày đi, ngày khởi hành và chi phí chuyến đi',
                      'Click to edit duration, departure date, and trip cost directly'
                    )}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-[#242424] border border-zinc-200/90 dark:border-zinc-700/80 hover:border-zinc-500 focus-within:border-zinc-500 text-zinc-700 dark:text-zinc-200 font-mono-num transition-all cursor-text"
                  >
                    <label htmlFor="inline-duration-input" className="sr-only">
                      {t('Số ngày đi', 'Duration in days')}
                    </label>
                    <input
                      id="inline-duration-input"
                      type="number"
                      min={1}
                      max={365}
                      value={durationDays}
                      onFocus={() => setActiveToolPanel('tripMeta')}
                      onChange={(e) => setDurationDays(e.target.value)}
                      style={{
                        width: `${Math.max(2, String(durationDays || '1').length + 1)}ch`,
                      }}
                      className="bg-transparent text-center font-bold text-zinc-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span>{t('ngày', 'days')}</span>

                    <span className="text-zinc-400 dark:text-zinc-500 select-none">
                      ·
                    </span>

                    <label htmlFor="inline-cost-input" className="sr-only">
                      {t('Chi phí chuyến đi (VNĐ)', 'Trip cost (VND)')}
                    </label>
                    <input
                      id="inline-cost-input"
                      type="text"
                      inputMode="numeric"
                      value={
                        cost === ''
                          ? ''
                          : new Intl.NumberFormat('vi-VN').format(
                              Number(cost) || 0
                            )
                      }
                      onFocus={() => setActiveToolPanel('tripMeta')}
                      onChange={(e) => {
                        const rawDigits = e.target.value.replace(/[^0-9]/g, '');
                        setCost(rawDigits);
                      }}
                      placeholder="0"
                      style={{
                        width: `${Math.max(
                          5,
                          new Intl.NumberFormat('vi-VN').format(Number(cost) || 0)
                            .length + 1
                        )}ch`,
                      }}
                      className="bg-transparent text-right font-bold text-zinc-900 dark:text-white focus:outline-none"
                    />
                    <span className="text-zinc-900 dark:text-white font-bold">
                      ₫
                    </span>
                  </div>

                  {selectedVibe && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                      {selectedVibe}
                      <button
                        type="button"
                        onClick={() => setSelectedVibe('')}
                        className="hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {hashtagsInput.trim() && (
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {hashtagsInput}
                    </span>
                  )}
                </div>

                {/* Lưới xem trước Ảnh đã đính kèm */}
                {(existingImages.length > 0 || localFiles.length > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {existingImages.map((imgUrl, idx) => (
                      <div
                        key={imgUrl + idx}
                        className="relative group aspect-16/10 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
                      >
                        <img
                          src={imgUrl}
                          alt={`${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingImage(imgUrl)}
                          aria-label={t(`Gỡ ảnh ${idx + 1}`, `Remove photo ${idx + 1}`)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {localFiles.map((item, idx) => (
                      <div
                        key={item.id}
                        className="relative group aspect-16/10 rounded-2xl overflow-hidden border-2 border-zinc-500 bg-zinc-100 dark:bg-zinc-900"
                      >
                        <img
                          src={item.previewUrl}
                          alt={`${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveLocalFile(item)}
                          aria-label={t(
                            `Gỡ ảnh mới tải lên ${idx + 1}`,
                            `Remove uploaded photo ${idx + 1}`
                          )}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Thanh 8 Icon Chức năng chuẩn giao diện Threads (Ảnh mẫu) */}
                <div className="flex items-center gap-1 sm:gap-2 pt-1 text-zinc-500 dark:text-zinc-400">
                  {/* 1. Tải ảnh từ thiết bị */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('Tải ảnh chuyến đi (tối đa 6 ảnh)', 'Upload photos (max 6)')}
                    aria-label={t('Tải ảnh chuyến đi', 'Upload photos')}
                    className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-[18px] h-[18px]" />
                  </button>
                  <input
                    ref={fileInputRef}
                    id="post-images-file-input"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleSelectFiles}
                    className="hidden"
                  />

                  {/* 2. GIF / Kho ảnh mẫu du lịch nhanh */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'presets' ? null : 'presets'
                      )
                    }
                    title={t('Chọn ảnh mẫu địa danh / GIF', 'Preset travel photos / GIF')}
                    aria-label={t('Chọn ảnh mẫu địa danh', 'Preset travel photos')}
                    className={`px-1.5 py-1 rounded-lg text-[10px] font-extrabold border transition-colors cursor-pointer ${
                      activeToolPanel === 'presets'
                        ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white bg-zinc-200/70 dark:bg-zinc-800'
                        : 'border-current hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    GIF
                  </button>

                  {/* 3. Biểu tượng cảm xúc (Emoji) */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'emoji' ? null : 'emoji'
                      )
                    }
                    title={t('Chèn biểu tượng cảm xúc', 'Insert emoji')}
                    aria-label={t('Chèn biểu tượng cảm xúc', 'Insert emoji')}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      activeToolPanel === 'emoji'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Smile className="w-[18px] h-[18px]" />
                  </button>

                  {/* 4. Thẻ #Hashtag chủ đề */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'hashtags' ? null : 'hashtags'
                      )
                    }
                    title={t('Gắn thẻ #hashtag du lịch', 'Add travel #hashtags')}
                    aria-label={t('Gắn thẻ #hashtag', 'Add #hashtags')}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      activeToolPanel === 'hashtags'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Hash className="w-[18px] h-[18px]" />
                  </button>

                  {/* 5. Chèn mẫu lịch trình (Checklist / Poll icon) */}
                  <button
                    type="button"
                    onClick={handleInsertItineraryTemplate}
                    title={t('Chèn khung lịch trình mẫu', 'Insert itinerary outline')}
                    aria-label={t('Chèn khung lịch trình mẫu', 'Insert itinerary outline')}
                    className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <AlignLeft className="w-[18px] h-[18px]" />
                  </button>

                  {/* 6. Chi phí, Ngày đi & Số ngày (Document icon) */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'tripMeta' ? null : 'tripMeta'
                      )
                    }
                    title={t(
                      'Cài đặt Chi phí, Ngày đi & Số ngày',
                      'Set Trip Cost, Date & Duration'
                    )}
                    aria-label={t(
                      'Cài đặt Chi phí, Ngày đi & Số ngày',
                      'Set Trip Cost, Date & Duration'
                    )}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      activeToolPanel === 'tripMeta'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="w-[18px] h-[18px]" />
                  </button>

                  {/* 7. Định vị Địa điểm & Tỉnh/Thành phố (MapPin icon) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveToolPanel((prev) =>
                        prev === 'location' ? null : 'location'
                      );
                      window.setTimeout(() => locationInputRef.current?.focus(), 60);
                    }}
                    title={t('Định vị địa điểm & bản đồ', 'Location & Map coordinates')}
                    aria-label={t('Định vị địa điểm & bản đồ', 'Location & Map coordinates')}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      activeToolPanel === 'location'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <MapPin className="w-[18px] h-[18px]" />
                  </button>

                  {/* 8. Cảm xúc âm nhạc / Vibe chuyến đi (Music icon) */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToolPanel((prev) =>
                        prev === 'vibe' ? null : 'vibe'
                      )
                    }
                    title={t('Gắn cảm xúc / âm nhạc chuyến đi', 'Add travel mood / music vibe')}
                    aria-label={t('Gắn cảm xúc chuyến đi', 'Add travel vibe')}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      activeToolPanel === 'vibe'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#242424] hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Music className="w-[18px] h-[18px]" />
                  </button>
                </div>

                {/* Các Khay Công Cụ Mở Rộng Tương Ứng Khi Ấn Icon */}
                {activeToolPanel === 'presets' && (
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-200">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                        {t(
                          'Chọn nhanh ảnh địa danh Việt Nam hoặc tải ảnh từ máy',
                          'Quick-select Vietnam destination photos or upload from device'
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-zinc-900 dark:text-white hover:underline cursor-pointer"
                      >
                        {t('+ Tải ảnh từ máy', '+ Upload file')}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {PRESET_TRAVEL_PHOTOS.map((preset) => (
                        <button
                          key={preset.url}
                          type="button"
                          onClick={() => handleAddPresetPhoto(preset)}
                          className="group relative aspect-16/10 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          <img
                            src={preset.url}
                            alt={preset.labelVi}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-black/65 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate">
                            {t(preset.labelVi, preset.labelEn)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeToolPanel === 'emoji' && (
                  <div className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] flex flex-wrap gap-1.5">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() =>
                          setContent((prev) => `${prev}${emoji}`)
                        }
                        className="w-8 h-8 rounded-xl hover:bg-zinc-200/70 dark:hover:bg-[#2c2c2c] flex items-center justify-center text-base cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {activeToolPanel === 'hashtags' && (
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] space-y-2">
                    <input
                      id="post-hashtags-input"
                      type="text"
                      value={hashtagsInput}
                      onChange={(e) => setHashtagsInput(e.target.value)}
                      placeholder={t(
                        'Nhập #hashtag (VD: #dalat #phuquoc #travel)...',
                        'Type #hashtags (e.g. #dalat #phuquoc #travel)...'
                      )}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616]"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_HASHTAGS.map((tag) => {
                        const active = hashtagsInput
                          .toLowerCase()
                          .includes(`#${tag}`);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleHashtag(tag)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              active
                                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                                : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeToolPanel === 'tripMeta' && (
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {t(
                          'Chỉnh sửa thời gian đi & tổng chi phí chuyến đi',
                          'Edit travel dates, duration & total trip cost'
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveToolPanel(null)}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label
                          htmlFor="post-date-input"
                          className="block text-[11px] font-semibold text-zinc-500 mb-1"
                        >
                          {t('Ngày khởi hành', 'Departure date')}
                        </label>
                        <input
                          id="post-date-input"
                          type="date"
                          value={tripDate}
                          onChange={(e) => setTripDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616] text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="post-duration-input"
                          className="block text-[11px] font-semibold text-zinc-500 mb-1"
                        >
                          {t('Số ngày đi', 'Duration (days)')}
                        </label>
                        <input
                          id="post-duration-input"
                          type="number"
                          min={1}
                          max={365}
                          value={durationDays}
                          onChange={(e) => setDurationDays(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616] text-zinc-900 dark:text-zinc-100 font-mono-num"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="post-cost-input"
                          className="block text-[11px] font-semibold text-zinc-500 mb-1"
                        >
                          {t('Chi phí (VNĐ)', 'Trip cost (VND)')}
                        </label>
                        <input
                          id="post-cost-input"
                          type="text"
                          inputMode="numeric"
                          value={
                            cost === ''
                              ? ''
                              : new Intl.NumberFormat('vi-VN').format(
                                  Number(cost) || 0
                                )
                          }
                          onChange={(e) => {
                            const rawDigits = e.target.value.replace(
                              /[^0-9]/g,
                              ''
                            );
                            setCost(rawDigits);
                          }}
                          placeholder="2.500.000"
                          className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616] text-zinc-900 dark:text-zinc-100 font-mono-num"
                        />
                      </div>
                    </div>

                    {/* Chọn nhanh số ngày & mức chi phí phổ biến */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                      <div className="flex flex-wrap items-center gap-1">
                        {[1, 2, 3, 4, 5, 7].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDurationDays(String(d))}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              Number(durationDays) === d
                                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                                : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {d} {t('ngày', 'd')}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {[
                          { label: '500k', val: '500000' },
                          { label: '1.5tr', val: '1500000' },
                          { label: '2.5tr', val: '2500000' },
                          { label: '5tr', val: '5000000' },
                          { label: '10tr', val: '10000000' },
                        ].map((preset) => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => setCost(preset.val)}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold font-mono-num cursor-pointer ${
                              cost === preset.val
                                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                                : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeToolPanel === 'location' && (
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                        {t('Địa điểm chính *', 'Main destination *')}
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t('VD: Đà Lạt / Hạ Long...', 'e.g. Da Lat / Ha Long...')}
                        className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="post-province-input"
                        className="block text-[11px] font-semibold text-zinc-500 mb-1"
                      >
                        {t('Tỉnh thành / Quốc gia', 'Province / Country')}
                      </label>
                      <input
                        id="post-province-input"
                        type="text"
                        value={provinceOrCountry}
                        onChange={(e) => setProvinceOrCountry(e.target.value)}
                        placeholder={t('VD: Lâm Đồng, Việt Nam', 'e.g. Lam Dong, Vietnam')}
                        className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161616]"
                      />
                    </div>
                  </div>
                )}

                {activeToolPanel === 'vibe' && (
                  <div className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-[#303030] flex flex-wrap gap-1.5">
                    {TRAVEL_VIBES.map((vibe) => {
                      const label = t(vibe.labelVi, vibe.labelEn);
                      return (
                        <button
                          key={vibe.id}
                          type="button"
                          onClick={() => {
                            setSelectedVibe(label);
                            setActiveToolPanel(null);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                            selectedVibe === label
                              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                              : 'bg-white dark:bg-[#161616] text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Các đoạn nối tiếp trong chuỗi (Sub-threads khi ấn Add to thread) */}
            {subThreads.map((subText, idx) => (
              <div key={idx} className="flex gap-3.5">
                <div className="flex flex-col items-center shrink-0">
                  <img
                    src={user?.avatar || '/api/media/avatar/VN'}
                    alt={user?.fullName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                  />
                  <div className="w-[2px] flex-1 bg-zinc-200 dark:bg-[#2e2e2e] my-1.5 rounded-full" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {user?.username} · {t(`Phần ${idx + 2}`, `Part ${idx + 2}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubThread(idx)}
                      className="text-zinc-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={subText}
                    onChange={(e) => handleUpdateSubThread(idx, e.target.value)}
                    placeholder={t(
                      'Viết tiếp lịch trình hoặc cảm nhận tiếp theo...',
                      'Add another part to your travel thread...'
                    )}
                    className="w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 bg-transparent focus:outline-none resize-none"
                  />
                </div>
              </div>
            ))}

            {/* Hàng "Add to thread" chuẩn thiết kế Threads */}
            <div className="flex items-center gap-3.5 pl-2">
              <img
                src={user?.avatar || '/api/media/avatar/VN'}
                alt={user?.fullName || 'User'}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover opacity-50"
              />
              <button
                type="button"
                onClick={handleAddSubThread}
                className="text-sm font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {t('Thêm vào chuỗi bài viết', 'Add to thread')}
              </button>
            </div>

            {/* Hiển thị thông báo lỗi kiểm tra hợp lệ nếu có */}
            {(Object.values(fieldErrors).some(Boolean) || submitError) && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-500 space-y-1"
              >
                {submitError && <p className="font-semibold">{submitError}</p>}
                {Object.entries(fieldErrors).map(([key, msg]) =>
                  msg ? <p key={key}>• {msg}</p> : null
                )}
              </div>
            )}
          </div>

          {/* Modal Footer Bar: Post Options (trái) | Post (phải) */}
          <div className="px-5 py-3.5 border-t border-zinc-200/80 dark:border-[#2a2a2a] flex items-center justify-between relative">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPostOptions((prev) => !prev)}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>
                  {visibility === 'public'
                    ? t('Tùy chọn bài viết · Công khai', 'Post Options · Anyone')
                    : t(
                        'Tùy chọn bài viết · Người theo dõi',
                        'Post Options · Followers'
                      )}
                </span>
              </button>

              {showPostOptions && (
                <div className="absolute left-0 bottom-full mb-2.5 w-64 rounded-2xl bg-white dark:bg-[#202020] border border-zinc-200 dark:border-[#333333] shadow-2xl p-2 z-30 space-y-1">
                  <div className="px-2.5 py-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    {t('Ai có thể xem bài viết này?', 'Who can see this post?')}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVisibility('public');
                      setShowPostOptions(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-[#2a2a2a] cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                      <span>{t('Bất kỳ ai (Công khai)', 'Anyone (Public)')}</span>
                    </span>
                    {visibility === 'public' && (
                      <Check className="w-4 h-4 text-zinc-900 dark:text-white" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVisibility('followers');
                      setShowPostOptions(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-[#2a2a2a] cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Users className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                      <span>
                        {t('Chỉ người theo dõi', 'Followers only')}
                      </span>
                    </span>
                    {visibility === 'followers' && (
                      <Check className="w-4 h-4 text-zinc-900 dark:text-white" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                canPostReady
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-zinc-950 dark:border-white hover:opacity-90'
                  : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-[#363636] hover:border-zinc-500 dark:hover:border-zinc-400'
              }`}
            >
              {submitting
                ? t('Đang đăng...', 'Posting...')
                : isEditMode
                ? t('Cập nhật', 'Update')
                : t('Đăng', 'Post')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
