import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateTopLocations,
  applyLikeTransition,
  buildCommentThreads,
  canViewPost,
  computeSuggestedUsers,
  extractMentionedUsernames,
  normalizeHashtags,
  validateImageFileMeta,
  validatePostInput,
} from './travelRules';
import type { PostComment, TravelPost, User } from '../types/travel';

test('canViewPost enforces followers-only privacy even on direct API check', () => {
  const followersOnlyPost = {
    authorId: 'u_author',
    visibility: 'followers' as const,
    status: 'active' as const,
  };
  const authorFollowers = ['u_follower_1', 'u_follower_2'];

  // Guest cannot view followers-only post
  assert.equal(canViewPost(followersOnlyPost, authorFollowers, null, null), false);

  // Non-follower member cannot view followers-only post
  assert.equal(
    canViewPost(followersOnlyPost, authorFollowers, 'u_stranger', 'member'),
    false
  );

  // Follower can view
  assert.equal(
    canViewPost(followersOnlyPost, authorFollowers, 'u_follower_1', 'member'),
    true
  );

  // Author can always view own post
  assert.equal(
    canViewPost(followersOnlyPost, authorFollowers, 'u_author', 'member'),
    true
  );

  // Admin can view for moderation
  assert.equal(
    canViewPost(followersOnlyPost, authorFollowers, 'u_admin', 'admin'),
    true
  );
});

test('applyLikeTransition prevents duplicate likes and supports optimistic toggle', () => {
  const initialLikes = ['u1', 'u2'];

  // Like by new user u3
  const step1 = applyLikeTransition(initialLikes, 'u3', 'like');
  assert.deepEqual(step1.likes, ['u1', 'u2', 'u3']);
  assert.equal(step1.liked, true);
  assert.equal(step1.changed, true);

  // Duplicate like attempt by u3 is idempotent / rejected
  const step2 = applyLikeTransition(step1.likes, 'u3', 'like');
  assert.deepEqual(step2.likes, ['u1', 'u2', 'u3']);
  assert.equal(step2.changed, false);

  // Toggle unlike by u2
  const step3 = applyLikeTransition(step2.likes, 'u2', 'toggle');
  assert.deepEqual(step3.likes, ['u1', 'u3']);
  assert.equal(step3.liked, false);
  assert.equal(step3.changed, true);
});

