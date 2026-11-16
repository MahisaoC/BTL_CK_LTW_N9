import type {
  CommentThread,
  DirectMessage,
  DirectMessageReplyPreview,
  LocationStat,
  PostComment,
  PostVisibility,
  TravelPost,
  User,
  UserRole,
} from '../types/travel.ts';

/**
 * Rule 1: Strict privacy check for "Chỉ người theo dõi" (followers-only) posts.
 * Even direct API requests for a post by ID must reject non-followers.
 */
export const canViewPost = (
  post: Pick<TravelPost, 'authorId' | 'visibility' | 'status'>,
  authorFollowers: string[],
  viewerId: string | null,
  viewerRole?: UserRole | null
): boolean => {
  if (post.status === 'hidden') {
    return viewerRole === 'admin' || (viewerId !== null && viewerId === post.authorId);
  }
  if (post.visibility === 'public') {
    return true;
  }
  // visibility === 'followers'
  if (!viewerId) {
    return false;
  }
  if (viewerId === post.authorId || viewerRole === 'admin') {
    return true;
  }
  return authorFollowers.includes(viewerId);
};

/**
 * Rule 2: Immutable Like / Unlike calculation (prevents duplicate likes & supports optimistic rollback).
 */
export const applyLikeTransition = (
  currentLikes: readonly string[],
  userId: string,
  intent: 'like' | 'unlike' | 'toggle' = 'toggle'
): { likes: string[]; liked: boolean; changed: boolean } => {
  const uniqueSet = new Set(currentLikes);
  const alreadyLiked = uniqueSet.has(userId);

  if (intent === 'like') {
    if (alreadyLiked) {
      return { likes: [...uniqueSet], liked: true, changed: false };
    }
    return { likes: [...uniqueSet, userId], liked: true, changed: true };
  }

  if (intent === 'unlike') {
    if (!alreadyLiked) {
      return { likes: [...uniqueSet], liked: false, changed: false };
    }
    const nextLikes = [...uniqueSet].filter((id) => id !== userId);
    return { likes: nextLikes, liked: false, changed: true };
  }

  // toggle
  if (alreadyLiked) {
    return {
      likes: [...uniqueSet].filter((id) => id !== userId),
      liked: false,
      changed: true,
    };
  }
  return {
    likes: [...uniqueSet, userId],
    liked: true,
    changed: true,
  };
};

/**
 * Rule 3: Validate Travel Post payload (Client controlled form & Server middleware).
 */
export interface PostValidationInput {
  title?: string;
  content?: string;
  location?: string;
  tripDate?: string;
  cost?: number | string;
  images?: string[];
  visibility?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export const validatePostInput = (input: PostValidationInput): ValidationResult => {
  const errors: Record<string, string> = {};
  const title = (input.title ?? '').trim();
  const content = (input.content ?? '').trim();
  const location = (input.location ?? '').trim();
  const tripDate = (input.tripDate ?? '').trim();
  const numericCost = Number(input.cost ?? 0);
  const images = Array.isArray(input.images) ? input.images : [];
  const visibility = input.visibility as PostVisibility | undefined;

  if (!title) {
    errors.title = 'Vui lòng nhập tiêu đề chuyến đi.';
  } else if (title.length < 5 || title.length > 120) {
    errors.title = 'Tiêu đề cần từ 5 đến 120 ký tự.';
  }

  if (!content) {
    errors.content = 'Vui lòng chia sẻ nội dung trải nghiệm chuyến đi.';
  } else if (content.length < 20) {
    errors.content = 'Nội dung bài viết cần tối thiểu 20 ký tự.';
  }

  if (!location) {
    errors.location = 'Vui lòng nhập địa điểm chuyến đi.';
  } else if (location.length < 2) {
    errors.location = 'Tên địa điểm cần tối thiểu 2 ký tự.';
  }

  if (!tripDate || Number.isNaN(Date.parse(tripDate))) {
    errors.tripDate = 'Vui lòng chọn ngày khởi hành hợp lệ.';
  }

  if (Number.isNaN(numericCost) || numericCost < 0) {
    errors.cost = 'Chi phí chuyến đi phải là số không âm.';
  } else if (numericCost > 5_000_000_000) {
    errors.cost = 'Chi phí vượt quá giới hạn cho phép.';
  }

  if (images.length === 0) {
    errors.images = 'Cần đính kèm ít nhất 1 ảnh về chuyến đi.';
  } else if (images.length > 6) {
    errors.images = 'Mỗi bài viết chỉ được đăng tối đa 6 ảnh.';
  }

  if (visibility && visibility !== 'public' && visibility !== 'followers') {
    errors.visibility = 'Chế độ hiển thị không hợp lệ.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Rule 4: Validate image file metadata (format & size <= 5MB).
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const validateImageFileMeta = (
  mimeType: string,
  sizeBytes: number
): { valid: boolean; error?: string } => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: 'Định dạng ảnh không hợp lệ (chỉ chấp nhận JPG, PNG, WEBP, SVG).',
    };
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'Dung lượng mỗi ảnh không được vượt quá 5MB.',
    };
  }
  return { valid: true };
};

