import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { NotificationItem } from '../types/travel';
import { apiRequest } from '../utils/api';

interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  lastPolledAt: string | null;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  loading: false,
  lastPolledAt: null,
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchAll',
  async () => {
    const response = await apiRequest<{
      notifications: NotificationItem[];
      unreadCount: number;
    }>('/api/notifications');
    return response;
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  'notifications/markAllRead',
  async () => {
    await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
    return true;
  }
);

export const markNotificationRead = createAsyncThunk(
  'notifications/markOneRead',
  async (id: string) => {
    const response = await apiRequest<{
      notification: NotificationItem;
      unreadCount: number;
    }>(`/api/notifications/${id}/read`, { method: 'PATCH' });
    return { id, unreadCount: response.unreadCount };
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    clearNotifications: (state) => {
      state.items = [];
      state.unreadCount = 0;
      state.lastPolledAt = null;
    },
    setUnreadCount: (state, action: PayloadAction<number>) => {
      state.unreadCount = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.notifications;
        state.unreadCount = action.payload.unreadCount;
        state.lastPolledAt = new Date().toISOString();
      })
      .addCase(fetchNotifications.rejected, (state) => {
        state.loading = false;
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.unreadCount = 0;
        state.items = state.items.map((item) => ({ ...item, isRead: true }));
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        state.unreadCount = action.payload.unreadCount;
        state.items = state.items.map((item) =>
          item._id === action.payload.id ? { ...item, isRead: true } : item
        );
      });
  },
});

export const { clearNotifications, setUnreadCount } = notificationSlice.actions;
export default notificationSlice.reducer;
