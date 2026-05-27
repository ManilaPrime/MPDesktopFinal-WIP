import { startOfMonth, endOfMonth, differenceInDays, max, min, addMonths, isValid, parseISO } from 'date-fns';

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
 * Calculates the portion of a booking's total amount that belongs to a specific month.
 * @param booking The booking object containing totalAmount, checkinDate, and checkoutDate.
 * @param targetMonth 0-indexed month (0 = Jan, 11 = Dec).
 * @param targetYear The 4-digit year.
 * @returns The prorated amount for that month.
 */
export function calculateProratedRevenue(booking: any, targetMonth: number, targetYear: number) {
  const checkin = booking.checkinDate ? parseISO(booking.checkinDate) : null;
  const checkout = booking.checkoutDate ? parseISO(booking.checkoutDate) : null;
  const totalAmount = Number(booking.totalAmount) || 0;

  if (!checkin || !checkout || !isValid(checkin) || !isValid(checkout) || totalAmount <= 0) return 0;

  const totalNights = Math.max(1, differenceInDays(checkout, checkin));
  const nightlyRate = totalAmount / totalNights;

  const targetMonthStart = startOfMonth(new Date(targetYear, targetMonth));
  const targetMonthEnd = endOfMonth(new Date(targetYear, targetMonth));
  const nextMonthStart = addMonths(targetMonthStart, 1);

  // Intersection of booking nights and target month
  const overlapStart = max([targetMonthStart, checkin]);
  const overlapEnd = min([nextMonthStart, checkout]);

  const overlapNights = differenceInDays(overlapEnd, overlapStart);
  
  return overlapNights > 0 ? overlapNights * nightlyRate : 0;
}
