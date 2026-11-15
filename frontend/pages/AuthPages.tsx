import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Compass,
  KeyRound,
  Lock,
  Mail,
  MailCheck,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { User } from '../types/travel';
import { type ApiError, apiRequest, setStoredToken } from '../utils/api';

const GoogleMarkSvg: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2H12z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.9v2.6C4.6 19.8 8 22 12 22z"
    />
    <path
      fill="#4A90E2"
      d="M6.2 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V7.6H2.9C2.3 8.9 2 10.4 2 12s.3 3.1.9 4.4l3.3-2.6z"
    />
    <path
      fill="#FBBC05"
      d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8 2 4.6 4.2 2.9 7.6l3.3 2.6c.8-2.5 3.1-4.3 5.8-4.3z"
    />
  </svg>
);

export const LoginPage: React.FC = () => {
  const {
    login,
    loginWithGoogle,
    ensureGmailTokenForEmailSend,
    updateCurrentUser,
  } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotEmailOrUser, setForgotEmailOrUser] = useState('');
  const [forgotResolvedEmail, setForgotResolvedEmail] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotNeedsReconnect, setForgotNeedsReconnect] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setError('Bạn đã đóng cửa sổ đăng nhập Google.');
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          'Tên miền hiện tại chưa được thêm vào Authorized Domains trên Firebase Console.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Đăng nhập Google thất bại.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const openForgotPasswordModal = () => {
    setShowForgotModal(true);
    setForgotStep('request');
    setForgotEmailOrUser(identifier.trim());
    setForgotOtpCode('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError(null);
    setForgotSuccess(null);
    setForgotNeedsReconnect(false);
  };

  const executeSendForgotCode = async (
    e?: React.FormEvent,
    forcePopup = false
  ) => {
    if (e) {
      e.preventDefault();
    }
    setForgotError(null);
    setForgotSuccess(null);
    setForgotNeedsReconnect(false);

    if (!forgotEmailOrUser.trim()) {
      setForgotError(
        t(
          'Vui lòng nhập địa chỉ email hoặc tên người dùng của bạn.',
          'Please enter your email or username.'
        )
      );
      return;
    }

    setForgotLoading(true);
    try {
      // IMPORTANT: Acquire Gmail token synchronously in the user's click gesture BEFORE any fetch()
      const gmailToken = await ensureGmailTokenForEmailSend(forcePopup);

      const res = await apiRequest<{
        sent: boolean;
        email: string;
        username: string;
        deliveryStatus: string;
        message: string;
      }>('/api/auth/forgot-password/send-code', {
        method: 'POST',
        headers: gmailToken ? { 'X-Gmail-Access-Token': gmailToken } : undefined,
        body: JSON.stringify({
          identifier: forgotEmailOrUser.trim(),
          gmailAccessToken: gmailToken || undefined,
        }),
      });

      setForgotResolvedEmail(res.email);
      setForgotStep('verify');
      setForgotSuccess(res.message);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'GMAIL_AUTH_REQUIRED' || apiErr.status === 428) {
        setForgotNeedsReconnect(true);
        setForgotError(
          t(
            'Phiên kết nối Gmail đã hết hạn. Nhấn nút "Kết nối Gmail & Gửi mã ngay" bên dưới để gửi thư lập tức.',
            'Gmail session expired. Click the button below to reconnect Gmail and send the code immediately.'
          )
        );
      } else {
        setForgotError(
          err instanceof Error
            ? err.message
            : t('Không thể gửi thư xác nhận.', 'Failed to send verification email.')
        );
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPasswordWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    if (!/^\d{6}$/.test(forgotOtpCode.trim())) {
      setForgotError(
        t(
          'Vui lòng nhập đúng mã xác nhận 6 chữ số trong hộp thư email của bạn.',
          'Please enter the 6-digit code from your email inbox.'
        )
      );
      return;
    }
    if (forgotNewPassword.length < 6) {
      setForgotError(
        t(
          'Mật khẩu mới cần tối thiểu 6 ký tự.',
          'New password must be at least 6 characters.'
        )
      );
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError(
        t('Mật khẩu xác nhận không khớp.', 'Password confirmation does not match.')
      );
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        user: User;
        token: string;
      }>('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotResolvedEmail || forgotEmailOrUser.trim(),
          code: forgotOtpCode.trim(),
          newPassword: forgotNewPassword,
        }),
      });

      if (res.token && res.user) {
        setStoredToken(res.token);
        updateCurrentUser(res.user);
      }
      setShowForgotModal(false);
      navigate('/');
    } catch (err) {
      setForgotError(
        err instanceof Error
          ? err.message
          : t('Đặt lại mật khẩu thất bại.', 'Failed to reset password.')
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 bg-[#181818] rounded-3xl border border-[#2a2a2a] overflow-hidden">
        {/* Left visual panel */}
        <div className="md:col-span-5 bg-[#121212] text-white p-8 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-[#262626]">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-stone-200 text-xs font-semibold mb-6">
              <Compass className="w-4 h-4" />
              Lữ Hành Việt • Mạng xã hội du lịch
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              Chào mừng bạn trở lại hành trình!
            </h1>
            <p className="text-sm text-stone-400 mt-3 leading-relaxed">
              Đăng nhập để chia sẻ nhật ký chuyến đi mới, lưu lại những tọa độ yêu thích và trò chuyện cùng cộng đồng du lịch.
            </p>
          </div>

          <div className="relative z-10 mt-8 pt-5 border-t border-white/10 text-xs text-stone-400 space-y-2">
            <div className="flex items-center gap-2 text-stone-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {t(
                  'Bảo mật tài khoản bằng xác thực mã OTP gửi trực tiếp vào Gmail',
                  'Account secured with direct Gmail OTP verification'
                )}
              </span>
            </div>
            <p className="text-stone-500">
              {t(
                'Mã bảo mật 6 chữ số chỉ được gửi riêng tới hộp thư email của bạn.',
                'Your 6-digit security code is sent strictly to your private email inbox.'
              )}
            </p>
          </div>
        </div>

        {/* Right form */}
        <div className="md:col-span-7 p-7 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold text-stone-100">
              {t('Đăng nhập tài khoản', 'Sign in to your account')}
            </h2>
            <p className="text-sm text-stone-400 mt-1">
              {t('Chưa có tài khoản?', "Don't have an account?")}{' '}
              <Link
                to="/register"
                className="font-semibold text-white hover:underline"
              >
                {t('Đăng ký thành viên mới', 'Create a new account')}
              </Link>
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/70 text-rose-200 text-xs font-medium flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Official Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleSubmitting || submitting}
            className="w-full mb-4 py-3 rounded-2xl bg-[#222222] hover:bg-[#2a2a2a] text-stone-100 font-semibold text-sm border border-[#333333] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <GoogleMarkSvg />
            {googleSubmitting
              ? t('Đang kết nối Google...', 'Connecting to Google...')
              : t('Đăng nhập bằng Google (Sign in with Google)', 'Sign in with Google')}
          </button>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-[#2a2a2a]" />
            <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
              {t('Hoặc dùng mật khẩu', 'Or with password')}
            </span>
            <div className="flex-grow border-t border-[#2a2a2a]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                {t('Email hoặc Username', 'Email or Username')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t(
                    'Nhập email hoặc tên người dùng...',
                    'Enter email or username...'
                  )}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
                  {t('Mật khẩu', 'Password')}
                </label>
                <button
                  type="button"
                  data-testid="open-forgot-password-btn"
                  onClick={openForgotPasswordModal}
                  className="text-xs font-semibold text-stone-300 hover:text-white underline underline-offset-4 transition-colors"
                >
                  {t('Quên mật khẩu?', 'Forgot password?')}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || googleSubmitting}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-stone-200 text-stone-950 font-bold text-sm transition-all disabled:opacity-50"
            >
              {submitting
                ? t('Đang xác thực...', 'Signing in...')
                : t('Đăng nhập ngay', 'Sign in')}
            </button>
          </form>
        </div>
      </div>

      {/* Floating Modal: Quên mật khẩu & Nhận mã OTP trực tiếp qua hộp thư Email */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setShowForgotModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-[#181818] border border-[#2e2e2e] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-stone-200" />
                <h3 className="text-base font-bold text-white">
                  {t('Quên mật khẩu • Nhận mã qua Email', 'Forgot Password • Email OTP')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-white hover:bg-[#262626] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {forgotError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/70 text-rose-200 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                  {forgotNeedsReconnect && (
                    <button
                      type="button"
                      onClick={() => executeSendForgotCode(undefined, true)}
                      disabled={forgotLoading}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <GoogleMarkSvg />
                      {t(
                        'Kết nối Gmail & Gửi mã ngay',
                        'Connect Gmail & Send Code Now'
                      )}
                    </button>
                  )}
                </div>
              )}

              {forgotSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{forgotSuccess}</span>
                </div>
              )}

              {forgotStep === 'request' && (
                <form
                  onSubmit={(e) => executeSendForgotCode(e, false)}
                  className="space-y-4"
                >
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {t(
                      'Nhập địa chỉ Email hoặc tên người dùng (@username) của bạn. Khi nhấn gửi, hệ thống sẽ lập tức gửi một bức thư chứa mã xác nhận 6 chữ số trực tiếp vào hộp thư Gmail của bạn.',
                      'Enter your registered Email or @username. Clicking Send will immediately deliver a 6-digit verification code to your Gmail inbox.'
                    )}
                  </p>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      {t('Email hoặc Username nhận mã', 'Email or Username')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        data-testid="forgot-email-input"
                        value={forgotEmailOrUser}
                        onChange={(e) => setForgotEmailOrUser(e.target.value)}
                        placeholder="Ví dụ: 2k7nguyenquan@gmail.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#101010] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    data-testid="forgot-send-code-btn"
                    disabled={forgotLoading}
                    className="w-full py-3 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <MailCheck className="w-4 h-4" />
                    {forgotLoading
                      ? t('Đang gửi mã vào Gmail...', 'Sending code to Gmail...')
                      : t('Gửi mã xác nhận qua Email', 'Send Code via Email')}
                  </button>
                </form>
              )}

              {forgotStep === 'verify' && (
                <form onSubmit={handleResetPasswordWithCode} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-[#121212] border border-[#2c2c2c] text-xs text-stone-300 leading-relaxed flex items-start gap-2.5">
                    <MailCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      {t(
                        'Thư chứa mã OTP 6 chữ số đã được gửi trực tiếp tới hộp thư ',
                        'A 6-digit OTP email has been sent directly to '
                      )}
                      <strong className="text-white">{forgotResolvedEmail}</strong>.{' '}
                      {t(
                        'Vui lòng mở hộp thư đến (Inbox) hoặc Tất cả thư (All Mail) trên Gmail của bạn để lấy mã.',
                        'Please check your Gmail Inbox or All Mail to retrieve the code.'
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      {t(
                        'Mã xác nhận 6 số trong thư Email của bạn',
                        '6-Digit Code from Your Email Inbox'
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      data-testid="forgot-otp-input"
                      value={forgotOtpCode}
                      onChange={(e) =>
                        setForgotOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Nhập 6 chữ số từ Gmail"
                      className="w-full px-4 py-3 rounded-xl bg-[#101010] border border-[#2c2c2c] text-center font-mono text-lg font-bold tracking-[0.25em] text-white focus:outline-none focus:border-stone-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      {t('Mật khẩu mới (tối thiểu 6 ký tự)', 'New Password (min 6 chars)')}
                    </label>
                    <input
                      type="password"
                      required
                      data-testid="forgot-new-password-input"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      {t('Xác nhận mật khẩu mới', 'Confirm New Password')}
                    </label>
                    <input
                      type="password"
                      required
                      data-testid="forgot-confirm-password-input"
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => executeSendForgotCode(undefined, false)}
                      disabled={forgotLoading}
                      className="px-4 py-3 rounded-xl bg-[#242424] hover:bg-[#2e2e2e] text-stone-300 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${forgotLoading ? 'animate-spin' : ''}`}
                      />
                      {t('Gửi lại mã', 'Resend')}
                    </button>
                    <button
                      type="submit"
                      data-testid="forgot-reset-submit-btn"
                      disabled={forgotLoading}
                      className="flex-1 py-3 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-sm transition-colors disabled:opacity-50"
                    >
                      {forgotLoading
                        ? t('Đang cập nhật...', 'Resetting...')
                        : t('Xác nhận & Đặt lại mật khẩu', 'Verify & Reset Password')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const { register, loginWithGoogle, ensureGmailTokenForEmailSend } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [homeCity, setHomeCity] = useState('Hà Nội');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Verify 6-digit OTP from real email inbox (sent immediately on 1st click)
  const [step, setStep] = useState<'form' | 'verify_email'>('form');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const executeSendVerificationEmail = async (
    e?: React.FormEvent,
    forcePopup = false
  ) => {
    if (e) {
      e.preventDefault();
    }
    setError(null);
    setNeedsReconnect(false);

    if (password !== confirmPassword) {
      setError(t('Mật khẩu xác nhận không khớp.', 'Passwords do not match.'));
      return;
    }

    setSendingCode(true);
    try {
      // IMPORTANT: Acquire Gmail token synchronously in the user's click gesture BEFORE any fetch()
      const gmailToken = await ensureGmailTokenForEmailSend(forcePopup);

      const res = await apiRequest<{
        sent: boolean;
        email: string;
        expiresInSeconds: number;
        deliveryStatus: string;
        message: string;
      }>('/api/auth/register/send-code', {
        method: 'POST',
        headers: gmailToken ? { 'X-Gmail-Access-Token': gmailToken } : undefined,
        body: JSON.stringify({
          fullName,
          username,
          email,
          password,
          gmailAccessToken: gmailToken || undefined,
        }),
      });

      setDeliveryNotice(res.message);
      setVerificationCode('');
      setStep('verify_email');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'GMAIL_AUTH_REQUIRED' || apiErr.status === 428) {
        setNeedsReconnect(true);
        setError(
          t(
            'Phiên kết nối Gmail đã hết hạn. Nhấn nút "Kết nối Gmail & Gửi mã ngay" bên dưới để gửi thư lập tức.',
            'Gmail session expired. Click the button below to reconnect Gmail and send the code immediately.'
          )
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : t(
                'Không thể gửi thư xác nhận email.',
                'Could not send verification email.'
              )
        );
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleConfirmOtpAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError(
        t(
          'Vui lòng nhập đúng mã xác nhận 6 chữ số trong thư email của bạn.',
          'Please enter the 6-digit verification code from your email inbox.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      await register({
        fullName,
        username,
        email,
        password,
        homeCity,
        verificationCode: verificationCode.trim(),
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng ký bằng Google thất bại.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-[#181818] rounded-3xl border border-[#2a2a2a] p-7 sm:p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-300 bg-[#262626] px-3 py-1 rounded-full mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              {step === 'form'
                ? t('Bước 1/2 • Thông tin tài khoản', 'Step 1/2 • Account Details')
                : t('Bước 2/2 • Xác nhận Email qua thư', 'Step 2/2 • Email Inbox Verification')}
            </span>
            <h1 className="text-2xl font-extrabold text-stone-100">
              {step === 'form'
                ? t('Tạo tài khoản Lữ Hành Việt', 'Create your Wanderlust account')
                : t('Xác nhận địa chỉ Email của bạn', 'Verify your Email address')}
            </h1>
          </div>
          <Link
            to="/login"
            className="text-xs font-semibold text-stone-400 hover:text-white underline"
          >
            {t('Đã có tài khoản? Đăng nhập', 'Already have an account? Sign in')}
          </Link>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/70 text-rose-200 text-xs font-medium space-y-2.5">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            {needsReconnect && (
              <button
                type="button"
                onClick={() => executeSendVerificationEmail(undefined, true)}
                disabled={sendingCode}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-xs flex items-center justify-center gap-2"
              >
                <GoogleMarkSvg />
                {t(
                  'Kết nối Gmail & Gửi mã ngay',
                  'Connect Gmail & Send Code Now'
                )}
              </button>
            )}
          </div>
        )}

        {step === 'form' && (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleSubmitting || sendingCode}
              className="w-full mb-4 py-3 rounded-2xl bg-[#222222] hover:bg-[#2a2a2a] text-stone-100 font-semibold text-sm border border-[#333333] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              <GoogleMarkSvg />
              {googleSubmitting
                ? t('Đang kết nối Google...', 'Connecting to Google...')
                : t('Đăng ký nhanh bằng Google (Sign in with Google)', 'Sign in with Google')}
            </button>

            <div className="relative flex py-2 items-center mb-4">
              <div className="flex-grow border-t border-[#2a2a2a]" />
              <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                {t(
                  'Hoặc đăng ký và nhận mã xác nhận qua hộp thư Email',
                  'Or register with Email verification'
                )}
              </span>
              <div className="flex-grow border-t border-[#2a2a2a]" />
            </div>

            <form
              onSubmit={(e) => executeSendVerificationEmail(e, false)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Họ và tên hiển thị *', 'Full Name *')}
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    data-testid="register-fullname-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Tên định danh (@username) *', 'Username (@handle) *')}
                </label>
                <input
                  type="text"
                  required
                  data-testid="register-username-input"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))
                  }
                  placeholder="nguyenvana_travel"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Địa chỉ Email (nhận thư mã xác thực) *', 'Email Address (for verification) *')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    data-testid="register-email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@gmail.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Thành phố đang sống', 'Home City')}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={homeCity}
                    onChange={(e) => setHomeCity(e.target.value)}
                    placeholder="Hà Nội, TP.HCM, Đà Nẵng..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Mật khẩu (tối thiểu 6 ký tự) *', 'Password (min 6 chars) *')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    data-testid="register-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  {t('Nhập lại mật khẩu *', 'Confirm Password *')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    data-testid="register-confirm-password-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121212] border border-[#2a2a2a] text-sm text-stone-100 focus:outline-none focus:border-stone-500"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  data-testid="register-send-code-btn"
                  disabled={sendingCode}
                  className="w-full py-3.5 rounded-2xl bg-white hover:bg-stone-200 text-stone-950 font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <MailCheck className="w-4 h-4" />
                  {sendingCode
                    ? t('Đang gửi mã vào Gmail...', 'Sending code to Gmail...')
                    : t(
                        'Gửi mã xác nhận tới Email',
                        'Send Verification Code to Email'
                      )}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'verify_email' && (
          <form onSubmit={handleConfirmOtpAndRegister} className="space-y-5">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 leading-relaxed flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                {deliveryNotice ||
                  t(
                    `Đã gửi thư chứa mã xác nhận 6 chữ số trực tiếp tới ${email}. Vui lòng mở hộp thư đến (Inbox) trên Gmail của bạn để lấy mã.`,
                    `Sent a 6-digit verification code to ${email}. Please check your Gmail inbox.`
                  )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
                  {t(
                    'Nhập mã xác nhận 6 chữ số trong thư Email của bạn *',
                    'Enter 6-Digit Code from Your Email *'
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => executeSendVerificationEmail(undefined, false)}
                  disabled={sendingCode}
                  className="text-xs text-stone-300 hover:text-white inline-flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sendingCode ? 'animate-spin' : ''}`} />
                  {t('Gửi lại thư mới', 'Resend email')}
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={6}
                data-testid="register-otp-input"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                className="w-full px-4 py-3.5 rounded-2xl bg-[#101010] border border-[#2f2f2f] text-center font-mono text-2xl font-black tracking-[0.35em] text-white focus:outline-none focus:border-white"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="px-4 py-3.5 rounded-2xl bg-[#222222] hover:bg-[#2c2c2c] text-stone-300 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('Quay lại sửa thông tin', 'Back to edit')}
              </button>
              <button
                type="submit"
                data-testid="register-verify-submit-btn"
                disabled={submitting}
                className="flex-1 py-3.5 rounded-2xl bg-white hover:bg-stone-200 text-stone-950 font-bold text-sm transition-all disabled:opacity-50"
              >
                {submitting
                  ? t('Đang kích hoạt tài khoản...', 'Activating account...')
                  : t(
                      'Xác nhận Email & Hoàn tất đăng ký',
                      'Verify Email & Complete Sign Up'
                    )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const NotFoundPage: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#181818] border border-[#2a2a2a] flex items-center justify-center text-stone-300 mb-4">
        <Compass className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-extrabold text-white mb-2">
        {t('404 • Không tìm thấy trang', '404 • Page Not Found')}
      </h1>
      <p className="text-sm text-stone-400 max-w-md mb-6">
        {t(
          'Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.',
          'The page you are looking for does not exist or has been moved.'
        )}
      </p>
      <Link
        to="/"
        className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-stone-200 transition-colors"
      >
        {t('Về trang chủ Bảng tin', 'Back to Home Feed')}
      </Link>
    </div>
  );
};
