import { useState, useEffect } from 'react';

/**
 * Custom Hook #1: useDebounce
 * Trì hoãn cập nhật giá trị tìm kiếm (search theo địa điểm / hashtag)
 * kèm cleanup clearTimeout khi unmount hoặc khi value thay đổi (Yêu cầu #4).
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
