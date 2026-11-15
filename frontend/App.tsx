import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { WorkspaceRoleBar } from './components/WorkspaceRoleBar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { FeedPage } from './pages/FeedPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostFormPage } from './pages/PostFormPage';
import { ProfilePage } from './pages/ProfilePage';
import { TravelMapPage } from './pages/TravelMapPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  AdminLayout,
  AdminReportsTab,
  AdminStatsTab,
  AdminUsersTab,
} from './pages/AdminDashboardPage';
import { LoginPage, RegisterPage, NotFoundPage } from './pages/AuthPages';

const GlobalPostModalManager: React.FC = () => {
  const { user } = useAuth();
  const [modalState, setModalState] = useState<{
    open: boolean;
    editPostId: string | null;
  }>({ open: false, editPostId: null });

  useEffect(() => {
    const handleOpenModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ postId?: string | null }>;
      setModalState({
        open: true,
        editPostId: customEvent.detail?.postId ?? null,
      });
    };

    window.addEventListener('travel:open-post-modal', handleOpenModal);
    return () => {
      window.removeEventListener('travel:open-post-modal', handleOpenModal);
    };
  }, []);

  if (!modalState.open || !user) return null;

  return (
    <PostFormPage
      editPostId={modalState.editPostId}
      onClose={() => setModalState({ open: false, editPostId: null })}
    />
  );
};

export default function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <BrowserRouter>
              <div className="min-h-screen flex flex-col md:flex-row bg-zinc-100 dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 transition-colors pb-14 md:pb-0">
                {/* Left Sidebar (Desktop) / Top & Bottom Bar (Mobile) */}
                <Navbar />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                  <WorkspaceRoleBar />

                  <main className="flex-1">
                    <Routes>
                      {/* Public Routes */}
                      <Route path="/" element={<FeedPage mode="public" />} />
                      <Route path="/map" element={<TravelMapPage />} />
                      <Route path="/posts/:id" element={<PostDetailPage />} />
                      <Route path="/profile/:id" element={<ProfilePage />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />

                      {/* Protected Member Routes */}
                      <Route
                        path="/following"
                        element={
                          <ProtectedRoute>
                            <FeedPage mode="following" />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/posts/new"
                        element={
                          <ProtectedRoute>
                            <>
                              <FeedPage mode="public" />
                              <PostFormPage />
                            </>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/posts/:id/edit"
                        element={
                          <ProtectedRoute>
                            <>
                              <FeedPage mode="public" />
                              <PostFormPage />
                            </>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/notifications"
                        element={
                          <ProtectedRoute>
                            <NotificationsPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/messages"
                        element={
                          <ProtectedRoute>
                            <MessagesPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/messages/:userId"
                        element={
                          <ProtectedRoute>
                            <MessagesPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/settings"
                        element={
                          <ProtectedRoute>
                            <SettingsPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* Protected Admin Nested Routes + <Outlet /> (Yêu cầu #5) */}
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <AdminLayout />
                          </ProtectedRoute>
                        }
                      >
                        <Route index element={<Navigate to="reports" replace />} />
                        <Route path="reports" element={<AdminReportsTab />} />
                        <Route path="users" element={<AdminUsersTab />} />
                        <Route path="stats" element={<AdminStatsTab />} />
                      </Route>

                      {/* 404 Route */}
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </main>
                </div>

                {/* Global Threads-style "New thread" Modal Overlay */}
                <GlobalPostModalManager />
              </div>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </Provider>
  );
}
