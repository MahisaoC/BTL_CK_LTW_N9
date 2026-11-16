import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TravelPost } from '../types/travel';
import { applyLikeTransition } from '../utils/travelRules';

interface FeedState {
  posts: TravelPost[];
  page: number;
  hasMore: boolean;
  total: number;
  loading: boolean;
  activeHashtag: string;
  searchQuery: string;
}

const initialState: FeedState = {
  posts: [],
  page: 1,
  hasMore: true,
  total: 0,
  loading: false,
  activeHashtag: '',
  searchQuery: '',
};

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    setFeedLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setFeedInitialPage: (
      state,
      action: PayloadAction<{
        posts: TravelPost[];
        hasMore: boolean;
        total: number;
      }>
    ) => {
      state.posts = action.payload.posts;
      state.page = 1;
      state.hasMore = action.payload.hasMore;
      state.total = action.payload.total;
      state.loading = false;
    },
    appendFeedPage: (
      state,
      action: PayloadAction<{
        posts: TravelPost[];
        page: number;
        hasMore: boolean;
        total: number;
      }>
    ) => {
      const existingIds = new Set(state.posts.map((p) => p._id));
      const newItems = action.payload.posts.filter((p) => !existingIds.has(p._id));
      state.posts = [...state.posts, ...newItems];
      state.page = action.payload.page;
      state.hasMore = action.payload.hasMore;
      state.total = action.payload.total;
      state.loading = false;
    },
    // Optimistic update for Like button (Yêu cầu riêng Đề 5: cập nhật ngay, lỗi thì hoàn tác)
    optimisticToggleLike: (
      state,
      action: PayloadAction<{ postId: string; userId: string }>
    ) => {
      const { postId, userId } = action.payload;
      state.posts = state.posts.map((post) => {
        if (post._id !== postId) return post;
        const result = applyLikeTransition(post.likes, userId, 'toggle');
        return { ...post, likes: result.likes };
      });
    },
    syncPostLikes: (
      state,
      action: PayloadAction<{ postId: string; likes: string[] }>
    ) => {
      const { postId, likes } = action.payload;
      state.posts = state.posts.map((post) =>
        post._id === postId ? { ...post, likes } : post
      );
    },
    removePostFromFeed: (state, action: PayloadAction<string>) => {
      state.posts = state.posts.filter((post) => post._id !== action.payload);
      state.total = Math.max(0, state.total - 1);
    },
    prependOrUpdatePostInFeed: (state, action: PayloadAction<TravelPost>) => {
      const incoming = action.payload;
      const existsIdx = state.posts.findIndex((p) => p._id === incoming._id);
      if (existsIdx >= 0) {
        state.posts[existsIdx] = incoming;
      } else {
        state.posts = [incoming, ...state.posts];
        state.total += 1;
      }
    },
    setActiveHashtag: (state, action: PayloadAction<string>) => {
      state.activeHashtag = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
  },
});

export const {
  setFeedLoading,
  setFeedInitialPage,
  appendFeedPage,
  optimisticToggleLike,
  syncPostLikes,
  removePostFromFeed,
  prependOrUpdatePostInFeed,
  setActiveHashtag,
  setSearchQuery,
} = feedSlice.actions;

export default feedSlice.reducer;
