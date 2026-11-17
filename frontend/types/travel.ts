export type UserRole = 'member' | 'admin';

export type MessagePrivacySetting = 'everyone' | 'mutual';

export interface UserSettingsPreferences {
  // Privacy tab
  privateProfile: boolean;
  tagsAndMentions: 'everyone' | 'following' | 'no_one';
  onlineStatus: 'everyone' | 'followers' | 'mutual' | 'no_one';
  restrictedProfiles: string[];
  privateLikes: boolean;
  // Content preferences tab
  hiddenWords: string[];
  hideLikeAndShareCounts: boolean;
  yourAlgoTopics: string[];
  sensitiveContent: 'less' | 'standard' | 'more';
  politicalContent: boolean;
  // Supervision for Teen Accounts
  teenSupervisionEnabled: boolean;
  dailyTimeLimitMinutes: number;
  sleepModeEnabled: boolean;
  // Security & Meta Account Center
  twoFactorEmailOtp: boolean;
  loginAlerts: boolean;
}

export interface EmailVerificationLetter {
  id: string;
  to: string;
  recipientName: string;
  subject: string;
  purpose: 'register_verify' | 'forgot_password' | 'change_password';
  otpCode: string;
  expiresAt: string;
  sentAt: string;
  deliveryChannel: 'smtp_and_inbox' | 'virtual_inbox';
  smtpStatus?: string;
}

export interface User {
  _id: string;
  fullName: string;
  username: string;
  email: string;
  emailVerified?: boolean;
  role: UserRole;
  avatar: string;
  coverImage?: string;
  bio: string;
  homeCity: string;
  followers: string[]; // User IDs who follow this user
  following: string[]; // User IDs this user follows
  savedPosts: string[]; // Bookmarked post IDs
  isLocked: boolean;
  createdAt: string;
  // Cài đặt quyền riêng tư & quản lý hộp thư tin nhắn
  messagePrivacy?: MessagePrivacySetting; // 'everyone' | 'mutual' (chỉ người follow lẫn nhau)
  pinnedConversations?: string[]; // Partner user IDs đã ghim
  archivedConversations?: string[]; // Partner user IDs đã lưu trữ
  mutedConversations?: string[]; // Partner user IDs đã tắt thông báo
  blockedUsers?: string[]; // User IDs đã chặn
  deletedConversationsAt?: Record<string, string>; // partnerId -> ISO timestamp xóa hội thoại
  settings?: UserSettingsPreferences;
  isOnline?: boolean;
  lastActiveAt?: string | null;
}

export type PostVisibility = 'public' | 'followers';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface TravelPost {
  _id: string;
  authorId: string;
  author?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar' | 'role'>;
  title: string;
  content: string;
  images: string[]; // Max 6 images
  location: string;
  provinceOrCountry: string;
  coordinates: GeoCoordinates;
  tripDate: string;
  durationDays: number;
  cost: number; // VND
  hashtags: string[];
  visibility: PostVisibility;
  likes: string[]; // Array of User IDs
  commentCount: number;
  reportCount?: number;
  status: 'active' | 'hidden';
  createdAt: string;
  updatedAt: string;
}

export interface PostComment {
  _id: string;
  postId: string;
  authorId: string;
  author?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar' | 'role'>;
  content: string;
  images?: string[]; // Up to 3 attached images in a comment/reply
  mentions?: string[]; // Mentioned @usernames
  parentId: string | null; // null for root comment, root comment _id for 1-level reply
  createdAt: string;
}

export interface CommentThread extends PostComment {
  replies: PostComment[];
}

export type NotificationType = 'like' | 'comment' | 'reply' | 'follow' | 'system';

export interface NotificationItem {
  _id: string;
  recipientId: string;
  senderId: string;
  sender?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar'>;
  type: NotificationType;
  postId?: string;
  postTitle?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PostReport {
  _id: string;
  postId: string;
  post?: Pick<TravelPost, '_id' | 'title' | 'location' | 'authorId' | 'status'>;
  reporterId: string;
  reporter?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar'>;
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
}

export interface LocationStat {
  location: string;
  provinceOrCountry: string;
  coordinates: GeoCoordinates;
  postCount: number;
  totalLikes: number;
  avgCost: number;
  sampleImage: string;
  recentPostId: string;
}

export interface DirectMessageReplyPreview {
  _id: string;
  senderId: string;
  senderName?: string;
  content: string;
  hasImages?: boolean;
}

export interface DirectMessage {
  _id: string;
  senderId: string;
  recipientId: string;
  sender?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar' | 'role'>;
  recipient?: Pick<User, '_id' | 'fullName' | 'username' | 'avatar' | 'role'>;
  content: string;
  images?: string[]; // Up to 3 attached images in a chat message
  replyToMessageId?: string | null;
  replyTo?: DirectMessageReplyPreview | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  reactions?: Record<string, string>;
  isForwarded?: boolean;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  partner: Pick<
    User,
    | '_id'
    | 'fullName'
    | 'username'
    | 'avatar'
    | 'role'
    | 'homeCity'
    | 'bio'
    | 'messagePrivacy'
    | 'isOnline'
    | 'lastActiveAt'
  >;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  isOnline?: boolean;
  lastActiveAt?: string | null;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  isBlockedByMe?: boolean;
  isBlockingMe?: boolean;
  isMutualFollow?: boolean;
}