/**
 * Rule 5: Build 1-level nested comment threads from flat comments.
 * If a reply targets another reply, normalize parentId to the root comment.
 */
export const buildCommentThreads = (comments: readonly PostComment[]): CommentThread[] => {
  const sorted = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const rootMap = new Map<string, CommentThread>();
  const parentLookup = new Map<string, string | null>();

  sorted.forEach((c) => {
    parentLookup.set(c._id, c.parentId);
    if (!c.parentId) {
      rootMap.set(c._id, { ...c, replies: [] });
    }
  });

  sorted.forEach((c) => {
    if (c.parentId) {
      // Resolve root parent (1-level nesting guarantee)
      let rootId: string | null = c.parentId;
      while (rootId && !rootMap.has(rootId) && parentLookup.get(rootId)) {
        rootId = parentLookup.get(rootId) ?? null;
      }
      const rootThread = rootId ? rootMap.get(rootId) : undefined;
      if (rootThread) {
        rootThread.replies = [...rootThread.replies, { ...c, parentId: rootThread._id }];
      } else {
        // Orphaned reply becomes root
        rootMap.set(c._id, { ...c, parentId: null, replies: [] });
      }
    }
  });

  return [...rootMap.values()];
};

/**
 * Rule 6: Aggregation Pipeline equivalent for Top Mentioned Travel Locations.
 * ($match active -> $group by location -> $sort by postCount desc, totalLikes desc)
 */
export const aggregateTopLocations = (
  posts: readonly TravelPost[],
  limit = 10
): LocationStat[] => {
  const activePosts = posts.filter((p) => p.status === 'active' && p.visibility === 'public');
  const groups = new Map<
    string,
    {
      location: string;
      provinceOrCountry: string;
      coordinates: { lat: number; lng: number };
      postCount: number;
      totalLikes: number;
      totalCost: number;
      sampleImage: string;
      recentPostId: string;
    }
  >();

  activePosts.forEach((post) => {
    const key = post.location.trim().toLowerCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        location: post.location.trim(),
        provinceOrCountry: post.provinceOrCountry,
        coordinates: post.coordinates,
        postCount: 1,
        totalLikes: post.likes.length,
        totalCost: post.cost,
        sampleImage: post.images[0] ?? '',
        recentPostId: post._id,
      });
    } else {
      groups.set(key, {
        ...existing,
        postCount: existing.postCount + 1,
        totalLikes: existing.totalLikes + post.likes.length,
        totalCost: existing.totalCost + post.cost,
      });
    }
  });

  return [...groups.values()]
    .map((g) => ({
      location: g.location,
      provinceOrCountry: g.provinceOrCountry,
      coordinates: g.coordinates,
      postCount: g.postCount,
      totalLikes: g.totalLikes,
      avgCost: Math.round(g.totalCost / g.postCount),
      sampleImage: g.sampleImage,
      recentPostId: g.recentPostId,
    }))
    .sort((a, b) => {
      if (b.postCount !== a.postCount) return b.postCount - a.postCount;
      return b.totalLikes - a.totalLikes;
    })
    .slice(0, limit);
};

/**
 * Rule 7: Normalize hashtags from input string or array.
 */
