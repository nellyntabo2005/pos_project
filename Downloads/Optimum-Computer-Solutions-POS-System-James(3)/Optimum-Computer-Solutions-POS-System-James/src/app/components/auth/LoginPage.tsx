import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { UserRole } from '../../types/auth';
import type { LoginResult } from '../../services/api';

interface LoginPageProps {
  onLogin: (username: string, password: string, role: UserRole) => Promise<LoginResult>;
  onVerifyTwoFactor: (username: string, code: string, role: UserRole) => Promise<LoginResult>;
}

export function LoginPage({ onLogin, onVerifyTwoFactor }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const selectedRole: UserRole = 'cashier';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');

    try {
      const result = await onLogin(email, password, selectedRole);
      if (result.twoFactorRequired) {
        if (!result.verificationCode) {
          throw new Error('Login requires verification, but no verification code was returned.');
        }

        await onVerifyTwoFactor(email, result.verificationCode, selectedRole);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : '';
      setLoginError(message || 'Unable to sign in. Check your backend server and credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage(`Password reset link sent to ${resetEmail}`);
    setTimeout(() => {
      setIsResetOpen(false);
      setResetEmail('');
      setResetMessage('');
    }, 2000);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#9d9c98] p-4">
      <div className="pointer-events-none absolute -left-32 top-1/3 h-1 w-[140%] bg-blue-400/30 blur-sm animate-shimmer-slow [--line-rotate:-22deg]" />
      <div className="pointer-events-none absolute -right-24 top-1/4 h-1 w-[120%] bg-red-400/30 blur-sm animate-shimmer-slow [--line-rotate:35deg]" />
      <div className="pointer-events-none absolute bottom-10 left-0 h-1 w-[90%] bg-blue-500/20 blur-sm animate-shimmer-slow [--line-rotate:18deg]" />

      <Card className="animate-panel-enter relative w-full max-w-xl rounded-xl border border-white/70 bg-white/95 shadow-2xl">
        <CardHeader className="space-y-3 px-8 pb-3 pt-7 text-center">
          <div className="animate-float-slow relative mx-auto mb-2 h-28 w-56">
            <div className="absolute left-4 top-6 h-16 w-48 rotate-[-18deg] rounded-[50%] border-[6px] border-red-600 border-b-transparent border-l-transparent" />
            <div className="absolute left-1 top-8 h-14 w-52 rotate-[18deg] rounded-[50%] border-[4px] border-cyan-500 border-t-transparent border-r-transparent" />
            <div className="absolute inset-x-0 top-6 text-center text-7xl font-black tracking-tight text-cyan-500 drop-shadow-sm">
              POS
            </div>
          </div>
          <CardTitle className="leading-tight">
            <span className="block text-4xl font-black text-blue-950">Sales Entry and Receipt</span>
            <span className="block text-4xl font-black text-red-700">Management System</span>
          </CardTitle>
          <p className="text-lg text-gray-900">Enter your credentials to access the dashboard</p>
        </CardHeader>
        <CardContent className="px-8 pb-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-base font-medium text-gray-900">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-500" />
                <Input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-md border-2 border-black bg-cyan-50 pl-12 text-base text-gray-900 shadow-inner transition-all duration-200 focus-visible:ring-blue-500 focus-visible:shadow-[0_0_0_4px_rgba(37,99,235,0.15)]"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-base font-medium text-gray-900">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-md border-2 border-black bg-cyan-50 pl-12 pr-12 text-base text-gray-900 shadow-inner transition-all duration-200 focus-visible:ring-blue-500 focus-visible:shadow-[0_0_0_4px_rgba(37,99,235,0.15)]"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transform text-gray-500 hover:text-gray-900"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="remember" />
                <label htmlFor="remember" className="text-base text-gray-900">
                  Remember me
                </label>
              </div>
              <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                <DialogTrigger asChild>
                  <button className="text-base text-blue-950 hover:text-blue-700">
                    Forgot password?
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-white border-gray-200">
                  <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">Email Address</label>
                      <Input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="bg-gray-100 border-gray-200"
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                    {resetMessage && (
                      <p className="text-sm text-green-600">{resetMessage}</p>
                    )}
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                      Send Reset Link
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Button type="submit" className="animate-pulse-ring h-12 w-full rounded-md bg-gradient-to-r from-blue-950 via-blue-600 to-blue-950 text-lg text-white shadow-[0_0_22px_rgba(37,99,235,0.8)] hover:from-blue-900 hover:via-blue-500 hover:to-blue-900">
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
            {loginError && (
              <p className="text-sm text-red-600">{loginError}</p>
            )}
          </form>

          <p className="mt-5 text-center text-base text-gray-900">
            Need access? Contact an administrator to create your staff account.
          </p>

          <div className="mt-5 flex items-center justify-center gap-4">
            <div className="h-px w-32 bg-red-700" />
            <div className="h-3 w-3 rounded-full bg-red-700" />
            <div className="h-px w-32 bg-blue-950" />
          </div>

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-900">
              &copy; 2026 Sales Entry and Receipt Management System. All rights reserved.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
