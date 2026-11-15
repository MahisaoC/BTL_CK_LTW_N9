import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import jwt from 'jsonwebtoken';
import { db, type UserRecord } from '../db.ts';
import type { UserRole } from '../../frontend/types/travel.ts';

if (!getApps().length) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0927812338',
  });
}

export const adminAuth = getAuth();

export interface JwtPayloadData {
  sub: string;
  role: UserRole;
  username: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayloadData;
    }
  }
}

const getJwtSecret = (): string =>
  process.env.JWT_SECRET || 'wanderlust_ltw_cuoiky_jwt_secret_2026';

export const signAuthToken = (payload: {
  sub: string;
  role: UserRole;
  username: string;
}): string => {
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      username: payload.username,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
};

export const verifyFirebaseTokenToUserRecord = async (
  token: string
): Promise<UserRecord> => {
  const decodedToken = await adminAuth.verifyIdToken(token);
  const email = (
    decodedToken.email || `${decodedToken.uid}@firebase.user`
  ).toLowerCase();
  const isOwnerAdmin = email === '2k7nguyenquan@gmail.com';
  const cleanUsername =
    email
      .split('@')[0]
      ?.replace(/[^a-zA-Z0-9._]/g, '')
      .toLowerCase() || `user_${decodedToken.uid.slice(0, 6)}`;

  return {
    _id: decodedToken.uid,
    fullName:
      decodedToken.name?.trim() ||
      (isOwnerAdmin ? 'Nguyễn Quân' : cleanUsername),
    username: isOwnerAdmin
      ? 'nguyenquan'
      : `${cleanUsername}.${decodedToken.uid.slice(0, 4)}`,
    email,
    passwordHash: 'firebase_oauth_managed',
    role: isOwnerAdmin ? 'admin' : 'member',
    avatar:
      decodedToken.picture ||
      `/api/media/avatar/${encodeURIComponent(cleanUsername)}`,
    bio: isOwnerAdmin
      ? 'Quản trị viên hệ thống Lữ Hành Việt.'
      : 'Thành viên cộng đồng Lữ Hành Việt.',
    homeCity: 'Việt Nam',
    followers: [],
    following: [],
    savedPosts: [],
    isLocked: false,
    createdAt: new Date().toISOString(),
  };
};

export const resolveTokenToUser = async (token: string) => {
  // 1. Thử xác thực bằng JWT nội bộ trước
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayloadData;
    const foundUser = db.state.users.find((u) => u._id === decoded.sub);
    if (foundUser) {
      return foundUser;
    }
  } catch {
    // Nếu không phải JWT nội bộ, chuyển sang xác thực Firebase ID Token (Google Sign-In)
  }

  // 2. Xác thực bằng Firebase Admin SDK & đồng bộ với MongoDB Atlas
  const userRecord = await verifyFirebaseTokenToUserRecord(token);
  const existingIdx = db.state.users.findIndex(
    (u) =>
      u._id === userRecord._id ||
      u.email.toLowerCase() === userRecord.email.toLowerCase()
  );
  if (existingIdx >= 0) {
    db.state.users[existingIdx] = {
      ...db.state.users[existingIdx],
      fullName: db.state.users[existingIdx].fullName || userRecord.fullName,
      email: userRecord.email,
    };
    return db.state.users[existingIdx];
  } else {
    db.state.users = [...db.state.users, userRecord];
    return userRecord;
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const foundUser = await resolveTokenToUser(token);
      if (foundUser && !foundUser.isLocked) {
        req.user = {
          sub: foundUser._id,
          role: foundUser.role,
          username: foundUser.username,
        };
        const { markUserActivePresence } = await import('../routes/messageRoutes.ts');
        markUserActivePresence(foundUser._id);
      }
    } catch {
      // Bỏ qua token không hợp lệ trên các route optionalAuth
    }
  }
  next();
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Vui lòng đăng nhập để thực hiện chức năng này.',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const foundUser = await resolveTokenToUser(token);
    if (!foundUser) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Tài khoản không tồn tại hoặc phiên đăng nhập đã hết hạn.',
      });
      return;
    }
    if (foundUser.isLocked) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên.',
      });
      return;
    }
    req.user = {
      sub: foundUser._id,
      role: foundUser.role,
      username: foundUser.username,
    };
    const { markUserActivePresence } = await import('../routes/messageRoutes.ts');
    markUserActivePresence(foundUser._id);
    next();
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token xác thực không hợp lệ hoặc đã hết hạn.',
    });
  }
};

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập tài nguyên này.',
      });
      return;
    }
    next();
  });
};
