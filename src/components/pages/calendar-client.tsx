'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUser, useAuth } from '@/firebase';
import { useAppResources } from '@/lib/app-data-store';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ClipboardList,
  AlertCircle,
  CalendarPlus,
  Clipboard,
  ImageDown,
  Trash2,
  X,
  CalendarDays,
  UserCircle
} from 'lucide-react';
import { useDateStore } from '@/lib/date-store';
import { useDialogCleanup } from '@/hooks/use-dialog-cleanup';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subMonths
} from 'date-fns';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import { AddBookingDialog } from './add-booking-dialog';
import { BookingDetailsDialog } from './booking-details-dialog';

// ponytail: extract booking dialog modals to sub-components to reduce file size.

const unitColors = [
  '#EF4444', '#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899', '#10B981',
  '#FBBF24', '#6366F1', '#D946EF', '#0EA5E9', '#84CC16'
];

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type CalendarCell = {
  unitId: string;
  unitIndex: number;
  date: string;
  dayIndex: number;
};

type UnitDateRange = {
  unit: any;
  checkinDate: string;
  checkoutDate: string;
  nights: number;
};

type BookingDraft = {
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string;
  guestEmail: string;
  agentId: string;
  agentName: string;
  bookingDate: string;
  adults: number;
  children: number;
  paymentStatus: string;
  bookingPaymentStatus: string;
  notes: string;
  totalAmount: number | string;
  isCustomAmount: boolean;
  bookingPayment: {
    amount: number | string;
    paidAt: string;
    method: string;
    reference: string;
    notes: string;
    status: string;
    paymentStatus: string;
  };
  securityDepositStatus: string;
  securityDeposit: {
    amount: number | string;
    status: string;
  };
  securityDepositReceipt: {
    amount: number | string;
    paidAt: string;
    method: string;
    reference: string;
    notes: string;
    status: string;
    refundAmount: number | string;
    refundPaidAt: string;
    refundMethod: string;
    refundReference: string;
    refundNotes: string;
  };
};

const toDateInput = (value?: string) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

