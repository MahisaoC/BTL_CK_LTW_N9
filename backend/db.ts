import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type {
  DirectMessage,
  NotificationItem,
  PostComment,
  PostReport,
  TravelPost,
  User,
} from '../frontend/types/travel.ts';

export interface UserRecord extends User {
  passwordHash: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  posts: TravelPost[];
  comments: PostComment[];
  notifications: NotificationItem[];
  reports: PostReport[];
  messages: DirectMessage[];
}

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const inMemoryMediaCache = new Map<
  string,
  { buffer: Buffer; mimeType: string }
>();

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export function storeBufferAsMediaUrl(
  buffer: Buffer,
  mimeType = 'image/jpeg'
): string {
  const cleanMime = mimeType.toLowerCase().split(';')[0].trim();
  const ext = MIME_TO_EXT[cleanMime] || 'jpg';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  const filename = `media_${hash}.${ext}`;

  inMemoryMediaCache.set(filename, { buffer, mimeType: cleanMime });

  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }
    const filePath = path.join(MEDIA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
    }
  } catch {
    // Ignore read-only filesystem errors; inMemoryMediaCache still serves it
  }

  return `/api/media/file/${filename}`;
}

export function externalizeDataUrlIfNeeded(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  if (!rawUrl.startsWith('data:image/')) return rawUrl;

  const match = rawUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return rawUrl;

  try {
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    return storeBufferAsMediaUrl(buffer, mimeType);
  } catch {
    return rawUrl;
  }
}

export function resolveMediaFileBuffer(
  filename: string
): { buffer: Buffer; mimeType: string } | null {
  const safeName = path.basename(filename);
  const cached = inMemoryMediaCache.get(safeName);
  if (cached) return cached;

  try {
    const filePath = path.join(MEDIA_DIR, safeName);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(safeName).toLowerCase();
      const mimeType = EXT_TO_MIME[ext] || 'image/jpeg';
      const entry = { buffer, mimeType };
      inMemoryMediaCache.set(safeName, entry);
      return entry;
    }
  } catch {
    // Ignore disk read error
  }
  return null;
}

export function externalizeEmbeddedBase64InState(
  state: DatabaseSchema
): boolean {
  let changed = false;

  for (const user of state.users) {
    if (user.avatar && user.avatar.startsWith('data:image/')) {
      user.avatar = externalizeDataUrlIfNeeded(user.avatar);
      changed = true;
    }
  }

  for (const post of state.posts) {
    if (Array.isArray(post.images)) {
      post.images = post.images.map((img) => {
        if (img && img.startsWith('data:image/')) {
          changed = true;
          return externalizeDataUrlIfNeeded(img);
        }
        return img;
      });
    }
  }

  for (const msg of state.messages || []) {
    if (Array.isArray(msg.images)) {
      msg.images = msg.images.map((img) => {
        if (img && img.startsWith('data:image/')) {
          changed = true;
          return externalizeDataUrlIfNeeded(img);
        }
        return img;
      });
    }
  }

  return changed;
}

const DEFAULT_ADMIN_HASH = bcrypt.hashSync('123456', 10);

export const createInitialSeedData = (): DatabaseSchema => {
  return {
    users: [
      {
        _id: 'G7W2NxsKaURQJtiaBAIKaHj3xLy1',
        fullName: 'Nguyễn Quân',
        username: 'nguyenquan',
        email: '2k7nguyenquan@gmail.com',
        passwordHash: DEFAULT_ADMIN_HASH,
        role: 'admin',
        avatar:
          'https://lh3.googleusercontent.com/a/ACg8ocLz56hZMYF7yz2hoMt6dQtCaY5sHF6aoFq8uQ0OzQhYn3R4NOZa=s96-c',
        bio: 'Quản trị viên hệ thống Lữ Hành Việt.',
        homeCity: 'Việt Nam',
        followers: [],
        following: [],
        savedPosts: [],
        isLocked: false,
        createdAt: '2026-11-10T04:10:54.367Z',
      },
    ],
    posts: [],
    comments: [],
    notifications: [],
    reports: [],
    messages: [],
  };
};

class JsonDatabase {
  private data: DatabaseSchema;
  private diskFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private mongoFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadOrSeed();
  }

  private loadOrSeed(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (
          parsed &&
          Array.isArray(parsed.users) &&
          Array.isArray(parsed.posts) &&
          Array.isArray(parsed.comments) &&
          Array.isArray(parsed.notifications) &&
          Array.isArray(parsed.reports)
        ) {
          const loadedState: DatabaseSchema = {
            ...parsed,
            messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          };
          if (externalizeEmbeddedBase64InState(loadedState)) {
            this.writeDiskAsync(loadedState);
          }
          return loadedState;
        }
      }
    } catch {
      // Fallback to fresh empty state if corrupted
    }
    const emptyState = createInitialSeedData();
    this.writeDiskAsync(emptyState);
    return emptyState;
  }

  private writeDiskAsync(targetData: DatabaseSchema): void {
    if (this.diskFlushTimer) {
      clearTimeout(this.diskFlushTimer);
    }
    this.diskFlushTimer = setTimeout(async () => {
      this.diskFlushTimer = null;
      try {
        externalizeEmbeddedBase64InState(targetData);
        if (!fs.existsSync(DATA_DIR)) {
          await fs.promises.mkdir(DATA_DIR, { recursive: true });
        }
        await fs.promises.writeFile(
          DB_FILE,
          JSON.stringify(targetData, null, 2),
          'utf-8'
        );
      } catch {
        // Ignore write errors in read-only filesystems
      }
    }, 80);
  }

  private scheduleMongoSync(): void {
    if (this.mongoFlushTimer) {
      clearTimeout(this.mongoFlushTimer);
    }
    this.mongoFlushTimer = setTimeout(() => {
      this.mongoFlushTimer = null;
      import('./models/mongooseSchemas.ts')
        .then(({ syncSnapshotToMongo }) => syncSnapshotToMongo(this.data))
        .catch(() => {});
    }, 200);
  }

  public async saveAsync(nextData?: DatabaseSchema): Promise<void> {
    if (nextData) {
      this.data = nextData;
    }
    externalizeEmbeddedBase64InState(this.data);
    this.writeDiskAsync(this.data);
    this.scheduleMongoSync();
  }

  public save(nextData?: DatabaseSchema): void {
    void this.saveAsync(nextData);
  }

  public resetToSeed(): DatabaseSchema {
    const fresh = createInitialSeedData();
    this.save(fresh);
    return this.data;
  }

  public get state(): DatabaseSchema {
    return this.data;
  }

  public sanitizeUser(u: UserRecord): User {
    const { passwordHash: _ignored, ...safeUser } = u;
    return safeUser;
  }

  public getAuthorBrief(userId: string) {
    const u = this.data.users.find((item) => item._id === userId);
    if (!u) {
      return {
        _id: userId,
        fullName: 'Thành viên Lữ Hành',
        username: 'member',
        avatar: '/api/media/avatar/LH',
        role: 'member' as const,
      };
    }
    return {
      _id: u._id,
      fullName: u.fullName,
      username: u.username,
      avatar: u.avatar,
      role: u.role,
    };
  }

  public populatePost(post: TravelPost): TravelPost {
    const commentCount = this.data.comments.filter((c) => c.postId === post._id).length;
    const reportCount = this.data.reports.filter(
      (r) => r.postId === post._id && r.status === 'pending'
    ).length;
    return {
      ...post,
      author: this.getAuthorBrief(post.authorId),
      commentCount,
      reportCount,
    };
  }
}

export const db = new JsonDatabase();

