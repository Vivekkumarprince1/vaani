import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ThemeContext } from '../contexts/ThemeContext';
import Loader from '../components/Loader';
import { Button, Input, Card } from '../components/ui';

const Login = () => {
  const [formData, setFormData] = useState({
    mobileNumber: '',
    password: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login, loading, loadingMessage } = useContext(AuthContext);
  const { isDark } = useContext(ThemeContext);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate mobile number
    if (!/^\d{10}$/.test(formData.mobileNumber)) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    try {
      const result = await login(formData.mobileNumber, formData.password);
      if (result.success) {
        const pendingCallRoomId = sessionStorage.getItem('vaani_join_callRoomId');
        if (pendingCallRoomId) {
          sessionStorage.removeItem('vaani_join_callRoomId');
          navigate(`/join/${pendingCallRoomId}`);
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  if (loading) {
    return <Loader message={loadingMessage} />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      {/* Background gradient effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute w-96 h-96 rounded-full blur-3xl opacity-10 -top-48 -left-48 ${isDark ? 'bg-blue-500' : 'bg-green-400'}`}></div>
        <div className={`absolute w-96 h-96 rounded-full blur-3xl opacity-10 -bottom-48 -right-48 ${isDark ? 'bg-purple-500' : 'bg-blue-300'}`}></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h-2m0 0h-2m2 0v-2m0 2v2m2 0h2m-2 0h-2m2 0v-2m0 2v2" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Vaani</h1>
          </div>
          <p className="text-[var(--color-text-secondary)] text-lg">Welcome Back</p>
          <p className="text-[var(--color-text-tertiary)] text-sm mt-1">Sign in to connect with friends</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl">
          <Card.Body className="space-y-6">
            {/* Error Alert */}
            {error && (
              <div className="p-4 bg-[var(--color-error-bg)] border border-[var(--color-error)] rounded-lg text-[var(--color-error)] text-sm flex gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Mobile Number */}
              <Input
                id="mobileNumber"
                label="Mobile Number"
                type="tel"
                name="mobileNumber"
                value={formData.mobileNumber}
                onChange={handleChange}
                required
                placeholder="Enter 10-digit mobile number"
                pattern="[0-9]{10}"
                error={formData.mobileNumber && !/^\d{10}$/.test(formData.mobileNumber) ? 'Must be 10 digits' : ''}
              />

              {/* Password */}
              <Input
                id="password"
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Enter your password"
              />

              {/* Remember & Forgot Link */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[var(--color-border)] bg-[var(--color-bg-primary)] accent-[var(--color-primary)]"
                  />
                  <span className="text-[var(--color-text-secondary)]">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition-colors">
                  Forgot password?
                </Link>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-12"
                disabled={loading}
                loading={loading}
              >
                Sign In
              </Button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
              <span className="text-xs text-[var(--color-text-tertiary)] font-medium">OR</span>
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
            </div>

            {/* Social Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 py-2.5 px-4 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">Google</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 px-4 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5c-.563-.074-2.313-.227-4.39-.227-4.781 0-8.22 2.921-8.22 8.287v3.667z"/>
                </svg>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">Facebook</span>
              </button>
            </div>
          </Card.Body>
        </Card>

        {/* Sign Up Link */}
        <div className="text-center mt-8">
          <span className="text-[var(--color-text-secondary)]">Don&apos;t have an account? </span>
          <Link to="/register" className="text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] font-semibold transition-colors">
            Create one
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-[var(--color-text-tertiary)] space-y-1">
          <p>Connect with friends through video, audio, and chat</p>
          <p>By signing in, you agree to our Terms of Service and Privacy Policy</p>
        </div>
      </div>
    </div>
  );
};

export default Login;