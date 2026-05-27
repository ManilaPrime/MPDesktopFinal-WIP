'use client';

import { useState, useEffect, useMemo, useRef } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MoreVertical, Loader2, Save, Plus, ImageDown, Clipboard, Trash2, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils-app";
import { cn } from "@/lib/utils";
import html2canvas from "html2canvas";

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateInput(value?: string) {
  if (!value) return "";
  return String(value).split("T")[0];
}

export default function BookingsClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();

  const bookingsResources = useAppResources(['bookings', 'units']);
  const bookings = bookingsResources.data['bookings'] ?? [];
  const units = bookingsResources.data['units'] ?? [];
  const loading = bookingsResources.loading;

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUnitId, setFilterUnitId] = useState("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const bookingSummaryCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isDialogOpen) return;

    const cleanupDocumentInteractivity = () => {
      document.body.style.pointerEvents = '';
      document.body.removeAttribute('data-scroll-locked');
    };

    cleanupDocumentInteractivity();
    const timeoutId = window.setTimeout(cleanupDocumentInteractivity, 0);
    const frameId = window.requestAnimationFrame(cleanupDocumentInteractivity);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [isDialogOpen]);

  useEffect(() => {
    let cancelled = false;
    const loadAgents = async () => {
      setAgentsLoading(true);
      try {
        const data = await apiClient.get<any[]>('/agents', auth);
        if (!cancelled) setAgents(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    };
    loadAgents();
    return () => { cancelled = true; };
  }, [auth]);

  const unitsById = useMemo(() => {
    const map = new Map<string, any>();
    units.forEach((u) => map.set(String(u.id).trim().toLowerCase(), u));
    return map;
  }, [units]);

  const findUnitForBooking = (rawUnitId: any) => {
    if (!rawUnitId) return null;
    return unitsById.get(String(rawUnitId).trim().toLowerCase()) || null;
  };

  const getBookingDateValue = (booking: any) =>
    booking?.bookingDate || booking?.createdAt || booking?.checkinDate || new Date().toISOString();

  const selectedUnit = useMemo(
    () => findUnitForBooking(editingBooking?.unitId || editingBooking?.unit_id),
    [editingBooking?.unitId, editingBooking?.unit_id, unitsById]
  );

  const totalNights = useMemo(() => {
    const checkin = editingBooking?.checkinDate ? new Date(editingBooking.checkinDate) : null;
    const checkout = editingBooking?.checkoutDate ? new Date(editingBooking.checkoutDate) : null;
    if (!checkin || !checkout || Number.isNaN(checkin.getTime()) || Number.isNaN(checkout.getTime())) return 0;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.round((checkout.getTime() - checkin.getTime()) / oneDay));
  }, [editingBooking?.checkinDate, editingBooking?.checkoutDate]);

  const autoCalculatedAmount = useMemo(() => {
    if (!selectedUnit) return toNumber(editingBooking?.totalAmount);
    const adults = toNumber(editingBooking?.adults, 2);
    const children = toNumber(editingBooking?.children, 0);
    const baseOccupancy = toNumber(selectedUnit?.capacity ?? selectedUnit?.baseOccupancy, 0);
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(selectedUnit?.rate, 0);
    const extraGuestFee = toNumber(selectedUnit?.extraGuestFee, 0);
    return Math.max(0, totalNights * (nightlyRate + extraGuests * extraGuestFee));
  }, [selectedUnit, editingBooking?.adults, editingBooking?.children, totalNights, editingBooking?.totalAmount]);

  const displayedTotalAmount = editingBooking?.isCustomAmount
    ? toNumber(editingBooking?.totalAmount)
    : autoCalculatedAmount;

  // --- Image / Content Builders ---
  const sanitizePathSegment = (value: string | undefined, fallback: string) => {
    return (value || fallback).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-');
  };

  const buildBookingImageRelativePath = (booking: any) => {
    const date = toDateInput(getBookingDateValue(booking)).replace(/-/g, '');
    const unitName = sanitizePathSegment(findUnitForBooking(booking?.unitId)?.name || booking?.unitName, 'Unit');
    const identifier = sanitizePathSegment(booking?.id || `${booking?.guestFirstName}-${booking?.guestLastName}`, 'booking');
    return `ManilaPrime/Bookings/${date}_${unitName}_${identifier}.png`;
  };

  const formatBookingCardDate = (value: string | undefined) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? toDateInput(value) : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getBookingGuestName = (booking: any) => `${booking?.guestFirstName || ''} ${booking?.guestLastName || ''}`.trim() || booking?.guestName || 'Valued Guest';
  const getBookingUnitName = (booking: any) => findUnitForBooking(booking?.unitId)?.name || booking?.unitName || 'Unassigned';
  const getBookingWifiNetwork = (booking: any) => findUnitForBooking(booking?.unitId)?.wifiNetwork || booking?.wifiNetwork || 'Available upon arrival';
  const getBookingWifiPassword = (booking: any) => findUnitForBooking(booking?.unitId)?.wifiPassword || booking?.wifiPassword || 'Ask team upon check-in';

  const handleCopyAuthorizationLetter = async () => {
    if (!editingBooking) return;
    const text = `Dear Admin,\n\nI'm Rey Arjay Rojo Patiag, SPA of the said unit, please allow my GUEST\nto enter and stay in the said unit from ${toDateInput(editingBooking?.checkinDate)} to ${toDateInput(editingBooking?.checkoutDate)}\n\nUNIT: ${getBookingUnitName(editingBooking)}\n\nGUEST:\n${getBookingGuestName(editingBooking)}\n\nThank you very much!`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Letter copied', description: 'Ready to paste.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Copy failed', description: e.message });
    }
  };

  const handleSaveBookingImage = async () => {
    if (!editingBooking || !bookingSummaryCardRef.current) return;
    try {
      const canvas = await html2canvas(bookingSummaryCardRef.current, { backgroundColor: '#0B0B0B', scale: 2 });
      const relativePath = buildBookingImageRelativePath(editingBooking);
      const { mkdir, writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await mkdir('ManilaPrime/Bookings', { baseDir: BaseDirectory.Desktop, recursive: true });
      await writeFile(relativePath, dataUrlToUint8Array(canvas.toDataURL('image/png')), { baseDir: BaseDirectory.Desktop });
      toast({ title: 'Image saved', description: `Saved to Desktop/${relativePath}` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Image save failed', description: error.message });
    }
  };

  const makeDefaultBooking = () => {
    const today = new Date().toISOString().split('T')[0];
    return {
      paymentStatus: 'Unpaid', bookingDate: today, checkinDate: today, checkoutDate: today, adults: 2, children: 0,
      agentId: '', agentName: '', isCustomAmount: false, totalAmount: 0,
      securityDeposit: { amount: 1000, status: 'Unpaid' },
      bookingPayment: { amount: 0, paidAt: today, method: 'CASH', reference: '', notes: '' },
      securityDepositReceipt: { amount: 0, paidAt: today, method: 'CASH', reference: '', notes: '', refundAmount: 0, refundPaidAt: today, refundMethod: 'CASH', refundReference: '', refundNotes: '' },
    };
  };

  const normalizeBookingForEdit = (booking: any) => ({
    ...makeDefaultBooking(),
    ...booking,
    bookingDate: toDateInput(booking?.bookingDate || booking?.createdAt),
    checkinDate: toDateInput(booking?.checkinDate),
    checkoutDate: toDateInput(booking?.checkoutDate),
    adults: toNumber(booking?.adults, 2),
    children: toNumber(booking?.children, 0),
    isCustomAmount: Boolean(booking?.isCustomAmount),
    totalAmount: toNumber(booking?.totalAmount),
    paymentStatus: booking?.paymentStatus || 'Unpaid',
    bookingPaymentStatus: booking?.paymentStatus || 'Unpaid',
    securityDepositStatus: booking?.securityDeposit?.status || 'Unpaid',
    securityDeposit: { amount: toNumber(booking?.securityDeposit?.amount, 1000), status: booking?.securityDeposit?.status || 'Unpaid' },
    bookingPayment: {
      amount: toNumber(booking?.bookingPayment?.amount, 0),
      paidAt: toDateInput(booking?.bookingPayment?.paidAt),
      method: booking?.bookingPayment?.method || 'CASH',
      reference: booking?.bookingPayment?.reference || '',
      notes: booking?.bookingPayment?.notes || '',
      status: booking?.paymentStatus || 'Unpaid',
      paymentStatus: booking?.paymentStatus || 'Unpaid',
    },
    securityDepositReceipt: {
      amount: toNumber(booking?.securityDepositReceipt?.amount, 0),
      paidAt: toDateInput(booking?.securityDepositReceipt?.paidAt),
      method: booking?.securityDepositReceipt?.method || 'CASH',
      reference: booking?.securityDepositReceipt?.reference || '',
      notes: booking?.securityDepositReceipt?.notes || '',
      status: booking?.securityDeposit?.status || 'Unpaid',
      refundAmount: toNumber(booking?.securityDepositReceipt?.refundAmount, 0),
      refundPaidAt: toDateInput(booking?.securityDepositReceipt?.refundPaidAt),
      refundMethod: booking?.securityDepositReceipt?.refundMethod || 'CASH',
    },
  });

  const setNested = (path: string, value: any) => {
    setEditingBooking((prev: any) => {
      const next = { ...(prev || {}) };
      const parts = path.split('.');
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
      return next;
    });
  };

  // --- API INTERACTIONS ---
  // PERFORMANCE FIX: We removed redundant db calls. 1 API call does everything via the backend.
  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const paymentStatus = editingBooking?.paymentStatus || 'Unpaid';
      const depositStatus = editingBooking?.securityDepositStatus || 'Unpaid';
      const selectedAgent = agents.find((a: any) => String(a.id) === String(editingBooking?.agentId || ''));
      
      const payload = {
        ...editingBooking,
        uid: user?.uid,
        agentName: selectedAgent?.name || '',
        totalAmount: editingBooking?.isCustomAmount ? toNumber(editingBooking?.totalAmount) : autoCalculatedAmount,
        paymentStatus,
        bookingPaymentStatus: paymentStatus,
        securityDepositStatus: depositStatus,
        securityDeposit: { amount: toNumber(editingBooking?.securityDeposit?.amount, 1000), status: depositStatus },
        bookingPayment: { ...editingBooking.bookingPayment, status: paymentStatus, paymentStatus },
        securityDepositReceipt: { ...editingBooking.securityDepositReceipt, status: depositStatus },
      };

      if (editingBooking?.id) {
        await apiClient.put(`/booking/${editingBooking.id}`, payload, auth);
        toast({ title: "Success", description: "Booking updated." });
      } else {
        await apiClient.post('/booking', payload, auth);
        toast({ title: "Success", description: "New booking created." });
      }

      setIsDialogOpen(false);
      await bookingsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteBooking = async (booking: any) => {
    if (!confirm(`Delete booking for ${booking?.guestFirstName}? This will remove it permanently.`)) return;
    setFormLoading(true);
    try {
      await apiClient.delete(`/booking/${booking.id}`, auth);
      toast({ title: "Deleted", description: "The booking and ledgers were removed." });
      if (editingBooking?.id === booking.id) { setIsDialogOpen(false); setEditingBooking(null); }
      await bookingsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error?.message });
    } finally {
      setFormLoading(false);
    }
  };

  // --- RENDERING ---
  const filteredAndSortedBookings = useMemo(() => {
    const filtered = bookings.filter((b) => {
      const s = searchTerm.toLowerCase();
      const u = findUnitForBooking(b.unitId)?.name?.toLowerCase() || '';
      const matchesSearch = (b.guestFirstName || "").toLowerCase().includes(s) || (b.guestLastName || "").toLowerCase().includes(s) || u.includes(s);
      const matchesUnit = filterUnitId === "all" || String(b.unitId) === filterUnitId;
      const matchesStatus = filterPaymentStatus === "all" || (b.paymentStatus || 'Unpaid').toLowerCase() === filterPaymentStatus;
      
      let matchesDate = true;
      if (b.checkinDate) {
        const d = b.checkinDate.split('T')[0];
        if (startDate && d < startDate) matchesDate = false;
        if (endDate && d > endDate) matchesDate = false;
      }
      return matchesSearch && matchesUnit && matchesStatus && matchesDate;
    });

    const today = new Date().toISOString().split('T')[0];
    const upcoming = filtered.filter(b => (b.checkinDate || '') >= today).sort((a, b) => (a.checkinDate || '').localeCompare(b.checkinDate || ''));
    const past = filtered.filter(b => (b.checkinDate || '') < today).sort((a, b) => (b.checkinDate || '').localeCompare(a.checkinDate || ''));
    return [...upcoming, ...past];
  }, [bookings, searchTerm, unitsById, filterUnitId, filterPaymentStatus, startDate, endDate]);

  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case "paid": return "bg-green-500 text-white border-none";
      case "partial": return "bg-blue-500 text-white border-none";
      case "received": return "bg-orange-500 text-white border-none";
      case "refunded": return "bg-slate-600 text-white border-none";
      case "unpaid": return "bg-red-500 text-white border-none";
      default: return "bg-gray-100";
    }
  };

  if (loading) return <div className="flex justify-center min-h-[40vh] items-center"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">Bookings</h1><p className="text-muted-foreground">Manage your staycation reservations</p></div>
        <Button className="gradient-btn text-white" onClick={() => { setEditingBooking(makeDefaultBooking()); setIsDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> New Booking</Button>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] space-y-1"><Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Search</Label><Input placeholder="Guest name or unit..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="w-36 space-y-1"><Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Unit</Label><select className="w-full px-3 h-10 border rounded-md text-sm" value={filterUnitId} onChange={e => setFilterUnitId(e.target.value)}><option value="all">All Units</option>{units.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.unitNumber}</option>)}</select></div>
          <div className="w-36 space-y-1"><Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Status</Label><select className="w-full px-3 h-10 border rounded-md text-sm" value={filterPaymentStatus} onChange={e => setFilterPaymentStatus(e.target.value)}><option value="all">All</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></select></div>
          <div className="w-40 space-y-1"><Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">From</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="w-40 space-y-1"><Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">To</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          {(searchTerm || filterUnitId !== 'all' || filterPaymentStatus !== 'all' || startDate || endDate) && <Button variant="ghost" onClick={() => { setSearchTerm(''); setFilterUnitId('all'); setFilterPaymentStatus('all'); setStartDate(''); setEndDate(''); }} className="text-red-600"><X className="h-4 w-4 mr-2" /> Clear</Button>}
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="font-bold">Check-in</TableHead>
              <TableHead className="font-bold">Guest</TableHead>
              <TableHead className="font-bold">Unit</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold">Total</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedBookings.map((booking) => (
              <TableRow key={booking.id} className={cn((booking.checkinDate || '') < new Date().toISOString().split('T')[0] && "bg-gray-50/50 opacity-80 hover:opacity-100")}>
                <TableCell className="font-bold">{booking.checkinDate?.split('T')[0]}</TableCell>
                <TableCell className="font-bold">{booking.guestFirstName} {booking.guestLastName}</TableCell>
                <TableCell>{findUnitForBooking(booking.unitId)?.name || 'N/A'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge className={getStatusColor(booking.paymentStatus)}>{booking.paymentStatus || 'Unpaid'}</Badge>
                    <Badge className={getStatusColor(booking?.securityDeposit?.status || 'Unpaid')}>Deposit: {booking?.securityDeposit?.status || 'Unpaid'}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(booking.totalAmount)}</TableCell>
                <TableCell>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditingBooking(normalizeBookingForEdit(booking)); setIsDialogOpen(true); }}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onSelect={(e) => { e.preventDefault(); handleDeleteBooking(booking); }}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingBooking?.id ? 'Edit Booking' : 'New Booking'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveBooking} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>First Name</Label><Input value={editingBooking?.guestFirstName || ''} onChange={e => setEditingBooking({ ...editingBooking, guestFirstName: e.target.value })} required /></div>
              <div className="space-y-1"><Label>Last Name</Label><Input value={editingBooking?.guestLastName || ''} onChange={e => setEditingBooking({ ...editingBooking, guestLastName: e.target.value })} required /></div>
            </div>
            <div className="space-y-1">
              <Label>Agent</Label>
              <select className="w-full h-10 border rounded-md px-3" value={editingBooking?.agentId || ''} onChange={e => setEditingBooking({...editingBooking, agentId: e.target.value })}>
                <option value="">{agentsLoading ? 'Loading...' : 'No Agent'}</option>
                {agents.map((a: any) => <option key={a.id} value={String(a.id)}>{a.name || a.fullName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Unit</Label><select className="w-full h-10 border rounded-md px-3" value={editingBooking?.unitId || ''} onChange={e => setEditingBooking({ ...editingBooking, unitId: e.target.value })} required><option value="">Select Unit</option>{units.map((u) => <option key={u.id} value={String(u.id)}>{u.name || u.unitNumber}</option>)}</select></div>
              <div className="space-y-1"><Label>Booking Date</Label><Input type="date" value={editingBooking?.bookingDate || ''} onChange={e => setEditingBooking({ ...editingBooking, bookingDate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Check-in</Label><Input type="date" value={editingBooking?.checkinDate || ''} onChange={e => setEditingBooking({ ...editingBooking, checkinDate: e.target.value })} required /></div>
              <div className="space-y-1"><Label>Check-out</Label><Input type="date" value={editingBooking?.checkoutDate || ''} onChange={e => setEditingBooking({ ...editingBooking, checkoutDate: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Adults</Label><Input type="number" min="1" value={editingBooking?.adults ?? 2} onChange={e => setEditingBooking({ ...editingBooking, adults: e.target.value })} /></div>
              <div className="space-y-1"><Label>Children</Label><Input type="number" min="0" value={editingBooking?.children ?? 0} onChange={e => setEditingBooking({ ...editingBooking, children: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={editingBooking?.notes || ''} onChange={e => setEditingBooking({ ...editingBooking, notes: e.target.value })} className="min-h-[90px]" /></div>

            {/* Pricing */}
            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div><p className="font-semibold">Pricing</p><p className="text-xs text-muted-foreground">{totalNights} night(s)</p></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(editingBooking?.isCustomAmount)} onChange={e => setEditingBooking({ ...editingBooking, isCustomAmount: e.target.checked })}/> Use fixed amount</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Total Amount</Label><Input type="number" min="0" value={editingBooking?.isCustomAmount ? (editingBooking?.totalAmount ?? 0) : displayedTotalAmount} disabled={!editingBooking?.isCustomAmount} onChange={e => setEditingBooking({ ...editingBooking, totalAmount: e.target.value })} /></div>
                <div className="space-y-1"><Label>Nightly Rate</Label><Input value={selectedUnit ? formatCurrency(selectedUnit.rate || 0) : '-'} disabled /></div>
              </div>
            </div>

            {/* Payment */}
            <div className="rounded-xl border p-4 space-y-4">
              <p className="font-semibold">Booking Payment</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Status</Label><select className="w-full h-10 border rounded-md px-3" value={editingBooking?.paymentStatus || 'Unpaid'} onChange={e => setEditingBooking({...editingBooking, paymentStatus: e.target.value, bookingPayment: {...editingBooking.bookingPayment, status: e.target.value}})}><option value="Unpaid">Unpaid</option><option value="Partial">Partial</option><option value="Paid">Paid</option></select></div>
                <div className="space-y-1"><Label>Amount Received</Label><Input type="number" min="0" value={editingBooking?.bookingPayment?.amount ?? 0} onChange={e => setNested('bookingPayment.amount', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={editingBooking?.bookingPayment?.paidAt || ''} onChange={e => setNested('bookingPayment.paidAt', e.target.value)} /></div>
                <div className="space-y-1"><Label>Method</Label><select className="w-full h-10 border rounded-md px-3" value={editingBooking?.bookingPayment?.method || 'CASH'} onChange={e => setNested('bookingPayment.method', e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select></div>
              </div>
            </div>

            {/* Deposit */}
            <div className="rounded-xl border p-4 space-y-4">
              <p className="font-semibold">Security Deposit</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Status</Label><select className="w-full h-10 border rounded-md px-3" value={editingBooking?.securityDepositStatus || 'Unpaid'} onChange={e => setEditingBooking({...editingBooking, securityDepositStatus: e.target.value, securityDepositReceipt: {...editingBooking.securityDepositReceipt, status: e.target.value}})}><option value="Unpaid">Unpaid</option><option value="Received">Received</option><option value="Refunded">Refunded</option></select></div>
                <div className="space-y-1"><Label>Received Amount</Label><Input type="number" min="0" value={editingBooking?.securityDepositReceipt?.amount ?? 0} onChange={e => setNested('securityDepositReceipt.amount', e.target.value)} /></div>
              </div>
              {String(editingBooking?.securityDepositStatus).toLowerCase() === 'refunded' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label>Refund Amount</Label><Input type="number" min="0" value={editingBooking?.securityDepositReceipt?.refundAmount ?? 0} onChange={e => setNested('securityDepositReceipt.refundAmount', e.target.value)} /></div>
                  <div className="space-y-1"><Label>Refund Date</Label><Input type="date" value={editingBooking?.securityDepositReceipt?.refundPaidAt || ''} onChange={e => setNested('securityDepositReceipt.refundPaidAt', e.target.value)} /></div>
                </div>
              )}
            </div>

            <div className={cn("grid gap-2", editingBooking?.id ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
              <Button type="button" variant="outline" onClick={handleSaveBookingImage} disabled={formLoading}><ImageDown className="mr-2 h-4 w-4" /> Image</Button>
              <Button type="button" variant="outline" onClick={handleCopyAuthorizationLetter} disabled={formLoading}><Clipboard className="mr-2 h-4 w-4" /> Letter</Button>
              {editingBooking?.id && <Button type="button" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteBooking(editingBooking)} disabled={formLoading}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>}
              <Button type="submit" disabled={formLoading} className="gradient-btn text-white">{formLoading ? <Loader2 className="animate-spin" /> : <Save className="mr-2" />} Save</Button>
            </div>
          </form>
          
          {/* INVISIBLE SNAPSHOT DIV */}
          <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 opacity-100">
             <div ref={bookingSummaryCardRef} className="overflow-hidden rounded-[36px] border-2 border-[#EFD45C] bg-[#141414] text-[#F7F4EA]" style={{ width: 1080, minHeight: 1480 }}>
                <div className="rounded-t-[34px] bg-[#EFD45C] px-14 pb-10 pt-10 text-[#0B0B0B]">
                   <h2 className="text-center text-[44px] font-bold leading-tight">Welcome to Manila Prime</h2>
                </div>
                <div className="px-[94px] pb-[54px] pt-[42px]">
                   <p className="text-[36px] font-bold leading-none">Dear {getBookingGuestName(editingBooking)},</p>
                   <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-7 pb-7 pt-6">
                      <p className="text-[30px] font-bold text-[#EFD45C]">Booking Details</p>
                      <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Unit: {getBookingUnitName(editingBooking)}</p>
                      <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Check-in: {formatBookingCardDate(editingBooking?.checkinDate)}</p>
                      <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">Check-out: {formatBookingCardDate(editingBooking?.checkoutDate)}</p>
                   </div>
                </div>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}