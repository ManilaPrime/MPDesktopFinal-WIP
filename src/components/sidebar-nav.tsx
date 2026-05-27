'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Home,
  CreditCard,
  DollarSign,
  Users,
  Handshake,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Wand2,
  Bell,
  Loader2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Calendar', href: '/calendar/', icon: CalendarDays },
  { name: 'Bookings', href: '/bookings/', icon: ClipboardList },
  { name: 'Units', href: '/units/', icon: Home },
  { name: 'Payments', href: '/payments/', icon: CreditCard },
  { name: 'Expenses', href: '/expenses/', icon: DollarSign },
  { name: 'Investors', href: '/investors/', icon: Users },
  { name: 'Agents', href: '/agents/', icon: Handshake },
  { name: 'Reminders', href: '/reminders/', icon: Bell },
  { name: 'AI Assistant', href: '/ai-assistant/', icon: Wand2 },
  { name: 'Reports', href: '/analytics/', icon: BarChart3 },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const normalizedPathname = React.useMemo(() => {
    if (!pathname) return '/';
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  }, [pathname]);

  React.useEffect(() => {
    setPendingHref(null);
  }, [normalizedPathname]);

  React.useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const prefetchAll = () => {
      for (const item of navItems) {
        try {
          router.prefetch(item.href);
        } catch {
          // Ignore prefetch errors in desktop webviews.
        }
      }

      try {
        router.prefetch('/settings/');
      } catch {}
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(prefetchAll, { timeout: 1000 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timeout = window.setTimeout(prefetchAll, 250);
    return () => window.clearTimeout(timeout);
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login/');
  };

  const onNavigate = (href: string) => {
    const target = href === '/' ? '/' : href.endsWith('/') ? href : `${href}/`;
    if (target === normalizedPathname) {
      setIsOpen(false);
      return;
    }

    setPendingHref(target);
    setIsOpen(false);

    React.startTransition(() => {
      router.push(target);
    });
  };

  const itemClassName = (isActive: boolean) =>
    cn(
      'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 group text-left',
      isActive
        ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
        : 'text-gray-600 hover:bg-amber-50 hover:text-amber-600'
    );

  return (
    <>
      <Button
        variant="ghost"
        className="md:hidden fixed top-4 left-4 z-50 h-10 w-10 p-0"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform bg-white border-r transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-full md:block shrink-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const target = item.href === '/' ? '/' : (item.href.endsWith('/') ? item.href : `${item.href}/`);
              const isActive = normalizedPathname === target;
              const isPending = pendingHref === target;

              return (
                <Link
                  key={item.name}
                  href={target}
                  prefetch
                  onMouseEnter={() => router.prefetch(target)}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(target);
                  }}
                  className={itemClassName(isActive)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isPending ? (
                    <Loader2 className={cn('h-5 w-5 animate-spin', isActive ? 'text-white' : 'text-amber-600')} />
                  ) : (
                    <item.icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-gray-400 group-hover:text-amber-600')} />
                  )}
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t space-y-2 shrink-0">
            <Link
              href="/settings/"
              prefetch
              onMouseEnter={() => router.prefetch('/settings/')}
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/settings/');
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors"
            >
              {pendingHref === '/settings/' ? <Loader2 className="h-5 w-5 animate-spin text-amber-600" /> : <Settings className="h-5 w-5 text-gray-400" />}
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <LogOut className="h-5 w-5 text-gray-400" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
