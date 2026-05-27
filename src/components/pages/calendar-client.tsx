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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

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

  // Timezone Offset Bug Fix applied here: using strictly local year/month/day math
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

  const getBookingWifiNetwork = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.wifiNetwork || booking?.wifiNetwork || 'Available upon arrival';
  };

  const getBookingWifiPassword = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.wifiPassword || booking?.wifiPassword || 'Please ask our team upon check-in';
  };

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

  const getDetailsDisplayedTotalAmount = () =>
    detailsBooking?.isCustomAmount ? toNumber(detailsBooking?.totalAmount) : getDetailsAutoAmount();

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

  const buildAuthorizationLetter = (booking: any) => {
    const checkinDate = toDateInput(booking?.checkinDate) || '';
    const checkoutDate = toDateInput(booking?.checkoutDate) || '';

    return `Dear Admin,

I'm Rey Arjay Rojo Patiag, SPA of the said unit, please allow my GUEST
to enter and stay in the said unit from ${checkinDate} to ${checkoutDate}

UNIT: ${getBookingUnitName(booking)}

GUEST:
${getBookingGuestName(booking)}

Thank you very much!`;
  };

  const displayDraftGuestName = () => {
    const draft = bookingDraft as any;
    const explicitGuestName = String(draft.guestName || '').trim();
    const fullName = `${draft.guestFirstName || ''} ${draft.guestLastName || ''}`.trim();
    return explicitGuestName || fullName || 'GUEST';
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

  const sanitizePathSegment = (value: string | undefined, fallback: string) => {
    const cleaned = (value || fallback)
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '-')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
    return cleaned || fallback;
  };

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

  const getCalendarBookingDateValue = (range?: UnitDateRange) =>
    range?.checkinDate || todayDateInput();

  const getCalendarBookingImageBaseName = () => {
    const draft = bookingDraft as any;
    const firstRange = selectedRanges[0];
    const bookingDate = toDateInput(getCalendarBookingDateValue(firstRange)) || todayDateInput();
    const yyyymmdd = bookingDate.replace(/-/g, '');
    const unitName = sanitizePathSegment(
      firstRange ? getUnitLabel(firstRange.unit) : undefined,
      'Unit'
    );
    const identifier = sanitizePathSegment(
      `${draft.guestFirstName || 'booking'}-${draft.guestLastName || ''}`,
      'booking'
    );
    const checkinDate = sanitizePathSegment(firstRange?.checkinDate, 'checkin');
    const checkoutDate = sanitizePathSegment(firstRange?.checkoutDate, 'checkout');
    const dateSuffix = firstRange ? `_${checkinDate}_${checkoutDate}` : '';
    const rangeSuffix = selectedRanges.length > 1 ? `_${selectedRanges.length}-bookings` : '';
    return `${yyyymmdd}_${unitName}_${identifier}${dateSuffix}${rangeSuffix}`;
  };

  const buildCalendarBookingImageRelativePath = () =>
    `ManilaPrime/Bookings/${getCalendarBookingImageBaseName()}.png`;

  const buildCalendarBookingImageDisplayPath = () =>
    `Desktop/${buildCalendarBookingImageRelativePath()}`;

  const buildBookingImageBaseName = (booking: any) => {
    const bookingDate = toDateInput(getBookingDateValue(booking)) || todayDateInput();
    const yyyymmdd = bookingDate.replace(/-/g, '');
    const unitName = sanitizePathSegment(getBookingUnitName(booking), 'Unit');
    const identifier = sanitizePathSegment(
      booking?.id || booking?.bookingReference || booking?.referenceNo || `${booking?.guestFirstName || 'booking'}-${booking?.guestLastName || ''}`,
      'booking'
    );
    return `${yyyymmdd}_${unitName}_${identifier}`;
  };

  const buildBookingImageRelativePath = (booking: any) =>
    `ManilaPrime/Bookings/${buildBookingImageBaseName(booking)}.png`;

  const buildBookingImageDisplayPath = (booking: any) =>
    `Desktop/${buildBookingImageRelativePath(booking)}`;

  const getRangeWifiNetwork = (range?: UnitDateRange) =>
    range?.unit?.wifiNetwork || 'Available upon arrival';

  const getRangeWifiPassword = (range?: UnitDateRange) =>
    range?.unit?.wifiPassword || 'Please ask our team upon check-in';

  const buildAuthorizationLetterForRange = (range: UnitDateRange) => {
    return `Dear Admin,

I'm Rey Arjay Rojo Patiag, SPA of the said unit, please allow my GUEST
to enter and stay in the said unit from ${range.checkinDate} to ${range.checkoutDate}

UNIT: ${getUnitLabel(range.unit)}

GUEST:
${displayDraftGuestName()}

Thank you very much!`;
  };

  const buildCalendarAuthorizationLetters = () =>
    selectedRanges.map(buildAuthorizationLetterForRange).join('\n\n------------------------------\n\n');

  const handleCopyCalendarAuthorizationLetters = async () => {
    if (selectedRanges.length === 0) {
      toast({ variant: 'destructive', title: 'No selected dates', description: 'Select at least one unit/date range first.' });
      return;
    }
    if (!hasCalendarDraftGuestName()) {
      toast({ variant: 'destructive', title: 'Guest name required', description: 'Enter at least a first or last name before copying the letter.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(buildCalendarAuthorizationLetters());
      toast({ title: 'Authorization letter copied', description: 'Ready to paste.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Copy failed', description: error?.message || 'Could not copy.' });
    }
  };

  const handleSaveCalendarSnapshot = async () => {
    if (!calendarSnapshotRef.current || selectedRanges.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to snapshot' });
      return;
    }
    if (!hasCalendarDraftGuestName()) {
      toast({ variant: 'destructive', title: 'Guest name required' });
      return;
    }

    try {
      const canvas = await html2canvas(calendarSnapshotRef.current, { backgroundColor: '#0B0B0B', scale: 2, useCORS: true, logging: false });
      const relativePath = buildCalendarBookingImageRelativePath();
      const displayPath = buildCalendarBookingImageDisplayPath();
      const dataUrl = canvas.toDataURL('image/png');
      const bytes = dataUrlToUint8Array(dataUrl);

      const { mkdir, writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await mkdir('ManilaPrime/Bookings', { baseDir: BaseDirectory.Desktop, recursive: true });
      await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Desktop });

      toast({ title: 'Booking image saved', description: `Saved to ${displayPath}` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Image save failed', description: error?.message || String(error) });
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

      if (blockedDuringSelection > 0) {
        toast({ title: 'Some booked dates were skipped', description: `${blockedDuringSelection} booked dates cannot be selected.` });
      }

      setDragAnchor(null);
      setDragTarget(null);
      setDragSelection([]);
      setBlockedDuringSelection(0);
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [dragAnchor, dragSelection, dragAction, blockedDuringSelection, toast]);

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

  // API Call logic mapped perfectly to backend
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
      const paymentStatus = bookingDraft.bookingPaymentStatus || bookingDraft.paymentStatus || bookingDraft.bookingPayment?.status || 'Unpaid';
      const depositStatus = bookingDraft.securityDepositStatus || bookingDraft.securityDeposit?.status || bookingDraft.securityDepositReceipt?.status || 'Unpaid';

      for (const range of selectedRanges) {
        const totalAmount = bookingDraft.isCustomAmount
          ? toNumber(bookingDraft.totalAmount, 0)
          : getRangeAutoAmount(range, bookingDraft);

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
          isCustomAmount: Boolean(bookingDraft.isCustomAmount),
          securityDepositStatus: depositStatus,
          securityDeposit: {
            ...(bookingDraft.securityDeposit || {}),
            amount: toNumber(bookingDraft.securityDeposit?.amount, 1000),
            status: depositStatus
          },
          bookingPayment: {
            ...(bookingDraft.bookingPayment || {}),
            amount: toNumber(bookingDraft.bookingPayment?.amount, 0),
            paidAt: bookingDraft.bookingPayment?.paidAt || today,
            method: bookingDraft.bookingPayment?.method || 'CASH',
            reference: bookingDraft.bookingPayment?.reference || '',
            notes: bookingDraft.bookingPayment?.notes || '',
            status: paymentStatus,
            paymentStatus
          },
          securityDepositReceipt: {
            ...(bookingDraft.securityDepositReceipt || {}),
            amount: toNumber(bookingDraft.securityDepositReceipt?.amount, 0),
            paidAt: bookingDraft.securityDepositReceipt?.paidAt || today,
            method: bookingDraft.securityDepositReceipt?.method || 'CASH',
            reference: bookingDraft.securityDepositReceipt?.reference || '',
            notes: bookingDraft.securityDepositReceipt?.notes || '',
            status: depositStatus,
            refundAmount: toNumber(bookingDraft.securityDepositReceipt?.refundAmount, 0),
            refundPaidAt: bookingDraft.securityDepositReceipt?.refundPaidAt || today,
            refundMethod: bookingDraft.securityDepositReceipt?.refundMethod || 'CASH',
            refundReference: bookingDraft.securityDepositReceipt?.refundReference || '',
            refundNotes: bookingDraft.securityDepositReceipt?.refundNotes || ''
          },
        };

        await apiClient.post<any>('/booking', payload, auth);
      }

      toast({ title: 'Booking created', description: `${selectedRanges.length} booking(s) saved.` });
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
    const hasGuestName = String(detailsBooking.guestFirstName || '').trim() || String(detailsBooking.guestLastName || '').trim() || String(detailsBooking.guestName || '').trim();
    if (!hasGuestName) {
      toast({ variant: 'destructive', title: 'Guest name required' });
      return;
    }

    setSaving(true);

    try {
      const today = todayDateInput();
      const resolvedUnit = getBookingUnit(detailsBooking);
      const paymentStatus = detailsBooking.bookingPaymentStatus || detailsBooking.paymentStatus || detailsBooking.bookingPayment?.status || 'Unpaid';
      const depositStatus = detailsBooking.securityDepositStatus || detailsBooking.securityDeposit?.status || detailsBooking.securityDepositReceipt?.status || 'Unpaid';
      const normalizedNotes = String(detailsBooking.notes || detailsBooking.specialRequests || '').trim();
      const totalAmount = detailsBooking.isCustomAmount ? toNumber(detailsBooking.totalAmount, 0) : getDetailsAutoAmount();

      const payload = {
        ...detailsBooking,
        uid: detailsBooking.uid || user?.uid,
        unitId: String(detailsBooking.unitId || detailsBooking.unit_id || resolvedUnit?.id || ''),
        unitName: resolvedUnit?.name || detailsBooking.unitName || detailsBooking.unitname || '',
        bookingDate: getBookingDateValue(detailsBooking),
        checkinDate: toDateInput(detailsBooking.checkinDate),
        checkoutDate: toDateInput(detailsBooking.checkoutDate),
        guestFirstName: String(detailsBooking.guestFirstName || '').trim(),
        guestLastName: String(detailsBooking.guestLastName || '').trim(),
        guestPhone: String(detailsBooking.guestPhone || detailsBooking.phone || '').trim(),
        guestEmail: String(detailsBooking.guestEmail || detailsBooking.email || '').trim(),
        adults: Number(detailsBooking.adults || 0),
        children: Number(detailsBooking.children || 0),
        paymentStatus,
        bookingPaymentStatus: paymentStatus,
        notes: normalizedNotes,
        specialRequests: normalizedNotes,
        totalAmount,
        isCustomAmount: Boolean(detailsBooking.isCustomAmount),
        securityDepositStatus: depositStatus,
        securityDeposit: {
          ...(detailsBooking.securityDeposit || {}),
          amount: toNumber(detailsBooking.securityDeposit?.amount, 1000),
          status: depositStatus,
        },
        bookingPayment: {
          ...(detailsBooking.bookingPayment || {}),
          amount: toNumber(detailsBooking.bookingPayment?.amount, 0),
          paidAt: detailsBooking.bookingPayment?.paidAt || today,
          method: detailsBooking.bookingPayment?.method || 'CASH',
          reference: detailsBooking.bookingPayment?.reference || '',
          notes: detailsBooking.bookingPayment?.notes || '',
          status: paymentStatus,
          paymentStatus,
        },
        securityDepositReceipt: {
          ...(detailsBooking.securityDepositReceipt || {}),
          amount: toNumber(detailsBooking.securityDepositReceipt?.amount, 0),
          paidAt: detailsBooking.securityDepositReceipt?.paidAt || today,
          method: detailsBooking.securityDepositReceipt?.method || 'CASH',
          reference: detailsBooking.securityDepositReceipt?.reference || '',
          notes: detailsBooking.securityDepositReceipt?.notes || '',
          status: depositStatus,
          refundAmount: toNumber(detailsBooking.securityDepositReceipt?.refundAmount, 0),
          refundPaidAt: detailsBooking.securityDepositReceipt?.refundPaidAt || today,
          refundMethod: detailsBooking.securityDepositReceipt?.refundMethod || 'CASH',
          refundReference: detailsBooking.securityDepositReceipt?.refundReference || '',
          refundNotes: detailsBooking.securityDepositReceipt?.refundNotes || '',
        },
      };

      const sanitizedPayload = removeUndefinedDeep(payload);
      await apiClient.put(`/booking/${detailsBooking.id}`, sanitizedPayload, auth);
      
      setDetailsBooking(payload);
      await calendarResources.refresh();
      toast({ title: 'Booking updated' });
    } catch (saveError: any) {
      toast({ variant: 'destructive', title: 'Failed to save booking', description: saveError?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyDetailsAuthorizationLetter = async () => {
    if (!detailsBooking) return;
    try {
      await navigator.clipboard.writeText(buildAuthorizationLetter(detailsBooking));
      toast({ title: 'Letter copied' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Copy failed', description: error?.message });
    }
  };

  const handleSaveDetailsSnapshot = async () => {
    if (!detailsBooking || !detailsSnapshotRef.current) return;
    try {
      const canvas = await html2canvas(detailsSnapshotRef.current, { backgroundColor: '#0B0B0B', scale: 2, useCORS: true, logging: false });
      const relativePath = buildBookingImageRelativePath(detailsBooking);
      const dataUrl = canvas.toDataURL('image/png');
      const bytes = dataUrlToUint8Array(dataUrl);
      const { mkdir, writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await mkdir('ManilaPrime/Bookings', { baseDir: BaseDirectory.Desktop, recursive: true });
      await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Desktop });
      toast({ title: 'Booking image saved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Image save failed', description: error?.message });
    }
  };

  const handleCancelDetailsBooking = async () => {
    if (!detailsBooking?.id) return;
    const guestName = getBookingGuestName(detailsBooking);
    if (!window.confirm(`Cancel booking for ${guestName}? This will remove it from the calendar.`)) return;
    setSaving(true);
    try {
      await apiClient.delete(`/booking/${detailsBooking.id}`, auth);
      setDetailsBooking(null);
      clearSelection();
      await calendarResources.refresh();
      toast({ title: 'Booking canceled' });
    } catch (cancelError: any) {
      toast({ variant: 'destructive', title: 'Failed to cancel booking', description: cancelError?.message });
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
            
            {/* Table Header: Units */}
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

            {/* Table Body: Dates (Rows) x Units (Cols) */}
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

      <Card className="border-none shadow-sm bg-gray-50/50 p-6 rounded-2xl text-left mt-4">
        <h3 className="text-[10px] font-black text-gray-400 mb-4 uppercase tracking-[0.2em]">Legend</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {(units as any[]).map((unit) => (
            <div key={unit.id} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-100 shadow-sm">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: unitColorMap.get(String(unit.id)) }} />
              <span className="text-[11px] font-bold text-gray-700 uppercase tracking-tight">{unit.unitNumber || unit.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="w-3 h-3 rounded-sm shrink-0 border border-gray-200 bg-gray-50" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">Available Date</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-amber-200 shadow-sm">
            <div className="w-3 h-3 rounded-sm shrink-0 bg-amber-100 border border-amber-500" />
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-tight">Selected for booking</span>
          </div>
        </div>
      </Card>

      <Dialog open={Boolean(detailsBooking)} onOpenChange={(open) => !open && setDetailsBooking(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View Details & Edit</DialogTitle>
            <DialogDescription>Review or edit the booking information.</DialogDescription>
          </DialogHeader>

          {detailsBooking && (
            <div className="space-y-4 pt-2">
              <div className="bg-white border rounded-xl p-5 shadow-sm mb-6 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                   <div>
                      <h3 className="text-xl font-bold text-gray-900">{detailsBooking?.guestFirstName} {detailsBooking?.guestLastName}</h3>
                      <p className="text-sm text-gray-500 font-medium mt-1">{getBookingUnitName(detailsBooking)}</p>
                   </div>
                   <span className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider",
                      isPaidStatus(detailsBooking?.paymentStatus || detailsBooking?.bookingPaymentStatus) ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                   )}>
                      {isPaidStatus(detailsBooking?.paymentStatus || detailsBooking?.bookingPaymentStatus) ? 'PAID' : 'UNPAID'}
                   </span>
                </div>
                <div className="h-px bg-gray-100 my-1" />
                <div className="grid grid-cols-2 gap-4 text-sm mt-1">
                   <div>
                      <p className="text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">Check-In</p>
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        <CalendarDays className="w-4 h-4 text-blue-500" /> {formatBookingCardDate(detailsBooking?.checkinDate)}
                      </div>
                   </div>
                   <div>
                      <p className="text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">Check-Out</p>
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        <CalendarDays className="w-4 h-4 text-orange-500" /> {formatBookingCardDate(detailsBooking?.checkoutDate)}
                      </div>
                   </div>
                </div>
              </div>

              <form onSubmit={async (e) => { e.preventDefault(); await handleSaveDetailsBooking(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label>First Name</Label><Input value={detailsBooking?.guestFirstName || ''} onChange={e => setDetailsBooking({ ...detailsBooking, guestFirstName: e.target.value })} required /></div>
                  <div className="space-y-1"><Label>Last Name</Label><Input value={detailsBooking?.guestLastName || ''} onChange={e => setDetailsBooking({ ...detailsBooking, guestLastName: e.target.value })} required /></div>
                </div>

                <div className="space-y-1">
                  <Label>Agent</Label>
                  <select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.agentId || ''} onChange={e => {
                      const agentId = e.target.value;
                      const selectedAgent = (agents as any[]).find((a: any) => String(a.id) === String(agentId));
                      setDetailsBooking({ ...detailsBooking, agentId, agentName: agentId ? getAgentLabel(selectedAgent) : '' });
                    }}>
                    <option value="">No Agent</option>
                    {(agents as any[]).map((agent: any) => (<option key={agent.id} value={String(agent.id)}>{getAgentLabel(agent)}</option>))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Unit</Label>
                    <select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.unitId || detailsBooking?.unit_id || ''} onChange={e => {
                        const nextUnit = (units as any[]).find((u: any) => String(u.id) === String(e.target.value));
                        setDetailsBooking({ ...detailsBooking, unitId: e.target.value, unit_id: e.target.value, unitName: nextUnit ? getUnitLabel(nextUnit) : detailsBooking?.unitName });
                      }} required>
                      <option value="">Select Unit</option>
                      {(units as any[]).map((u: any) => <option key={u.id} value={String(u.id)}>{u.name || u.unitNumber}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>Booking Date</Label><Input type="date" value={toDateInput(detailsBooking?.bookingDate) || ''} onChange={e => setDetailsBooking({ ...detailsBooking, bookingDate: e.target.value })} /></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label>Check-in</Label><Input type="date" value={toDateInput(detailsBooking?.checkinDate) || ''} onChange={e => setDetailsBooking({ ...detailsBooking, checkinDate: e.target.value })} required /></div>
                  <div className="space-y-1"><Label>Check-out</Label><Input type="date" value={toDateInput(detailsBooking?.checkoutDate) || ''} onChange={e => setDetailsBooking({ ...detailsBooking, checkoutDate: e.target.value })} required /></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label>Adults</Label><Input type="number" min="1" value={detailsBooking?.adults ?? 2} onChange={e => setDetailsBooking({ ...detailsBooking, adults: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Children</Label><Input type="number" min="0" value={detailsBooking?.children ?? 0} onChange={e => setDetailsBooking({ ...detailsBooking, children: e.target.value })} /></div>
                </div>

                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={detailsBooking?.notes || ''} onChange={e => setDetailsBooking({ ...detailsBooking, notes: e.target.value, specialRequests: e.target.value })} placeholder="Guest notes, special requests, or internal remarks" className="min-h-[90px]" />
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="font-semibold">Pricing</p><p className="text-xs text-muted-foreground">{getDetailsTotalNights()} night(s) • unit rate based</p></div>
                    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(detailsBooking?.isCustomAmount)} onChange={(e) => setDetailsBooking({ ...detailsBooking, isCustomAmount: e.target.checked })} /> Use fixed amount</label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label>Total Amount</Label><Input type="number" min="0" value={detailsBooking?.isCustomAmount ? (detailsBooking?.totalAmount ?? 0) : getDetailsDisplayedTotalAmount()} disabled={!detailsBooking?.isCustomAmount} onChange={e => setDetailsBooking({ ...detailsBooking, totalAmount: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Nightly Rate</Label><Input value={getBookingUnit(detailsBooking) ? formatCurrency(getBookingUnit(detailsBooking)?.rate || 0) : '-'} disabled /></div>
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <p className="font-semibold">Booking Payment</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Payment Status</Label>
                      <select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.bookingPaymentStatus || detailsBooking?.paymentStatus || detailsBooking?.bookingPayment?.status || 'Unpaid'} onChange={e => setDetailsBooking({ ...detailsBooking, paymentStatus: e.target.value, bookingPaymentStatus: e.target.value, bookingPayment: { ...(detailsBooking?.bookingPayment || {}), status: e.target.value, paymentStatus: e.target.value } })}>
                        <option value="Unpaid">Unpaid</option><option value="Partial">Partial</option><option value="Paid">Paid</option>
                      </select>
                    </div>
                    <div className="space-y-1"><Label>Amount Received</Label><Input type="number" min="0" value={detailsBooking?.bookingPayment?.amount ?? 0} onChange={e => setDetailsNested('bookingPayment.amount', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label>Payment Date</Label><Input type="date" value={detailsBooking?.bookingPayment?.paidAt || ''} onChange={e => setDetailsNested('bookingPayment.paidAt', e.target.value)} /></div>
                    <div className="space-y-1"><Label>Method</Label><select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.bookingPayment?.method || 'CASH'} onChange={e => setDetailsNested('bookingPayment.method', e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select></div>
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <p className="font-semibold">Security Deposit</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Deposit Status</Label>
                      <select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.securityDepositStatus || detailsBooking?.securityDeposit?.status || detailsBooking?.securityDepositReceipt?.status || 'Unpaid'} onChange={e => setDetailsBooking({ ...detailsBooking, securityDepositStatus: e.target.value, securityDeposit: { ...(detailsBooking?.securityDeposit || {}), status: e.target.value }, securityDepositReceipt: { ...(detailsBooking?.securityDepositReceipt || {}), status: e.target.value } })}>
                        <option value="Unpaid">Unpaid</option><option value="Received">Received</option><option value="Refunded">Refunded</option>
                      </select>
                    </div>
                    <div className="space-y-1"><Label>Configured Amount</Label><Input type="number" min="0" value={detailsBooking?.securityDeposit?.amount ?? 1000} onChange={e => setDetailsNested('securityDeposit.amount', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label>Received Amount</Label><Input type="number" min="0" value={detailsBooking?.securityDepositReceipt?.amount ?? 0} onChange={e => setDetailsNested('securityDepositReceipt.amount', e.target.value)} /></div>
                    <div className="space-y-1"><Label>Received Date</Label><Input type="date" value={detailsBooking?.securityDepositReceipt?.paidAt || ''} onChange={e => setDetailsNested('securityDepositReceipt.paidAt', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label>Received Method</Label><select className="w-full h-10 border rounded-md px-3" value={detailsBooking?.securityDepositReceipt?.method || 'CASH'} onChange={e => setDetailsNested('securityDepositReceipt.method', e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select></div>
                    <div className="space-y-1"><Label>Received Reference</Label><Input value={detailsBooking?.securityDepositReceipt?.reference || ''} onChange={e => setDetailsNested('securityDepositReceipt.reference', e.target.value)} /></div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Button type="button" variant="outline" onClick={handleSaveDetailsSnapshot} disabled={saving || !detailsBooking}><ImageDown className="mr-2 h-4 w-4" /> Save Image</Button>
                  <Button type="button" variant="outline" onClick={handleCopyDetailsAuthorizationLetter} disabled={saving || !detailsBooking}><Clipboard className="mr-2 h-4 w-4" /> Copy Letter</Button>
                  <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={handleCancelDetailsBooking} disabled={saving || !detailsBooking?.id}><Trash2 className="mr-2 h-4 w-4" /> Cancel Booking</Button>
                  <Button type="submit" disabled={saving} className="gradient-btn text-white">{saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Save Edit</Button>
                </div>

                <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 opacity-100">
                  <div ref={detailsSnapshotRef} className="overflow-hidden rounded-[36px] border-2 border-[#EFD45C] bg-[#141414] text-[#F7F4EA]" style={{ width: 1080, minHeight: 1480 }}>
                    <div className="rounded-t-[34px] bg-[#EFD45C] px-14 pb-10 pt-10 text-[#0B0B0B]">
                      <h2 className="mt-10 text-center text-[44px] font-bold leading-tight">Welcome to Manila Prime</h2>
                    </div>
                    <div className="px-[94px] pb-[54px] pt-[42px]">
                      <p className="text-[36px] font-bold leading-none">Dear {detailsBooking?.guestFirstName || getBookingGuestName(detailsBooking)},</p>
                      <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-7 pb-7 pt-6">
                        <p className="text-[30px] font-bold text-[#EFD45C]">Booking Details</p>
                        <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Unit: {getBookingUnitName(detailsBooking)}</p>
                        <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Check-in: {formatBookingCardDate(detailsBooking?.checkinDate)}</p>
                        <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Check-out: {formatBookingCardDate(detailsBooking?.checkoutDate)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Booking from Calendar</DialogTitle><DialogDescription>Selected calendar dates provide the unit and stay dates.</DialogDescription></DialogHeader>
          <form onSubmit={handleSaveSelection} className="space-y-4 pt-4">
            <div className="rounded-xl border bg-amber-50/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 mb-3">Selected dates</p>
              {selectedRanges.map((range) => (
                <div key={`${range.unit.id}-${range.checkinDate}`} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 border">
                  <div><p className="font-bold text-gray-900">{getUnitLabel(range.unit)}</p><p className="text-xs text-gray-500">{range.checkinDate} → {range.checkoutDate}</p></div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{range.nights} night(s)</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>First Name</Label><Input value={bookingDraft.guestFirstName || ''} onChange={e => updateDraft('guestFirstName', e.target.value)} required /></div>
              <div className="space-y-1"><Label>Last Name</Label><Input value={bookingDraft.guestLastName || ''} onChange={e => updateDraft('guestLastName', e.target.value)} required /></div>
            </div>

            <div className="space-y-1">
              <Label>Agent</Label>
              <select className="w-full h-10 border rounded-md px-3" value={bookingDraft.agentId || ''} onChange={e => {
                  const agentId = e.target.value;
                  const selectedAgent = (agents as any[]).find((a: any) => String(a.id) === String(agentId));
                  setBookingDraft({ ...bookingDraft, agentId, agentName: agentId ? getAgentLabel(selectedAgent) : '' });
                }}>
                <option value="">No Agent</option>
                {(agents as any[]).map((agent: any) => (<option key={agent.id} value={String(agent.id)}>{getAgentLabel(agent)}</option>))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Adults</Label><Input type="number" min="1" value={bookingDraft.adults ?? 2} onChange={e => updateDraft('adults', e.target.value)} /></div>
              <div className="space-y-1"><Label>Children</Label><Input type="number" min="0" value={bookingDraft.children ?? 0} onChange={e => updateDraft('children', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={bookingDraft.notes || ''} onChange={e => updateDraft('notes', e.target.value)} className="min-h-[90px]" /></div>

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div><p className="font-semibold">Pricing</p></div>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(bookingDraft.isCustomAmount)} onChange={(e) => updateDraft('isCustomAmount', e.target.checked)} /> Use fixed amount</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Total Amount</Label><Input type="number" min="0" value={bookingDraft.isCustomAmount ? (bookingDraft.totalAmount ?? 0) : selectedRanges.reduce((sum, range) => sum + getRangeAutoAmount(range, bookingDraft), 0)} disabled={!bookingDraft.isCustomAmount} onChange={e => updateDraft('totalAmount', e.target.value)} /></div>
                <div className="space-y-1"><Label>Nightly Rate</Label><Input value={selectedRanges.length === 1 ? formatCurrency(selectedRanges[0].unit?.rate || 0) : 'Multiple units'} disabled /></div>
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <p className="font-semibold">Booking Payment</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Payment Status</Label><select className="w-full h-10 border rounded-md px-3" value={bookingDraft.bookingPaymentStatus || 'Unpaid'} onChange={e => setBookingDraft({ ...bookingDraft, paymentStatus: e.target.value, bookingPaymentStatus: e.target.value, bookingPayment: { ...(bookingDraft.bookingPayment || {}), status: e.target.value, paymentStatus: e.target.value } })}><option value="Unpaid">Unpaid</option><option value="Partial">Partial</option><option value="Paid">Paid</option></select></div>
                <div className="space-y-1"><Label>Amount Received</Label><Input type="number" min="0" value={bookingDraft.bookingPayment?.amount ?? 0} onChange={e => setDraftNested('bookingPayment.amount', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Payment Date</Label><Input type="date" value={bookingDraft.bookingPayment?.paidAt || ''} onChange={e => setDraftNested('bookingPayment.paidAt', e.target.value)} /></div>
                <div className="space-y-1"><Label>Method</Label><select className="w-full h-10 border rounded-md px-3" value={bookingDraft.bookingPayment?.method || 'CASH'} onChange={e => setDraftNested('bookingPayment.method', e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select></div>
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <p className="font-semibold">Security Deposit</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Deposit Status</Label><select className="w-full h-10 border rounded-md px-3" value={bookingDraft.securityDepositStatus || 'Unpaid'} onChange={e => setBookingDraft({ ...bookingDraft, securityDepositStatus: e.target.value, securityDeposit: { ...(bookingDraft.securityDeposit || {}), status: e.target.value }, securityDepositReceipt: { ...(bookingDraft.securityDepositReceipt || {}), status: e.target.value } })}><option value="Unpaid">Unpaid</option><option value="Received">Received</option><option value="Refunded">Refunded</option></select></div>
                <div className="space-y-1"><Label>Configured Amount</Label><Input type="number" min="0" value={bookingDraft.securityDeposit?.amount ?? 1000} onChange={e => setDraftNested('securityDeposit.amount', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Received Amount</Label><Input type="number" min="0" value={bookingDraft.securityDepositReceipt?.amount ?? 0} onChange={e => setDraftNested('securityDepositReceipt.amount', e.target.value)} /></div>
                <div className="space-y-1"><Label>Received Date</Label><Input type="date" value={bookingDraft.securityDepositReceipt?.paidAt || ''} onChange={e => setDraftNested('securityDepositReceipt.paidAt', e.target.value)} /></div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Button type="button" variant="outline" onClick={handleSaveCalendarSnapshot} disabled={saving || !canGenerateCalendarArtifacts()}><ImageDown className="h-4 w-4 mr-2" /> Image</Button>
              <Button type="button" variant="outline" onClick={handleCopyCalendarAuthorizationLetters} disabled={saving || !canGenerateCalendarArtifacts()}><Clipboard className="h-4 w-4 mr-2" /> Letter</Button>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Add more dates</Button>
              <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); clearSelection(); }}>Cancel</Button>
              <Button type="submit" className="gradient-btn text-white" disabled={saving || selectedRanges.length === 0}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />} Save</Button>
            </div>
          </form>

          <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 opacity-100">
            <div ref={calendarSnapshotRef} className="overflow-hidden rounded-[36px] border-2 border-[#EFD45C] bg-[#141414] text-[#F7F4EA]" style={{ width: 1080, minHeight: 1480 }}>
              <div className="rounded-t-[34px] bg-[#EFD45C] px-14 pb-10 pt-10 text-[#0B0B0B]">
                <h2 className="mt-10 text-center text-[44px] font-bold leading-tight">Welcome to Manila Prime</h2>
              </div>
              <div className="px-[94px] pb-[54px] pt-[42px]">
                <p className="text-[36px] font-bold leading-none">Dear {displayDraftGuestName()},</p>
                <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-7 pb-7 pt-6">
                  <p className="text-[30px] font-bold text-[#EFD45C]">Booking Details</p>
                  <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Unit: {selectedRanges.length === 1 ? getUnitLabel(selectedRanges[0].unit) : `${selectedRanges.length} units`}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}