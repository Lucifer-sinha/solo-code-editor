import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Code, Eye, EyeOff, User, Mail, Lock, Sparkles, ArrowRight, Github, Twitter, Chrome } from 'lucide-react';
import toast from 'react-hot-toast';

console.log('LoginRegisterPage rendered');

export default function LoginRegisterPage() {
  const { login, register, loading } = useAuth() || {};
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  // Animation trigger on mode change
  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 600);
    return () => clearTimeout(timer);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    
    try {
      if (mode === 'login') {
        if (!username || !password) {
          setError('Please fill in all fields');
          return;
        }
        if (login) {
          await login(username, password);
          toast.success(`Welcome back, ${username}!`, {
            icon: '🎉',
            style: {
              borderRadius: '10px',
              background: '#1f2937',
              color: '#fff',
            },
          });
          navigate(from, { replace: true });
        }
      } else {
        if (!username || !email || !password) {
          setError('Please fill in all fields');
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          return;
        }
        if (register) {
          await register(username, email, password);
          toast.success('Registration successful! Please login.', {
            icon: '✨',
            style: {
              borderRadius: '10px',
              background: '#1f2937',
              color: '#fff',
            },
          });
          setMode('login');
          setUsername('');
          setEmail('');
          setPassword('');
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
        toast.error(err.message, {
          style: {
            borderRadius: '10px',
            background: '#ef4444',
            color: '#fff',
          },
        });
      } else {
        setError('An unknown error occurred');
        toast.error('An unknown error occurred');
      }
    }
  };

  const toggleMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setUsername('');
    setEmail('');
    setPassword('');
    setFocusedField(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        
        {/* Floating Particles */}
        <div className="floating-particles">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 20}s`,
                animationDuration: `${20 + Math.random() * 20}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Header Section */}
        <div className={`text-center transition-all duration-600 ${isAnimating ? 'animate-pulse' : ''}`}>
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-lg opacity-75 animate-pulse"></div>
              <div className="relative bg-gradient-to-r from-blue-500 to-purple-600 p-4 rounded-full shadow-2xl">
                <Code className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
          
          <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent mb-3">
            {mode === 'login' ? 'Welcome Back' : 'Join Code TA'}
          </h2>
          
          <p className="text-gray-300 text-lg">
            {mode === 'login' 
              ? 'Continue your coding journey' 
              : 'Start building something amazing'
            }
          </p>
          
          <div className="flex justify-center mt-4">
            <Sparkles className="w-5 h-5 text-yellow-400 animate-bounce" />
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6">
          {/* Mode Toggle */}
          <div className="flex bg-gray-800/50 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => toggleMode('login')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all duration-300 ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => toggleMode('register')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all duration-300 ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Username Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 block">Username</label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                  focusedField === 'username' ? 'text-blue-400' : 'text-gray-400'
                }`}>
                  <User className="h-5 w-5" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  className="block w-full px-4 py-3 pl-12 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:bg-gray-800/70"
                  placeholder="Enter your username"
                />
                <div className={`absolute inset-0 rounded-xl border-2 pointer-events-none transition-opacity duration-200 ${
                  focusedField === 'username' ? 'border-blue-500 opacity-100' : 'opacity-0'
                }`}></div>
              </div>
            </div>

            {/* Email Field (Register only) */}
            {mode === 'register' && (
              <div className="space-y-2 animate-slideDown">
                <label className="text-sm font-medium text-gray-200 block">Email Address</label>
                <div className="relative group">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                    focusedField === 'email' ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="block w-full px-4 py-3 pl-12 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:bg-gray-800/70"
                    placeholder="Enter your email"
                  />
                  <div className={`absolute inset-0 rounded-xl border-2 pointer-events-none transition-opacity duration-200 ${
                    focusedField === 'email' ? 'border-blue-500 opacity-100' : 'opacity-0'
                  }`}></div>
                </div>
              </div>
            )}

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 block">Password</label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                  focusedField === 'password' ? 'text-blue-400' : 'text-gray-400'
                }`}>
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="block w-full px-4 py-3 pl-12 pr-12 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:bg-gray-800/70"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-400 transition-colors duration-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                <div className={`absolute inset-0 rounded-xl border-2 pointer-events-none transition-opacity duration-200 ${
                  focusedField === 'password' ? 'border-blue-500 opacity-100' : 'opacity-0'
                }`}></div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 backdrop-blur-sm border border-red-500/20 rounded-xl p-4 animate-shake">
                <p className="text-red-300 text-sm flex items-center">
                  <span className="w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse"></span>
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-2xl"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  {mode === 'login' ? 'Signing you in...' : 'Creating your account...'}
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
                </div>
              )}
              
              {/* Button Glow Effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl"></div>
            </button>
          </form>

          {/* Social Login Options */}
          <div className="pt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-800/50 text-gray-400 rounded-full">Or continue with</span>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-3 gap-3">
              <button className="group bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded-xl p-3 transition-all duration-200 hover:scale-105">
                <Github className="h-5 w-5 text-gray-400 group-hover:text-white mx-auto" />
              </button>
              <button className="group bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded-xl p-3 transition-all duration-200 hover:scale-105">
                <Twitter className="h-5 w-5 text-gray-400 group-hover:text-blue-400 mx-auto" />
              </button>
              <button className="group bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded-xl p-3 transition-all duration-200 hover:scale-105">
                <Chrome className="h-5 w-5 text-gray-400 group-hover:text-red-400 mx-auto" />
              </button>
            </div>
          </div>

          {/* Test Accounts (Login mode only) */}
          {mode === 'login' && (
            <div className="bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/20 rounded-xl p-4 mt-6">
              <p className="text-yellow-300 text-xs font-medium mb-2 flex items-center">
                <Sparkles className="w-3 h-3 mr-1" />
                Quick Test Accounts
              </p>
              <div className="space-y-1 text-xs text-yellow-200/80">
                <p><span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">alice</span> / <span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">password123</span></p>
                <p><span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">bob</span> / <span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">password123</span></p>
                <p><span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">charlie</span> / <span className="font-mono bg-yellow-500/20 px-2 py-1 rounded">password123</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-400">
          <p>By continuing, you agree to our</p>
          <div className="flex justify-center space-x-4 mt-2">
            <a href="#" className="hover:text-blue-400 transition-colors duration-200">Terms of Service</a>
            <span>•</span>
            <a href="#" className="hover:text-blue-400 transition-colors duration-200">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
