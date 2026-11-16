import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}

/**
 * Custom Hook #3: useInfiniteScroll
 * Sử dụng IntersectionObserver + useRef để tự động tải trang tiếp theo khi cuộn tới cuối bảng tin,
 * nhớ gỡ observer.disconnect() khi unmount (Yêu cầu kỹ thuật riêng Đề 5).
 */
export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '220px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onLoadMore);

  useEffect(() => {
    callbackRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          callbackRef.current();
        }
      },
      { rootMargin, threshold: 0.1 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, rootMargin]);

  return sentinelRef;
}
