import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, type UserRecord } from '../db.ts';
import {
  requireAuth,
  signAuthToken,
  verifyFirebaseTokenToUserRecord,
} from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';
import {
  isServerMailerConfigured,
  sendVerificationEmailLetter,
  setServerGmailAccessToken,
  verifyEmailOtpCode,
} from '../utils/emailService.ts';

export const authRouter = Router();

// GET /api/auth/mailer-status
authRouter.get('/mailer-status', (_req, res) => {
  res.status(200).json({
    ready: isServerMailerConfigured(),
  });
});

function extractRequestGmailToken(req: {
  headers: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | null {
  const headerToken = req.headers['x-gmail-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  const bodyToken = req.body?.gmailAccessToken;
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }
  return null;
}

// POST /api/auth/firebase - Đồng bộ tài khoản Google Sign-In (Firebase Auth) vào MongoDB Atlas
authRouter.post('/firebase', async (req, res, next) => {
  try {
    const bodyIdToken = String(req.body?.idToken || '').trim();
    const authHeader = req.headers.authorization;
    const token =
      bodyIdToken ||
      (authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '');

    if (!token) {
      throw new HttpError(401, 'Thiếu Firebase ID Token.');
    }

    const userRecord = await verifyFirebaseTokenToUserRecord(token);
    const gmailToken = extractRequestGmailToken(req);
    if (gmailToken) {
      setServerGmailAccessToken(gmailToken, userRecord.email);
    }
    const isOwnerAdmin = userRecord.email.toLowerCase() === '2k7nguyenquan@gmail.com';
    if (isOwnerAdmin) {
      userRecord.role = 'admin';
    }

    const existingIdx = db.state.users.findIndex(
      (u) =>
        u._id === userRecord._id ||
        u.email.toLowerCase() === userRecord.email.toLowerCase()
    );
    let finalUser: UserRecord;
    if (existingIdx >= 0) {
      db.state.users[existingIdx] = {
        ...db.state.users[existingIdx],
        fullName: db.state.users[existingIdx].fullName || userRecord.fullName,
        avatar: db.state.users[existingIdx].avatar || userRecord.avatar,
        email: userRecord.email,
        emailVerified: true,
        role: isOwnerAdmin ? 'admin' : db.state.users[existingIdx].role,
      };
      finalUser = db.state.users[existingIdx];
    } else {
      finalUser = {
        ...userRecord,
        emailVerified: true,
      };
      db.state.users = [...db.state.users, finalUser];
      await db.saveAsync();
    }

    const jwtToken = signAuthToken({
      sub: finalUser._id,
      role: finalUser.role,
      username: finalUser.username,
    });

    res.status(200).json({
      user: db.sanitizeUser(finalUser),
      token: jwtToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register/send-code
authRouter.post('/register/send-code', async (req, res, next) => {
  try {
    const { fullName, username, email, password } = req.body ?? {};

    if (!fullName || String(fullName).trim().length < 2) {
      throw new HttpError(400, 'Họ và tên cần tối thiểu 2 ký tự.');
    }
    if (!username || !/^[a-zA-Z0-9._]{3,24}$/.test(String(username).trim())) {
      throw new HttpError(
        400,
        'Tên người dùng (username) cần từ 3-24 ký tự, chỉ gồm chữ cái, số, dấu chấm hoặc gạch dưới.'
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      throw new HttpError(400, 'Địa chỉ email không hợp lệ.');
    }
    if (!password || String(password).length < 6) {
      throw new HttpError(400, 'Mật khẩu cần tối thiểu 6 ký tự.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim().toLowerCase();

    if (normalizedEmail !== '2k7nguyenquan@gmail.com') {
      const existingEmail = db.state.users.find(
        (u) => u.email.toLowerCase() === normalizedEmail
      );
      if (existingEmail) {
        throw new HttpError(400, 'Địa chỉ email này đã được đăng ký tài khoản.');
      }
      const existingUsername = db.state.users.find(
        (u) => u.username.toLowerCase() === normalizedUsername
      );
      if (existingUsername) {
        throw new HttpError(400, 'Tên người dùng (username) này đã được sử dụng.');
      }
    }

    const gmailAccessToken = extractRequestGmailToken(req);
    const letter = await sendVerificationEmailLetter({
      to: normalizedEmail,
      recipientName: String(fullName).trim(),
      purpose: 'register_verify',
      gmailAccessToken,
    });

    const isDirectFallback = Boolean(letter.smtpStatus?.startsWith('Mã xác nhận 6 số'));
    res.status(200).json({
      sent: true,
      email: normalizedEmail,
      expiresInSeconds: 600,
      deliveryStatus: letter.smtpStatus,
      message: isDirectFallback
        ? letter.smtpStatus
        : `Đã gửi thư chứa mã xác nhận 6 chữ số từ luhanhvietltw@gmail.com tới hộp thư ${normalizedEmail}. Vui lòng mở Gmail để lấy mã.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register
authRouter.post('/register', async (req, res, next) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      homeCity,
      bio,
      verificationCode,
    } = req.body ?? {};

    if (!fullName || String(fullName).trim().length < 2) {
      throw new HttpError(400, 'Họ và tên cần tối thiểu 2 ký tự.');
    }
    if (!username || !/^[a-zA-Z0-9._]{3,24}$/.test(String(username).trim())) {
      throw new HttpError(
        400,
        'Tên người dùng (username) cần từ 3-24 ký tự, chỉ gồm chữ cái, số, dấu chấm hoặc gạch dưới.'
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      throw new HttpError(400, 'Địa chỉ email không hợp lệ.');
    }
    if (!password || String(password).length < 6) {
      throw new HttpError(400, 'Mật khẩu cần tối thiểu 6 ký tự.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim().toLowerCase();

    if (!verificationCode) {
      throw new HttpError(
        400,
        'Vui lòng nhập mã xác nhận 6 chữ số được gửi trong thư email của bạn.'
      );
    }

    const otpCheck = verifyEmailOtpCode({
      email: normalizedEmail,
      purpose: 'register_verify',
      code: String(verificationCode),
      consume: true,
    });
    if (!otpCheck.valid) {
      throw new HttpError(400, otpCheck.message || 'Mã xác nhận email không hợp lệ.');
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    if (normalizedEmail === '2k7nguyenquan@gmail.com') {
      const adminIdx = db.state.users.findIndex(
        (u) => u.email.toLowerCase() === '2k7nguyenquan@gmail.com'
      );
      if (adminIdx >= 0) {
        db.state.users[adminIdx] = {
          ...db.state.users[adminIdx],
          fullName: String(fullName).trim(),
          username: normalizedUsername,
          emailVerified: true,
          passwordHash,
          role: 'admin',
          homeCity: homeCity ? String(homeCity).trim() : db.state.users[adminIdx].homeCity,
          bio: bio ? String(bio).trim() : db.state.users[adminIdx].bio,
        };
        await db.saveAsync();
        const adminUser = db.state.users[adminIdx];
        const token = signAuthToken({
          sub: adminUser._id,
          role: 'admin',
          username: adminUser.username,
        });
        res.status(201).json({
          user: db.sanitizeUser(adminUser),
          token,
        });
        return;
      }
    }

    const existing = db.state.users.find(
      (u) =>
        u.email.toLowerCase() === normalizedEmail ||
        u.username.toLowerCase() === normalizedUsername
    );
    if (existing) {
      throw new HttpError(400, 'Email hoặc username này đã được sử dụng.');
    }

    const isOwner = normalizedEmail === '2k7nguyenquan@gmail.com';

    const newUser: UserRecord = {
      _id: isOwner ? 'u_admin_quan' : `u_${Date.now()}`,
      fullName: String(fullName).trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      emailVerified: true,
      passwordHash,
      role: isOwner ? 'admin' : 'member',
      avatar: `/api/media/avatar/${encodeURIComponent(String(fullName).trim())}`,
      bio: bio
        ? String(bio).trim()
        : isOwner
        ? 'Quản trị viên hệ thống Lữ Hành Việt.'
        : 'Thành viên của cộng đồng Lữ Hành Việt.',
      homeCity: homeCity ? String(homeCity).trim() : 'Việt Nam',
      followers: [],
      following: [],
      savedPosts: [],
      isLocked: false,
      createdAt: new Date().toISOString(),
    };

    db.state.users = [...db.state.users, newUser];
    await db.saveAsync();

    const token = signAuthToken({
      sub: newUser._id,
      role: newUser.role,
      username: newUser.username,
    });

    res.status(201).json({
      user: db.sanitizeUser(newUser),
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { identifier, email, password } = req.body ?? {};
    const loginKey = String(identifier || email || '')
      .trim()
      .toLowerCase();

    if (!loginKey || !password) {
      throw new HttpError(400, 'Vui lòng nhập email/username và mật khẩu.');
    }

    const found = db.state.users.find(
      (u) =>
        u.email.toLowerCase() === loginKey || u.username.toLowerCase() === loginKey
    );

    if (!found) {
      throw new HttpError(401, 'Thông tin đăng nhập không chính xác.');
    }

    const passwordValid = await bcrypt.compare(String(password), found.passwordHash);
    if (!passwordValid) {
      throw new HttpError(401, 'Thông tin đăng nhập không chính xác.');
    }

    if (found.isLocked) {
      throw new HttpError(
        403,
        'Tài khoản này đã bị khóa do vi phạm tiêu chuẩn cộng đồng.'
      );
    }

    const token = signAuthToken({
      sub: found._id,
      role: found.role,
      username: found.username,
    });

    res.status(200).json({
      user: db.sanitizeUser(found),
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password/send-code
authRouter.post('/forgot-password/send-code', async (req, res, next) => {
  try {
    const rawKey = String(req.body?.email || req.body?.identifier || '')
      .trim()
      .toLowerCase();
    if (!rawKey) {
      throw new HttpError(400, 'Vui lòng nhập địa chỉ email hoặc tên người dùng.');
    }

    const found = db.state.users.find(
      (u) => u.email.toLowerCase() === rawKey || u.username.toLowerCase() === rawKey
    );
    if (!found) {
      throw new HttpError(
        404,
        'Không tìm thấy tài khoản nào liên kết với email hoặc username này.'
      );
    }

    const gmailAccessToken = extractRequestGmailToken(req);
    const letter = await sendVerificationEmailLetter({
      to: found.email,
      recipientName: found.fullName,
      purpose: 'forgot_password',
      gmailAccessToken,
    });

    const isDirectFallback = Boolean(letter.smtpStatus?.startsWith('Mã xác nhận 6 số'));
    res.status(200).json({
      sent: true,
      email: found.email,
      username: found.username,
      expiresInSeconds: 600,
      deliveryStatus: letter.smtpStatus,
      message: isDirectFallback
        ? letter.smtpStatus
        : `Mã khôi phục mật khẩu gồm 6 chữ số đã được gửi từ luhanhvietltw@gmail.com vào hộp thư ${found.email}. Vui lòng kiểm tra Gmail của bạn.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password/reset
authRouter.post('/forgot-password/reset', async (req, res, next) => {
  try {
    const rawKey = String(req.body?.email || req.body?.identifier || '')
      .trim()
      .toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!rawKey || !code || !newPassword) {
      throw new HttpError(
        400,
        'Vui lòng nhập đầy đủ email, mã xác nhận 6 số và mật khẩu mới.'
      );
    }
    if (newPassword.length < 6) {
      throw new HttpError(400, 'Mật khẩu mới cần tối thiểu 6 ký tự.');
    }

    const foundIdx = db.state.users.findIndex(
      (u) => u.email.toLowerCase() === rawKey || u.username.toLowerCase() === rawKey
    );
    if (foundIdx < 0) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }

    const targetUser = db.state.users[foundIdx];
    const otpCheck = verifyEmailOtpCode({
      email: targetUser.email,
      purpose: 'forgot_password',
      code,
      consume: true,
    });
    if (!otpCheck.valid) {
      throw new HttpError(400, otpCheck.message || 'Mã xác nhận không chính xác.');
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    db.state.users[foundIdx] = {
      ...targetUser,
      passwordHash: nextHash,
      emailVerified: true,
    };
    await db.saveAsync();

    const updatedUser = db.state.users[foundIdx];
    const token = signAuthToken({
      sub: updatedUser._id,
      role: updatedUser.role,
      username: updatedUser.username,
    });

    res.status(200).json({
      success: true,
      message: 'Đặt lại mật khẩu mới thành công!',
      user: db.sanitizeUser(updatedUser),
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password/send-code
authRouter.post('/change-password/send-code', requireAuth, async (req, res, next) => {
  try {
    const user = db.state.users.find((u) => u._id === req.user?.sub);
    if (!user) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }

    const gmailAccessToken = extractRequestGmailToken(req);
    const letter = await sendVerificationEmailLetter({
      to: user.email,
      recipientName: user.fullName,
      purpose: 'change_password',
      gmailAccessToken,
    });

    const isDirectFallback = Boolean(letter.smtpStatus?.startsWith('Mã xác nhận 6 số'));
    res.status(200).json({
      sent: true,
      email: user.email,
      expiresInSeconds: 600,
      deliveryStatus: letter.smtpStatus,
      message: isDirectFallback
        ? letter.smtpStatus
        : `Đã gửi mã bảo mật 6 chữ số từ luhanhvietltw@gmail.com vào hộp thư ${user.email}. Vui lòng mở Gmail để kiểm tra.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const userIdx = db.state.users.findIndex((u) => u._id === req.user?.sub);
    if (userIdx < 0) {
      throw new HttpError(404, 'Không tìm thấy tài khoản người dùng.');
    }

    const user = db.state.users[userIdx];
    const currentPassword = String(req.body?.currentPassword || '');
    const emailCode = String(req.body?.emailCode || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!newPassword || newPassword.length < 6) {
      throw new HttpError(400, 'Mật khẩu mới cần tối thiểu 6 ký tự.');
    }

    if (emailCode) {
      const otpCheck = verifyEmailOtpCode({
        email: user.email,
        purpose: 'change_password',
        code: emailCode,
        consume: true,
      });
      if (!otpCheck.valid) {
        throw new HttpError(400, otpCheck.message || 'Mã xác thực email không hợp lệ.');
      }
    } else if (currentPassword) {
      const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        throw new HttpError(400, 'Mật khẩu hiện tại không chính xác.');
      }
    } else {
      throw new HttpError(
        400,
        'Vui lòng nhập mật khẩu hiện tại hoặc mã xác nhận 6 số gửi qua email.'
      );
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    db.state.users[userIdx] = {
      ...user,
      passwordHash: nextHash,
      emailVerified: true,
    };
    await db.saveAsync();

    res.status(200).json({
      success: true,
      message: 'Đã đổi mật khẩu tài khoản thành công.',
      user: db.sanitizeUser(db.state.users[userIdx]),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = db.state.users.find((u) => u._id === req.user?.sub);
    if (!user) {
      throw new HttpError(404, 'Không tìm thấy thông tin người dùng.');
    }
    res.status(200).json({ user: db.sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});
