import React, { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { UserRole } from '../types/auth';
import { useAppLanguage } from '../services/language';
import { canAccessModule, roleLabel, type AppModuleId } from '../services/permissions';

const allMenuItems = [
  { label: 'Dashboard', id: 'dashboard' },
  { label: 'POS / Sales', id: 'pos' },
  { label: 'Invoices', id: 'invoices' },
  { label: 'Customers', id: 'customers' },
  { label: 'Stock levels', id: 'products' },
  { label: 'Procurement', id: 'procurement' },
  { label: 'Inventory', id: 'inventory' },
  { label: 'Expenses', id: 'expenses' },
  { label: 'Reports', id: 'reports' },
  { label: 'Users / Staff', id: 'users' },
  { label: 'Settings', id: 'settings' }
] satisfies Array<{ label: string; id: AppModuleId }>;

interface SidebarProps {
  activeItem: string;
  onItemClick: (itemId: string) => void;
  onLogout: () => void;
  userRole: UserRole;
  userName: string;
}

export function Sidebar({ activeItem, onItemClick, onLogout, userRole, userName }: SidebarProps) {
  const { t } = useAppLanguage();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const filteredMenuItems = useMemo(
    () => allMenuItems.filter(item => canAccessModule(item.id, userRole)),
    [userRole]
  );

  const getRoleBadgeColor = (role: UserRole) => {
    switch(role) {
      case 'super_admin':
        return 'bg-red-100 text-red-800';
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'cashier':
        return 'bg-blue-100 text-blue-800';
      case 'accountant':
        return 'bg-purple-100 text-purple-800';
      case 'manager':
        return 'bg-emerald-100 text-emerald-800';
      case 'storekeeper':
      case 'inventory_clerk':
        return 'bg-amber-100 text-amber-800';
      case 'viewer':
        return 'bg-slate-100 text-slate-800';
      case 'customer':
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="sticky top-0 h-screen w-60 shrink-0 overflow-hidden border-r border-gray-200 bg-white flex flex-col">
      {/* Logo/Brand */}
      <div className="p-5 border-b border-gray-100">
        <h2 className="text-gray-900 font-semibold text-lg tracking-tight">SALES ENTRY & RECEIPT</h2>
        <p className="text-gray-400 text-xs mt-0.5">{t('Management System')}</p>
      </div>

      {/* User Info */}
      <div className="px-5 py-3 border-b border-gray-100 bg-slate-50">
        <p className="text-xs text-gray-500 mb-1">{t('Logged in as')}</p>
        <p className="text-sm font-semibold text-gray-900">{userName}</p>
        <Badge className={`mt-2 ${getRoleBadgeColor(userRole)}`}>
          {roleLabel(userRole)}
        </Badge>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 p-3 space-y-0.5 overflow-hidden">
        {filteredMenuItems.map((item) => {
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                setIsLogoutConfirmOpen(false);
                onItemClick(item.id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-blue-600" />}
              <span className="block truncate pl-2">{t(item.label)}</span>
            </button>
          );
        })}
      </div>

      {/* Logout Button */}
      <div className="relative p-3 border-t border-gray-100">
        {isLogoutConfirmOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-md border border-gray-200 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">{t('Log out?')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('End this session and return to sign in.')}</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 flex-1 text-xs"
                onClick={() => setIsLogoutConfirmOpen(false)}
              >
                {t('Stay')}
              </Button>
              <Button
                type="button"
                className="h-8 flex-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  onLogout();
                }}
              >
                {t('Logout')}
              </Button>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-500 hover:text-gray-900 hover:bg-gray-100 text-sm"
          onClick={() => setIsLogoutConfirmOpen(previous => !previous)}
        >
          {t('Logout')}
        </Button>
      </div>
    </div>
  );
}
