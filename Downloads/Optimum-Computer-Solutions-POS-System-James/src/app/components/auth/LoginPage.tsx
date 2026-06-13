import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Lock, User, Eye, EyeOff, Mail, BadgeCheck, ChevronDown, Loader2 } from 'lucide-react';
import { UserRole } from '../../types/auth';
import { registerAccount } from '../../services/api';
import type { LoginResult, RegistrationRole } from '../../services/api';

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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createRole, setCreateRole] = useState<RegistrationRole>('cashier');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createMessage, setCreateMessage] = useState('');

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

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateMessage('');

    if (createPassword !== confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    setIsCreatingAccount(true);

    try {
      await registerAccount({
        username: createUsername.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role: createRole
      });

      setEmail(createUsername.trim());
      setPassword('');
      setCreateMessage('Account created. An admin must approve it before login.');
      setCreateUsername('');
      setCreateEmail('');
      setCreatePassword('');
      setConfirmPassword('');
      setCreateRole('cashier');
      setTimeout(() => {
        setIsCreateOpen(false);
        setCreateMessage('');
      }, 1600);
    } catch (error) {
      console.error(error);
      setCreateError(error instanceof Error ? error.message : 'Account could not be created.');
    } finally {
      setIsCreatingAccount(false);
    }
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

          <div className="mt-5 text-center">
            <div className="text-lg text-gray-900">
              Don't have an account?{' '}
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="font-semibold text-blue-950 hover:text-blue-700">
                    Create account
                  </button>
                </DialogTrigger>
                <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-2 border-black bg-white/95 p-8 shadow-2xl sm:max-w-xl">
                  <DialogHeader className="sr-only">
                    <DialogTitle>Create Account</DialogTitle>
                  </DialogHeader>

                  <div className="mx-auto mb-3 flex h-28 w-64 items-center justify-center">
                    <div className="relative h-28 w-64">
                      <div className="absolute left-1 top-8 h-14 w-52 rotate-[18deg] rounded-[50%] border-[4px] border-cyan-500 border-t-transparent border-r-transparent" />
                      <div className="absolute left-6 top-3 h-20 w-52 rotate-[18deg] rounded-[50%] border-[5px] border-red-700 border-b-transparent border-l-transparent" />
                      <span className="absolute left-20 top-8 text-6xl font-black tracking-normal text-cyan-500 drop-shadow-sm">
                        POS
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 text-center">
                    <h2 className="text-5xl font-black tracking-normal text-blue-950">
                      Create Account
                    </h2>
                    <p className="mt-2 text-xl text-gray-900">Enter your details to register</p>
                  </div>

                  <form onSubmit={handleCreateAccount} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-base font-medium text-gray-900">Username</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <Input
                          type="text"
                          value={createUsername}
                          onChange={(e) => setCreateUsername(e.target.value)}
                          className="h-11 rounded-md border-2 border-black bg-cyan-50 pl-12 text-base text-gray-900 shadow-inner focus-visible:ring-blue-500"
                          placeholder="e.g., JohnDoe"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-base font-medium text-gray-900">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <Input
                          type="email"
                          value={createEmail}
                          onChange={(e) => setCreateEmail(e.target.value)}
                          className="h-11 rounded-md border-2 border-black bg-cyan-50 pl-12 text-base text-gray-900 shadow-inner focus-visible:ring-blue-500"
                          placeholder="e.g., john@email.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-base font-medium text-gray-900">Role</label>
                      <div className="relative">
                        <BadgeCheck className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <select
                          value={createRole}
                          onChange={(e) => setCreateRole(e.target.value as RegistrationRole)}
                          className="h-11 w-full appearance-none rounded-md border-2 border-black bg-cyan-50 px-12 text-base text-gray-900 shadow-inner outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="accountant">Accountant</option>
                          <option value="cashier">Cashier</option>
                          <option value="inventory_clerk">Inventory Clerk</option>
                          <option value="manager">Manager</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-base font-medium text-gray-900">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <Input
                          type="password"
                          value={createPassword}
                          onChange={(e) => setCreatePassword(e.target.value)}
                          className="h-11 rounded-md border-2 border-black bg-cyan-50 pl-12 text-base text-gray-900 shadow-inner focus-visible:ring-blue-500"
                          placeholder="Create a password"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-base font-medium text-gray-900">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="h-11 rounded-md border-2 border-black bg-cyan-50 pl-12 text-base text-gray-900 shadow-inner focus-visible:ring-blue-500"
                          placeholder="Confirm your password"
                          required
                        />
                      </div>
                    </div>

                    <div className="text-center text-lg text-gray-900">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(false)}
                        className="font-semibold text-blue-950 hover:text-blue-700"
                      >
                        Sign in
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-4 pt-1">
                      <div className="h-px w-32 bg-red-700" />
                      <div className="h-3 w-3 rounded-full bg-red-700" />
                      <div className="h-px w-32 bg-blue-950" />
                    </div>

                    {createError && (
                      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
                    )}
                    {createMessage && (
                      <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{createMessage}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-md bg-blue-600 text-lg font-semibold text-white shadow-[0_0_18px_rgba(37,99,235,0.65)] hover:bg-blue-700"
                      disabled={isCreatingAccount}
                    >
                      {isCreatingAccount ? 'Creating Account...' : 'Create Account'}
                    </Button>

                    <div className="flex items-center justify-center gap-4">
                      <div className="h-px w-32 bg-red-700" />
                      <div className="h-3 w-3 rounded-full bg-red-700" />
                      <div className="h-px w-32 bg-blue-950" />
                    </div>

                    <p className="text-center text-sm text-gray-900">
                      © 2026 Sales Entry and Receipt Management System. All rights reserved.
                    </p>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4">
            <div className="h-px w-32 bg-red-700" />
            <div className="h-3 w-3 rounded-full bg-red-700" />
            <div className="h-px w-32 bg-blue-950" />
          </div>

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-900">
              © 2026 Sales Entry and Receipt Management System. All rights reserved.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