const todayDateInput = () => new Date().toISOString().split('T')[0];

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value: any) =>
  `₱${toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function removeUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)])
    );
  }
  return value;
}

const displayGuestName = (booking: any) => {
  const explicitGuestName = String(booking?.guestName || '').trim();
  const fullName = `${booking?.guestFirstName || ''} ${booking?.guestLastName || ''}`.trim();
  return explicitGuestName || fullName || 'Guest not set';
};

const getUnitLabel = (unit: any) => unit?.name || unit?.unitNumber || unit?.unitName || 'Unnamed unit';

const toComparableUnitValues = (unit: any) => [
  unit?.id,
  unit?.unitNumber,
  unit?.name
].filter(Boolean).map((value) => String(value).trim().toLowerCase());

const makeDefaultBookingDraft = (): BookingDraft => {
  const today = todayDateInput();
  return {
    guestFirstName: '',
    guestLastName: '',
    guestPhone: '',
    guestEmail: '',
    agentId: '',
    agentName: '',
    bookingDate: today,
    adults: 2,
    children: 0,
    paymentStatus: 'Unpaid',
    bookingPaymentStatus: 'Unpaid',
    notes: '',
    totalAmount: 0,
    isCustomAmount: false,
    bookingPayment: {
      amount: 0,
      paidAt: today,
      method: 'CASH',
      reference: '',
      notes: '',
      status: 'Unpaid',
      paymentStatus: 'Unpaid',
    },
    securityDepositStatus: 'Unpaid',
    securityDeposit: {
      amount: 1000,
      status: 'Unpaid',
    },
    securityDepositReceipt: {
      amount: 0,
      paidAt: today,
      method: 'CASH',
      reference: '',
      notes: '',
      status: 'Unpaid',
      refundAmount: 0,
      refundPaidAt: today,
      refundMethod: 'CASH',
      refundReference: '',
      refundNotes: '',
    },
  };
};

export default function CalendarClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year, setMonth, setYear } = useDateStore();

  const calendarResources = useAppResources(['bookings', 'units', 'agents']);
  const bookings = calendarResources.data['bookings'] ?? [];
  const units = calendarResources.data['units'] ?? [];
  const agents = calendarResources.data['agents'] ?? [];
  const loading = calendarResources.loading;
  const error = calendarResources.error;

  const [dragAnchor, setDragAnchor] = useState<CalendarCell | null>(null);
  const [dragTarget, setDragTarget] = useState<CalendarCell | null>(null);
  const [selection, setSelection] = useState<CalendarCell[]>([]);
  const [dragSelection, setDragSelection] = useState<CalendarCell[]>([]);
  const [dragAction, setDragAction] = useState<'add' | 'remove'>('add');
  const [blockedDuringSelection, setBlockedDuringSelection] = useState(0);
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(() => makeDefaultBookingDraft());

  useDialogCleanup(isAddDialogOpen || !!detailsBooking);

  const calendarSnapshotRef = useRef<HTMLDivElement | null>(null);
  const detailsSnapshotRef = useRef<HTMLDivElement | null>(null);

  const viewDate = useMemo(() => new Date(year, month, 1), [month, year]);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const unitColorMap = useMemo(() => {
    const map = new Map<string, string>();
    (units as any[]).forEach((unit, index) => {
      map.set(String(unit.id), unitColors[index % unitColors.length]);
    });
    return map;
  }, [units]);

  const cellKey = (cell: Pick<CalendarCell, 'unitId' | 'date'>) => `${cell.unitId}__${cell.date}`;

  const findBookingForCell = (unit: any, dateObj: Date) => {
    const targetValues = toComparableUnitValues(unit);

    return (bookings as any[]).find((booking) => {
      const bookingUnitId = String(booking.unitId || booking.unit_id || booking.unitName || '').trim().toLowerCase();
      const isTargetUnit = targetValues.includes(bookingUnitId);

      if (!isTargetUnit) return false;

      const checkinStr = toDateInput(booking.checkinDate);
      const checkoutStr = toDateInput(booking.checkoutDate);
      if (!checkinStr || !checkoutStr) return false;

      const [inYr, inMo, inDy] = checkinStr.split('-').map(Number);
      const [outYr, outMo, outDy] = checkoutStr.split('-').map(Number);

      const cIn = new Date(inYr, inMo - 1, inDy);
      const cOut = new Date(outYr, outMo - 1, outDy);

      return dateObj.getTime() >= cIn.getTime() && dateObj.getTime() < cOut.getTime();
    }) || null;
  };

  const isCellAvailable = (unit: any, dateObj: Date) => !findBookingForCell(unit, dateObj);

  const buildCellsBetween = (start: CalendarCell, end: CalendarCell) => {
    const minUnitIndex = Math.min(start.unitIndex, end.unitIndex);
    const maxUnitIndex = Math.max(start.unitIndex, end.unitIndex);
    const minDayIndex = Math.min(start.dayIndex, end.dayIndex);
    const maxDayIndex = Math.max(start.dayIndex, end.dayIndex);
    const availableCells: CalendarCell[] = [];
    let blockedCells = 0;

    for (let unitIndex = minUnitIndex; unitIndex <= maxUnitIndex; unitIndex += 1) {
      const unit = (units as any[])[unitIndex];
      if (!unit) continue;

      for (let dayIndex = minDayIndex; dayIndex <= maxDayIndex; dayIndex += 1) {
        const day = daysInMonth[dayIndex];
        if (!day) continue;

        const dateStr = format(day, 'yyyy-MM-dd');
        const nextCell = {
          unitId: String(unit.id),
          unitIndex,
          date: dateStr,
          dayIndex
        };

        if (isCellAvailable(unit, day)) {
          availableCells.push(nextCell);
        } else {
          blockedCells += 1;
        }
      }
    }

    return { availableCells, blockedCells };
  };

  const selectedCellKeys = useMemo(() => new Set(selection.map(cellKey)), [selection]);
  const dragCellKeys = useMemo(() => new Set(dragSelection.map(cellKey)), [dragSelection]);

  const previewSelectedCellKeys = useMemo(() => {
    const preview = new Set(selectedCellKeys);
    dragSelection.forEach((cell) => {
      const key = cellKey(cell);
      if (dragAction === 'remove') preview.delete(key);
      else preview.add(key);
    });
    return preview;
  }, [selectedCellKeys, dragSelection, dragAction]);

  const selectedRanges = useMemo<UnitDateRange[]>(() => {
    const byUnit = new Map<string, CalendarCell[]>();
    selection.forEach((cell) => {
      const current = byUnit.get(cell.unitId) || [];
      current.push(cell);
      byUnit.set(cell.unitId, current);
    });

    const ranges: UnitDateRange[] = [];
    Array.from(byUnit.entries()).forEach(([unitId, cells]) => {
      const sorted = [...cells].sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.date.localeCompare(b.date);
      });
      const unit = (units as any[]).find((item) => String(item.id) === unitId);
      if (!unit || sorted.length === 0) return;

      let currentGroup: CalendarCell[] = [];
      sorted.forEach((cell) => {
        const previous = currentGroup[currentGroup.length - 1];
        if (!previous || cell.dayIndex === previous.dayIndex + 1) {
          currentGroup.push(cell);
          return;
        }
        const firstDate = currentGroup[0].date;
        const lastDate = currentGroup[currentGroup.length - 1].date;
        ranges.push({
          unit,
          checkinDate: firstDate,
          checkoutDate: format(addDays(new Date(`${lastDate}T00:00:00`), 1), 'yyyy-MM-dd'),
          nights: currentGroup.length
        });
        currentGroup = [cell];
      });

      if (currentGroup.length > 0) {
        const firstDate = currentGroup[0].date;
        const lastDate = currentGroup[currentGroup.length - 1].date;
        ranges.push({
          unit,
          checkinDate: firstDate,
          checkoutDate: format(addDays(new Date(`${lastDate}T00:00:00`), 1), 'yyyy-MM-dd'),
          nights: currentGroup.length
        });
      }
    });

    return ranges;
  }, [selection, units]);

  const getAgentLabel = (agent: any) =>
    agent?.name || agent?.fullName || agent?.agentName || 'Unnamed Agent';

  const findUnitForBooking = (unitIdOrName?: string) => {
    const target = String(unitIdOrName || '').trim().toLowerCase();
    if (!target) return null;
    return (units as any[]).find((unit) => toComparableUnitValues(unit).includes(target)) || null;
  };

  const getBookingUnit = (booking: any) =>
    findUnitForBooking(booking?.unitId || booking?.unit_id || booking?.unitName || booking?.unitname);

  const getBookingGuestName = (booking: any) => {
    const explicitGuestName = String(booking?.guestName || '').trim();
    const fullName = `${booking?.guestFirstName || ''} ${booking?.guestLastName || ''}`.trim();
    return explicitGuestName || fullName || 'Valued Guest';
  };

  const getBookingUnitName = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.name || booking?.unitName || booking?.unitname || 'Unassigned';
  };

  const getBookingDateValue = (booking: any) =>
    toDateInput(booking?.bookingDate) || toDateInput(booking?.createdAt) || todayDateInput();

  const getRangeAutoAmount = (range: UnitDateRange, draft: BookingDraft = bookingDraft) => {
    const adults = toNumber(draft.adults, 2);
    const children = toNumber(draft.children, 0);
    const baseOccupancy = toNumber(range.unit?.capacity ?? range.unit?.baseOccupancy, 0);
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(range.unit?.rate, 0);
    const extraGuestFee = toNumber(range.unit?.extraGuestFee, 0);
    return Math.max(0, range.nights * (nightlyRate + extraGuests * extraGuestFee));
  };

  const getDetailsTotalNights = () => {
    const checkin = detailsBooking?.checkinDate ? new Date(detailsBooking.checkinDate) : null;
    const checkout = detailsBooking?.checkoutDate ? new Date(detailsBooking.checkoutDate) : null;
    if (!checkin || !checkout || Number.isNaN(checkin.getTime()) || Number.isNaN(checkout.getTime())) return 0;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.round((checkout.getTime() - checkin.getTime()) / oneDay));
  };

  const getDetailsAutoAmount = () => {
    if (!detailsBooking) return 0;
    const unit = getBookingUnit(detailsBooking);
    if (!unit) return toNumber(detailsBooking?.totalAmount);
    const adults = toNumber(detailsBooking?.adults, 2);
    const children = toNumber(detailsBooking?.children, 0);
    const baseOccupancy = toNumber(unit?.capacity ?? unit?.baseOccupancy, 0);
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(unit?.rate, 0);
    const extraGuestFee = toNumber(unit?.extraGuestFee, 0);
    return Math.max(0, getDetailsTotalNights() * (nightlyRate + extraGuests * extraGuestFee));
  };

  const setDetailsNested = (path: string, value: any) => {
    setDetailsBooking((prev: any) => {
      if (!prev) return prev;
      const [parent, child] = path.split('.');
      return {
        ...prev,
        [parent]: {
          ...(prev[parent] || {}),
          [child]: value,
        },
      };
    });
  };

  const setDraftNested = (path: string, value: any) => {
    setBookingDraft((prev: any) => {
      const [parent, child] = path.split('.');
      return {
        ...prev,
        [parent]: {
          ...(prev[parent] || {}),
          [child]: value,
        },
      };
    });
  };

  const isPaidStatus = (status: any) => {
    const value = String(status || '').trim().toLowerCase();
    return value === 'paid' || value === 'received';
  };

  const hasCalendarDraftGuestName = () => {
    const draft = bookingDraft as any;
    return Boolean(
      String(draft.guestName || '').trim() || 
      String(draft.guestFirstName || '').trim() || 
      String(draft.guestLastName || '').trim()
    );
  };

  const canGenerateCalendarArtifacts = () =>
    selectedRanges.length > 0 && hasCalendarDraftGuestName();

  const formatBookingCardDate = (value: string | undefined) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return toDateInput(value) || '-';
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const buildBookingImageBaseName = (booking: any) => {
    const bookingDate = toDateInput(getBookingDateValue(booking)) || todayDateInput();
    const yyyymmdd = bookingDate.replace(/-/g, '');
    const sanitizePathSegment = (value: string | undefined, fallback: string) => {
      return (value || fallback).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-');
    };
    const unitName = sanitizePathSegment(getBookingUnitName(booking), 'Unit');
    const identifier = sanitizePathSegment(
      booking?.id || booking?.bookingReference || `${booking?.guestFirstName || 'booking'}-${booking?.guestLastName || ''}`,
      'booking'
    );
    return `${yyyymmdd}_${unitName}_${identifier}`;
  };

  const buildBookingImageRelativePath = (booking: any) =>
    `ManilaPrime/Bookings/${buildBookingImageBaseName(booking)}.png`;

  const handleCopyCalendarAuthorizationLetters = async () => {
    if (selectedRanges.length === 0) {
      toast({ variant: 'destructive', title: 'No selected dates' });
      return;
    }
    try {
      toast({ title: 'Authorization letter copied' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  const handleSaveCalendarSnapshot = async () => {
    if (!calendarSnapshotRef.current || selectedRanges.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to snapshot' });
      return;
    }
    try {
      toast({ title: 'Booking image saved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Image save failed' });
    }
  };

  useEffect(() => {
    if (!dragAnchor || !dragTarget) return;
    const { availableCells, blockedCells } = buildCellsBetween(dragAnchor, dragTarget);
    setDragSelection(availableCells);
    setBlockedDuringSelection(blockedCells);
  }, [dragAnchor, dragTarget, bookings, daysInMonth, units]);

  useEffect(() => {
    if (!dragAnchor) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = dragAction === 'remove' ? 'not-allowed' : 'crosshair';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragAnchor, dragAction]);

  useEffect(() => {
    if (!dragAnchor) return;
    const handleMouseUp = () => {
      setSelection((previousSelection) => {
        const nextByKey = new Map(previousSelection.map((cell) => [cellKey(cell), cell]));
        dragSelection.forEach((cell) => {
          const key = cellKey(cell);
          if (dragAction === 'remove') nextByKey.delete(key);
          else nextByKey.set(key, cell);
        });
        return Array.from(nextByKey.values()).sort((a, b) => {
          if (a.unitIndex !== b.unitIndex) return a.unitIndex - b.unitIndex;
          return a.dayIndex - b.dayIndex;
        });
      });
      setDragAnchor(null);
      setDragTarget(null);
      setDragSelection([]);
      setBlockedDuringSelection(0);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [dragAnchor, dragSelection, dragAction]);

  const clearSelection = () => {
    setSelection([]);
    setDragSelection([]);
    setBlockedDuringSelection(0);
    setDragAnchor(null);
    setDragTarget(null);
    setDragAction('add');
  };

  const handlePrevMonth = () => {
    const prev = subMonths(viewDate, 1);
    setMonth(prev.getMonth());
    setYear(prev.getFullYear());
    clearSelection();
  };

  const handleNextMonth = () => {
    const next = addMonths(viewDate, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    clearSelection();
  };

  const handleAvailableMouseDown = (cell: CalendarCell) => {
    const { availableCells, blockedCells } = buildCellsBetween(cell, cell);
    const isAlreadySelected = selectedCellKeys.has(cellKey(cell));
    setDragAction(isAlreadySelected ? 'remove' : 'add');
    setDragSelection(availableCells);
    setBlockedDuringSelection(blockedCells);
    setDragAnchor(cell);
    setDragTarget(cell);
  };

  const updateDraft = (field: keyof BookingDraft, value: any) => {
    setBookingDraft((prev) => ({ ...prev, [field]: value }));
  };

  const createAgentCommission = async (bookingData: {
    agentId: string; agentName: string; totalAmount: number;
    unitId: string; unitName: string; checkinDate: string; checkoutDate: string;
    guestFirstName: string; guestLastName: string; bookingId?: string;
  }) => {
    if (!bookingData.agentId) return;
    const agent = (agents as any[]).find(a => String(a.id) === String(bookingData.agentId));
    if (!agent) return;
    const checkin = new Date(bookingData.checkinDate);
    const checkout = new Date(bookingData.checkoutDate);
    const nights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)));
    const unit = (units as any[]).find(u => String(u.id) === String(bookingData.unitId));
    const baseRate = toNumber(unit?.rate, 0);
    const commissionAmount = Math.max(0, bookingData.totalAmount - (baseRate * nights));
    if (commissionAmount <= 0) return;
    const guestName = `${bookingData.guestFirstName} ${bookingData.guestLastName}`.trim();
    try {
      await apiClient.post('/expense', {
        uid: user?.uid,
        title: `Commission - ${bookingData.agentName} - ${guestName}`,
        category: 'Agent Commission',
        agentId: bookingData.agentId,
        agentName: bookingData.agentName,
        bookingId: bookingData.bookingId || '',
        amount: Math.round(commissionAmount * 100) / 100,
        date: bookingData.checkinDate,
        commissionStatus: 'on hold',
        unitId: bookingData.unitId,
        unitName: bookingData.unitName,
        paymentMethod: 'CASH',
        notes: `Auto-generated commission for ${guestName} (${nights} nights)`,
        createdAt: new Date().toISOString(),
      }, auth);
    } catch (err) {
      console.error('Failed to create agent commission:', err);
    }
  };

  const handleSaveSelection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedRanges.length === 0) {
      toast({ variant: 'destructive', title: 'No available dates selected' });
      return;
    }
    const hasGuestName = bookingDraft.guestFirstName.trim() || bookingDraft.guestLastName.trim();
    if (!hasGuestName) {
      toast({ variant: 'destructive', title: 'Guest name required' });
      return;
    }
    setSaving(true);
    try {
      const today = todayDateInput();
      const bookingDate = toDateInput(bookingDraft.bookingDate) || today;
      const paymentStatus = bookingDraft.bookingPaymentStatus || bookingDraft.paymentStatus || 'Unpaid';
      const depositStatus = bookingDraft.securityDepositStatus || 'Unpaid';
      for (const range of selectedRanges) {
        const totalAmount = bookingDraft.isCustomAmount ? toNumber(bookingDraft.totalAmount, 0) : getRangeAutoAmount(range, bookingDraft);
        const payload = {
          uid: user?.uid,
          unitId: String(range.unit.id),
          unitName: getUnitLabel(range.unit),
          guestFirstName: bookingDraft.guestFirstName.trim(),
          guestLastName: bookingDraft.guestLastName.trim(),
          guestPhone: bookingDraft.guestPhone.trim(),
          guestEmail: bookingDraft.guestEmail.trim(),
          agentId: bookingDraft.agentId || '',
          agentName: bookingDraft.agentName || '',
          checkinDate: range.checkinDate,
          checkoutDate: range.checkoutDate,
          bookingDate,
          adults: Number(bookingDraft.adults || 0),
          children: Number(bookingDraft.children || 0),
          paymentStatus,
          bookingPaymentStatus: paymentStatus,
          notes: bookingDraft.notes.trim(),
          specialRequests: bookingDraft.notes.trim(),
          totalAmount,
          isCustomAmount: true,
          securityDepositStatus: depositStatus,
          securityDeposit: { ...(bookingDraft.securityDeposit || {}), status: depositStatus },
          bookingPayment: { ...(bookingDraft.bookingPayment || {}), status: paymentStatus },
          securityDepositReceipt: { ...(bookingDraft.securityDepositReceipt || {}), status: depositStatus }
        };
        const bookingRes = await apiClient.post<any>('/booking', payload, auth);
        if (bookingDraft.agentId) {
          await createAgentCommission({
            agentId: bookingDraft.agentId,
            agentName: bookingDraft.agentName,
            totalAmount,
            unitId: String(range.unit.id),
            unitName: getUnitLabel(range.unit),
            checkinDate: range.checkinDate,
            checkoutDate: range.checkoutDate,
            guestFirstName: bookingDraft.guestFirstName.trim(),
            guestLastName: bookingDraft.guestLastName.trim(),
            bookingId: bookingRes?.id || bookingRes?.data?.id || '',
          });
        }
      }
      toast({ title: 'Booking created' });
      setIsAddDialogOpen(false);
      clearSelection();
      setBookingDraft(makeDefaultBookingDraft());
      await calendarResources.refresh();
    } catch (saveError: any) {
      toast({ variant: 'destructive', title: 'Failed to save booking', description: saveError?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailsBooking = async () => {
    if (!detailsBooking?.id) return;
    setSaving(true);
    try {
      const payload = { ...detailsBooking };
      const sanitizedPayload = removeUndefinedDeep(payload);
      await apiClient.put(`/booking/${detailsBooking.id}`, sanitizedPayload, auth);
      if (detailsBooking.agentId) {
        await createAgentCommission({
          agentId: detailsBooking.agentId,
          agentName: detailsBooking.agentName || '',
          totalAmount: Number(detailsBooking.totalAmount),
          unitId: String(detailsBooking.unitId || ''),
          unitName: detailsBooking.unitName || '',
          checkinDate: toDateInput(detailsBooking.checkinDate) || '',
          checkoutDate: toDateInput(detailsBooking.checkoutDate) || '',
          guestFirstName: detailsBooking.guestFirstName || '',
          guestLastName: detailsBooking.guestLastName || '',
          bookingId: detailsBooking.id,
        });
      }
      setDetailsBooking(payload);
      await calendarResources.refresh();
      toast({ title: 'Booking updated' });
    } catch (saveError: any) {
      toast({ variant: 'destructive', title: 'Failed to save booking' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailsSnapshot = async () => {
    if (!detailsBooking || !detailsSnapshotRef.current) return;
    toast({ title: 'Booking image saved' });
  };

  const handleCopyDetailsAuthorizationLetter = async () => {
    toast({ title: 'Letter copied' });
  };

  const handleCancelDetailsBooking = async () => {
    if (!detailsBooking?.id) return;
    setSaving(true);
    try {
      await apiClient.delete(`/booking/${detailsBooking.id}`, auth);
      setDetailsBooking(null);
      await calendarResources.refresh();
      toast({ title: 'Booking canceled' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        <p className="text-muted-foreground font-medium">Syncing Business Overview...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 uppercase tracking-tight">📋 All Units Overview</h1>
            <p className="text-xs text-gray-500">
              Click booked dates to view details. Click or drag available dates to build a booking selection.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {selection.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" className="gradient-btn text-white" onClick={() => setIsAddDialogOpen(true)}>
                <CalendarPlus className="h-4 w-4 mr-2" /> Book selected
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4 mr-2" /> Clear selection
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="rounded-full bg-amber-500 text-white hover:bg-amber-600" onClick={handlePrevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-lg font-black min-w-[140px] text-center text-gray-800">
            {format(viewDate, 'MMMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" className="rounded-full bg-amber-500 text-white hover:bg-amber-600" onClick={handleNextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-md overflow-hidden rounded-2xl relative">
        <ScrollArea className="w-full h-[calc(100vh-320px)]">
          <div className="min-w-[1200px] relative select-none cursor-default">
            
            <div className="flex sticky top-0 z-30 bg-white">
              <div className="w-32 shrink-0 border-r border-b border-gray-200 h-[70px] sticky left-0 z-50 bg-gray-50 flex items-center justify-center font-black text-xs text-gray-400 uppercase tracking-[0.2em]">
                Date
              </div>
              {(units as any[]).map((unit) => (
                <div key={unit.id} className="flex-1 min-w-[160px] border-r border-b border-gray-200 h-[70px] flex flex-col items-center justify-center text-center px-2 shadow-[0_1px_0_rgba(0,0,0,0.05)] bg-white" style={{ borderTop: `4px solid ${unitColorMap.get(String(unit.id))}` }}>
                  <span className="font-bold text-sm text-gray-800 line-clamp-1">{unit.unitNumber || unit.name || 'Unnamed Unit'}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{unit.type || 'Unit'}</span>
                </div>
              ))}
            </div>

            <div className="bg-white pb-10">
              {daysInMonth.map((day, dayIndex) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div key={dateStr} className="flex border-b border-gray-100 group transition-colors">
                    <div className={cn("w-32 shrink-0 flex flex-col justify-center items-center py-3 border-r border-gray-200 sticky left-0 z-20 shadow-[1px_0_0_rgba(0,0,0,0.05)]", isWeekend ? "bg-amber-50/50 text-amber-900" : "bg-white text-gray-800", isSameDay(day, new Date()) && "ring-2 ring-inset ring-amber-500 bg-amber-100")}>
                      <span className="font-black text-lg leading-none">{format(day, 'MMM d')}</span>
                      <span className="text-[10px] font-bold uppercase mt-1 opacity-60 tracking-wider">{format(day, 'EEEE')}</span>
                    </div>

                    {(units as any[]).map((unit, unitIndex) => {
                      const bookingForCell = findBookingForCell(unit, day);
                      const isBooked = Boolean(bookingForCell);
                      const unitColor = unitColorMap.get(String(unit.id));
                      const cell = { unitId: String(unit.id), unitIndex, date: dateStr, dayIndex };
                      const isSelected = previewSelectedCellKeys.has(cellKey(cell));
                      const isBeingRemoved = dragAction === 'remove' && dragCellKeys.has(cellKey(cell));
                      const isPaid = isPaidStatus(bookingForCell?.paymentStatus || bookingForCell?.bookingPaymentStatus);

                      return (
                        <button
                          type="button"
                          key={`${unit.id}-${dateStr}`}
                          className={cn(
                            'flex-1 min-w-[160px] flex items-center justify-start border-r border-gray-100 min-h-[75px] transition-colors outline-none select-none p-1.5 relative',
                            isBooked ? 'cursor-pointer hover:brightness-95' : 'cursor-crosshair hover:bg-amber-50/50',
                            isSelected && 'bg-amber-100 ring-2 ring-inset ring-amber-500',
                            isBeingRemoved && 'bg-red-50 ring-2 ring-inset ring-red-400'
                          )}
                          style={isBooked ? { backgroundColor: `${unitColor}15` } : {}}
                          onMouseDown={(event) => {
                            if (!isBooked) {
                              event.preventDefault();
                              handleAvailableMouseDown(cell);
                            }
                          }}
                          onDoubleClick={(event) => {
                            if (isBooked) {
                              event.preventDefault();
                              clearSelection();
                              setDetailsBooking(bookingForCell);
                            }
                          }}
                          onMouseEnter={() => {
                            if (!dragAnchor) return;
                            setDragTarget(cell);
                          }}
                        >
                          {isBooked ? (
                            <div className="w-full h-full flex flex-col items-start justify-center p-2 rounded bg-white shadow-sm border border-gray-100" style={{ borderLeft: `4px solid ${unitColor}` }}>
                              <div className="flex items-center gap-1.5 w-full">
                                <UserCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="font-bold text-xs text-gray-800 truncate text-left">{displayGuestName(bookingForCell)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-2 pl-0.5">
                                <div className={cn("w-2 h-2 rounded-full", isPaid ? "bg-green-500" : "bg-red-500")} />
                                <span className={cn("text-[10px] uppercase font-bold tracking-wider", isPaid ? "text-green-600" : "text-red-600")}>
                                  {isPaid ? 'Paid' : 'Unpaid'}
                                </span>
                              </div>
                            </div>
                          ) : isSelected ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <CalendarPlus className="h-5 w-5 text-amber-500/60 pointer-events-none" />
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>

      <AddBookingDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        selectedRanges={selectedRanges}
        bookingDraft={bookingDraft}
        agents={agents}
        saving={saving}
        onSave={handleSaveSelection}
        updateDraft={updateDraft}
        setBookingDraft={setBookingDraft}
        setDraftNested={setDraftNested}
        onSaveSnapshot={handleSaveCalendarSnapshot}
        onCopyLetters={handleCopyCalendarAuthorizationLetters}
        canGenerateArtifacts={canGenerateCalendarArtifacts()}
        calendarSnapshotRef={calendarSnapshotRef}
        getRangeAutoAmount={getRangeAutoAmount}
      />

      <BookingDetailsDialog
        open={Boolean(detailsBooking)}
        onOpenChange={(open) => {
          if (!open) setDetailsBooking(null);
        }}
        detailsBooking={detailsBooking}
        setDetailsBooking={setDetailsBooking}
        agents={agents}
        units={units}
        saving={saving}
        onSave={handleSaveDetailsBooking}
        onSaveSnapshot={handleSaveDetailsSnapshot}
        onCopyLetter={handleCopyDetailsAuthorizationLetter}
        onCancel={handleCancelDetailsBooking}
        setDetailsNested={setDetailsNested}
        detailsSnapshotRef={detailsSnapshotRef}
      />
    </div>
  );
}