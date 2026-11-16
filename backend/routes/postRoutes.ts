import { Router } from 'express';
import { db } from '../db.ts';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.ts';
import { HttpError } from '../middleware/errorMiddleware.ts';
import {
  applyLikeTransition,
  buildCommentThreads,
  canViewPost,
  extractMentionedUsernames,
  normalizeHashtags,
  normalizeSearchText,
  validatePostInput,
} from '../../frontend/utils/travelRules.ts';
import type { NotificationItem, PostComment, TravelPost } from '../../frontend/types/travel.ts';

export const postRouter = Router();

const VIETNAM_GEO_DICTIONARY: Array<{
  keywords: string[];
  lat: number;
  lng: number;
  province: string;
}> = [
  { keywords: ['ocean park 2', 'ocean park 3', 'vinhomes ocean park 2', 'văn giang'], lat: 20.9458, lng: 105.9764, province: 'Hưng Yên, Việt Nam' },
  { keywords: ['ocean park 1', 'vinhomes ocean park', 'gia lâm'], lat: 20.9953, lng: 105.9458, province: 'Hà Nội, Việt Nam' },
  { keywords: ['ecopark'], lat: 20.9585, lng: 105.9327, province: 'Hưng Yên, Việt Nam' },
  { keywords: ['hưng yên', 'hung yen', 'phố hiến'], lat: 20.6464, lng: 106.0511, province: 'Hưng Yên, Việt Nam' },
  { keywords: ['hà nội', 'ha noi', 'hồ gươm', 'ho guom', 'hồ tây', 'ho tay', 'phố cổ hà nội', 'ba vì', 'sóc sơn'], lat: 21.0285, lng: 105.8542, province: 'Hà Nội, Việt Nam' },
  { keywords: ['tà xùa', 'ta xua', 'bắc yên'], lat: 21.3186, lng: 104.4561, province: 'Sơn La, Việt Nam' },
  { keywords: ['mộc châu', 'moc chau', 'sơn la', 'son la'], lat: 20.8448, lng: 104.639, province: 'Sơn La, Việt Nam' },
  { keywords: ['hà giang', 'ha giang', 'đồng văn', 'dong van', 'mã pí lèng', 'ma pi leng', 'lũng cú', 'lung cu', 'mèo vạc', 'hoàng su phì', 'lô lô chải'], lat: 23.2285, lng: 105.3522, province: 'Hà Giang, Việt Nam' },
  { keywords: ['sapa', 'sa pa', 'fansipan', 'lào cai', 'lao cai', 'y tý', 'bắc hà'], lat: 22.3364, lng: 103.8438, province: 'Lào Cai, Việt Nam' },
  { keywords: ['mù cang chải', 'mu cang chai', 'yên bái', 'yen bai', 'trạm tấu'], lat: 21.8514, lng: 104.0872, province: 'Yên Bái, Việt Nam' },
  { keywords: ['điện biên', 'dien bien', 'apachai'], lat: 21.386, lng: 103.023, province: 'Điện Biên, Việt Nam' },
  { keywords: ['lai châu', 'lai chau', 'sin suối hồ'], lat: 22.3862, lng: 103.4703, province: 'Lai Châu, Việt Nam' },
  { keywords: ['hòa bình', 'hoa binh', 'mai châu', 'mai chau', 'thung nai'], lat: 20.6592, lng: 105.0764, province: 'Hòa Bình, Việt Nam' },
  { keywords: ['cao bằng', 'cao bang', 'bản giốc', 'ban gioc', 'pác bó'], lat: 22.8547, lng: 106.7235, province: 'Cao Bằng, Việt Nam' },
  { keywords: ['bắc kạn', 'bac kan', 'ba bể', 'ba be'], lat: 22.4167, lng: 105.6167, province: 'Bắc Kạn, Việt Nam' },
  { keywords: ['lạng sơn', 'lang son', 'mẫu sơn', 'mau son', 'bắc sơn'], lat: 21.8537, lng: 106.761, province: 'Lạng Sơn, Việt Nam' },
  { keywords: ['tuyên quang', 'tuyen quang', 'na hang'], lat: 21.8236, lng: 105.2142, province: 'Tuyên Quang, Việt Nam' },
  { keywords: ['thái nguyên', 'thai nguyen', 'hồ núi cốc'], lat: 21.5942, lng: 105.8482, province: 'Thái Nguyên, Việt Nam' },
  { keywords: ['phú thọ', 'phu tho', 'đền hùng', 'xuân sơn'], lat: 21.3228, lng: 105.402, province: 'Phú Thọ, Việt Nam' },
  { keywords: ['vĩnh phúc', 'vinh phuc', 'tam đảo', 'tam dao', 'đại lải'], lat: 21.4569, lng: 105.6439, province: 'Vĩnh Phúc, Việt Nam' },
  { keywords: ['bắc giang', 'bac giang', 'đồng cao'], lat: 21.2731, lng: 106.1946, province: 'Bắc Giang, Việt Nam' },
  { keywords: ['bắc ninh', 'bac ninh'], lat: 21.1861, lng: 106.0763, province: 'Bắc Ninh, Việt Nam' },
  { keywords: ['quảng ninh', 'quang ninh', 'hạ long', 'ha long', 'bình liêu', 'cô tô', 'co to', 'vân đồn', 'yên tử', 'móng cái', 'bãi cháy'], lat: 20.9599, lng: 107.0425, province: 'Quảng Ninh, Việt Nam' },
  { keywords: ['hải phòng', 'hai phong', 'cát bà', 'cat ba', 'đồ sơn', 'lan hạ'], lat: 20.7278, lng: 107.0481, province: 'Hải Phòng, Việt Nam' },
  { keywords: ['hải dương', 'hai duong', 'côn sơn'], lat: 20.9373, lng: 106.3146, province: 'Hải Dương, Việt Nam' },
  { keywords: ['thái bình', 'thai binh', 'cồn vành'], lat: 20.4463, lng: 106.3366, province: 'Thái Bình, Việt Nam' },
  { keywords: ['hà nam', 'ha nam', 'tam chúc'], lat: 20.5453, lng: 105.9122, province: 'Hà Nam, Việt Nam' },
  { keywords: ['nam định', 'nam dinh', 'quất lâm', 'hải hậu'], lat: 20.4388, lng: 106.1621, province: 'Nam Định, Việt Nam' },
  { keywords: ['ninh bình', 'ninh binh', 'tràng an', 'trang an', 'tam cốc', 'tam coc', 'hang múa', 'bái đính', 'cúc phương'], lat: 20.2506, lng: 105.9745, province: 'Ninh Bình, Việt Nam' },
  { keywords: ['thanh hóa', 'thanh hoa', 'pù luông', 'pu luong', 'sầm sơn', 'sam son', 'hải tiến'], lat: 19.8067, lng: 105.7852, province: 'Thanh Hóa, Việt Nam' },
  { keywords: ['nghệ an', 'nghe an', 'cửa lò', 'cua lo', 'vinh', 'con cuông'], lat: 18.6796, lng: 105.6813, province: 'Nghệ An, Việt Nam' },
  { keywords: ['hà tĩnh', 'ha tinh', 'thiên cầm'], lat: 18.3559, lng: 105.8877, province: 'Hà Tĩnh, Việt Nam' },
  { keywords: ['quảng bình', 'quang binh', 'phong nha', 'kẻ bàng', 'đồng hới', 'nhật lệ'], lat: 17.5919, lng: 106.2833, province: 'Quảng Bình, Việt Nam' },
  { keywords: ['quảng trị', 'quang tri', 'cồn cỏ', 'khe sanh'], lat: 16.7504, lng: 107.1855, province: 'Quảng Trị, Việt Nam' },
  { keywords: ['huế', 'hue', 'thừa thiên huế', 'lăng cô', 'đại nội'], lat: 16.4637, lng: 107.5909, province: 'Thừa Thiên Huế, Việt Nam' },
  { keywords: ['đà nẵng', 'da nang', 'bà nà', 'ba na', 'sơn trà', 'mỹ khê', 'ngũ hành sơn'], lat: 16.0544, lng: 108.2022, province: 'Đà Nẵng, Việt Nam' },
  { keywords: ['hội an', 'hoi an', 'cù lao chàm', 'quảng nam', 'quang nam', 'mỹ sơn'], lat: 15.8801, lng: 108.338, province: 'Quảng Nam, Việt Nam' },
  { keywords: ['lý sơn', 'ly son', 'quảng ngãi', 'quang ngai'], lat: 15.3802, lng: 109.1167, province: 'Quảng Ngãi, Việt Nam' },
  { keywords: ['quy nhơn', 'quy nhon', 'kỳ co', 'ky co', 'eo gió', 'eo gio', 'bình định', 'binh dinh'], lat: 13.7829, lng: 109.2196, province: 'Bình Định, Việt Nam' },
  { keywords: ['phú yên', 'phu yen', 'tuy hòa', 'tuy hoa', 'ghềnh đá đĩa', 'ghenh da dia', 'mũi điện'], lat: 13.0955, lng: 109.3209, province: 'Phú Yên, Việt Nam' },
  { keywords: ['nha trang', 'khánh hòa', 'khanh hoa', 'cam ranh', 'vân phong', 'điệp sơn', 'bình ba'], lat: 12.2388, lng: 109.1967, province: 'Khánh Hòa, Việt Nam' },
  { keywords: ['ninh thuận', 'ninh thuan', 'vĩnh hy', 'vinh hy', 'phan rang', 'mũi dinh', 'hang rái'], lat: 11.7187, lng: 109.2021, province: 'Ninh Thuận, Việt Nam' },
  { keywords: ['bình thuận', 'binh thuan', 'mũi né', 'mui ne', 'phan thiết', 'phan thiet', 'phú quý', 'phu quy'], lat: 10.9333, lng: 108.1, province: 'Bình Thuận, Việt Nam' },
  { keywords: ['kon tum', 'măng đen', 'mang đen', 'mang den', 'ngọc hồi'], lat: 14.5997, lng: 108.2511, province: 'Kon Tum, Việt Nam' },
  { keywords: ['gia lai', 'pleiku', 'biển hồ'], lat: 13.9833, lng: 108.0, province: 'Gia Lai, Việt Nam' },
  { keywords: ['đắk lắk', 'dak lak', 'buôn ma thuột', 'buon ma thuot', 'hồ lắk'], lat: 12.6667, lng: 108.05, province: 'Đắk Lắk, Việt Nam' },
  { keywords: ['đắk nông', 'dak nong', 'tà đùng', 'ta dung', 'gia nghĩa'], lat: 11.9841, lng: 107.6877, province: 'Đắk Nông, Việt Nam' },
  { keywords: ['đà lạt', 'da lat', 'lâm đồng', 'lam dong', 'bảo lộc', 'bao loc', 'tuyền lâm', 'cầu đất', 'langbiang'], lat: 11.9404, lng: 108.4583, province: 'Lâm Đồng, Việt Nam' },
  { keywords: ['hồ chí minh', 'ho chi minh', 'sài gòn', 'sai gon', 'tphcm', 'củ chi', 'cần giờ'], lat: 10.7769, lng: 106.7009, province: 'TP. Hồ Chí Minh, Việt Nam' },
  { keywords: ['vũng tàu', 'vung tau', 'bà rịa', 'ba ria', 'hồ tràm', 'ho tram', 'côn đảo', 'con dao', 'long hải'], lat: 10.346, lng: 107.0843, province: 'Bà Rịa - Vũng Tàu, Việt Nam' },
  { keywords: ['tây ninh', 'tay ninh', 'bà đen', 'ba den', 'hồ dầu tiếng'], lat: 11.3675, lng: 106.1742, province: 'Tây Ninh, Việt Nam' },
  { keywords: ['đồng nai', 'dong nai', 'trị an', 'tri an', 'cát tiên', 'biên hòa'], lat: 11.1246, lng: 107.0185, province: 'Đồng Nai, Việt Nam' },
  { keywords: ['bình dương', 'binh duong', 'thủ dầu một'], lat: 10.9804, lng: 106.6519, province: 'Bình Dương, Việt Nam' },
  { keywords: ['bình phước', 'binh phuoc', 'bù gia mập'], lat: 11.7512, lng: 106.7235, province: 'Bình Phước, Việt Nam' },
  { keywords: ['cần thơ', 'can tho', 'ninh kiều', 'cái răng'], lat: 10.0452, lng: 105.7469, province: 'Cần Thơ, Việt Nam' },
  { keywords: ['an giang', 'châu đốc', 'chau doc', 'trà sư', 'thất sơn', 'long xuyên'], lat: 10.5216, lng: 105.1259, province: 'An Giang, Việt Nam' },
  { keywords: ['phú quốc', 'phu quoc', 'kiên giang', 'kien giang', 'hà tiên', 'ha tien', 'nam du', 'rạch giá'], lat: 10.2899, lng: 103.984, province: 'Kiên Giang, Việt Nam' },
  { keywords: ['cà mau', 'ca mau', 'đất mũi', 'dat mui', 'u minh'], lat: 9.1768, lng: 105.1524, province: 'Cà Mau, Việt Nam' },
  { keywords: ['bạc liêu', 'bac lieu'], lat: 9.2941, lng: 105.7216, province: 'Bạc Liêu, Việt Nam' },
  { keywords: ['sóc trăng', 'soc trang'], lat: 9.6025, lng: 105.9739, province: 'Sóc Trăng, Việt Nam' },
  { keywords: ['bến tre', 'ben tre'], lat: 10.2434, lng: 106.3756, province: 'Bến Tre, Việt Nam' },
  { keywords: ['tiền giang', 'tien giang', 'mỹ tho'], lat: 10.3600, lng: 106.3600, province: 'Tiền Giang, Việt Nam' },
  { keywords: ['đồng tháp', 'dong thap', 'sa đéc', 'sa dec', 'tràm chim'], lat: 10.4938, lng: 105.6882, province: 'Đồng Tháp, Việt Nam' },
  { keywords: ['vĩnh long', 'vinh long'], lat: 10.2537, lng: 105.9722, province: 'Vĩnh Long, Việt Nam' },
  { keywords: ['trà vinh', 'tra vinh'], lat: 9.9347, lng: 106.3453, province: 'Trà Vinh, Việt Nam' },
  { keywords: ['hậu giang', 'hau giang', 'vị thanh'], lat: 9.7845, lng: 105.4701, province: 'Hậu Giang, Việt Nam' },
  { keywords: ['long an', 'tân lập', 'tân an'], lat: 10.6956, lng: 106.2431, province: 'Long An, Việt Nam' },
];