test('validatePostInput enforces 1..6 images, title, content, and non-negative cost', () => {
  const invalid = validatePostInput({
    title: 'Ngắn',
    content: 'Quá ngắn',
    location: '',
    tripDate: 'invalid-date',
    cost: -500,
    images: [],
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.content);
  assert.ok(invalid.errors.location);
  assert.ok(invalid.errors.tripDate);
  assert.ok(invalid.errors.cost);
  assert.ok(invalid.errors.images);

  // More than 6 images fails
  const tooManyImages = validatePostInput({
    title: 'Hành trình săn mây Tà Xùa 3 ngày 2 đêm',
    content: 'Chuyến đi tuyệt vời cùng những người bạn ngắm biển mây lúc bình minh.',
    location: 'Tà Xùa, Sơn La',
    tripDate: '2026-10-15',
    cost: 2500000,
    images: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg'],
    visibility: 'public',
  });
  assert.equal(tooManyImages.valid, false);
  assert.ok(tooManyImages.errors.images);

  // Valid payload passes
  const valid = validatePostInput({
    title: 'Hành trình săn mây Tà Xùa 3 ngày 2 đêm',
    content: 'Chuyến đi tuyệt vời cùng những người bạn ngắm biển mây lúc bình minh.',
    location: 'Tà Xùa, Sơn La',
    tripDate: '2026-10-15',
    cost: 2500000,
    images: ['1.jpg', '2.jpg'],
    visibility: 'public',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('validateImageFileMeta checks MIME type and 5MB size limit', () => {
  assert.equal(validateImageFileMeta('image/jpeg', 1024 * 500).valid, true);
  assert.equal(validateImageFileMeta('application/pdf', 1024 * 500).valid, false);
  assert.equal(validateImageFileMeta('image/png', 6 * 1024 * 1024).valid, false);
});

test('buildCommentThreads groups 1-level replies under root comments', () => {
  const comments: PostComment[] = [
    {
      _id: 'c1',
      postId: 'p1',
      authorId: 'u1',
      content: 'Bài viết chi tiết quá!',
      parentId: null,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      _id: 'c2',
      postId: 'p1',
      authorId: 'u2',
      content: 'Cảm ơn bạn nhé!',
      parentId: 'c1',
      createdAt: '2026-10-01T10:05:00.000Z',
    },
    {
      _id: 'c3',
      postId: 'p1',
      authorId: 'u3',
      content: 'Cho mình xin lịch trình ngày 2 với.',
      parentId: 'c2', // Reply to reply -> flattened to root c1
      createdAt: '2026-10-01T10:10:00.000Z',
    },
  ];

  const threads = buildCommentThreads(comments);
  assert.equal(threads.length, 1);
  assert.equal(threads[0]._id, 'c1');
  assert.equal(threads[0].replies.length, 2);
  assert.equal(threads[0].replies[1].parentId, 'c1');
});

test('aggregateTopLocations groups and sorts destinations by postCount and totalLikes', () => {
  const mockPosts: TravelPost[] = [
    {
      _id: 'p1',
      authorId: 'u1',
      title: 'Đà Lạt mùa hoa dã quỳ',
      content: 'Nội dung chuyến đi Đà Lạt mùa thu rất đẹp và thơ mộng.',
      images: ['img1'],
      location: 'Đà Lạt',
      provinceOrCountry: 'Lâm Đồng, Việt Nam',
      coordinates: { lat: 11.9404, lng: 108.4583 },
      tripDate: '2026-10-01',
      durationDays: 3,
      cost: 3000000,
      hashtags: ['dalat'],
      visibility: 'public',
      likes: ['u2', 'u3', 'u4'],
      commentCount: 2,
      status: 'active',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      _id: 'p2',
      authorId: 'u2',
      title: 'Đà Lạt săn mây Cầu Đất',
      content: 'Săn mây buổi sớm tại đồi chè Cầu Đất Đà Lạt.',
      images: ['img2'],
      location: 'Đà Lạt',
      provinceOrCountry: 'Lâm Đồng, Việt Nam',
      coordinates: { lat: 11.9404, lng: 108.4583 },
      tripDate: '2026-10-05',
      durationDays: 4,
      cost: 4000000,
      hashtags: ['dalat', 'sanmay'],
      visibility: 'public',
      likes: ['u1'],
      commentCount: 1,
      status: 'active',
      createdAt: '2026-10-05T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
    },
    {
      _id: 'p3',
      authorId: 'u1',
      title: 'Phú Quốc rực rỡ nắng vàng',
      content: 'Khám phá Nam đảo Phú Quốc và lặn ngắm san hô.',
      images: ['img3'],
      location: 'Phú Quốc',
      provinceOrCountry: 'Kiên Giang, Việt Nam',
      coordinates: { lat: 10.2899, lng: 103.984 },
      tripDate: '2026-09-20',
      durationDays: 3,
      cost: 6000000,
      hashtags: ['phuquoc'],
      visibility: 'public',
      likes: ['u2', 'u3'],
      commentCount: 0,
      status: 'active',
      createdAt: '2026-09-20T00:00:00Z',
      updatedAt: '2026-09-20T00:00:00Z',
    },
  ];

  const stats = aggregateTopLocations(mockPosts, 5);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].location, 'Đà Lạt');
  assert.equal(stats[0].postCount, 2);
  assert.equal(stats[0].totalLikes, 4);
  assert.equal(stats[0].avgCost, 3500000);
  assert.equal(stats[1].location, 'Phú Quốc');
});

test('normalizeHashtags and computeSuggestedUsers work deterministically', () => {
  assert.deepEqual(normalizeHashtags('#DaLat, #SanMay #dalat #BienDao'), [
    'dalat',
    'sanmay',
    'biendao',
  ]);

  const users: User[] = [
    {
      _id: 'u1',
      fullName: 'User 1',
      username: 'user1',
      email: 'u1@test.com',
      role: 'member',
      avatar: '',
      bio: '',
      homeCity: 'Hà Nội',
      followers: [],
      following: ['u2'],
      savedPosts: [],
      isLocked: false,
      createdAt: '',
    },
    {
      _id: 'u2',
      fullName: 'User 2',
      username: 'user2',
      email: 'u2@test.com',
      role: 'member',
      avatar: '',
      bio: '',
      homeCity: 'Đà Nẵng',
      followers: ['u1', 'u3'],
      following: [],
      savedPosts: [],
      isLocked: false,
      createdAt: '',
    },
    {
      _id: 'u3',
      fullName: 'User 3',
      username: 'user3',
      email: 'u3@test.com',
      role: 'member',
      avatar: '',
      bio: '',
      homeCity: 'TP.HCM',
      followers: ['u2'],
      following: [],
      savedPosts: [],
      isLocked: false,
      createdAt: '',
    },
  ];

  const suggested = computeSuggestedUsers(users, 'u1', 5);
  assert.equal(suggested.length, 1);
  assert.equal(suggested[0]._id, 'u3');
});

test('extractMentionedUsernames extracts unique @handles from text and explicit list', () => {
  const mentions = extractMentionedUsernames(
    'Chào @nguyenquan và @hizakomc.0dZF nhé! Đi cùng @NguyenQuan vui lắm 🥰',
    ['@mahirusosad.0nwq']
  );
  assert.deepEqual(mentions, ['nguyenquan', 'hizakomc.0dzf', 'mahirusosad.0nwq']);
});

test('searchUsersByQuery matches @username, Vietnamese diacritic-insensitive fullName, and homeCity', async () => {
  const { searchUsersByQuery } = await import('./travelRules');
  const users: User[] = [
    {
      _id: 'u_admin',
      fullName: 'Nguyễn Quân',
      username: 'nguyenquan',
      email: '2k7nguyenquan@gmail.com',
      role: 'admin',
      avatar: '',
      bio: 'Quản trị viên hệ thống Lữ Hành Việt.',
      homeCity: 'Hà Nội, Việt Nam',
      followers: ['u2'],
      following: [],
      savedPosts: [],
      isLocked: false,
      createdAt: '',
    },
    {
      _id: 'u2',
      fullName: 'Quân Nguyễn',
      username: 'hizakomc.0dzf',
      email: 'hizako@gmail.com',
      role: 'member',
      avatar: '',
      bio: 'Đam mê săn mây Đà Lạt',
      homeCity: 'Đà Lạt',
      followers: [],
      following: [],
      savedPosts: [],
      isLocked: false,
      createdAt: '',
    },
  ];

  const byHandle = searchUsersByQuery(users, '@hizakomc');
  assert.equal(byHandle.length, 1);
  assert.equal(byHandle[0].username, 'hizakomc.0dzf');

  const byNameNoTone = searchUsersByQuery(users, 'nguyen quan');
  assert.equal(byNameNoTone.length, 2);
  assert.equal(byNameNoTone[0].username, 'nguyenquan');

  const byCity = searchUsersByQuery(users, 'da lat');
  assert.equal(byCity.length, 1);
  assert.equal(byCity[0]._id, 'u2');
});

test('emailService generates 6-digit OTP letter and verifies registration & forgot-password codes', async () => {
  const {
    generateSixDigitOtp,
    sendVerificationEmailLetter,
    verifyEmailOtpCode,
  } = await import('../../backend/utils/emailService.ts');

  const sampleOtp = generateSixDigitOtp();
  assert.match(sampleOtp, /^\d{6}$/);

  const letter = await sendVerificationEmailLetter({
    to: 'TestUser@example.com',
    recipientName: 'Test User',
    purpose: 'register_verify',
  });
  assert.equal(letter.to, 'testuser@example.com');
  assert.match(letter.otpCode, /^\d{6}$/);

  // Wrong code should fail
  const wrongCheck = verifyEmailOtpCode({
    email: 'testuser@example.com',
    purpose: 'register_verify',
    code: '000000' === letter.otpCode ? '999999' : '000000',
  });
  assert.equal(wrongCheck.valid, false);

  // Correct code should pass and consume OTP
  const rightCheck = verifyEmailOtpCode({
    email: 'testuser@example.com',
    purpose: 'register_verify',
    code: letter.otpCode,
    consume: true,
  });
  assert.equal(rightCheck.valid, true);

  // Re-using consumed OTP should fail
  const reuseCheck = verifyEmailOtpCode({
    email: 'testuser@example.com',
    purpose: 'register_verify',
    code: letter.otpCode,
  });
  assert.equal(reuseCheck.valid, false);
});

test('calculateGeoDistance, resolveReferenceOrigin, and Google Maps URL builders work accurately', async () => {
  const {
    calculateGeoDistance,
    resolveReferenceOrigin,
    buildGoogleMapsPlaceUrl,
    buildGoogleMapsDirectionsUrl,
  } = await import('./travelRules');

  // Hanoi (21.0285, 105.8542) to Ocean Park 2 Hung Yen (20.9431, 105.9781)
  const hanoiOrigin = resolveReferenceOrigin('Hà Nội, Việt Nam', null, null);
  assert.equal(hanoiOrigin.key, 'hanoi');

  const dist = calculateGeoDistance(hanoiOrigin.coordinates, {
    lat: 20.9431,
    lng: 105.9781,
  });
  assert.ok(dist.straightKm > 10 && dist.straightKm < 22);
  assert.ok(dist.roadEstimateKm > dist.straightKm);

  const placeUrl = buildGoogleMapsPlaceUrl({
    location: 'Ocean Park 2, Hưng Yên',
    provinceOrCountry: 'Hưng Yên, Việt Nam',
    coordinates: { lat: 20.9431, lng: 105.9781 },
  });
  assert.ok(placeUrl.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.ok(placeUrl.includes('20.943100'));

  const dirUrl = buildGoogleMapsDirectionsUrl({
    location: 'Ocean Park 2, Hưng Yên',
    coordinates: { lat: 20.9431, lng: 105.9781 },
    origin: hanoiOrigin.coordinates,
  });
  assert.ok(dirUrl.startsWith('https://www.google.com/maps/dir/?'));
  assert.ok(dirUrl.includes('destination=20.943100%2C105.978100'));
  assert.ok(dirUrl.includes('origin=21.028500%2C105.854200'));
});

test('buildSharedPostMessagePayload, buildTripSummaryClipboardText, and extractSharedPostInfoFromMessage work accurately', async () => {
  const {
    buildSharedPostMessagePayload,
    buildTripSummaryClipboardText,
    extractSharedPostInfoFromMessage,
  } = await import('./travelRules');

  const samplePost = {
    _id: 'p_ocean_park_2',
    title: 'Cuối tuần dạo biển hồ Ocean Park 2',
    location: 'Ocean Park 2, Hưng Yên',
    provinceOrCountry: 'Hưng Yên, Việt Nam',
    durationDays: 2,
    cost: 1500000,
    images: ['https://example.com/ocean1.jpg', 'https://example.com/ocean2.jpg'],
    hashtags: ['oceanpark2', 'hungyen'],
    author: {
      _id: 'u1',
      fullName: 'Nguyễn Quân',
      username: 'nguyenquan',
      avatar: '',
      role: 'admin' as const,
    },
  };

  const shareUrl = 'https://luhanhviet.app/posts/p_ocean_park_2';
  const payload = buildSharedPostMessagePayload(
    samplePost,
    shareUrl,
    'Cuối tuần đi chỗ này không?'
  );

  assert.ok(payload.content.startsWith('Cuối tuần đi chỗ này không?'));
  assert.ok(payload.content.includes(shareUrl));
  assert.deepEqual(payload.images, ['https://example.com/ocean1.jpg']);

  const extracted = extractSharedPostInfoFromMessage(payload.content);
  assert.ok(extracted);
  assert.equal(extracted.postId, 'p_ocean_park_2');
  assert.equal(extracted.matchedUrl, '/posts/p_ocean_park_2');

  const summary = buildTripSummaryClipboardText(samplePost, shareUrl);
  assert.ok(summary.includes('@nguyenquan'));
  assert.ok(summary.includes('#oceanpark2 #hungyen'));
  assert.ok(summary.includes(shareUrl));
});

test('filterMessagesByContentQuery, getPinnedMessagesInChat, and buildMessageReplyPreview work accurately', async () => {
  const {
    filterMessagesByContentQuery,
    getPinnedMessagesInChat,
    buildMessageReplyPreview,
  } = await import('./travelRules');

  const msg1 = {
    _id: 'm1',
    senderId: 'u1',
    recipientId: 'u2',
    content: 'Lịch trình đi Hà Giang 4 ngày 3 đêm',
    isPinned: true,
    pinnedAt: '2026-11-12T06:00:00.000Z',
    isRead: true,
    createdAt: '2026-11-12T05:00:00.000Z',
  };
  const replyPreview = buildMessageReplyPreview(msg1, 'Nguyễn Quân');
  assert.equal(replyPreview._id, 'm1');
  assert.equal(replyPreview.senderName, 'Nguyễn Quân');
  assert.equal(replyPreview.content, 'Lịch trình đi Hà Giang 4 ngày 3 đêm');

  const msg2 = {
    _id: 'm2',
    senderId: 'u2',
    recipientId: 'u1',
    content: 'Cảm ơn bạn, mình sẽ đặt xe khách tối thứ 6 nhé!',
    replyToMessageId: 'm1',
    replyTo: replyPreview,
    isPinned: false,
    isRead: true,
    createdAt: '2026-11-12T06:10:00.000Z',
  };
  const msg3 = {
    _id: 'm3',
    senderId: 'u1',
    recipientId: 'u2',
    content: 'Nhớ mang áo ấm vì Đồng Văn khá lạnh',
    isPinned: true,
    pinnedAt: '2026-11-12T07:00:00.000Z',
    isRead: false,
    createdAt: '2026-11-12T06:30:00.000Z',
  };

  const all = [msg1, msg2, msg3];
  const pinned = getPinnedMessagesInChat(all);
  assert.equal(pinned.length, 2);
  assert.equal(pinned[0]._id, 'm3');
  assert.equal(pinned[1]._id, 'm1');

  const searchDongVan = filterMessagesByContentQuery(all, 'dong van');
  assert.equal(searchDongVan.length, 1);
  assert.equal(searchDongVan[0]._id, 'm3');

  const searchHaGiang = filterMessagesByContentQuery(all, 'ha giang');
  // Matches msg1 directly and msg2 via replyTo preview
  assert.equal(searchHaGiang.length, 2);
});

test('evaluateUserOnlineVisibility returns false for offline accounts and respects onlineStatus privacy settings', async () => {
  const { evaluateUserOnlineVisibility } = await import('./travelRules');

  // Offline account (not connected via SSE or recent API request) must never show as online
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: false,
      targetOnlinePolicy: 'everyone',
      viewerOnlinePolicy: 'everyone',
    }),
    false
  );

  // Connected account with default 'everyone' policy shows as online
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      targetOnlinePolicy: 'everyone',
      viewerOnlinePolicy: 'everyone',
    }),
    true
  );

  // Blocked either way hides online status
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      isBlockedEitherWay: true,
      targetOnlinePolicy: 'everyone',
    }),
    false
  );

  // Target policy 'no_one' hides online status even when connected
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      targetOnlinePolicy: 'no_one',
    }),
    false
  );

  // Viewer policy 'no_one' (reciprocity) hides others' online status
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      targetOnlinePolicy: 'everyone',
      viewerOnlinePolicy: 'no_one',
    }),
    false
  );

  // Target policy 'mutual' requires both following each other
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      targetOnlinePolicy: 'mutual',
      isViewerFollowingTarget: true,
      isTargetFollowingViewer: false,
    }),
    false
  );
  assert.equal(
    evaluateUserOnlineVisibility({
      isTargetConnectedOrRecent: true,
      targetOnlinePolicy: 'mutual',
      isViewerFollowingTarget: true,
      isTargetFollowingViewer: true,
    }),
    true
  );
});
