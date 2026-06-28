'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageDown, Clipboard, Loader2, CalendarPlus, Trash2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

// ponytail: extract BookingDetailsDialog to reduce component size and improve modularity.

interface BookingDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailsBooking: any;
  setDetailsBooking: React.Dispatch<React.SetStateAction<any>>;
  agents: any[];
  units: any[];
  saving: boolean;
  onSave: () => void;
  onSaveSnapshot: () => void;
  onCopyLetter: () => void;
  onCancel: () => void;
  setDetailsNested: (path: string, value: any) => void;
  detailsSnapshotRef: React.RefObject<HTMLDivElement | null>;
}

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value: any) =>
  `₱${toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toDateInput = (value?: string) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

const todayDateInput = () => new Date().toISOString().split('T')[0];

const getUnitLabel = (unit: any) => unit?.name || unit?.unitNumber || unit?.unitName || 'Unnamed unit';

export function BookingDetailsDialog({
  open,
  onOpenChange,
  detailsBooking,
  setDetailsBooking,
  agents,
  units,
  saving,
  onSave,
  onSaveSnapshot,
  onCopyLetter,
  onCancel,
  setDetailsNested,
  detailsSnapshotRef,
}: BookingDetailsDialogProps) {
  const getAgentLabel = (agent: any) =>
    agent?.name || agent?.fullName || agent?.agentName || 'Unnamed Agent';

  const toComparableUnitValues = (unit: any) => [
    unit?.id,
    unit?.unitNumber,
    unit?.name
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

  const findUnitForBooking = (unitIdOrName?: string) => {
    const target = String(unitIdOrName || '').trim().toLowerCase();
    if (!target) return null;
    return (units as any[]).find((unit) => toComparableUnitValues(unit).includes(target)) || null;
  };

  const getBookingUnit = (booking: any) =>
    findUnitForBooking(booking?.unitId || booking?.unit_id || booking?.unitName || booking?.unitname);

  const getBookingUnitName = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.name || booking?.unitName || booking?.unitname || 'Unassigned';
  };

  const getBookingGuestName = (booking: any) => {
    const explicitGuestName = String(booking?.guestName || '').trim();
    const fullName = `${booking?.guestFirstName || ''} ${booking?.guestLastName || ''}`.trim();
    return explicitGuestName || fullName || 'Valued Guest';
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

  const isPaidStatus = (status: any) => {
    const value = String(status || '').trim().toLowerCase();
    return value === 'paid' || value === 'received';
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onOpenChange(false)}>
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

            <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label>Total Amount</Label><Input type="number" min="0" value={detailsBooking?.isCustomAmount ? (detailsBooking?.totalAmount ?? 0) : getDetailsDisplayedTotalAmount()} onChange={e => setDetailsBooking({ ...detailsBooking, isCustomAmount: true, totalAmount: e.target.value })} /></div>
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
                <Button type="button" variant="outline" onClick={onSaveSnapshot} disabled={saving || !detailsBooking}><ImageDown className="mr-2 h-4 w-4" /> Save Image</Button>
                <Button type="button" variant="outline" onClick={onCopyLetter} disabled={saving || !detailsBooking}><Clipboard className="mr-2 h-4 w-4" /> Copy Letter</Button>
                <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onCancel} disabled={saving || !detailsBooking?.id}><Trash2 className="mr-2 h-4 w-4" /> Cancel Booking</Button>
                <Button type="submit" disabled={saving} className="gradient-btn text-white">{saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Save Edit</Button>
              </div>

              <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 opacity-100">
                <div ref={detailsSnapshotRef} className="overflow-hidden rounded-[36px] border-4 border-[#EFD45C] bg-[#0B0B0B] text-[#F7F4EA]" style={{ width: 1080, minHeight: 1480, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div className="bg-[#EFD45C] px-[72px] pb-10 pt-12 text-[#0B0B0B] rounded-t-[32px]">
                    <div className="flex items-center gap-5">
                      <div className="w-[72px] h-[72px] rounded-full border-[5px] border-black bg-transparent flex items-center justify-center">
                        <span className="text-[36px] font-black tracking-tighter text-black">MP</span>
                      </div>
                      <div className="text-left">
                        <h2 className="text-[30px] font-black text-black leading-tight tracking-tight uppercase">Manila Prime</h2>
                        <p className="text-[24px] font-extrabold text-black leading-none uppercase tracking-widest mt-0.5">Staycation</p>
                      </div>
                    </div>
                    <h1 className="text-center text-[44px] font-black text-black leading-tight tracking-tight mt-10">
                      Welcome to Manila Prime Staycation
                    </h1>
                  </div>

                  <div className="px-[72px] pb-14 pt-12 text-left">
                    <h2 className="text-[38px] font-black text-white leading-none">
                      Dear {getBookingGuestName(detailsBooking)},
                    </h2>
                    <p className="text-[24px] text-[#A3A3A3] leading-relaxed mt-4">
                      Thank you for booking with us. We are delighted to host you and hope you enjoy a smooth, comfortable, and relaxing stay.
                    </p>

                    <div className="mt-10 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-10 py-9">
                      <p className="text-[28px] font-black text-[#EFD45C] tracking-wide mb-6">Booking Details</p>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">Guest Name</span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">{getBookingGuestName(detailsBooking)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">Unit</span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">{getBookingUnitName(detailsBooking)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">Booking Date</span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">{formatBookingCardDate(getBookingDateValue(detailsBooking))}</span>
                        </div>
                        
                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">Check-in</span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">{formatBookingCardDate(detailsBooking?.checkinDate)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center pb-2">
                          <span className="text-[24px] font-bold text-white w-1/3">Check-out</span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">{formatBookingCardDate(detailsBooking?.checkoutDate)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-10 py-9">
                      <p className="text-[28px] font-black text-[#EFD45C] tracking-wide mb-6">Wi-Fi Access</p>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-start border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3 mt-1">Network</span>
                          <span className="text-[28px] font-extrabold text-[#EFD45C] w-2/3 leading-tight">{getBookingWifiNetwork(detailsBooking)}</span>
                        </div>
                        
                        <div className="flex justify-between items-start pb-2">
                          <span className="text-[24px] font-bold text-white w-1/3 mt-1">Password</span>
                          <span className="text-[28px] font-extrabold text-[#EFD45C] w-2/3 leading-tight">{getBookingWifiPassword(detailsBooking)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 rounded-[24px] border border-[#2B2B2B] px-8 py-6 text-center">
                      <p className="text-[22px] text-[#A3A3A3] leading-relaxed">
                        Please keep this card for your arrival. Should you need any assistance before check-in, our team will be happy to help.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
