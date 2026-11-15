import { getGmailAccessToken } from './firebase';

const TOKEN_STORAGE_KEY = 'wanderlust_jwt_token';
let inMemoryAuthToken: string | null = null;

export const getStoredToken = (): string | null => {
  if (inMemoryAuthToken) {
    return inMemoryAuthToken;
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (saved) {
        inMemoryAuthToken = saved;
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
  }
  return null;
};

export const setStoredToken = (token: string | null): void => {
  inMemoryAuthToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  }
};

export interface ApiError extends Error {
  status: number;
  code?: string;
  errors?: Record<string, string>;
}

export const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getStoredToken();
  const gmailAccessToken = getGmailAccessToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (gmailAccessToken && !headers.has('X-Gmail-Access-Token')) {
    headers.set('X-Gmail-Access-Token', gmailAccessToken);
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(
      data.message || `Yêu cầu thất bại với mã trạng thái ${response.status}`
    ) as ApiError;
    err.status = response.status;
    err.code = data.code;
    err.errors = data.errors;
    throw err;
  }

  return data as T;
};

export const PUBLIC_SHARED_APP_URL =
  'https://ais-pre-oppr4kvjd5auvujtz7a72t-788671996133.asia-southeast1.run.app';

/**
 * Luôn trả về đường dẫn công khai (ais-pre-...) thay vì đường dẫn dev nội bộ (ais-dev-... hoặc localhost)
 * để người nhận link bên ngoài có thể truy cập trực tiếp không bị chặn quyền.
 */
export const getPublicShareOrigin = (): string => {
  if (typeof window === 'undefined' || !window.location.origin) {
    return PUBLIC_SHARED_APP_URL;
  }
  const origin = window.location.origin;
  if (origin.startsWith('https://ais-dev-')) {
    return origin.replace('https://ais-dev-', 'https://ais-pre-');
  }
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return PUBLIC_SHARED_APP_URL;
  }
  return origin;
};

/**
 * Sao chép văn bản vào bộ nhớ tạm, có cơ chế fallback bằng textarea + execCommand('copy')
 * để hoạt động ổn định 100% ngay cả khi chạy trong iframe của AI Studio.
 */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback sang document.execCommand('copy') khi iframe chặn quyền Clipboard API
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

export const formatVndCurrency = (amount: number): string => {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} ₫`;
};

export const formatVietnameseDate = (isoOrDate: string): string => {
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
};

export const formatRelativeTimeVi = (isoOrDate: string): string => {
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;
  const diffSec = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày`;
  return formatVietnameseDate(isoOrDate);
};

export const uploadImagesToServer = async (files: File[]): Promise<string[]> => {
  if (files.length === 0) return [];
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }
  const res = await apiRequest<{ urls: string[] }>('/api/uploads', {
    method: 'POST',
    body: formData,
  });
  return Array.isArray(res.urls) ? res.urls : [];
};

