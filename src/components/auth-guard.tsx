'use client';

import React, { useEffect, useMemo } from 'react';
import { useUser } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/header';
import { SidebarNav } from '@/components/sidebar-nav';
import { AppShellPreloader } from '@/components/app-shell-preloader';

/**
 * @fileOverview Protects routes and handles the initial loading state for the desktop app.
 * Optimized for Tauri/Static Export with robust path normalization for trailingSlash: true.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Robust path comparison for static export trailing slashes
  const isLoginPage = useMemo(() => {
    if (!pathname) return false;
    const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
    return normalized === '/login/';
  }, [pathname]);

  useEffect(() => {
    // If auth state is determined and no user is present, redirect to login
    // Always use the trailing slash to match the static file structure in Tauri
    if (!isUserLoading && !user && !isLoginPage) {
      router.push('/login/');
    }
  }, [user, isUserLoading, isLoginPage, router]);

  // Show a professional loader while checking initial auth status
  if (isUserLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
        <div className="p-8 bg-white rounded-2xl shadow-xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
          <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Initialising HostFlow...</p>
        </div>
      </div>
    );
  }

  // If on login page, just show the login content
  if (isLoginPage) {
    return <>{children}</>;
  }

  // If not logged in, render nothing while redirect happens
  if (!user) {
    return null;
  }

  // Default Shell for authenticated users
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav />
        <AppShellPreloader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
