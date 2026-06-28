import { isValid, parseISO } from 'date-fns';

export function formatCurrency(amount: number) {
  return '₱' + (amount || 0).toLocaleString('en-PH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
}

export function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Parses a date string into a local midnight Date object, ignoring timezone offsets.
 */
export function parseLocalOnly(dateStr: string): Date | null {
  if (!dateStr) return null;
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return new Date(year, month - 1, day);
}

/**
 * Calculates the portion of a booking's total amount that belongs to a specific month.
 * @param booking The booking object containing totalAmount, checkinDate, and checkoutDate.
 * @param targetMonth 0-indexed month (0 = Jan, 11 = Dec).
 * @param targetYear The 4-digit year.
 * @returns The prorated amount for that month.
 */
export function calculateProratedRevenue(booking: any, targetMonth: number, targetYear: number) {
  const checkin = parseLocalOnly(booking.checkinDate);
  const checkout = parseLocalOnly(booking.checkoutDate);
  const totalAmount = Number(booking.totalAmount) || 0;

  if (!checkin || !checkout || totalAmount <= 0) return 0;

  const totalNights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86400000));
  const nightlyRate = totalAmount / totalNights;

  const targetMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthStart = new Date(targetYear, targetMonth + 1, 1);

  // Intersection of booking nights and target month
  const overlapStart = new Date(Math.max(targetMonthStart.getTime(), checkin.getTime()));
  const overlapEnd = new Date(Math.min(nextMonthStart.getTime(), checkout.getTime()));

  const overlapNights = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
  
  return overlapNights > 0 ? overlapNights * nightlyRate : 0;
}

/**
 * Calculates the portion of a booking's base rate (excluding agent surplus) that belongs to a specific month.
 * @param booking The booking object containing baseRate/totalAmount, checkinDate, and checkoutDate.
 * @param targetMonth 0-indexed month (0 = Jan, 11 = Dec).
 * @param targetYear The 4-digit year.
 * @returns The prorated base amount for that month.
 */
export function calculateProratedBaseRevenue(booking: any, targetMonth: number, targetYear: number) {
  const checkin = parseLocalOnly(booking.checkinDate);
  const checkout = parseLocalOnly(booking.checkoutDate);

  if (!checkin || !checkout) return 0;

  const totalNights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86400000));
  const totalAmount = Number(booking.totalAmount) || 0;
  
  // baseRate in database represents the nightly unit base rate. Total base rate is baseRate * totalNights.
  // Fall back to totalAmount if baseRate is not present.
  const rawBaseAmount = Number(booking.baseRate) ? (Number(booking.baseRate) * totalNights) : totalAmount;
  
  // Cap the total base rate at totalAmount only when it is higher than totalAmount
  const baseAmount = rawBaseAmount > totalAmount ? totalAmount : rawBaseAmount;

  if (baseAmount <= 0) return 0;

  const nightlyRate = baseAmount / totalNights;

  const targetMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthStart = new Date(targetYear, targetMonth + 1, 1);

  // Intersection of booking nights and target month
  const overlapStart = new Date(Math.max(targetMonthStart.getTime(), checkin.getTime()));
  const overlapEnd = new Date(Math.min(nextMonthStart.getTime(), checkout.getTime()));

  const overlapNights = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
  
  return overlapNights > 0 ? overlapNights * nightlyRate : 0;
}

