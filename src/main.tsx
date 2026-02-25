import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './index.css'
import { ThemeProvider } from './components/ThemeProvider'
import { Layout } from './components/Layout'
import { JournalView } from './views/JournalView'
import { StatsView } from './views/StatsView'
import { ProfileView } from './views/ProfileView'
import { AuthProvider } from './contexts/AuthContext'
import { AuthView } from './views/AuthView'
import { ProtectedRoute } from './components/ProtectedRoute'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<AuthView />} />

              {/* Protected routes */}
              <Route path="/" element={
                 <ProtectedRoute>
                   <Layout />
                 </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/journal" replace />} />
                <Route path="journal" element={<JournalView />} />
                <Route path="stats" element={<StatsView />} />
                <Route path="profile" element={<ProfileView />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
