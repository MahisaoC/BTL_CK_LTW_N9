import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AtSign,
  BellOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Globe,
  HeartOff,
  HelpCircle,
  Home,
  ImageOff,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  MailCheck,
  Moon,
  Plus,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import type {
  MessagePrivacySetting,
  User,
  UserSettingsPreferences,
} from '../types/travel';
import { type ApiError, apiRequest } from '../utils/api';

type SettingsTabKey =
  | 'meta_account'
  | 'supervision'
  | 'privacy'
  | 'content_preferences'
  | 'account_status'
  | 'more_settings'
  | 'help';

const DEFAULT_SETTINGS: UserSettingsPreferences = {
  privateProfile: false,
  tagsAndMentions: 'everyone',
  onlineStatus: 'everyone',
  restrictedProfiles: [],
  privateLikes: false,
  hiddenWords: [],
  hideLikeAndShareCounts: false,
  yourAlgoTopics: [
    'Du lịch biển đảo',
    'Ẩm thực bản địa',
    'Leo núi & Trekking',
    'Văn hóa di sản',
  ],
  sensitiveContent: 'standard',
  politicalContent: false,
  teenSupervisionEnabled: false,
  dailyTimeLimitMinutes: 0,
  sleepModeEnabled: false,
  twoFactorEmailOtp: false,
  loginAlerts: true,
};