export const normalizeHashtags = (raw: string | readonly string[]): string[] => {
  const items: readonly string[] =
    typeof raw === 'string' ? raw.split(/[\s,]+/) : raw;
  const cleaned = items
    .map((tag: string) => tag.trim().replace(/^#+/, '').toLowerCase())
    .filter((tag: string) => tag.length >= 2 && tag.length <= 30);
  return [...new Set(cleaned)].slice(0, 8);
};

/**
 * Rule 8: Suggest members to follow (Nâng cao: gợi ý người nên theo dõi).
 */
export const computeSuggestedUsers = (
  allUsers: readonly User[],
  currentUserId: string | null,
  limit = 4
): User[] => {
  const currentUser = currentUserId
    ? allUsers.find((u) => u._id === currentUserId)
    : undefined;
  const alreadyFollowing = new Set(currentUser?.following ?? []);

  return allUsers
    .filter(
      (u) =>
        !u.isLocked &&
        u._id !== currentUserId &&
        !alreadyFollowing.has(u._id)
    )
    .sort((a, b) => b.followers.length - a.followers.length)
    .slice(0, limit);
};

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu để hỗ trợ tìm kiếm người dùng & địa điểm chính xác
 */
export const normalizeSearchText = (value: string): string => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

/**
 * Rule 9: Tìm kiếm thành viên theo @username, họ tên (có dấu & không dấu), thành phố hoặc tiểu sử.
 */
export const searchUsersByQuery = (
  allUsers: readonly User[],
  rawQuery: string,
  limit = 12
): User[] => {
  const cleanRaw = String(rawQuery || '')
    .trim()
    .replace(/^[@#]+/, '')
    .toLowerCase();
  const cleanNormalized = normalizeSearchText(cleanRaw);
  const compactQuery = cleanNormalized.replace(/\s+/g, '');
  const queryTokens = cleanNormalized.split(/\s+/).filter(Boolean);
  if (!cleanNormalized) {
    return [];
  }

  const scored: Array<{ user: User; score: number }> = [];

  for (const u of allUsers) {
    if (u.isLocked) continue;
    const uname = u.username.toLowerCase();
    const fname = u.fullName.toLowerCase();
    const fnameNorm = normalizeSearchText(u.fullName);
    const cityNorm = normalizeSearchText(u.homeCity);
    const bioNorm = normalizeSearchText(u.bio);
    const emailPrefix = (u.email.split('@')[0] || '').toLowerCase();

    let score = 0;
    if (uname === cleanRaw || uname === cleanNormalized || uname === compactQuery) {
      score = 100;
    } else if (
      uname.startsWith(cleanRaw) ||
      uname.startsWith(cleanNormalized) ||
      uname.startsWith(compactQuery)
    ) {
      score = 85;
    } else if (fname === cleanRaw || fnameNorm === cleanNormalized) {
      score = 80;
    } else if (fname.includes(cleanRaw) || fnameNorm.includes(cleanNormalized)) {
      score = 70;
    } else if (
      queryTokens.length > 1 &&
      queryTokens.every((tok) => fnameNorm.includes(tok) || uname.includes(tok))
    ) {
      score = 62;
    } else if (
      uname.includes(cleanRaw) ||
      uname.includes(compactQuery) ||
      emailPrefix.includes(cleanRaw)
    ) {
      score = 55;
    } else if (cityNorm.includes(cleanNormalized)) {
      score = 35;
    } else if (bioNorm.includes(cleanNormalized)) {
      score = 20;
    }

    if (score > 0) {
      scored.push({ user: u, score: score + Math.min(10, u.followers.length) });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.user);
};

/**
 * Rule 10: Extract unique @username mentions from comment text and explicit mention list.
 */
export const extractMentionedUsernames = (
  text: string,
  explicitMentions: readonly string[] = []
): string[] => {
  const found = new Set<string>();
  const regex = /(?:^|\s)@([a-zA-Z0-9._]{3,24})(?=$|\s|[.,!?;:)\]])/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    if (match[1]) {
      found.add(match[1].toLowerCase());
    }
    match = regex.exec(text);
  }
  explicitMentions.forEach((m) => {
    const clean = String(m || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();
    if (/^[a-zA-Z0-9._]{3,24}$/.test(clean)) {
      found.add(clean);
    }
  });
  return [...found];
};

/**
 * Rule 11: Geographical Distance (Haversine formula) & Google Maps Universal URLs
 * Phục vụ tính năng xem chuẩn vị trí chính xác và khoảng cách địa lý trên Google Maps.
 */
export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface CityHub {
  key: string;
  labelVi: string;
  labelEn: string;
  coordinates: GeoCoordinates;
}

export const VIETNAM_CITY_HUBS: readonly CityHub[] = [
  {
    key: 'hanoi',
    labelVi: 'Hà Nội',
    labelEn: 'Hanoi',
    coordinates: { lat: 21.0285, lng: 105.8542 },
  },
  {
    key: 'hcmc',
    labelVi: 'TP. Hồ Chí Minh',
    labelEn: 'Ho Chi Minh City',
    coordinates: { lat: 10.7769, lng: 106.7009 },
  },
  {
    key: 'danang',
    labelVi: 'Đà Nẵng',
    labelEn: 'Da Nang',
    coordinates: { lat: 16.0544, lng: 108.2022 },
  },
  {
    key: 'haiphong',
    labelVi: 'Hải Phòng',
    labelEn: 'Hai Phong',
    coordinates: { lat: 20.8449, lng: 106.6881 },
  },
  {
    key: 'cantho',
    labelVi: 'Cần Thơ',
    labelEn: 'Can Tho',
    coordinates: { lat: 10.0452, lng: 105.7469 },
  },
  {
    key: 'hue',
    labelVi: 'Huế',
    labelEn: 'Hue',
    coordinates: { lat: 16.4637, lng: 107.5909 },
  },
  {
    key: 'nhatrang',
    labelVi: 'Nha Trang',
    labelEn: 'Nha Trang',
    coordinates: { lat: 12.2388, lng: 109.1967 },
  },
  {
    key: 'dalat',
    labelVi: 'Đà Lạt',
    labelEn: 'Da Lat',
    coordinates: { lat: 11.9404, lng: 108.4583 },
  },
];

/**
 * Tính khoảng cách đường chim bay (Haversine) tính bằng km và ước tính khoảng cách đường bộ (~1.25x).
 */
export const calculateGeoDistance = (
  origin: GeoCoordinates,
  destination: GeoCoordinates
): { straightKm: number; roadEstimateKm: number } => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Bán kính Trái Đất (km)

  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawKm = R * c;

  const straightKm = Math.max(0.1, Math.round(rawKm * 10) / 10);
  const roadEstimateKm = Math.max(0.2, Math.round(rawKm * 1.25 * 10) / 10);

  return { straightKm, roadEstimateKm };
};

/**
 * Xác định tọa độ điểm xuất phát từ GPS thực tế, thành phố người dùng chọn, hoặc thành phố trong hồ sơ.
 */
export const resolveReferenceOrigin = (
  homeCity?: string | null,
  selectedHubKey?: string | null,
  liveGps?: GeoCoordinates | null
): {
  key: string;
  labelVi: string;
  labelEn: string;
  coordinates: GeoCoordinates;
  isLiveGps: boolean;
} => {
  if (
    liveGps &&
    !Number.isNaN(liveGps.lat) &&
    !Number.isNaN(liveGps.lng) &&
    (!selectedHubKey || selectedHubKey === 'gps')
  ) {
    return {
      key: 'gps',
      labelVi: 'Vị trí hiện tại của bạn',
      labelEn: 'Your current GPS',
      coordinates: liveGps,
      isLiveGps: true,
    };
  }

  if (selectedHubKey && selectedHubKey !== 'gps') {
    const matchedHub = VIETNAM_CITY_HUBS.find((h) => h.key === selectedHubKey);
    if (matchedHub) {
      return { ...matchedHub, isLiveGps: false };
    }
  }

  if (homeCity) {
    const normHome = normalizeSearchText(homeCity);
    const matchedByHome = VIETNAM_CITY_HUBS.find(
      (h) =>
        normHome.includes(normalizeSearchText(h.labelVi)) ||
        normHome.includes(normalizeSearchText(h.labelEn))
    );
    if (matchedByHome) {
      return { ...matchedByHome, isLiveGps: false };
    }
  }

  // Mặc định là Hà Nội
  return { ...VIETNAM_CITY_HUBS[0], isLiveGps: false };
};

/**
 * Tạo liên kết mở trực tiếp vị trí chính xác trên Google Maps (hỗ trợ cả tọa độ GPS và tên địa danh).
 */
export const buildGoogleMapsPlaceUrl = (params: {
  location: string;
  provinceOrCountry?: string;
  coordinates?: GeoCoordinates;
}): string => {
  const { location, provinceOrCountry, coordinates } = params;
  if (
    coordinates &&
    typeof coordinates.lat === 'number' &&
    typeof coordinates.lng === 'number' &&
    !Number.isNaN(coordinates.lat) &&
    !Number.isNaN(coordinates.lng)
  ) {
    const lat = coordinates.lat.toFixed(6);
    const lng = coordinates.lng.toFixed(6);
    const label = [location, provinceOrCountry].filter(Boolean).join(', ');
    const query = label ? `${label} (${lat}, ${lng})` : `${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  const fallbackQuery = [location, provinceOrCountry].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`;
};

/**
 * Tạo liên kết chỉ đường & đo khoảng cách địa lý thực tế trên Google Maps từ vị trí người dùng đến điểm đến.
 */
export const buildGoogleMapsDirectionsUrl = (params: {
  location: string;
  provinceOrCountry?: string;
  coordinates?: GeoCoordinates;
  origin?: GeoCoordinates | null;
}): string => {
  const { location, provinceOrCountry, coordinates, origin } = params;
  const destinationParam =
    coordinates &&
    typeof coordinates.lat === 'number' &&
    typeof coordinates.lng === 'number' &&
    !Number.isNaN(coordinates.lat) &&
    !Number.isNaN(coordinates.lng)
      ? `${coordinates.lat.toFixed(6)},${coordinates.lng.toFixed(6)}`
      : [location, provinceOrCountry].filter(Boolean).join(', ');

  const searchParams = new URLSearchParams({
    api: '1',
    destination: destinationParam,
    travelmode: 'driving',
  });

  if (
    origin &&
    typeof origin.lat === 'number' &&
    typeof origin.lng === 'number' &&
    !Number.isNaN(origin.lat) &&
    !Number.isNaN(origin.lng)
  ) {
    searchParams.set(
      'origin',
      `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`
    );
  }

  return `https://www.google.com/maps/dir/?${searchParams.toString()}`;
};

/**
 * Rule 11: Tạo nội dung tin nhắn và ảnh đính kèm khi chia sẻ bài viết cho người đang theo dõi.
 */
export const buildSharedPostMessagePayload = (
  post: Pick<
    TravelPost,
    '_id' | 'title' | 'location' | 'provinceOrCountry' | 'durationDays' | 'cost' | 'images'
  >,
  shareUrl: string,
  customNote?: string
): { content: string; images: string[] } => {
  const cleanNote = String(customNote || '').trim();
  const formattedCost = `${new Intl.NumberFormat('vi-VN').format(
    Math.max(0, Math.round(post.cost || 0))
  )} ₫`;

  const lines: string[] = [];
  if (cleanNote) {
    lines.push(cleanNote);
    lines.push('');
  }
  lines.push(`📍 Chia sẻ hành trình: "${post.title}"`);
  lines.push(
    `🗺️ Điểm đến: ${post.location} (${post.provinceOrCountry}) · ${post.durationDays} ngày · Chi phí ${formattedCost}`
  );
  lines.push(`🔗 Xem bài viết: ${shareUrl}`);

  const previewImages =
    Array.isArray(post.images) && post.images.length > 0 && post.images[0]
      ? [post.images[0]]
      : [];

  return {
    content: lines.join('\n'),
    images: previewImages,
  };
};

/**
 * Tạo bản tóm tắt hành trình đầy đủ để người dùng sao chép nhanh kèm liên kết.
 */
export const buildTripSummaryClipboardText = (
  post: Pick<
    TravelPost,
    | '_id'
    | 'title'
    | 'location'
    | 'provinceOrCountry'
    | 'durationDays'
    | 'cost'
    | 'hashtags'
    | 'author'
  >,
  shareUrl: string
): string => {
  const formattedCost = `${new Intl.NumberFormat('vi-VN').format(
    Math.max(0, Math.round(post.cost || 0))
  )} ₫`;
  const authorHandle = post.author?.username ? `@${post.author.username}` : 'Lữ Hành Việt';
  const tags =
    Array.isArray(post.hashtags) && post.hashtags.length > 0
      ? post.hashtags.map((t) => `#${t}`).join(' ')
      : '';

  return [
    `✈️ ${post.title} (${authorHandle})`,
    `📍 Địa điểm: ${post.location}, ${post.provinceOrCountry}`,
    `⏱️ Thời lượng: ${post.durationDays} ngày · Chi phí tham khảo: ${formattedCost}`,
    tags ? `🏷️ ${tags}` : '',
    `🔗 Xem chi tiết tại Lữ Hành Việt: ${shareUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
};

/**
 * Trích xuất mã bài viết (/posts/:postId) từ nội dung tin nhắn để hiển thị nút mở bài viết trực tiếp trong khung chat.
 */
export const extractSharedPostInfoFromMessage = (
  content: string
): { postId: string; matchedUrl: string } | null => {
  const text = String(content || '');
  const regex = /(?:https?:\/\/[^\s]+\/posts\/|\/posts\/)([a-zA-Z0-9_-]+)/;
  const match = regex.exec(text);
  if (!match || !match[1]) {
    return null;
  }
  return {
    postId: match[1],
    matchedUrl: `/posts/${match[1]}`,
  };
};

/**
 * Rule 12: Tìm kiếm nội dung tin nhắn trong đoạn chat (hỗ trợ cả có dấu & không dấu tiếng Việt).
 */
export const filterMessagesByContentQuery = (
  messages: readonly DirectMessage[],
  rawQuery: string
): DirectMessage[] => {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) {
    return [...messages];
  }
  return messages.filter((msg) => {
    const contentNorm = normalizeSearchText(msg.content || '');
    const replyNorm = normalizeSearchText(msg.replyTo?.content || '');
    return contentNorm.includes(normQuery) || replyNorm.includes(normQuery);
  });
};

/**
 * Lấy danh sách các tin nhắn đã ghim trong đoạn chat, sắp xếp theo thời điểm ghim hoặc thời gian gửi mới nhất.
 */
export const getPinnedMessagesInChat = (
  messages: readonly DirectMessage[]
): DirectMessage[] => {
  return messages
    .filter((m) => Boolean(m.isPinned))
    .sort((a, b) => {
      const aTime = new Date(a.pinnedAt || a.createdAt).getTime();
      const bTime = new Date(b.pinnedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
};

/**
 * Tạo đối tượng trích dẫn trả lời tin nhắn (Reply Preview) trong đoạn chat.
 */
export const buildMessageReplyPreview = (
  targetMessage: Pick<DirectMessage, '_id' | 'senderId' | 'content' | 'images'>,
  senderName?: string
): DirectMessageReplyPreview => {
  const hasImages = Boolean(
    targetMessage.images && targetMessage.images.length > 0
  );
  const cleanContent = String(targetMessage.content || '').trim();
  return {
    _id: targetMessage._id,
    senderId: targetMessage.senderId,
    senderName: senderName || 'Thành viên',
    content:
      cleanContent ||
      (hasImages ? `[Đã gửi ${targetMessage.images?.length || 1} hình ảnh]` : ''),
    hasImages,
  };
};

/**
 * Rule 13: Kiểm tra trạng thái hoạt động (Online Presence) thực tế của tài khoản
 * kết hợp với quyền riêng tư hiển thị trạng thái hoạt động (onlineStatus) và chặn 2 chiều.
 */
export const evaluateUserOnlineVisibility = (params: {
  isTargetConnectedOrRecent: boolean;
  isBlockedEitherWay?: boolean;
  targetOnlinePolicy?: 'everyone' | 'followers' | 'mutual' | 'no_one';
  viewerOnlinePolicy?: 'everyone' | 'followers' | 'mutual' | 'no_one';
  isViewerFollowingTarget?: boolean;
  isTargetFollowingViewer?: boolean;
}): boolean => {
  if (!params.isTargetConnectedOrRecent) {
    return false;
  }
  if (params.isBlockedEitherWay) {
    return false;
  }
  // Nếu người xem tắt hiển thị trạng thái hoạt động của chính họ ('no_one'), họ cũng không xem được của người khác
  if (params.viewerOnlinePolicy === 'no_one') {
    return false;
  }

  const policy = params.targetOnlinePolicy ?? 'everyone';
  if (policy === 'no_one') {
    return false;
  }
  if (policy === 'followers') {
    return Boolean(params.isViewerFollowingTarget);
  }
  if (policy === 'mutual') {
    return Boolean(
      params.isViewerFollowingTarget && params.isTargetFollowingViewer
    );
  }
  return true;
};
