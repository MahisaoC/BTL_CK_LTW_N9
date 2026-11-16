import { useState, useCallback } from 'react';

/**
 * Custom Hook #2: useLocalStorage
 * Đồng bộ state với localStorage (dùng cho giao diện Sáng/Tối, bộ lọc, nháp bài viết).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch {
          // Ignore write errors
        }
        return valueToStore;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
