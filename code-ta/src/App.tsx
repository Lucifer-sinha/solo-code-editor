import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import Playground from './pages/Playground';
const Demo3D = lazy(() => import('./pages/Demo3D'));

import { Code, LogOut } from 'lucide-react';
import { CollabProvider } from './context/CollabContext';
import { AuthProvider, useAuth, AuthContextType } from './context/AuthContext';
import LoginRegisterPage from './pages/LoginRegisterPage';
import RightPanelStack from './components/RightPanelStack';

function RequireAuth() {
  const auth = useAuth() as AuthContextType | null;
  const { isAuthenticated, loading } = auth || { isAuthenticated: false, loading: false };
  const location = useLocation();

  console.log('RequireAuth rendered', { isAuthenticated, loading, user: auth?.user, token: auth?.token });

  if (loading) return <div style={{ color: '#fff', textAlign: 'center', marginTop: 80 }}>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function AuthenticatedLayout() {
  const auth = useAuth() as AuthContextType;
  const { logout, user } = auth;
  return (
    <>
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Code className="w-8 h-8 text-blue-400 mr-3" />
              <span className="text-xl font-bold text-white">𝓢𝒐𝓵𝒐</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex space-x-4">

              </div>
              <div className="flex items-center space-x-4 border-l border-gray-600 pl-4">
                <span className="text-sm text-gray-300">Welcome, {user?.username}</span>
                <button
                  onClick={logout}
                  className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <RightPanelStack />
      <Outlet />
    </>
  );
}



function App() {
  return (
    <AuthProvider>
      <CollabProvider>
        <Router>
          <div className="min-h-screen bg-gray-900">
            <Routes>
              <Route path="/login" element={<LoginRegisterPage />} />
              {/* Public 3D Demo Route */}
              <Route path="/demo" element={<Suspense fallback={<div style={{color:'#fff',textAlign:'center',marginTop:80}}>Loading 3D...</div>}><Demo3D /></Suspense>} />
              {/* Protected routes */}
              <Route element={<RequireAuth />}>
                <Route element={<AuthenticatedLayout />}>
                  <Route path="/" element={<Navigate to="/playground" replace />} />
                  <Route path="/playground" element={<Playground />} />

                </Route>
              </Route>
              {/* Catch-all: redirect to / */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#374151',
                  color: '#fff',
                },
                success: {
                  iconTheme: {
                    primary: '#10B981',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#EF4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </CollabProvider>
    </AuthProvider>
  );
}

export default App;
