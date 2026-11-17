import mongoose, { Schema, type Model } from 'mongoose';
import type { DatabaseSchema, UserRecord } from '../db.ts';
import type {
  DirectMessage,
  NotificationItem,
  PostComment,
  PostReport,
  TravelPost,
} from '../../frontend/types/travel.ts';

/**
 * Thiết kế CSDL MongoDB với Mongoose (Đề tài số 5 - Nhật ký du lịch)
 * Gồm 6 Collections có liên kết tham chiếu (_id):
 * 1. User (users)
 * 2. TravelPost (posts) - tham chiếu authorId -> User._id, likes -> [User._id]
 * 3. PostComment (comments) - tham chiếu postId -> TravelPost._id, authorId -> User._id, parentId -> PostComment._id (1 cấp)
 * 4. Notification (notifications) - tham chiếu recipientId, senderId -> User._id, postId -> TravelPost._id
 * 5. PostReport (reports) - tham chiếu postId -> TravelPost._id, reporterId -> User._id
 * 6. DirectMessage (messages) - tham chiếu senderId, recipientId -> User._id (nhắn tin trực tiếp 1-1)
 */

const userSchema = new Schema<UserRecord>(
  {
    _id: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    emailVerified: { type: Boolean, default: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 300 },
    homeCity: { type: String, default: 'Việt Nam' },
    followers: [{ type: String, ref: 'User' }],
    following: [{ type: String, ref: 'User' }],
    savedPosts: [{ type: String, ref: 'TravelPost' }],
    isLocked: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
    messagePrivacy: {
      type: String,
      enum: ['everyone', 'mutual'],
      default: 'everyone',
    },
    pinnedConversations: [{ type: String, ref: 'User' }],
    archivedConversations: [{ type: String, ref: 'User' }],
    mutedConversations: [{ type: String, ref: 'User' }],
    blockedUsers: [{ type: String, ref: 'User' }],
    deletedConversationsAt: { type: Schema.Types.Mixed, default: {} },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { collection: 'users', versionKey: false }
);

const travelPostSchema = new Schema<TravelPost>(
  {
    _id: { type: String, required: true },
    authorId: { type: String, ref: 'User', required: true, index: true },
    title: { type: String, required: true, minlength: 5, maxlength: 120 },
    content: { type: String, required: true, minlength: 20 },
    images: [{ type: String }],
    location: { type: String, required: true, index: true },
    provinceOrCountry: { type: String, required: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    tripDate: { type: String, required: true },
    durationDays: { type: Number, default: 3 },
    cost: { type: Number, min: 0, required: true },
    hashtags: [{ type: String, index: true }],
    visibility: { type: String, enum: ['public', 'followers'], default: 'public' },
    likes: [{ type: String, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'hidden'], default: 'active' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'posts', versionKey: false }
);

const postCommentSchema = new Schema<PostComment>(
  {
    _id: { type: String, required: true },
    postId: { type: String, ref: 'TravelPost', required: true, index: true },
    authorId: { type: String, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 600 },
    images: [{ type: String }],
    mentions: [{ type: String }],
    parentId: { type: String, ref: 'PostComment', default: null },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'comments', versionKey: false }
);

const notificationSchema = new Schema<NotificationItem>(
  {
    _id: { type: String, required: true },
    recipientId: { type: String, ref: 'User', required: true, index: true },
    senderId: { type: String, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['like', 'comment', 'reply', 'follow', 'system'],
      default: 'system',
    },
    postId: { type: String, ref: 'TravelPost' },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'notifications', versionKey: false }
);

const postReportSchema = new Schema<PostReport>(
  {
    _id: { type: String, required: true },
    postId: { type: String, ref: 'TravelPost', required: true },
    reporterId: { type: String, ref: 'User', required: true },
    reason: { type: String, required: true },
    details: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
    },
    createdAt: { type: String, default: () => new Date().toISOString() },
    resolvedAt: { type: String },
  },
  { collection: 'reports', versionKey: false }
);

const directMessageSchema = new Schema<DirectMessage>(
  {
    _id: { type: String, required: true },
    senderId: { type: String, ref: 'User', required: true, index: true },
    recipientId: { type: String, ref: 'User', required: true, index: true },
    content: { type: String, default: '', maxlength: 2000 },
    images: [{ type: String }],
    replyToMessageId: { type: String, default: null },
    replyTo: { type: Schema.Types.Mixed, default: null },
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: String, default: null },
    pinnedBy: { type: String, default: null },
    reactions: { type: Schema.Types.Mixed, default: () => ({}) },
    isForwarded: { type: Boolean, default: false },
    isRead: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString(), index: true },
  },
  { collection: 'messages', versionKey: false }
);