export const SettingsPage: React.FC = () => {
  const { user, updateCurrentUser, logout, ensureGmailTokenForEmailSend } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTabKey) || 'privacy';
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    [
      'meta_account',
      'supervision',
      'privacy',
      'content_preferences',
      'account_status',
      'more_settings',
      'help',
    ].includes(initialTab)
      ? initialTab
      : 'privacy'
  );

  // Sub-panel inside a tab (for drilling down into an item)
  const [subPanel, setSubPanel] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<UserSettingsPreferences>(() => ({
    ...DEFAULT_SETTINGS,
    ...(user?.settings || {}),
  }));
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacySetting>(
    user?.messagePrivacy || 'everyone'
  );
  const [blockedUsers, setBlockedUsers] = useState<string[]>(user?.blockedUsers || []);
  const [mutedConversations, setMutedConversations] = useState<string[]>(
    user?.mutedConversations || []
  );
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [newHiddenWord, setNewHiddenWord] = useState('');
  const [newAlgoTopic, setNewAlgoTopic] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Change Password / Email OTP states (inside Meta Account / More settings)
  const [pwdMode, setPwdMode] = useState<'current_password' | 'email_otp'>(
    'current_password'
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpNeedsReconnect, setOtpNeedsReconnect] = useState(false);
  const [otpSentNotice, setOtpSentNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setPrefs({
      ...DEFAULT_SETTINGS,
      ...(user.settings || {}),
    });
    setMessagePrivacy(user.messagePrivacy || 'everyone');
    setBlockedUsers(user.blockedUsers || []);
    setMutedConversations(user.mutedConversations || []);
  }, [user, navigate]);

  useEffect(() => {
    apiRequest<{ users: User[] }>('/api/users')
      .then((res) => setAllUsers(res.users || []))
      .catch(() => {});
  }, []);

  if (!user) {
    return null;
  }

  const handleSelectTab = (tab: SettingsTabKey) => {
    setActiveTab(tab);
    setSubPanel(null);
    setStatusBanner(null);
    setSearchParams({ tab });
  };

  const persistUserSettings = async (
    nextPrefs: UserSettingsPreferences,
    nextMsgPrivacy: MessagePrivacySetting = messagePrivacy,
    nextBlocked: string[] = blockedUsers,
    nextMuted: string[] = mutedConversations
  ) => {
    setPrefs(nextPrefs);
    setMessagePrivacy(nextMsgPrivacy);
    setBlockedUsers(nextBlocked);
    setMutedConversations(nextMuted);
    setSavingSettings(true);
    setStatusBanner(null);
    try {
      const res = await apiRequest<{ user: User; message: string }>(
        '/api/users/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            settings: nextPrefs,
            messagePrivacy: nextMsgPrivacy,
            blockedUsers: nextBlocked,
            mutedConversations: nextMuted,
          }),
        }
      );
      updateCurrentUser(res.user);
      setStatusBanner({
        type: 'success',
        text: t('Đã lưu thay đổi cài đặt.', 'Settings saved.'),
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : t('Không thể lưu cài đặt.', 'Could not save settings.'),
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const executeSendChangePasswordOtp = async (forcePopup = false) => {
    setSendingOtp(true);
    setStatusBanner(null);
    setOtpNeedsReconnect(false);
    try {
      // IMPORTANT: Acquire Gmail token synchronously in the user's click gesture BEFORE any fetch()
      const gmailToken = await ensureGmailTokenForEmailSend(forcePopup);

      const res = await apiRequest<{
        sent: boolean;
        email: string;
        deliveryStatus: string;
        message: string;
      }>('/api/auth/change-password/send-code', {
        method: 'POST',
        headers: gmailToken ? { 'X-Gmail-Access-Token': gmailToken } : undefined,
        body: JSON.stringify({ gmailAccessToken: gmailToken || undefined }),
      });

      setOtpSentNotice(res.message);
      setPwdMode('email_otp');
      setStatusBanner({
        type: 'success',
        text: res.message,
      });
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'GMAIL_AUTH_REQUIRED' || apiErr.status === 428) {
        setOtpNeedsReconnect(true);
        setStatusBanner({
          type: 'error',
          text: t(
            'Phiên kết nối Gmail đã hết hạn. Nhấn nút "Kết nối Gmail & Gửi mã ngay" bên dưới để gửi thư lập tức.',
            'Gmail session expired. Click the button below to reconnect Gmail and send the code immediately.'
          ),
        });
      } else {
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : t('Không thể gửi mã xác thực email.', 'Failed to send email OTP.'),
        });
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    if (newPassword.length < 6) {
      setStatusBanner({
        type: 'error',
        text: t(
          'Mật khẩu mới cần tối thiểu 6 ký tự.',
          'New password must be at least 6 characters.'
        ),
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setStatusBanner({
        type: 'error',
        text: t(
          'Mật khẩu xác nhận không trùng khớp.',
          'Password confirmation does not match.'
        ),
      });
      return;
    }

    setPwdSubmitting(true);
    try {
      const payload =
        pwdMode === 'email_otp'
          ? { emailCode: emailOtpCode.trim(), newPassword }
          : { currentPassword, newPassword };

      const res = await apiRequest<{
        success: boolean;
        message: string;
        user: User;
      }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      updateCurrentUser(res.user);
      setCurrentPassword('');
      setEmailOtpCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setOtpSentNotice(null);
      setStatusBanner({
        type: 'success',
        text: t(
          'Đã đổi mật khẩu tài khoản thành công!',
          'Password changed successfully!'
        ),
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : t('Đổi mật khẩu thất bại.', 'Failed to change password.'),
      });
    } finally {
      setPwdSubmitting(false);
    }
  };

  const tabTitleMap: Record<SettingsTabKey, string> = {
    meta_account: t('Trung tâm Tài khoản & Bảo mật', 'Account & Security Center'),
    supervision: t('Quản lý thời gian & Sức khỏe số', 'Digital Wellbeing & Time Limit'),
    privacy: t('Quyền riêng tư & Tin nhắn', 'Privacy & Messaging'),
    content_preferences: t('Tùy chọn nội dung', 'Content Preferences'),
    account_status: t('Trạng thái tài khoản', 'Account Status'),
    more_settings: t('Cài đặt chung & Ngôn ngữ', 'General & Language'),
    help: t('Trợ giúp & Chính sách', 'Help & Policies'),
  };

  const blockedUserObjects = allUsers.filter((u) => blockedUsers.includes(u._id));
  const mutedUserObjects = allUsers.filter((u) => mutedConversations.includes(u._id));
  const restrictedUserObjects = allUsers.filter((u) =>
    prefs.restrictedProfiles.includes(u._id)
  );

  return (
    <div className="w-full max-w-[1760px] mx-auto px-3 sm:px-6 lg:px-8 2xl:px-10 py-6 sm:py-8">
      {/* Header Title + Quick Language Switcher in Settings */}
      <div className="mb-5 px-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
          {tabTitleMap[activeTab]}
        </h1>

        <div
          role="group"
          aria-label={t('Chọn ngôn ngữ hiển thị', 'Select display language')}
          className="inline-flex items-center p-1 rounded-xl bg-zinc-200/80 dark:bg-[#181818] border border-zinc-300/80 dark:border-[#2a2a2a]"
        >
          <button
            type="button"
            onClick={() => setLanguage('vi')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              language === 'vi'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Tiếng Việt
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              language === 'en'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Main 2-column Rounded Container */}
      <div className="rounded-[26px] bg-[#101010] border border-[#242424] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px]">
        {/* Left Navigation Column */}
        <aside className="md:col-span-4 border-b md:border-b-0 md:border-r border-[#242424] p-4 sm:p-5 flex flex-col gap-1.5">
          {/* Lữ Hành Việt Account Center (Top block with subtitle) */}
          <button
            type="button"
            data-testid="settings-tab-meta_account"
            onClick={() => handleSelectTab('meta_account')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 cursor-pointer ${
              activeTab === 'meta_account'
                ? 'bg-[#262626] text-white ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <ShieldCheck className="w-6 h-6 text-white shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white leading-snug">
                {t('Trung tâm Tài khoản', 'Account Center')}
              </div>
              <p className="text-xs text-stone-400 leading-relaxed mt-0.5">
                {t(
                  'Mật khẩu, bảo mật, nhận mã qua email, thông tin cá nhân',
                  'Password, security, email OTP code, personal details'
                )}
              </p>
            </div>
          </button>

          {/* Quản lý thời gian & Sức khỏe số */}
          <button
            type="button"
            data-testid="settings-tab-supervision"
            onClick={() => handleSelectTab('supervision')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'supervision'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <Home className="w-5 h-5 text-white shrink-0" />
            <span className="truncate">
              {t('Quản lý thời gian sử dụng', 'Time Management & Wellbeing')}
            </span>
          </button>

          {/* Privacy */}
          <button
            type="button"
            data-testid="settings-tab-privacy"
            onClick={() => handleSelectTab('privacy')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <Lock className="w-5 h-5 text-white shrink-0" />
            <span>{t('Quyền riêng tư & Tin nhắn', 'Privacy & Messaging')}</span>
          </button>

          {/* Content preferences */}
          <button
            type="button"
            data-testid="settings-tab-content_preferences"
            onClick={() => handleSelectTab('content_preferences')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'content_preferences'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 text-white shrink-0" />
            <span>{t('Tùy chọn nội dung', 'Content preferences')}</span>
          </button>

          {/* Account status */}
          <button
            type="button"
            data-testid="settings-tab-account_status"
            onClick={() => handleSelectTab('account_status')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'account_status'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <UserIcon className="w-5 h-5 text-white shrink-0" />
            <span>{t('Trạng thái tài khoản', 'Account status')}</span>
          </button>

          {/* More settings */}
          <button
            type="button"
            data-testid="settings-tab-more_settings"
            onClick={() => handleSelectTab('more_settings')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'more_settings'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 text-white shrink-0 border border-white/80 rounded-md p-0.5" />
            <span>{t('Cài đặt chung & Ngôn ngữ', 'General & Language')}</span>
          </button>

          {/* Help */}
          <button
            type="button"
            data-testid="settings-tab-help"
            onClick={() => handleSelectTab('help')}
            className={`w-full text-left rounded-2xl px-4 py-3.5 transition-all flex items-center gap-3.5 text-[15px] font-medium cursor-pointer ${
              activeTab === 'help'
                ? 'bg-[#262626] text-white font-semibold ring-1 ring-[#3a3a3a]'
                : 'text-stone-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <HelpCircle className="w-5 h-5 text-white shrink-0" />
            <span>{t('Trợ giúp & Chính sách', 'Help & Policies')}</span>
          </button>
        </aside>

        {/* Right Detail Pane */}
        <section className="md:col-span-8 p-5 sm:p-8 flex flex-col justify-between">
          <div className="space-y-4">
            {statusBanner && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2 ${
                  statusBanner.type === 'success'
                    ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-200'
                    : 'bg-rose-950/50 border-rose-800/60 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {statusBanner.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{statusBanner.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  className="text-stone-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ================= TAB 1: PRIVACY ================= */}
            {activeTab === 'privacy' && !subPanel && (
              <div className="divide-y divide-[#1f1f1f]">
                {/* Private profile */}
                <button
                  type="button"
                  data-testid="privacy-row-private_profile"
                  onClick={() => setSubPanel('private_profile')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Lock className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Trang cá nhân riêng tư', 'Private profile')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-stone-400 text-sm">
                    <span>
                      {prefs.privateProfile
                        ? t('Riêng tư', 'Private')
                        : t('Công khai', 'Public')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                </button>

                {/* Tags and mentions */}
                <button
                  type="button"
                  data-testid="privacy-row-tags_mentions"
                  onClick={() => setSubPanel('tags_mentions')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <AtSign className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Gắn thẻ và nhắc đến (@mentions)', 'Tags and mentions')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Online status */}
                <button
                  type="button"
                  data-testid="privacy-row-online_status"
                  onClick={() => setSubPanel('online_status')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <UserCheck className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Trạng thái hoạt động trực tuyến', 'Online status')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Messages */}
                <button
                  type="button"
                  data-testid="privacy-row-messages"
                  onClick={() => setSubPanel('messages')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Send className="w-5 h-5 text-white" />
                    <div className="text-left">
                      <div className="text-[15px] font-medium text-white">
                        {t('Tin nhắn & Chống làm phiền', 'Messages & Anti-spam')}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {t(
                          'Tùy chọn nhận tin nhắn từ mọi người hoặc chỉ bạn bè Follow lẫn nhau',
                          'Allow messages from everyone or mutual followers only'
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                        messagePrivacy === 'mutual'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#1c1c1c] border-[#2e2e2e] text-stone-300'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>
                        {messagePrivacy === 'mutual'
                          ? t('Chỉ bạn bè Follow', 'Mutual Only')
                          : t('Mọi người', 'Everyone')}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                </button>

                {/* Restricted profiles */}
                <button
                  type="button"
                  data-testid="privacy-row-restricted"
                  onClick={() => setSubPanel('restricted')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Shield className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Tài khoản bị hạn chế', 'Restricted profiles')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Blocked profiles */}
                <button
                  type="button"
                  data-testid="privacy-row-blocked"
                  onClick={() => setSubPanel('blocked')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <XCircle className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Danh sách đã chặn', 'Blocked profiles')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-stone-400 text-sm">
                    {blockedUsers.length > 0 && <span>{blockedUsers.length}</span>}
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                </button>

                {/* Private likes */}
                <button
                  type="button"
                  data-testid="privacy-row-private_likes"
                  onClick={() => setSubPanel('private_likes')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <HeartOff className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Ẩn danh sách bài viết đã thích', 'Private likes')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            )}

            {/* Sub-panels for PRIVACY */}
            {activeTab === 'privacy' && subPanel && (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => setSubPanel(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('Quay lại Quyền riêng tư & Tin nhắn', 'Back to Privacy')}
                </button>

                {subPanel === 'private_profile' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {t('Trang cá nhân riêng tư', 'Private profile')}
                        </h3>
                        <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                          {t(
                            'Khi bật chế độ riêng tư, chỉ những người theo dõi được bạn chấp thuận mới có thể xem bài viết hành trình và danh sách bạn bè của bạn.',
                            'If your profile is private, only approved followers can see your travel posts and interactions.'
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          persistUserSettings({
                            ...prefs,
                            privateProfile: !prefs.privateProfile,
                          })
                        }
                        className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                          prefs.privateProfile ? 'bg-white' : 'bg-[#303030]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full transition-transform ${
                            prefs.privateProfile
                              ? 'translate-x-5 bg-black'
                              : 'translate-x-0 bg-stone-400'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {subPanel === 'tags_mentions' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-3">
                    <h3 className="text-base font-bold text-white">
                      {t('Gắn thẻ và nhắc đến (@mentions)', 'Tags and mentions')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Chọn ai có thể gắn thẻ hoặc nhắc đến @username của bạn trong bài viết và bình luận.',
                        'Choose who can tag or @mention you in posts and comments.'
                      )}
                    </p>
                    {(
                      [
                        {
                          val: 'everyone',
                          label: t('Mọi thành viên', 'Everyone'),
                        },
                        {
                          val: 'following',
                          label: t(
                            'Chỉ người bạn đang theo dõi',
                            'Profiles you follow'
                          ),
                        },
                        {
                          val: 'no_one',
                          label: t('Không một ai', 'No one'),
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() =>
                          persistUserSettings({
                            ...prefs,
                            tagsAndMentions: opt.val,
                          })
                        }
                        className="w-full p-3.5 rounded-xl bg-[#101010] border border-[#282828] flex items-center justify-between text-sm text-white hover:border-stone-500 cursor-pointer"
                      >
                        <span>{opt.label}</span>
                        {prefs.tagsAndMentions === opt.val && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {subPanel === 'online_status' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-3">
                    <h3 className="text-base font-bold text-white">
                      {t('Trạng thái hoạt động trực tuyến', 'Online status')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Kiểm soát ai có thể nhìn thấy khi bạn đang trực tuyến trên Lữ Hành Việt.',
                        'Choose who can see when you are active online.'
                      )}
                    </p>
                    {(
                      [
                        { val: 'everyone', label: t('Mọi thành viên', 'Anyone') },
                        {
                          val: 'followers',
                          label: t('Người theo dõi', 'Followers'),
                        },
                        {
                          val: 'mutual',
                          label: t(
                            'Bạn bè theo dõi lẫn nhau',
                            'Followers you follow back'
                          ),
                        },
                        { val: 'no_one', label: t('Tắt hiển thị trạng thái', 'No one') },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() =>
                          persistUserSettings({
                            ...prefs,
                            onlineStatus: opt.val,
                          })
                        }
                        className="w-full p-3.5 rounded-xl bg-[#101010] border border-[#282828] flex items-center justify-between text-sm text-white hover:border-stone-500 cursor-pointer"
                      >
                        <span>{opt.label}</span>
                        {prefs.onlineStatus === opt.val && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {subPanel === 'messages' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-3">
                    <h3 className="text-base font-bold text-white">
                      {t(
                        'Quyền riêng tư tin nhắn & Tránh làm phiền',
                        'Message Privacy Controls'
                      )}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Quyết định ai có thể gửi tin nhắn trực tiếp vào hộp thư của bạn.',
                        'Choose who can send direct messages to your inbox.'
                      )}
                    </p>
                    {(
                      [
                        {
                          val: 'everyone',
                          title: t('Mọi thành viên trên Lữ Hành Việt', 'Everyone'),
                          desc: t(
                            'Bất kỳ thành viên nào trên Lữ Hành Việt đều có thể nhắn tin cho bạn.',
                            'Anyone on the platform can message you.'
                          ),
                        },
                        {
                          val: 'mutual',
                          title: t(
                            'Chỉ người đã Follow và được mình Follow lại',
                            'Mutual Followers Only'
                          ),
                          desc: t(
                            'Bảo mật chống làm phiền: Chỉ nhận tin nhắn từ người theo dõi bạn và được bạn theo dõi lại.',
                            'Only receive messages from users who follow you and you follow back.'
                          ),
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() =>
                          persistUserSettings(prefs, opt.val, blockedUsers, mutedConversations)
                        }
                        className="w-full text-left p-4 rounded-xl bg-[#101010] border border-[#282828] flex items-start justify-between gap-3 hover:border-stone-500 cursor-pointer"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{opt.title}</div>
                          <div className="text-xs text-stone-400 mt-1">{opt.desc}</div>
                        </div>
                        {messagePrivacy === opt.val && (
                          <Check className="w-4 h-4 text-white shrink-0 mt-1" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {subPanel === 'restricted' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <h3 className="text-base font-bold text-white">
                      {t('Tài khoản bị hạn chế', 'Restricted profiles')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Bảo vệ bạn khỏi tương tác không mong muốn mà không cần chặn hoặc bỏ theo dõi họ.',
                        'Limit unwanted interactions without having to block or unfollow someone.'
                      )}
                    </p>
                    {restrictedUserObjects.length === 0 ? (
                      <p className="text-xs text-stone-500 py-4 text-center">
                        {t(
                          'Bạn chưa hạn chế tài khoản nào.',
                          "You haven't restricted any profiles."
                        )}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {restrictedUserObjects.map((u) => (
                          <div
                            key={u._id}
                            className="flex items-center justify-between p-3 rounded-xl bg-[#101010] border border-[#282828]"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatar}
                                alt={u.fullName}
                                className="w-9 h-9 rounded-full object-cover"
                              />
                              <div>
                                <div className="text-sm font-bold text-white">
                                  @{u.username}
                                </div>
                                <div className="text-xs text-stone-400">{u.fullName}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                persistUserSettings({
                                  ...prefs,
                                  restrictedProfiles: prefs.restrictedProfiles.filter(
                                    (id) => id !== u._id
                                  ),
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#242424] text-xs font-bold text-white hover:bg-[#303030] cursor-pointer"
                            >
                              {t('Bỏ hạn chế', 'Unrestrict')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subPanel === 'blocked' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <h3 className="text-base font-bold text-white">
                      {t('Danh sách đã chặn', 'Blocked profiles')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Những người bị chặn sẽ không thể nhắn tin, xem bài viết hoặc tìm thấy trang cá nhân của bạn.',
                        'Blocked users cannot message you or interact with your posts.'
                      )}
                    </p>
                    {blockedUserObjects.length === 0 ? (
                      <div className="py-6 text-center text-xs text-stone-500">
                        <UserX className="w-7 h-7 mx-auto mb-2 text-stone-600" />
                        {t('Chưa có tài khoản nào trong danh sách chặn.', 'No blocked profiles.')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {blockedUserObjects.map((u) => (
                          <div
                            key={u._id}
                            className="flex items-center justify-between p-3 rounded-xl bg-[#101010] border border-[#282828]"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatar}
                                alt={u.fullName}
                                className="w-9 h-9 rounded-full object-cover"
                              />
                              <div>
                                <div className="text-sm font-bold text-white">
                                  @{u.username}
                                </div>
                                <div className="text-xs text-stone-400">{u.fullName}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                persistUserSettings(
                                  prefs,
                                  messagePrivacy,
                                  blockedUsers.filter((id) => id !== u._id),
                                  mutedConversations
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-stone-200 cursor-pointer"
                            >
                              {t('Bỏ chặn', 'Unblock')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subPanel === 'private_likes' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {t('Ẩn danh sách bài viết đã thích', 'Private likes')}
                      </h3>
                      <p className="text-xs text-stone-400 mt-1">
                        {t(
                          'Chỉ mình bạn mới có thể nhìn thấy tab các bài viết du lịch mà bạn đã thả tim.',
                          'Only you will be able to see the posts you have liked.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        persistUserSettings({
                          ...prefs,
                          privateLikes: !prefs.privateLikes,
                        })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                        prefs.privateLikes ? 'bg-white' : 'bg-[#303030]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full transition-transform ${
                          prefs.privateLikes
                            ? 'translate-x-5 bg-black'
                            : 'translate-x-0 bg-stone-400'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 2: CONTENT PREFERENCES ================= */}
            {activeTab === 'content_preferences' && !subPanel && (
              <div className="divide-y divide-[#1f1f1f]">
                {/* Muted profiles */}
                <button
                  type="button"
                  data-testid="content-row-muted_profiles"
                  onClick={() => setSubPanel('muted_profiles')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <BellOff className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Tài khoản đã tắt thông báo', 'Muted profiles')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Hidden Words */}
                <button
                  type="button"
                  data-testid="content-row-hidden_words"
                  onClick={() => setSubPanel('hidden_words')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <EyeOff className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Từ khóa & cụm từ bị ẩn', 'Hidden words')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Hide like and share counts */}
                <button
                  type="button"
                  data-testid="content-row-hide_counts"
                  onClick={() => setSubPanel('hide_counts')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <HeartOff className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Ẩn số lượt thích và chia sẻ', 'Hide like and share counts')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Your Algo */}
                <button
                  type="button"
                  data-testid="content-row-your_algo"
                  onClick={() => setSubPanel('your_algo')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Sparkles className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Chủ đề du lịch ưu tiên trên bảng tin', 'Travel feed topics')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Sensitive content */}
                <button
                  type="button"
                  data-testid="content-row-sensitive_content"
                  onClick={() => setSubPanel('sensitive_content')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <ImageOff className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Kiểm soát nội dung nhạy cảm', 'Sensitive content')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>

                {/* Political content */}
                <button
                  type="button"
                  data-testid="content-row-political_content"
                  onClick={() => setSubPanel('political_content')}
                  className="w-full py-4 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Landmark className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-medium text-white">
                      {t('Nội dung thảo luận xã hội & chính sách', 'Social & policy content')}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            )}

            {/* Sub-panels for CONTENT PREFERENCES */}
            {activeTab === 'content_preferences' && subPanel && (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => setSubPanel(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('Quay lại Tùy chọn nội dung', 'Back to Content preferences')}
                </button>

                {subPanel === 'muted_profiles' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <h3 className="text-base font-bold text-white">
                      {t('Tài khoản đã tắt thông báo', 'Muted profiles')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Các tài khoản bạn đã tắt thông báo tin nhắn hoặc bảng tin.',
                        'Accounts you have muted from notifications or feed.'
                      )}
                    </p>
                    {mutedUserObjects.length === 0 ? (
                      <p className="text-xs text-stone-500 py-4 text-center">
                        {t(
                          'Bạn chưa tắt thông báo tài khoản nào.',
                          'You have not muted any profiles.'
                        )}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {mutedUserObjects.map((u) => (
                          <div
                            key={u._id}
                            className="flex items-center justify-between p-3 rounded-xl bg-[#101010] border border-[#282828]"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatar}
                                alt={u.fullName}
                                className="w-9 h-9 rounded-full object-cover"
                              />
                              <div>
                                <div className="text-sm font-bold text-white">
                                  @{u.username}
                                </div>
                                <div className="text-xs text-stone-400">{u.fullName}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                persistUserSettings(
                                  prefs,
                                  messagePrivacy,
                                  blockedUsers,
                                  mutedConversations.filter((id) => id !== u._id)
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-stone-200 cursor-pointer"
                            >
                              {t('Bật lại thông báo', 'Unmute')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subPanel === 'hidden_words' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <h3 className="text-base font-bold text-white">
                      {t('Từ khóa & cụm từ bị ẩn', 'Hidden words')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Tự động ẩn các bình luận và bài viết chứa từ khóa không mong muốn.',
                        'Automatically hide comments and posts containing custom words or phrases.'
                      )}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const word = newHiddenWord.trim();
                        if (!word) return;
                        const nextWords = Array.from(
                          new Set([...prefs.hiddenWords, word])
                        );
                        setNewHiddenWord('');
                        persistUserSettings({ ...prefs, hiddenWords: nextWords });
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={newHiddenWord}
                        onChange={(e) => setNewHiddenWord(e.target.value)}
                        placeholder={t('Nhập từ khóa cần ẩn...', 'Add word or phrase...')}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-stone-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        {t('Thêm', 'Add')}
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      {prefs.hiddenWords.map((word) => (
                        <span
                          key={word}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-xs text-stone-200"
                        >
                          {word}
                          <button
                            type="button"
                            onClick={() =>
                              persistUserSettings({
                                ...prefs,
                                hiddenWords: prefs.hiddenWords.filter((w) => w !== word),
                              })
                            }
                            className="text-stone-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {subPanel === 'hide_counts' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {t('Ẩn số lượt thích và chia sẻ', 'Hide like and share counts')}
                      </h3>
                      <p className="text-xs text-stone-400 mt-1">
                        {t(
                          'Ẩn tổng số lượt thích và chia sẻ trên các bài viết nhật ký để tập trung vào trải nghiệm nội dung.',
                          'Hide like and share counts on posts across your feed.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        persistUserSettings({
                          ...prefs,
                          hideLikeAndShareCounts: !prefs.hideLikeAndShareCounts,
                        })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                        prefs.hideLikeAndShareCounts ? 'bg-white' : 'bg-[#303030]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full transition-transform ${
                          prefs.hideLikeAndShareCounts
                            ? 'translate-x-5 bg-black'
                            : 'translate-x-0 bg-stone-400'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {subPanel === 'your_algo' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-4">
                    <h3 className="text-base font-bold text-white">
                      {t('Chủ đề du lịch ưu tiên trên bảng tin', 'Travel feed topics')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Chủ đề du lịch được ưu tiên gợi ý trên bảng tin của bạn.',
                        'Customize travel topics prioritized in your feed algorithm.'
                      )}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const topic = newAlgoTopic.trim();
                        if (!topic) return;
                        setNewAlgoTopic('');
                        persistUserSettings({
                          ...prefs,
                          yourAlgoTopics: Array.from(
                            new Set([...prefs.yourAlgoTopics, topic])
                          ),
                        });
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={newAlgoTopic}
                        onChange={(e) => setNewAlgoTopic(e.target.value)}
                        placeholder={t('Thêm chủ đề yêu thích...', 'Add travel topic...')}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-stone-200 cursor-pointer"
                      >
                        {t('Thêm', 'Add')}
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      {prefs.yourAlgoTopics.map((topic) => (
                        <span
                          key={topic}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101010] border border-[#2c2c2c] text-xs text-stone-200"
                        >
                          {topic}
                          <button
                            type="button"
                            onClick={() =>
                              persistUserSettings({
                                ...prefs,
                                yourAlgoTopics: prefs.yourAlgoTopics.filter(
                                  (tItem) => tItem !== topic
                                ),
                              })
                            }
                            className="text-stone-500 hover:text-rose-400 cursor-pointer"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {subPanel === 'sensitive_content' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] space-y-3">
                    <h3 className="text-base font-bold text-white">
                      {t('Kiểm soát nội dung nhạy cảm', 'Sensitive content')}
                    </h3>
                    <p className="text-xs text-stone-400">
                      {t(
                        'Chọn mức độ hiển thị nội dung nhạy cảm từ các tài khoản bạn chưa theo dõi.',
                        'Choose how much sensitive content to see from accounts you do not follow.'
                      )}
                    </p>
                    {(
                      [
                        { val: 'less', label: t('Ẩn bớt nội dung nhạy cảm', 'Less') },
                        { val: 'standard', label: t('Mức tiêu chuẩn', 'Standard') },
                        { val: 'more', label: t('Hiển thị nhiều hơn', 'More') },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() =>
                          persistUserSettings({
                            ...prefs,
                            sensitiveContent: opt.val,
                          })
                        }
                        className="w-full p-3.5 rounded-xl bg-[#101010] border border-[#282828] flex items-center justify-between text-sm text-white hover:border-stone-500 cursor-pointer"
                      >
                        <span>{opt.label}</span>
                        {prefs.sensitiveContent === opt.val && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {subPanel === 'political_content' && (
                  <div className="p-5 rounded-2xl bg-[#161616] border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {t('Nội dung thảo luận xã hội & chính sách', 'Social & policy content')}
                      </h3>
                      <p className="text-xs text-stone-400 mt-1">
                        {t(
                          'Đề xuất các bài thảo luận xã hội & chính sách du lịch trên bảng tin.',
                          'Suggest social and policy discussions in your recommendations.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        persistUserSettings({
                          ...prefs,
                          politicalContent: !prefs.politicalContent,
                        })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                        prefs.politicalContent ? 'bg-white' : 'bg-[#303030]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full transition-transform ${
                          prefs.politicalContent
                            ? 'translate-x-5 bg-black'
                            : 'translate-x-0 bg-stone-400'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 3: ACCOUNT STATUS ================= */}
            {activeTab === 'account_status' && (
              <div className="space-y-6">
                {/* User Identity Card */}
                <div className="rounded-2xl border border-[#2c2c2c] bg-[#141414] p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={user.avatar}
                      alt={user.fullName}
                      className="w-12 h-12 rounded-full object-cover border border-[#333333]"
                    />
                    <div>
                      <div className="text-[15px] font-bold text-white">
                        @{user.username}
                      </div>
                      <div className="text-sm text-stone-300">{user.fullName}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('Hoạt động tốt', 'Good standing')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-[15px] font-bold text-white">
                    {t(
                      'Kiểm duyệt & Tuân thủ tiêu chuẩn cộng đồng',
                      'Community compliance & moderation status'
                    )}
                  </h2>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {t(
                      'Xem các thông báo kiểm duyệt từ Lữ Hành Việt nếu hồ sơ hoặc bài viết của bạn vi phạm tiêu chuẩn cộng đồng.',
                      "See any moderation actions Lữ Hành Việt has taken if your profile or content doesn't follow community guidelines."
                    )}{' '}
                    <span className="underline text-stone-300 cursor-pointer">
                      {t('Tìm hiểu thêm', 'Learn more')}
                    </span>
                  </p>
                </div>

                <div className="divide-y divide-[#1f1f1f]">
                  {[
                    {
                      id: 'removed_content',
                      label: t(
                        'Nội dung bị gỡ hoặc giới hạn nhắn tin',
                        'Removed content and messaging issues'
                      ),
                      detail: t(
                        'Không có bài viết hoặc tin nhắn nào của bạn bị gỡ do vi phạm tiêu chuẩn cộng đồng.',
                        'No posts or messages have been removed for violating community guidelines.'
                      ),
                    },
                    {
                      id: 'lowered_feed',
                      label: t(
                        'Phân phối bài viết trên bảng tin cộng đồng',
                        'Content distribution in feed'
                      ),
                      detail: t(
                        'Nội dung của bạn đang được phân phối bình thường trên bảng tin cộng đồng.',
                        'Your content is distributed normally across the community feed.'
                      ),
                    },
                    {
                      id: 'features_cant_use',
                      label: t(
                        'Quyền sử dụng các tính năng trên hệ thống',
                        'Feature access permissions'
                      ),
                      detail: t(
                        'Bạn có toàn quyền sử dụng tất cả tính năng: Đăng bài, Bình luận, Nhắn tin và Chia sẻ.',
                        'You have full access to all features including Posting, Commenting, and Messaging.'
                      ),
                    },
                  ].map((item) => (
                    <div key={item.id} className="py-4 px-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSubPanel(subPanel === item.id ? null : item.id)
                        }
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                      >
                        <span className="text-[15px] font-medium text-white">
                          {item.label}
                        </span>
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                          <ChevronRight className="w-4 h-4 text-stone-500" />
                        </div>
                      </button>
                      {subPanel === item.id && (
                        <p className="mt-2.5 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-3">
                          {item.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= TAB 4: HELP ================= */}
            {activeTab === 'help' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setSubPanel(subPanel === 'privacy_help' ? null : 'privacy_help')
                  }
                  className="w-full py-3.5 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <span className="text-[15px] font-medium text-white">
                    {t('Hướng dẫn bảo mật & quyền riêng tư', 'Privacy and security help')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
                {subPanel === 'privacy_help' && (
                  <div className="p-4 rounded-2xl bg-[#161616] border border-[#2a2a2a] text-xs text-stone-300 space-y-2">
                    <p className="font-bold text-white">
                      {t('Hỗ trợ Quyền riêng tư & Bảo mật', 'Privacy & Security Guide')}
                    </p>
                    <p>
                      {t(
                        'Bạn có thể đổi mật khẩu trực tiếp hoặc yêu cầu mã OTP 6 số gửi qua Email trong mục Trung tâm Tài khoản ở cột bên trái.',
                        'You can change your password or request a 6-digit Email OTP code inside the Account Center tab on the left.'
                      )}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setSubPanel(subPanel === 'support_requests' ? null : 'support_requests')
                  }
                  className="w-full py-3.5 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                >
                  <span className="text-[15px] font-medium text-white">
                    {t('Yêu cầu hỗ trợ & Khiếu nại', 'Support requests')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
                {subPanel === 'support_requests' && (
                  <div className="p-4 rounded-2xl bg-[#161616] border border-[#2a2a2a] text-xs text-stone-300">
                    {t(
                      'Hiện tại bạn không có yêu cầu hỗ trợ hoặc khiếu nại vi phạm nào đang chờ xử lý.',
                      'You currently have no open support or report requests.'
                    )}
                  </div>
                )}

                <div className="border-t border-[#242424] my-3" />

                {[
                  {
                    id: 'help_center',
                    title: t('Trung tâm trợ giúp Lữ Hành Việt', 'Lữ Hành Việt Help Center'),
                    info: t(
                      'Trung tâm trợ giúp cộng đồng Lữ Hành Việt — Hướng dẫn đăng bài nhật ký, gắn thẻ tọa độ và bảo mật tài khoản.',
                      'Lữ Hành Việt Help Center — Guides for posting travel logs, tagging locations, and securing your account.'
                    ),
                  },
                  {
                    id: 'privacy_policy',
                    title: t(
                      'Chính sách quyền riêng tư Lữ Hành Việt',
                      'Lữ Hành Việt Privacy Policy'
                    ),
                    info: t(
                      'Chính sách quyền riêng tư: Dữ liệu hành trình và email của bạn được mã hóa và bảo vệ an toàn trên MongoDB Atlas.',
                      'Privacy Policy: Your travel journals and email are encrypted and protected.'
                    ),
                  },
                  {
                    id: 'terms_of_use',
                    title: t('Điều khoản sử dụng dịch vụ', 'Terms of Service'),
                    info: t(
                      'Điều khoản sử dụng: Tôn trọng bản quyền hình ảnh và chia sẻ thông tin du lịch trung thực, văn minh.',
                      'Terms of Use: Share authentic travel experiences and respect community standards.'
                    ),
                  },
                  {
                    id: 'messaging_otp_policy',
                    title: t(
                      'Quy định bảo mật Tin nhắn & Xác thực OTP',
                      'Messaging & OTP Security Policy'
                    ),
                    info: t(
                      'Chính sách bảo mật bổ sung cho tính năng Nhắn tin trực tiếp 1-1 và Xác thực mã OTP 6 chữ số qua Email.',
                      'Supplemental Security Policy covering 1-on-1 Direct Messaging and Email OTP verification.'
                    ),
                  },
                  {
                    id: 'community_guidelines',
                    title: t(
                      'Tiêu chuẩn cộng đồng du lịch văn minh',
                      'Community Guidelines'
                    ),
                    info: t(
                      'Quy tắc ứng xử khi bình luận, gắn thẻ @mention và báo cáo bài viết vi phạm trên cộng đồng Lữ Hành Việt.',
                      'Community rules for commenting, @mentioning, and reporting posts.'
                    ),
                  },
                  {
                    id: 'cookies_policy',
                    title: t(
                      'Chính sách Cookie & Phiên đăng nhập',
                      'Cookies & Session Policy'
                    ),
                    info: t(
                      'Chính sách Cookie: Chỉ sử dụng phiên đăng nhập JWT và tùy chọn giao diện Sáng/Tối.',
                      'Cookies Policy: Used strictly for JWT authentication sessions and theme preferences.'
                    ),
                  },
                ].map((linkItem) => (
                  <div key={linkItem.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSubPanel(
                          subPanel === linkItem.id ? null : linkItem.id
                        )
                      }
                      className="w-full py-3.5 px-2 flex items-center justify-between hover:bg-[#181818] rounded-xl transition-colors cursor-pointer"
                    >
                      <span className="text-[15px] font-medium text-white">
                        {linkItem.title}
                      </span>
                      <ExternalLink className="w-4 h-4 text-stone-400" />
                    </button>
                    {subPanel === linkItem.id && (
                      <div className="p-3.5 mb-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-xs text-stone-400">
                        {linkItem.info}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ================= TAB 5: ACCOUNT CENTER (Đổi mật khẩu, Quên mật khẩu & Xác thực Email) ================= */}
            {activeTab === 'meta_account' && (
              <div className="space-y-6">
                {/* Personal Details & Email Verification Status Card */}
                <div className="rounded-2xl border border-[#2c2c2c] bg-[#151515] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <img
                        src={user.avatar}
                        alt={user.fullName}
                        className="w-12 h-12 rounded-full object-cover border border-[#333333]"
                      />
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {user.fullName}{' '}
                          <span className="text-stone-400 font-normal">
                            (@{user.username})
                          </span>
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {t('Đã xác thực Email', 'Email Verified')}
                    </span>
                  </div>
                </div>

                {/* Change Password & Receive OTP via Email Section */}
                <div className="rounded-2xl border border-[#2c2c2c] bg-[#151515] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242424] pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <KeyRound className="w-5 h-5 text-white" />
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {t(
                            'Đổi mật khẩu & Khôi phục qua mã Email',
                            'Change Password & Email OTP Security'
                          )}
                        </h3>
                        <p className="text-xs text-stone-400">
                          {t(
                            'Đổi mật khẩu bằng mật khẩu hiện tại hoặc nhận mã OTP 6 chữ số gửi về Email (dùng khi quên mật khẩu hiện tại).',
                            'Update your password using your current password or a 6-digit OTP code sent to your email.'
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mode Switcher: Current Password vs Email OTP */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0e0e0e] border border-[#262626]">
                    <button
                      type="button"
                      data-testid="pwd-mode-current"
                      onClick={() => setPwdMode('current_password')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        pwdMode === 'current_password'
                          ? 'bg-[#262626] text-white'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {t('Dùng mật khẩu hiện tại', 'Use Current Password')}
                    </button>
                    <button
                      type="button"
                      data-testid="pwd-mode-email-otp"
                      onClick={() => setPwdMode('email_otp')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        pwdMode === 'email_otp'
                          ? 'bg-[#262626] text-white'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {t('Quên mật khẩu? Nhận mã qua Email', 'Receive Code via Email')}
                    </button>
                  </div>

                  <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                    {pwdMode === 'current_password' ? (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                          {t('Mật khẩu hiện tại', 'Current Password')}
                        </label>
                        <input
                          type="password"
                          required
                          data-testid="settings-current-password-input"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0e0e0e] border border-[#262626]">
                          <div className="text-xs text-stone-300">
                            {t('Nhận mã bảo mật 6 số qua hộp thư Gmail:', 'Send 6-digit code to Gmail:')}{' '}
                            <strong className="text-white">{user.email}</strong>
                          </div>
                          <button
                            type="button"
                            data-testid="settings-send-email-otp-btn"
                            onClick={() => executeSendChangePasswordOtp(false)}
                            disabled={sendingOtp}
                            className="px-3.5 py-2 rounded-xl bg-white hover:bg-stone-200 text-black text-xs font-bold transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                          >
                            {sendingOtp
                              ? t('Đang gửi mã vào Gmail...', 'Sending to Gmail...')
                              : t('Nhận mã qua Email', 'Send Email Code')}
                          </button>
                        </div>

                        {otpNeedsReconnect && (
                          <button
                            type="button"
                            onClick={() => executeSendChangePasswordOtp(true)}
                            disabled={sendingOtp}
                            className="w-full py-2.5 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {t(
                              'Kết nối Gmail & Gửi mã ngay',
                              'Connect Gmail & Send Code Now'
                            )}
                          </button>
                        )}

                        {otpSentNotice && (
                          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2">
                            <MailCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{otpSentNotice}</span>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                            {t(
                              'Mã xác nhận 6 số trong hộp thư Email của bạn',
                              '6-Digit Code from Your Email Inbox'
                            )}
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            data-testid="settings-otp-input"
                            value={emailOtpCode}
                            onChange={(e) =>
                              setEmailOtpCode(
                                e.target.value.replace(/\D/g, '').slice(0, 6)
                              )
                            }
                            placeholder={t(
                              'Nhập 6 chữ số từ hộp thư Gmail',
                              'Enter 6-digit code from Gmail'
                            )}
                            className="w-full px-4 py-2.5 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] font-mono text-base font-bold tracking-[0.25em] text-center text-white focus:outline-none focus:border-stone-400"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                          {t('Mật khẩu mới (tối thiểu 6 ký tự)', 'New Password')}
                        </label>
                        <input
                          type="password"
                          required
                          data-testid="settings-new-password-input"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                          {t('Xác nhận mật khẩu mới', 'Confirm New Password')}
                        </label>
                        <input
                          type="password"
                          required
                          data-testid="settings-confirm-password-input"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] text-sm text-white focus:outline-none focus:border-stone-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      data-testid="settings-save-password-btn"
                      disabled={pwdSubmitting}
                      className="w-full py-3 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {pwdSubmitting
                        ? t('Đang cập nhật mật khẩu...', 'Updating password...')
                        : t('Cập nhật mật khẩu mới', 'Update Password')}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ================= TAB 6: TIME MANAGEMENT & DIGITAL WELLBEING ================= */}
            {activeTab === 'supervision' && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-[#151515] border border-[#2a2a2a] space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {t(
                          'Quản lý thời gian & Sức khỏe số',
                          'Time Management & Digital Wellbeing'
                        )}
                      </h3>
                      <p className="text-xs text-stone-400 mt-1">
                        {t(
                          'Thiết lập giới hạn thời gian sử dụng mỗi ngày và chế độ nghỉ ngơi ban đêm để bảo vệ sức khỏe số.',
                          'Set daily time limits and scheduled breaks for healthier digital habits.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        persistUserSettings({
                          ...prefs,
                          teenSupervisionEnabled: !prefs.teenSupervisionEnabled,
                        })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                        prefs.teenSupervisionEnabled ? 'bg-white' : 'bg-[#303030]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full transition-transform ${
                          prefs.teenSupervisionEnabled
                            ? 'translate-x-5 bg-black'
                            : 'translate-x-0 bg-stone-400'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="pt-3 border-t border-[#242424] flex items-center justify-between">
                    <span className="text-sm text-stone-200">
                      {t('Chế độ nghỉ đêm (22:00 - 06:00)', 'Sleep mode (10 PM - 6 AM)')}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        persistUserSettings({
                          ...prefs,
                          sleepModeEnabled: !prefs.sleepModeEnabled,
                        })
                      }
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
                        prefs.sleepModeEnabled ? 'bg-white' : 'bg-[#303030]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full transition-transform ${
                          prefs.sleepModeEnabled
                            ? 'translate-x-5 bg-black'
                            : 'translate-x-0 bg-stone-400'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 7: MORE SETTINGS ================= */}
            {activeTab === 'more_settings' && (
              <div className="space-y-4">
                {/* Language Switch */}
                <div className="p-4 rounded-2xl bg-[#151515] border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-sm font-bold text-white">
                        {t('Ngôn ngữ hiển thị', 'Display Language')}
                      </div>
                      <div className="text-xs text-stone-400">
                        {language === 'vi' ? 'Tiếng Việt (VN)' : 'English (EN)'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLanguage('vi')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        language === 'vi'
                          ? 'bg-white text-black'
                          : 'bg-[#242424] text-stone-300'
                      }`}
                    >
                      Tiếng Việt
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        language === 'en'
                          ? 'bg-white text-black'
                          : 'bg-[#242424] text-stone-300'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>

                {/* Theme Switch */}
                <div className="p-4 rounded-2xl bg-[#151515] border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="w-5 h-5 text-white" />
                    ) : (
                      <Sun className="w-5 h-5 text-white" />
                    )}
                    <div>
                      <div className="text-sm font-bold text-white">
                        {t('Giao diện Sáng / Tối', 'Appearance Theme')}
                      </div>
                      <div className="text-xs text-stone-400">
                        {theme === 'dark'
                          ? t('Chế độ Tối (Dark)', 'Dark mode')
                          : t('Chế độ Sáng (Light)', 'Light mode')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="px-3.5 py-2 rounded-xl bg-[#242424] hover:bg-[#303030] text-xs font-bold text-white cursor-pointer"
                  >
                    {t('Chuyển chế độ', 'Switch theme')}
                  </button>
                </div>

                {/* Shortcut to Change Password */}
                <div className="p-4 rounded-2xl bg-[#151515] border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <KeyRound className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-sm font-bold text-white">
                        {t('Đổi mật khẩu & Mã bảo mật Email', 'Password & Email OTP')}
                      </div>
                      <div className="text-xs text-stone-400">
                        {t(
                          'Thay đổi mật khẩu hoặc nhận mã xác thực qua thư',
                          'Change password or request OTP code via email'
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('meta_account')}
                    className="px-3.5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-stone-200 cursor-pointer"
                  >
                    {t('Mở cài đặt mật khẩu', 'Open Password Settings')}
                  </button>
                </div>

                {/* Sign out */}
                <div className="p-4 rounded-2xl bg-[#151515] border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <div>
                      <div className="text-sm font-bold text-rose-400">
                        {t('Đăng xuất khỏi thiết bị này', 'Log out of this account')}
                      </div>
                      <div className="text-xs text-stone-400">@{user.username}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-bold cursor-pointer"
                  >
                    {t('Đăng xuất', 'Log out')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer status */}
          <div className="pt-6 mt-6 border-t border-[#1e1e1e] flex items-center justify-between text-[11px] text-stone-500">
            <span>
              {t(
                'Lữ Hành Việt • Trung tâm Cài đặt & Bảo mật',
                'Lữ Hành Việt • Settings & Privacy Center'
              )}
            </span>
            <span>
              {savingSettings ? t('Đang đồng bộ...', 'Syncing...') : `@${user.username}`}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
