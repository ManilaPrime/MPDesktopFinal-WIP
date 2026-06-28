import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  getDaysInMonth,
  parseLocalOnly,
  calculateProratedRevenue,
  calculateProratedBaseRevenue,
} from '../utils-app';

// ponytail: Basic clean tests for currency formatting, date parsing, and revenue calculations.

describe('formatCurrency helper', () => {
  it('formats amount to Philippine Peso without decimals', () => {
    expect(formatCurrency(1500)).toBe('₱1,500');
    expect(formatCurrency(0)).toBe('₱0');
  });
});

describe('getDaysInMonth helper', () => {
  it('returns correct days in a month', () => {
    expect(getDaysInMonth(1, 2024)).toBe(29); // February leap year
    expect(getDaysInMonth(1, 2023)).toBe(28); // February regular year
    expect(getDaysInMonth(0, 2024)).toBe(31); // January
  });
});

describe('parseLocalOnly helper', () => {
  it('parses YYYY-MM-DD date string ignoring timezone', () => {
    const parsed = parseLocalOnly('2026-06-25T14:30:00Z');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5); // 0-indexed (June = 5)
    expect(parsed?.getDate()).toBe(25);
  });

  it('returns null for empty or invalid inputs', () => {
    expect(parseLocalOnly('')).toBeNull();
    expect(parseLocalOnly('invalid-date')).toBeNull();
  });
});

describe('calculateProratedRevenue helper', () => {
  it('calcules correct overlap revenue when booking spans across months', () => {
    const booking = {
      checkinDate: '2026-05-28',
      checkoutDate: '2026-06-03',
      totalAmount: 6000, // 6 nights -> 1000 per night
    };

    // May: May 28, 29, 30, 31 (4 nights)
    const mayRev = calculateProratedRevenue(booking, 4, 2026);
    expect(mayRev).toBe(4000);

    // June: June 1, 2 (2 nights)
    const juneRev = calculateProratedRevenue(booking, 5, 2026);
    expect(juneRev).toBe(2000);
  });
});