export const UserModel: Model<UserRecord> =
  (mongoose.models.User as Model<UserRecord>) ||
  mongoose.model<UserRecord>('User', userSchema);

export const TravelPostModel: Model<TravelPost> =
  (mongoose.models.TravelPost as Model<TravelPost>) ||
  mongoose.model<TravelPost>('TravelPost', travelPostSchema);

export const PostCommentModel: Model<PostComment> =
  (mongoose.models.PostComment as Model<PostComment>) ||
  mongoose.model<PostComment>('PostComment', postCommentSchema);

export const NotificationModel: Model<NotificationItem> =
  (mongoose.models.Notification as Model<NotificationItem>) ||
  mongoose.model<NotificationItem>('Notification', notificationSchema);

export const PostReportModel: Model<PostReport> =
  (mongoose.models.PostReport as Model<PostReport>) ||
  mongoose.model<PostReport>('PostReport', postReportSchema);

export const DirectMessageModel: Model<DirectMessage> =
  (mongoose.models.DirectMessage as Model<DirectMessage>) ||
  mongoose.model<DirectMessage>('DirectMessage', directMessageSchema);

let mongoConnectPromise: Promise<boolean> | null = null;
let collectionsInitialized = false;
let lastMongoHydratedAt = 0;
let lastMongoMutationAt = 0;
let inFlightMongoHydration: Promise<boolean> | null = null;

export function hasCompletedInitialMongoHydration(): boolean {
  return lastMongoHydratedAt > 0;
}

export function markMongoStateMutated(): void {
  const now = Date.now();
  lastMongoMutatedAt(now);
}

function lastMongoMutatedAt(ts: number): void {
  lastMongoMutationAt = ts;
  lastMongoHydratedAt = ts;
}

const DEFAULT_ATLAS_URI =
  'mongodb+srv://quannhb25cc192_db_user:MZARUNn5IvNf6CsU@quan.zp4peuw.mongodb.net/travel_journal?retryWrites=true&w=majority';

/**
 * Chuẩn hóa chuỗi kết nối MONGODB_URI
 */
export function resolveMongoUri(): string | null {
  const raw = process.env.MONGODB_URI?.trim();
  if (!raw || raw.includes('<db_password>') || raw === 'MY_MONGODB_URI') {
    return DEFAULT_ATLAS_URI;
  }

  if (!raw.startsWith('mongodb://') && !raw.startsWith('mongodb+srv://')) {
    return `mongodb+srv://quannhb25cc192_db_user:${encodeURIComponent(
      raw
    )}@quan.zp4peuw.mongodb.net/travel_journal?retryWrites=true&w=majority`;
  }

  if (raw.endsWith('.mongodb.net/')) {
    return `${raw}travel_journal?retryWrites=true&w=majority`;
  }
  if (raw.includes('.mongodb.net/?')) {
    return raw.replace('.mongodb.net/?', '.mongodb.net/travel_journal?');
  }

  return raw;
}

/**
 * Khởi tạo đủ 6 bảng (Collections) và Indexes trên MongoDB Atlas ngay khi kết nối
 */
export async function initializeFiveMongoCollections(): Promise<boolean> {
  const models = [
    UserModel,
    TravelPostModel,
    PostCommentModel,
    NotificationModel,
    PostReportModel,
    DirectMessageModel,
  ];
  for (const model of models) {
    try {
      await model.createCollection();
    } catch {
      // Collection đã tồn tại
    }
    try {
      await model.createIndexes();
    } catch {
      // Index đã tồn tại
    }
  }
  collectionsInitialized = true;
  return true;
}

/**
 * Kết nối tới MongoDB Atlas
 */
export async function ensureMongoConnected(): Promise<boolean> {
  const uri = resolveMongoUri();
  if (!uri) {
    return false;
  }
  if (mongoose.connection.readyState === 1) {
    if (!collectionsInitialized) {
      await initializeFiveMongoCollections();
    }
    return true;
  }
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then(async () => {
        await initializeFiveMongoCollections();
        return true;
      })
      .catch(() => {
        mongoConnectPromise = null;
        return false;
      });
  }
  return mongoConnectPromise;
}

/**
 * Đọc dữ liệu từ 6 Collections trong MongoDB vào bộ nhớ của ứng dụng
 */
