import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest } from '../utils/api';

interface ReportPostModalProps {
  postId: string;
  postTitle: string;
  onClose: () => void;
  onReported: (message: string) => void;
}

/**
 * Component #5: ReportPostModal
 * Controlled form cho thành viên gửi báo cáo bài viết vi phạm tới Admin, hỗ trợ VI/EN.
 */
export const ReportPostModal: React.FC<ReportPostModalProps> = ({
  postId,
  postTitle,
  onClose,
  onReported,
}) => {
  const { t } = useLanguage();
  const reportReasons = [
    t(
      'Thông tin địa điểm / chi phí sai lệch thực tế',
      'Inaccurate location or trip cost information'
    ),
    t('Nội dung quảng cáo / spam thương mại', 'Commercial spam or advertising'),
    t(
      'Hình ảnh vi phạm bản quyền hoặc không phù hợp',
      'Copyrighted or inappropriate photos'
    ),
    t(
      'Ngôn từ thiếu chuẩn mực cộng đồng',
      'Inappropriate language violating community guidelines'
    ),
  ];

  const [reason, setReason] = useState(reportReasons[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t('Vui lòng chọn lý do báo cáo.', 'Please select a reason.'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest<{ message: string }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ postId, reason, details }),
      });
      onReported(res.message);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Không thể gửi báo cáo.', 'Could not submit report.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3
            id="report-modal-title"
            className="text-lg font-semibold text-zinc-900 dark:text-white"
          >
            {t('Báo cáo bài viết', 'Report Post')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Đóng hộp thoại báo cáo', 'Close report dialog')}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('Bài viết:', 'Post:')}{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">{postTitle}</strong>
          </p>

          <div>
            <label
              htmlFor="report-reason"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              {t('Lý do báo cáo', 'Reason for reporting')}
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
            >
              {reportReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-details"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              {t('Chi tiết bổ sung (không bắt buộc)', 'Additional details (optional)')}
            </label>
            <textarea
              id="report-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t(
                'Mô tả cụ thể vấn đề bạn phát hiện...',
                'Describe the issue in detail...'
              )}
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
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? t('Đang gửi...', 'Submitting...')
                : t('Gửi báo cáo', 'Submit report')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
