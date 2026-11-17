import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { EmailVerificationLetter } from '../../frontend/types/travel.ts';

interface StoredOtpEntry {
  email: string;
  purpose: EmailVerificationLetter['purpose'];
  otpCode: string;
  expiresAtMs: number;
  letter: EmailVerificationLetter;
}

const otpStore = new Map<string, StoredOtpEntry>();
const recentLetters: EmailVerificationLetter[] = [];

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const GMAIL_TOKEN_FILE = path.join(DATA_DIR, 'gmail_token.json');

interface PersistedGmailToken {
  accessToken: string;
  senderEmail?: string;
  updatedAt: string;
}

function loadPersistedGmailToken(): PersistedGmailToken | null {
  try {
    if (fs.existsSync(GMAIL_TOKEN_FILE)) {
      const raw = fs.readFileSync(GMAIL_TOKEN_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedGmailToken;
      if (parsed && typeof parsed.accessToken === 'string' && parsed.accessToken.trim()) {
        return parsed;
      }
    }
  } catch {
    // Ignore file read errors
  }
  return null;
}

function savePersistedGmailToken(token: string | null, senderEmail?: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!token) {
      if (fs.existsSync(GMAIL_TOKEN_FILE)) {
        fs.unlinkSync(GMAIL_TOKEN_FILE);
      }
      return;
    }
    const payload: PersistedGmailToken = {
      accessToken: token,
      senderEmail,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(GMAIL_TOKEN_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

const initialPersisted = loadPersistedGmailToken();
let activeServerGmailAccessToken: string | null = initialPersisted?.accessToken || null;
let activeServerSenderEmail: string | undefined = initialPersisted?.senderEmail;

export function setServerGmailAccessToken(
  token: string | null | undefined,
  senderEmail?: string
): void {
  if (token && token.trim()) {
    activeServerGmailAccessToken = token.trim();
    if (senderEmail) {
      activeServerSenderEmail = senderEmail.trim().toLowerCase();
    }
    savePersistedGmailToken(activeServerGmailAccessToken, activeServerSenderEmail);
  }
}

export function clearServerGmailAccessToken(): void {
  activeServerGmailAccessToken = null;
  savePersistedGmailToken(null);
}

export function getServerGmailAccessToken(): string | null {
  return activeServerGmailAccessToken;
}

function resolveSmtpCredentials(): {
  user: string;
  pass: string;
  host: string;
  scriptUrl: string;
} {
  const user = (
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    process.env.GMAIL_USER ||
    'luhanhvietltw@gmail.com'
  ).trim();
  const pass = (
    process.env.SMTP_PASS ||
    process.env.EMAIL_PASS ||
    process.env.GMAIL_PASS ||
    process.env.APP_PASSWORD ||
    ''
  ).replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const scriptUrl = (
    process.env.GOOGLE_SCRIPT_URL ||
    process.env.APPS_SCRIPT_URL ||
    process.env.GMAIL_SCRIPT_URL ||
    ''
  ).trim();
  return { user, pass, host, scriptUrl };
}

export function isServerMailerConfigured(): boolean {
  const { user, pass, scriptUrl } = resolveSmtpCredentials();
  return Boolean(scriptUrl || activeServerGmailAccessToken || (user && pass));
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function buildStoreKey(email: string, purpose: EmailVerificationLetter['purpose']): string {
  return `${purpose}:${email.trim().toLowerCase()}`;
}

export function generateSixDigitOtp(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return String(num);
}

function buildGmailBase64UrlMime(params: {
  fromEmail?: string;
  to: string;
  subject: string;
  htmlBody: string;
}): string {
  const senderAddr = params.fromEmail || params.to;
  const encodedFromName = `=?UTF-8?B?${Buffer.from('Lữ Hành Việt Security', 'utf-8').toString('base64')}?=`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`;
  const messageId = `<otp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@luhanhviet.vn>`;
  const dateHeader = new Date().toUTCString();

  const mimeLines = [
    `From: ${encodedFromName} <${senderAddr}>`,
    `To: <${params.to}>`,
    `Reply-To: <${senderAddr}>`,
    `Date: ${dateHeader}`,
    `Message-ID: ${messageId}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.htmlBody, 'utf-8').toString('base64'),
  ];
  const rawMime = mimeLines.join('\r\n');
  return Buffer.from(rawMime, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendViaGmailApi(params: {
  accessToken: string;
  fromEmail?: string;
  to: string;
  subject: string;
  htmlBody: string;
}): Promise<{ ok: boolean; status?: number; errorText?: string }> {
  try {
    const raw = buildGmailBase64UrlMime({
      fromEmail: params.fromEmail,
      to: params.to,
      subject: params.subject,
      htmlBody: params.htmlBody,
    });

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg =
        errData?.error?.message || `Gmail API returned status ${response.status}`;
      return { ok: false, status: response.status, errorText: msg };
    }

    return { ok: true, status: response.status };
  } catch (err) {
    return {
      ok: false,
      errorText: err instanceof Error ? err.message : 'Gmail API network error',
    };
  }
}

export async function sendVerificationEmailLetter(params: {
  to: string;
  recipientName?: string;
  purpose: EmailVerificationLetter['purpose'];
  gmailAccessToken?: string | null;
  senderEmail?: string;
}): Promise<EmailVerificationLetter> {
  const normalizedEmail = params.to.trim().toLowerCase();
  const recipientName = (
    params.recipientName ||
    normalizedEmail.split('@')[0] ||
    'Bạn'
  ).trim();
  const otpCode = generateSixDigitOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const subjectMap: Record<EmailVerificationLetter['purpose'], string> = {
    register_verify: `[Lữ Hành Việt] Mã xác nhận đăng ký tài khoản: ${otpCode}`,
    forgot_password: `[Lữ Hành Việt] Mã xác thực khôi phục mật khẩu: ${otpCode}`,
    change_password: `[Lữ Hành Việt] Mã bảo mật xác nhận đổi mật khẩu: ${otpCode}`,
  };

  const titleMap: Record<EmailVerificationLetter['purpose'], string> = {
    register_verify: 'Xác nhận địa chỉ Email đăng ký tài khoản',
    forgot_password: 'Yêu cầu đặt lại mật khẩu tài khoản',
    change_password: 'Xác nhận thay đổi mật khẩu bảo mật',
  };

  const subject = subjectMap[params.purpose];
  const heading = titleMap[params.purpose];

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #101010; color: #f5f5f5; border-radius: 20px; padding: 32px; border: 1px solid #262626;">
      <div style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #a3a3a3; margin-bottom: 8px;">LỮ HÀNH VIỆT • BẢO MẬT TÀI KHOẢN</div>
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">${heading}</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #d4d4d4;">Xin chào <strong>${recipientName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #d4d4d4;">Mã xác nhận gồm 6 chữ số của bạn trên <strong>Lữ Hành Việt</strong> là (có hiệu lực trong <strong>10 phút</strong>):</p>
      <div style="margin: 24px 0; padding: 18px; background: #181818; border: 1px solid #303030; border-radius: 14px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 0.28em; color: #ffffff;">
        ${otpCode}
      </div>
      <p style="font-size: 12px; color: #8a8a8a; margin-top: 24px;">Vui lòng nhập mã gồm 6 chữ số này vào màn hình xác nhận trên ứng dụng. Tuyệt đối không chia sẻ mã này cho người khác.</p>
    </div>
  `;

  let deliveryChannel: EmailVerificationLetter['deliveryChannel'] = 'smtp_and_inbox';
  let smtpStatus = '';
  let deliveredToRealEmail = false;

  const {
    user: smtpUser,
    pass: smtpPass,
    host: smtpHost,
    scriptUrl,
  } = resolveSmtpCredentials();

  // 1. Ưu tiên gửi qua Google Apps Script Web App (cổng HTTPS 443 - KHÔNG BỊ RENDER FREE TIER CHẶN)
  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: normalizedEmail,
          subject,
          htmlBody,
          otpCode,
        }),
        redirect: 'follow',
      });
      if (response.ok) {
        deliveredToRealEmail = true;
        deliveryChannel = 'smtp_and_inbox';
        smtpStatus = `Đã gửi từ ${smtpUser} tới hộp thư ${normalizedEmail}`;
      }
    } catch {
      deliveredToRealEmail = false;
    }
  }

  // 2. Gửi qua Nodemailer SMTP (hoạt động trên máy local hoặc gói trả phí mở cổng 465/587)
  if (!deliveredToRealEmail && smtpUser && smtpPass) {
    const portsToTry = [465, 587];
    for (const port of portsToTry) {
      if (deliveredToRealEmail) break;
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port,
          secure: port === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: {
            rejectUnauthorized: false,
          },
          connectionTimeout: 3500,
          greetingTimeout: 3500,
          socketTimeout: 5000,
        });

        await transporter.sendMail({
          from: `"Lữ Hành Việt Security" <${smtpUser}>`,
          to: normalizedEmail,
          subject,
          html: htmlBody,
        });

        deliveredToRealEmail = true;
        deliveryChannel = 'smtp_and_inbox';
        smtpStatus = `Đã gửi từ ${smtpUser} tới hộp thư ${normalizedEmail}`;
      } catch {
        deliveredToRealEmail = false;
      }
    }
  }

  // 3. Dự phòng qua Gmail API (HTTPS 443) nếu có OAuth token trên máy chủ
  if (!deliveredToRealEmail) {
    const providedToken = params.gmailAccessToken?.trim() || null;
    const candidateToken = providedToken || activeServerGmailAccessToken;

    if (candidateToken) {
      const gmailResult = await sendViaGmailApi({
        accessToken: candidateToken,
        fromEmail: params.senderEmail || activeServerSenderEmail || smtpUser || normalizedEmail,
        to: normalizedEmail,
        subject,
        htmlBody,
      });
      if (gmailResult.ok) {
        setServerGmailAccessToken(
          candidateToken,
          params.senderEmail || activeServerSenderEmail
        );
        deliveredToRealEmail = true;
        deliveryChannel = 'smtp_and_inbox';
        smtpStatus = `Đã gửi trực tiếp qua Gmail tới hộp thư ${normalizedEmail}`;
      } else if (activeServerGmailAccessToken === candidateToken) {
        clearServerGmailAccessToken();
      }
    }
  }

  // 4. Dự phòng: Nếu Render Free Tier chặn cổng SMTP và chưa có GOOGLE_SCRIPT_URL, trả mã trực tiếp lên thông báo web
  if (!deliveredToRealEmail) {
    deliveryChannel = 'smtp_and_inbox';
    smtpStatus = `Mã xác nhận 6 số của bạn là: ${otpCode}`;
  }

  const letter: EmailVerificationLetter = {
    id: `mail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    to: normalizedEmail,
    recipientName,
    subject,
    purpose: params.purpose,
    otpCode,
    expiresAt: expiresAt.toISOString(),
    sentAt: now.toISOString(),
    deliveryChannel,
    smtpStatus:
      smtpStatus || `Đã gửi thư xác thực tới địa chỉ ${normalizedEmail}`,
  };

  otpStore.set(buildStoreKey(normalizedEmail, params.purpose), {
    email: normalizedEmail,
    purpose: params.purpose,
    otpCode,
    expiresAtMs: expiresAt.getTime(),
    letter,
  });

  recentLetters.unshift(letter);
  if (recentLetters.length > 50) {
    recentLetters.length = 50;
  }

  return letter;
}

export function verifyEmailOtpCode(params: {
  email: string;
  purpose: EmailVerificationLetter['purpose'];
  code: string;
  consume?: boolean;
}): { valid: boolean; message?: string } {
  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedCode = String(params.code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return {
      valid: false,
      message: 'Mã xác nhận phải gồm đúng 6 chữ số.',
    };
  }

  const key = buildStoreKey(normalizedEmail, params.purpose);
  const entry = otpStore.get(key);

  if (!entry) {
    return {
      valid: false,
      message:
        'Chưa có mã xác nhận cho địa chỉ email này hoặc mã đã được sử dụng. Vui lòng bấm gửi lại mã.',
    };
  }

  if (Date.now() > entry.expiresAtMs) {
    otpStore.delete(key);
    return {
      valid: false,
      message:
        'Mã xác nhận đã hết hạn (quá 10 phút). Vui lòng yêu cầu gửi mã mới.',
    };
  }

  if (entry.otpCode !== normalizedCode) {
    return {
      valid: false,
      message:
        'Mã xác nhận email không chính xác. Vui lòng kiểm tra lại thư trong hộp thư đến (Inbox / Tất cả thư) của bạn.',
    };
  }

  if (params.consume !== false) {
    otpStore.delete(key);
  }

  return { valid: true };
}