const stripDiacritics = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export async function resolveLocationCoordinates(
  locationInput: string,
  provinceInput?: string
): Promise<{ lat: number; lng: number; province: string }> {
  const cleanLocation = locationInput.trim();
  const cleanProvince = (provinceInput || '').trim();
  const combinedNorm = `${cleanLocation} ${cleanProvince}`.toLowerCase();
  const combinedPlain = stripDiacritics(combinedNorm);

  // 1. Thử khớp từ điển địa danh Việt Nam trước (ưu tiên địa danh cụ thể dài hơn)
  let bestDictMatch: { lat: number; lng: number; province: string } | null = null;
  let bestKeywordLen = 0;

  for (const entry of VIETNAM_GEO_DICTIONARY) {
    for (const kw of entry.keywords) {
      const kwPlain = stripDiacritics(kw);
      if (combinedNorm.includes(kw.toLowerCase()) || combinedPlain.includes(kwPlain)) {
        if (kw.length > bestKeywordLen) {
          bestKeywordLen = kw.length;
          bestDictMatch = {
            lat: entry.lat,
            lng: entry.lng,
            province: entry.province,
          };
        }
      }
    }
  }

  // 2. Truy vấn OpenStreetMap Nominatim để lấy tọa độ chính xác đến từng địa điểm cụ thể
  try {
    const queryStr =
      cleanProvince && cleanProvince.toLowerCase() !== 'việt nam'
        ? `${cleanLocation}, ${cleanProvince}, Việt Nam`
        : `${cleanLocation}, Việt Nam`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(
        queryStr
      )}`,
      {
        headers: {
          'User-Agent': 'LuHanhVietTravelJournal/1.0 (https://luhanhviet.app)',
          'Accept-Language': 'vi,en',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (response.ok) {
      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
        address?: {
          state?: string;
          city?: string;
          province?: string;
          county?: string;
          country?: string;
        };
      }>;
      if (Array.isArray(results) && results[0]) {
        const lat = Number(results[0].lat);
        const lng = Number(results[0].lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          const addr = results[0].address;
          const stateOrCity =
            addr?.state || addr?.province || addr?.city || addr?.county || '';
          const country = addr?.country || 'Việt Nam';
          const detectedProvince = stateOrCity
            ? `${stateOrCity.replace(/^Tỉnh\s+|^Thành phố\s+/i, '')}, ${country}`
            : bestDictMatch?.province || cleanProvince || 'Việt Nam';
          return { lat, lng, province: detectedProvince };
        }
      }
    }
  } catch {
    // Fallback sang từ điển địa danh nội bộ nếu Nominatim timeout
  }

  if (bestDictMatch) {
    return bestDictMatch;
  }

  // Mặc định trung tâm Hà Nội nếu không tìm thấy
  return {
    lat: 21.0285,
    lng: 105.8542,
    province: cleanProvince || 'Việt Nam',
  };
}

// GET /api/posts - Server-side pagination + search ($regex, $in, $gte) + privacy filtering
postRouter.get('/', optionalAuth, (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 4));
    const feed = String(req.query.feed || 'public'); // 'public' | 'following' | 'saved' | 'all'
    const q = String(req.query.q || '').trim();
    const hashtag = String(req.query.hashtag || '')
      .trim()
      .replace(/^#+/, '')
      .toLowerCase();
    const locationFilter = String(req.query.location || '').trim().toLowerCase();
    const authorIdFilter = String(req.query.authorId || '').trim();
    const minCost = req.query.minCost !== undefined ? Number(req.query.minCost) : undefined;
    const maxCost = req.query.maxCost !== undefined ? Number(req.query.maxCost) : undefined;

    const viewerId = req.user?.sub ?? null;
    const viewerRole = req.user?.role ?? null;
    const viewerRecord = viewerId
      ? db.state.users.find((u) => u._id === viewerId)
      : undefined;

    if ((feed === 'following' || feed === 'saved') && !viewerRecord) {
      throw new HttpError(401, 'Vui lòng đăng nhập để xem bảng tin cá nhân hóa.');
    }

    // Filter posts with privacy enforcement (canViewPost)
    const filtered = db.state.posts
      .filter((post) => {
        const author = db.state.users.find((u) => u._id === post.authorId);
        const authorFollowers = author?.followers ?? [];
        if (!canViewPost(post, authorFollowers, viewerId, viewerRole)) {
          return false;
        }

        if (feed === 'following' && viewerRecord) {
          const followingSet = new Set([...viewerRecord.following, viewerRecord._id]);
          if (!followingSet.has(post.authorId)) return false;
        }

        if (feed === 'saved' && viewerRecord) {
          if (!viewerRecord.savedPosts.includes(post._id)) return false;
        }

        if (authorIdFilter && post.authorId !== authorIdFilter) {
          return false;
        }

        // MongoDB $regex equivalent on title, location, provinceOrCountry, content, hashtags & author
        if (q) {
          const cleanQ = q.replace(/^[@#]+/, '').trim();
          const escaped = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'i');
          const qNorm = normalizeSearchText(cleanQ);
          const authorUsername = author?.username || '';
          const authorFullName = author?.fullName || '';

          const matchesQuery =
            regex.test(post.title) ||
            regex.test(post.location) ||
            regex.test(post.provinceOrCountry) ||
            regex.test(post.content) ||
            regex.test(authorUsername) ||
            regex.test(authorFullName) ||
            post.hashtags.some((tag) => regex.test(tag)) ||
            (qNorm.length > 0 &&
              (normalizeSearchText(post.title).includes(qNorm) ||
                normalizeSearchText(post.location).includes(qNorm) ||
                normalizeSearchText(post.provinceOrCountry).includes(qNorm) ||
                normalizeSearchText(authorFullName).includes(qNorm) ||
                normalizeSearchText(authorUsername).includes(qNorm)));
          if (!matchesQuery) return false;
        }

        // MongoDB $in equivalent on hashtags
        if (hashtag) {
          if (!post.hashtags.some((t) => t.toLowerCase() === hashtag)) {
            return false;
          }
        }

        if (locationFilter) {
          if (
            !post.location.toLowerCase().includes(locationFilter) &&
            !post.provinceOrCountry.toLowerCase().includes(locationFilter)
          ) {
            return false;
          }
        }

        // MongoDB $gte / $lte equivalent on trip cost
        if (minCost !== undefined && !Number.isNaN(minCost) && post.cost < minCost) {
          return false;
        }
        if (maxCost !== undefined && !Number.isNaN(maxCost) && post.cost > maxCost) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const pagedItems = filtered
      .slice(startIndex, startIndex + limit)
      .map((p) => db.populatePost(p));
    const hasMore = startIndex + pagedItems.length < total;

    res.status(200).json({
      posts: pagedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/geocode?q=... - Tra cứu tọa độ GPS thực tế từ tên địa điểm
postRouter.get('/geocode', optionalAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const province = String(req.query.province || '').trim();
    if (!q || q.length < 2) {
      res.status(200).json({
        coordinates: { lat: 21.0285, lng: 105.8542 },
        province: 'Việt Nam',
      });
      return;
    }
    const geo = await resolveLocationCoordinates(q, province);
    res.status(200).json({
      coordinates: { lat: geo.lat, lng: geo.lng },
      province: geo.province,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/:id - Direct post lookup with strict privacy enforcement
postRouter.get('/:id', optionalAuth, (req, res, next) => {
  try {
    const post = db.state.posts.find((p) => p._id === req.params.id);
    if (!post) {
      throw new HttpError(404, 'Không tìm thấy bài viết hành trình này.');
    }

    const author = db.state.users.find((u) => u._id === post.authorId);
    const authorFollowers = author?.followers ?? [];
    const viewerId = req.user?.sub ?? null;
    const viewerRole = req.user?.role ?? null;

    if (!canViewPost(post, authorFollowers, viewerId, viewerRole)) {
      throw new HttpError(
        403,
        'Bài viết này ở chế độ "Chỉ người theo dõi". Bạn cần theo dõi tác giả để xem nội dung.'
      );
    }

    const postComments = db.state.comments
      .filter((c) => c.postId === post._id)
      .map((c) => ({
        ...c,
        author: db.getAuthorBrief(c.authorId),
      }));

    const commentThreads = buildCommentThreads(postComments);

    res.status(200).json({
      post: db.populatePost(post),
      comments: commentThreads,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts - Create new travel post
postRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title,
      content,
      images,
      location,
      provinceOrCountry,
      coordinates,
      tripDate,
      durationDays,
      cost,
      hashtags,
      visibility,
    } = req.body ?? {};

    const validation = validatePostInput({
      title,
      content,
      images,
      location,
      tripDate,
      cost,
      visibility,
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Dữ liệu không hợp lệ.';
      throw new HttpError(400, firstError, validation.errors);
    }

    const cleanLocation = String(location).trim();
    const cleanProvinceInput = provinceOrCountry ? String(provinceOrCountry).trim() : '';
    const geo = await resolveLocationCoordinates(cleanLocation, cleanProvinceInput);

    const hasExplicitCoords =
      coordinates &&
      typeof coordinates.lat === 'number' &&
      typeof coordinates.lng === 'number' &&
      !Number.isNaN(Number(coordinates.lat)) &&
      !Number.isNaN(Number(coordinates.lng));

    const resolvedCoords = hasExplicitCoords
      ? { lat: Number(coordinates.lat), lng: Number(coordinates.lng) }
      : { lat: geo.lat, lng: geo.lng };

    const resolvedProvince =
      cleanProvinceInput && cleanProvinceInput.toLowerCase() !== 'việt nam'
        ? cleanProvinceInput
        : geo.province;

    const now = new Date().toISOString();
    const newPost: TravelPost = {
      _id: `p_${Date.now()}`,
      authorId: req.user!.sub,
      title: String(title).trim(),
      content: String(content).trim(),
      images: (images as string[]).slice(0, 6),
      location: cleanLocation,
      provinceOrCountry: resolvedProvince,
      coordinates: resolvedCoords,
      tripDate: String(tripDate).trim(),
      durationDays: Math.max(1, Number(durationDays) || 3),
      cost: Math.max(0, Number(cost) || 0),
      hashtags: normalizeHashtags(hashtags || cleanLocation),
      visibility: visibility === 'followers' ? 'followers' : 'public',
      likes: [],
      commentCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    db.state.posts = [newPost, ...db.state.posts];
    db.save();

    res.status(201).json({
      post: db.populatePost(newPost),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/posts/:id - Update travel post (owner or admin only)
postRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = db.state.posts.find((p) => p._id === req.params.id);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy bài viết cần chỉnh sửa.');
    }

    if (existing.authorId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new HttpError(403, 'Bạn chỉ có quyền chỉnh sửa bài viết của chính mình.');
    }

    const {
      title = existing.title,
      content = existing.content,
      images = existing.images,
      location = existing.location,
      provinceOrCountry = existing.provinceOrCountry,
      coordinates,
      tripDate = existing.tripDate,
      durationDays = existing.durationDays,
      cost = existing.cost,
      hashtags = existing.hashtags,
      visibility = existing.visibility,
    } = req.body ?? {};

    const validation = validatePostInput({
      title,
      content,
      images,
      location,
      tripDate,
      cost,
      visibility,
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Dữ liệu không hợp lệ.';
      throw new HttpError(400, firstError, validation.errors);
    }

    const cleanLocation = String(location).trim();
    const cleanProvinceInput = String(provinceOrCountry || '').trim();
    const locationChanged =
      cleanLocation.toLowerCase() !== existing.location.toLowerCase();

    let resolvedCoords = existing.coordinates;
    let resolvedProvince = cleanProvinceInput || existing.provinceOrCountry;

    if (
      coordinates &&
      typeof coordinates.lat === 'number' &&
      typeof coordinates.lng === 'number'
    ) {
      resolvedCoords = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
      };
    } else if (locationChanged) {
      const geo = await resolveLocationCoordinates(cleanLocation, cleanProvinceInput);
      resolvedCoords = { lat: geo.lat, lng: geo.lng };
      if (!cleanProvinceInput || cleanProvinceInput.toLowerCase() === 'việt nam') {
        resolvedProvince = geo.province;
      }
    }

    const updatedPost: TravelPost = {
      ...existing,
      title: String(title).trim(),
      content: String(content).trim(),
      images: (images as string[]).slice(0, 6),
      location: cleanLocation,
      provinceOrCountry: resolvedProvince,
      coordinates: resolvedCoords,
      tripDate: String(tripDate).trim(),
      durationDays: Math.max(1, Number(durationDays) || existing.durationDays),
      cost: Math.max(0, Number(cost) || 0),
      hashtags: normalizeHashtags(hashtags),
      visibility: visibility === 'followers' ? 'followers' : 'public',
      updatedAt: new Date().toISOString(),
    };

    db.state.posts = db.state.posts.map((p) =>
      p._id === existing._id ? updatedPost : p
    );
    db.save();

    res.status(200).json({ post: db.populatePost(updatedPost) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id - Delete travel post (owner or admin)
postRouter.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const existing = db.state.posts.find((p) => p._id === req.params.id);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy bài viết cần xóa.');
    }

    if (existing.authorId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new HttpError(403, 'Bạn không có quyền xóa bài viết của người khác.');
    }

    db.state.posts = db.state.posts.filter((p) => p._id !== existing._id);
    db.state.comments = db.state.comments.filter((c) => c.postId !== existing._id);
    db.state.reports = db.state.reports.filter((r) => r.postId !== existing._id);
    db.save();

    import('../models/mongooseSchemas.ts')
      .then(({ deletePostFromMongo }) => deletePostFromMongo(existing._id))
      .catch(() => {});

    res.status(200).json({ message: 'Đã xóa bài viết thành công.', deletedId: existing._id });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/like - Optimistic Like / Unlike endpoint (blocks duplicate likes)
postRouter.post('/:id/like', requireAuth, (req, res, next) => {
  try {
    const post = db.state.posts.find((p) => p._id === req.params.id);
    if (!post) {
      throw new HttpError(404, 'Không tìm thấy bài viết.');
    }

    const author = db.state.users.find((u) => u._id === post.authorId);
    if (!canViewPost(post, author?.followers ?? [], req.user!.sub, req.user!.role)) {
      throw new HttpError(403, 'Bạn không có quyền tương tác với bài viết riêng tư này.');
    }

    const intent = (req.body?.intent as 'like' | 'unlike' | 'toggle') || 'toggle';
    const transition = applyLikeTransition(post.likes, req.user!.sub, intent);

    // Server blocks liking the same post twice when explicit 'like' intent is sent
    if (intent === 'like' && !transition.changed) {
      throw new HttpError(400, 'Bạn đã thích bài viết này trước đó.');
    }

    const updatedPost: TravelPost = {
      ...post,
      likes: transition.likes,
    };

    db.state.posts = db.state.posts.map((p) =>
      p._id === post._id ? updatedPost : p
    );

    // Create notification if liked and not self-like
    if (transition.liked && transition.changed && post.authorId !== req.user!.sub) {
      const notif: NotificationItem = {
        _id: `n_${Date.now()}`,
        recipientId: post.authorId,
        senderId: req.user!.sub,
        type: 'like',
        postId: post._id,
        postTitle: post.title,
        message: `đã thích bài viết "${post.title}".`,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      db.state.notifications = [notif, ...db.state.notifications];
    }

    db.save();

    res.status(200).json({
      likes: updatedPost.likes,
      liked: transition.liked,
      likeCount: updatedPost.likes.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/bookmark - Save / Unsave post
postRouter.post('/:id/bookmark', requireAuth, (req, res, next) => {
  try {
    const post = db.state.posts.find((p) => p._id === req.params.id);
    if (!post) {
      throw new HttpError(404, 'Không tìm thấy bài viết.');
    }

    const currentUser = db.state.users.find((u) => u._id === req.user!.sub);
    if (!currentUser) {
      throw new HttpError(404, 'Không tìm thấy tài khoản.');
    }

    const alreadySaved = currentUser.savedPosts.includes(post._id);
    const nextSaved = alreadySaved
      ? currentUser.savedPosts.filter((id) => id !== post._id)
      : [...currentUser.savedPosts, post._id];

    db.state.users = db.state.users.map((u) =>
      u._id === currentUser._id ? { ...u, savedPosts: nextSaved } : u
    );
    db.save();

    res.status(200).json({
      saved: !alreadySaved,
      savedPosts: nextSaved,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/comments - Add comment or 1-level reply (with images & @mentions)
postRouter.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const post = db.state.posts.find((p) => p._id === req.params.id);
    if (!post) {
      throw new HttpError(404, 'Không tìm thấy bài viết.');
    }

    const author = db.state.users.find((u) => u._id === post.authorId);
    if (!canViewPost(post, author?.followers ?? [], req.user!.sub, req.user!.role)) {
      throw new HttpError(403, 'Bạn không có quyền bình luận vào bài viết riêng tư này.');
    }

    const content = String(req.body?.content || '').trim();
    const rawParentId = req.body?.parentId ? String(req.body.parentId).trim() : null;
    const rawImages = Array.isArray(req.body?.images) ? req.body.images : [];
    const images = rawImages
      .filter((img: unknown): img is string => typeof img === 'string' && img.trim().length > 0)
      .map((img: string) => img.trim())
      .slice(0, 3);
    const rawMentions = Array.isArray(req.body?.mentions) ? req.body.mentions : [];
    const mentions = extractMentionedUsernames(content, rawMentions);

    if (!content && images.length === 0) {
      throw new HttpError(
        400,
        'Vui lòng nhập nội dung bình luận hoặc đính kèm ít nhất 1 hình ảnh.'
      );
    }
    if (content.length > 600) {
      throw new HttpError(400, 'Bình luận tối đa 600 ký tự.');
    }

    // Enforce 1-level reply hierarchy
    let resolvedParentId: string | null = null;
    let parentCommentAuthorId: string | null = null;
    if (rawParentId) {
      const targetComment = db.state.comments.find(
        (c) => c._id === rawParentId && c.postId === post._id
      );
      if (!targetComment) {
        throw new HttpError(404, 'Không tìm thấy bình luận gốc để trả lời.');
      }
      parentCommentAuthorId = targetComment.authorId;
      resolvedParentId = targetComment.parentId ?? targetComment._id;
    }

    const nowIso = new Date().toISOString();
    const newComment: PostComment = {
      _id: `c_${Date.now()}`,
      postId: post._id,
      authorId: req.user!.sub,
      content,
      images,
      mentions,
      parentId: resolvedParentId,
      createdAt: nowIso,
    };

    db.state.comments = [...db.state.comments, newComment];

    const newNotifications: NotificationItem[] = [];
    const notifiedUserIds = new Set<string>([req.user!.sub]);

    // 1. Notify mentioned @users first with a dedicated mention notification
    mentions.forEach((mentionedUsername, idx) => {
      const mentionedUser = db.state.users.find(
        (u) => u.username.toLowerCase() === mentionedUsername.toLowerCase()
      );
      if (mentionedUser && !notifiedUserIds.has(mentionedUser._id)) {
        notifiedUserIds.add(mentionedUser._id);
        newNotifications.push({
          _id: `n_${Date.now()}_m_${idx}`,
          recipientId: mentionedUser._id,
          senderId: req.user!.sub,
          type: 'comment',
          postId: post._id,
          postTitle: post.title,
          message: `đã nhắc đến bạn (@${mentionedUser.username}) trong một bình luận tại bài "${post.title}".`,
          isRead: false,
          createdAt: nowIso,
        });
      }
    });

    // 2. Notify post author or parent comment author if not already notified via @mention
    const notifyTargetId =
      resolvedParentId && parentCommentAuthorId && parentCommentAuthorId !== req.user!.sub
        ? parentCommentAuthorId
        : post.authorId !== req.user!.sub
        ? post.authorId
        : null;

    if (notifyTargetId && !notifiedUserIds.has(notifyTargetId)) {
      notifiedUserIds.add(notifyTargetId);
      newNotifications.push({
        _id: `n_${Date.now()}_c`,
        recipientId: notifyTargetId,
        senderId: req.user!.sub,
        type: resolvedParentId ? 'reply' : 'comment',
        postId: post._id,
        postTitle: post.title,
        message: resolvedParentId
          ? `đã trả lời bình luận của bạn trong bài "${post.title}".`
          : `đã bình luận về chuyến đi "${post.title}".`,
        isRead: false,
        createdAt: nowIso,
      });
    }

    if (newNotifications.length > 0) {
      db.state.notifications = [...newNotifications, ...db.state.notifications];
    }

    await db.saveAsync();

    const allPostComments = db.state.comments
      .filter((c) => c.postId === post._id)
      .map((c) => ({ ...c, author: db.getAuthorBrief(c.authorId) }));

    res.status(201).json({
      comment: { ...newComment, author: db.getAuthorBrief(newComment.authorId) },
      comments: buildCommentThreads(allPostComments),
      commentCount: allPostComments.length,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id/comments/:commentId
postRouter.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const comment = db.state.comments.find(
      (c) => c._id === req.params.commentId && c.postId === req.params.id
    );
    if (!comment) {
      throw new HttpError(404, 'Không tìm thấy bình luận.');
    }
    if (comment.authorId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new HttpError(403, 'Bạn không có quyền xóa bình luận này.');
    }

    db.state.comments = db.state.comments.filter(
      (c) => c._id !== comment._id && c.parentId !== comment._id
    );
    await db.saveAsync();

    import('../models/mongooseSchemas.ts')
      .then(({ deleteCommentFromMongo }) => deleteCommentFromMongo(comment._id))
      .catch(() => {});

    const allPostComments = db.state.comments
      .filter((c) => c.postId === req.params.id)
      .map((c) => ({ ...c, author: db.getAuthorBrief(c.authorId) }));

    res.status(200).json({
      comments: buildCommentThreads(allPostComments),
      commentCount: allPostComments.length,
    });
  } catch (err) {
    next(err);
  }
});
