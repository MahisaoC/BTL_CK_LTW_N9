import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';
import { storeBufferAsMediaUrl } from '../db.ts';
import {
  MAX_IMAGE_SIZE_BYTES,
  validateImageFileMeta,
} from '../../frontend/utils/travelRules.ts';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 6,
  },
});

// POST /api/uploads - Upload up to 6 images with format & size validation on the server
uploadRouter.post(
  '/',
  requireAuth,
  upload.array('images', 6),
  (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        throw new HttpError(400, 'Vui lòng chọn ít nhất 1 file ảnh để tải lên.');
      }
      if (files.length > 6) {
        throw new HttpError(400, 'Chỉ được phép tải lên tối đa 6 ảnh mỗi lần.');
      }

      const urls: string[] = [];

      for (const file of files) {
        const check = validateImageFileMeta(file.mimetype, file.size);
        if (!check.valid) {
          throw new HttpError(400, check.error || 'File ảnh không hợp lệ.');
        }
        urls.push(storeBufferAsMediaUrl(file.buffer, file.mimetype));
      }

      res.status(201).json({
        urls,
        count: urls.length,
        message: `Đã tải lên thành công ${urls.length} ảnh.`,
      });
    } catch (err) {
      next(err);
    }
  }
);
