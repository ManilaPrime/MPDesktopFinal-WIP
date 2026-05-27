
'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useDateStore } from '@/lib/date-store';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { month, year, setMonth, setYear } = useDateStore();

  const settingsRef = useMemo(
    () => (user ? doc(firestore, 'users', user.uid, 'settings', 'config') : null),
    [firestore, user?.uid]
  );
  const { data: settings } = useDoc(settingsRef);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 7 }, (_, i) => 2024 + i);

  return (
    <header className="gradient-header text-white p-4 shadow-lg shrink-0 relative z-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            🏢 {settings?.systemTitle || 'Manila Prime Property Management'}
          </h1>
          <p className="text-sm opacity-90">
            {settings?.companyName || 'Manila Prime Staycation'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px] bg-white text-gray-800 border-none h-10">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px] bg-white text-gray-800 border-none h-10">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