export async function hydrateMemoryStateFromMongo(
  targetState: DatabaseSchema,
  force = false
): Promise<boolean> {
  const now = Date.now();
  if (!force && lastMongoHydratedAt > 0 && now - lastMongoHydratedAt < 300_000) {
    return true;
  }
  const connected = await ensureMongoConnected();
  if (!connected) {
    lastMongoHydratedAt = Date.now();
    return false;
  }
  if (inFlightMongoHydration) {
    return inFlightMongoHydration;
  }
  const hydrationStartedAt = Date.now();
  inFlightMongoHydration = (async () => {
    try {
      const [users, posts, comments, notifications, reports, messages] =
        await Promise.all([
          UserModel.find().lean(),
          TravelPostModel.find().sort({ createdAt: -1 }).lean(),
          PostCommentModel.find().sort({ createdAt: 1 }).lean(),
          NotificationModel.find().sort({ createdAt: -1 }).lean(),
          PostReportModel.find().sort({ createdAt: -1 }).lean(),
          DirectMessageModel.find().sort({ createdAt: 1 }).lean(),
        ]);
      if (!force && lastMongoMutationAt >= hydrationStartedAt) {
        return true;
      }
      lastMongoHydratedAt = Date.now();
      targetState.users = users as UserRecord[];
      targetState.posts = posts as TravelPost[];
      targetState.comments = comments as PostComment[];
      targetState.notifications = notifications as NotificationItem[];
      targetState.reports = reports as PostReport[];
      targetState.messages = (messages as DirectMessage[]) || [];

      const { externalizeEmbeddedBase64InState, db: dbInstance } = await import(
        '../db.ts'
      );
      if (externalizeEmbeddedBase64InState(targetState)) {
        dbInstance.save();
      }
      return true;
    } catch {
      return false;
    } finally {
      inFlightMongoHydration = null;
    }
  })();
  return inFlightMongoHydration;
}

/**
 * Đồng bộ toàn bộ trạng thái hiện tại xuống 6 Collections của MongoDB Atlas
 */
export async function syncSnapshotToMongo(snapshot: DatabaseSchema): Promise<void> {
  lastMongoMutatedAt(Date.now());
  const connected = await ensureMongoConnected();
  if (!connected) {
    return;
  }
  try {
    await Promise.all([
      ...snapshot.users.map((u) =>
        UserModel.updateOne({ _id: u._id }, { $set: u }, { upsert: true })
      ),
      ...snapshot.posts.map((p) =>
        TravelPostModel.updateOne({ _id: p._id }, { $set: p }, { upsert: true })
      ),
      ...snapshot.comments.map((c) =>
        PostCommentModel.updateOne({ _id: c._id }, { $set: c }, { upsert: true })
      ),
      ...snapshot.notifications.map((n) =>
        NotificationModel.updateOne({ _id: n._id }, { $set: n }, { upsert: true })
      ),
      ...snapshot.reports.map((r) =>
        PostReportModel.updateOne({ _id: r._id }, { $set: r }, { upsert: true })
      ),
      ...(snapshot.messages || []).map((m) =>
        DirectMessageModel.updateOne({ _id: m._id }, { $set: m }, { upsert: true })
      ),
    ]);
    lastMongoMutatedAt(Date.now());
  } catch {
    // Ignore transient Mongo sync errors
  }
}

/**
 * Xóa bài viết và các bình luận/báo cáo liên quan trong MongoDB Atlas
 */
export async function deletePostFromMongo(postId: string): Promise<void> {
  const connected = await ensureMongoConnected();
  if (!connected) return;
  try {
    await Promise.all([
      TravelPostModel.deleteOne({ _id: postId }),
      PostCommentModel.deleteMany({ postId }),
      PostReportModel.deleteMany({ postId }),
    ]);
  } catch {
    // Ignore transient Mongo delete errors
  }
}

/**
 * Xóa bình luận và các phản hồi con trong MongoDB Atlas
 */
export async function deleteCommentFromMongo(commentId: string): Promise<void> {
  const connected = await ensureMongoConnected();
  if (!connected) return;
  try {
    await Promise.all([
      PostCommentModel.deleteMany({ parentId: commentId }),
      PostCommentModel.deleteOne({ _id: commentId }),
    ]);
  } catch {
    // Ignore transient Mongo delete errors
  }
}

/**
 * Xóa một tin nhắn trong MongoDB Atlas
 */
export async function deleteMessageFromMongo(messageId: string): Promise<void> {
  const connected = await ensureMongoConnected();
  if (!connected) return;
  try {
    await DirectMessageModel.deleteOne({ _id: messageId });
  } catch {
    // Ignore transient Mongo delete errors
  }
}

