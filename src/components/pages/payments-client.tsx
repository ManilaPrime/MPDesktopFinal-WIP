'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useUser, useAuth } from '@/firebase';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Loader2, 
  Plus, 
  Trash2, 
  Save, 
  Undo2,
  MoreVertical,
  Edit2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils-app';
import { useDateStore } from '@/lib/date-store';
import { cn } from '@/lib/utils';

export default function PaymentsClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();
  
  const paymentsResources = useAppResources(['booking-payments', 'security-deposits', 'bookings', 'units']);
  const bookingPayments = paymentsResources.data['booking-payments'] ?? [];
  const securityDeposits = paymentsResources.data['security-deposits'] ?? [];
  const bookings = paymentsResources.data['bookings'] ?? [];
  const units = paymentsResources.data['units'] ?? [];
  const loading = paymentsResources.loading;
  const [formLoading, setFormLoading] = useState(false);

  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);

  useEffect(() => {
    const anyDialogOpen = isCollectionOpen || isRefundOpen || isEditOpen;

    if (anyDialogOpen) return;

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
  }, [isCollectionOpen, isRefundOpen, isEditOpen]);


  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const depositBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    securityDeposits.forEach(d => {
      const bId = String(d.bookingId);
      const amt = Number(d.amount) || 0;
      if (!balances[bId]) balances[bId] = 0;
      if (d.type === 'receive') balances[bId] += amt;
      else if (d.type === 'refund') balances[bId] -= amt;
    });
    return balances;
  }, [securityDeposits]);

  const mergedLedger = useMemo(() => {
    const payments = bookingPayments.map(p => ({ ...p, _type: 'payment' }));
    const deposits = securityDeposits.map(d => ({ ...d, _type: 'deposit' }));
    return [...payments, ...deposits]
      .filter(item => item.paidAt?.startsWith(monthKey))
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.date || a.paidAt).getTime());
  }, [bookingPayments, securityDeposits, monthKey]);

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry?.bookingId) { toast({ variant: "destructive", title: "Error", description: "Select a booking." }); return; }
    const payAmt = parseFloat(editingEntry.paymentAmount || 0);
    const depAmt = parseFloat(editingEntry.depositAmount || 0);
    if (payAmt <= 0 && depAmt <= 0) { toast({ variant: "destructive", title: "Error", description: "Enter an amount." }); return; }

    const targetBooking = bookings.find(b => String(b.id) === String(editingEntry.bookingId));
    const targetUnitName = targetBooking?.unitName || units.find(u => String(u.id) === String(targetBooking?.unitId))?.name || 'Unknown Unit';

    setFormLoading(true);
    try {
      const commonData = {
        uid: user?.uid,
        bookingId: editingEntry.bookingId,
        unitId: targetBooking?.unitId || '',
        unitName: targetUnitName,
        guestName: `${targetBooking?.guestFirstName || ''} ${targetBooking?.guestLastName || ''}`.trim(),
        paidAt: editingEntry.paidAt || new Date().toISOString().split('T')[0],
        method: editingEntry.method || 'CASH',
        notes: editingEntry.notes || 'Manual entry from ledger.',
        reference: editingEntry.reference || '',
        status: 'Paid'
      };
      
      if (payAmt > 0) await apiClient.post('/booking-payment', { amount: payAmt, type: 'income', ...commonData }, auth);
      if (depAmt > 0) await apiClient.post('/security-deposit', { amount: depAmt, type: 'receive', ...commonData }, auth);
      
      toast({ title: "Success", description: "Collection recorded." });
      setIsCollectionOpen(false);
      await paymentsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry?.bookingId) { toast({ variant: "destructive", title: "Error", description: "Select a booking." }); return; }
    const refAmt = parseFloat(editingEntry.refundAmount || 0);
    const balance = depositBalances[editingEntry.bookingId] || 0;
    if (refAmt <= 0 || refAmt > balance) { toast({ variant: "destructive", title: "Error", description: "Invalid amount or exceeds available balance." }); return; }

    const targetBooking = bookings.find(b => String(b.id) === String(editingEntry.bookingId));
    const targetUnitName = targetBooking?.unitName || units.find(u => String(u.id) === String(targetBooking?.unitId))?.name || 'Unknown Unit';

    setFormLoading(true);
    try {
      await apiClient.post('/security-deposit', {
        uid: user?.uid,
        bookingId: editingEntry.bookingId,
        unitId: targetBooking?.unitId || '',
        unitName: targetUnitName,
        guestName: `${targetBooking?.guestFirstName || ''} ${targetBooking?.guestLastName || ''}`.trim(),
        type: 'refund',
        amount: refAmt,
        paidAt: editingEntry.paidAt || new Date().toISOString().split('T')[0],
        method: editingEntry.method || 'CASH',
        notes: editingEntry.notes || 'Manual refund from ledger.',
        reference: editingEntry.reference || '',
        status: 'Refunded'
      }, auth);
      toast({ title: "Success", description: "Deposit refunded." });
      setIsRefundOpen(false);
      await paymentsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const endpoint = editingEntry._type === 'payment' ? `/booking-payment/${editingEntry.id}` : `/security-deposit/${editingEntry.id}`;
      await apiClient.put(endpoint, { 
        ...editingEntry, 
        uid: user?.uid, 
        amount: parseFloat(editingEntry.amount),
        updatedAt: new Date().toISOString()
      }, auth);
      toast({ title: "Updated", description: "Entry updated." });
      setIsEditOpen(false);
      await paymentsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm("Permanently remove this entry from the ledger?")) return;
    const endpoint = item._type === 'payment' ? `/booking-payment/${item.id}` : `/security-deposit/${item.id}`;
    try {
      await apiClient.delete(endpoint, auth);
      toast({ title: "Deleted", description: "Entry removed." });
      await paymentsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
    }
  };

  const getStatusBadge = (item: any, isIncome: boolean, isRefund: boolean) => {
    const rawStatus = (item.status || (isIncome ? 'Paid' : (isRefund ? 'Refunded' : 'Paid'))).toLowerCase();
    
    if (rawStatus === 'paid' || rawStatus === 'received') {
      return <Badge className="bg-green-100 text-green-700 border-none uppercase text-[10px]">Paid</Badge>;
    }
    if (rawStatus === 'unpaid') {
      return <Badge className="bg-red-100 text-red-700 border-none uppercase text-[10px]">Unpaid</Badge>;
    }
    if (rawStatus === 'refunded') {
      return <Badge className="bg-slate-100 text-slate-700 border-none uppercase text-[10px]">Refunded</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-700 border-none uppercase text-[10px]">{item.status || 'Unknown'}</Badge>;
  };

  if (loading && !mergedLedger.length) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><Loader2 className="animate-spin text-amber-500" /><p className="text-sm text-muted-foreground italic">Syncing Ledger...</p></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 text-left">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">Payments Ledger</h1><p className="text-muted-foreground">{monthKey}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-red-600" onClick={() => { setEditingEntry({ paidAt: new Date().toISOString().split('T')[0], refundAmount: 0, method: 'CASH' }); setIsRefundOpen(true); }}><Undo2 className="h-4 w-4 mr-2" /> Refund</Button>
          <Button className="gradient-btn text-white" onClick={() => { setEditingEntry({ paidAt: new Date().toISOString().split('T')[0], paymentAmount: 0, depositAmount: 0, method: 'CASH' }); setIsCollectionOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Collection</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-md overflow-hidden text-left">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mergedLedger.map((item) => {
              const booking = bookings.find(b => String(b.id) === String(item.bookingId));
              const unit = units.find(u => String(u.id) === String(item.unitId || booking?.unitId));
              const isIncome = item._type === 'payment';
              const isRefund = item.type === 'refund';
              const unitName = item.unitName || unit?.name || unit?.unitNumber || 'N/A';
              
              return (
                <TableRow 
                  key={item.id} 
                  className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onDoubleClick={() => {
                    setEditingEntry({...item}); 
                    requestAnimationFrame(() => requestAnimationFrame(() => setIsEditOpen(true)));
                  }}
                >
                  <TableCell>
                    <Badge className={cn("text-[9px] uppercase border-none", isIncome ? "bg-green-100 text-green-700" : (isRefund ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"))}>
                      {isIncome ? 'Income' : (isRefund ? 'Refund' : 'Deposit')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{item.paidAt?.split('T')[0]}</TableCell>
                  <TableCell className="font-bold text-sm text-gray-900">{item.guestName || (booking ? `${booking.guestFirstName} ${booking.guestLastName}` : 'N/A')}</TableCell>
                  <TableCell className="text-xs text-gray-600">{unitName}</TableCell>
                  <TableCell className="text-[10px] font-bold text-gray-400">{item.method || 'CASH'}</TableCell>
                  <TableCell>{getStatusBadge(item, isIncome, isRefund)}</TableCell>
                  <TableCell className={cn("text-right font-black", isIncome ? "text-green-600" : (isRefund ? "text-red-600" : "text-blue-600"))}>
                    {isRefund ? '-' : ''}{formatCurrency(item.amount)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditingEntry({...item}); requestAnimationFrame(() => requestAnimationFrame(() => setIsEditOpen(true))); }}><Edit2 className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {mergedLedger.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground italic">No payment records found for this month.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* NEW COLLECTION MODAL */}
      <Dialog open={isCollectionOpen} onOpenChange={(open) => {
        setIsCollectionOpen(open);
        if (!open) {
          document.body.style.pointerEvents = '';
          window.setTimeout(() => {
            document.body.style.pointerEvents = '';
          }, 0);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-gray-50 px-6 py-6 border-b"><DialogTitle className="text-xl font-bold">Record Collection</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveCollection} className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400">Guest Reservation</Label>
              <select className="w-full h-11 border rounded-xl bg-gray-50/50 text-sm ring-1 ring-gray-200 px-3" value={editingEntry?.bookingId || ''} onChange={e => setEditingEntry({...editingEntry, bookingId: e.target.value})} required>
                <option value="">Select Reservation</option>
                {bookings.map(b => <option key={b.id} value={String(b.id)}>{b.guestFirstName} {b.guestLastName} - {b.unitName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-xs uppercase font-bold text-gray-400">Rent (₱)</Label><Input type="number" min="0" value={editingEntry?.paymentAmount || ''} onChange={e => setEditingEntry({...editingEntry, paymentAmount: e.target.value})} className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" /></div>
              <div className="space-y-2"><Label className="text-xs uppercase font-bold text-gray-400">Security (₱)</Label><Input type="number" min="0" value={editingEntry?.depositAmount || ''} onChange={e => setEditingEntry({...editingEntry, depositAmount: e.target.value})} className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-xs uppercase font-bold text-gray-400">Payment Date</Label><Input type="date" value={editingEntry?.paidAt?.split('T')[0] || ''} onChange={e => setEditingEntry({...editingEntry, paidAt: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" /></div>
              <div className="space-y-2"><Label className="text-xs uppercase font-bold text-gray-400">Method</Label><select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingEntry?.method || 'CASH'} onChange={e => setEditingEntry({...editingEntry, method: e.target.value})}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select></div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Notes & Reference</Label>
              <Textarea value={editingEntry?.notes || ''} onChange={e => setEditingEntry({...editingEntry, notes: e.target.value})} className="rounded-xl bg-gray-50/50 border-none ring-1 ring-gray-200 min-h-[80px]" placeholder="Optional notes or reference numbers..." />
            </div>
            <Button type="submit" disabled={formLoading} className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg">{formLoading ? <Loader2 className="animate-spin" /> : <Plus className="mr-2 h-5 w-5" />} Confirm Entry</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* REFUND MODAL */}
      <Dialog open={isRefundOpen} onOpenChange={(open) => {
        setIsRefundOpen(open);
        if (!open) {
          document.body.style.pointerEvents = '';
          window.setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-red-50 px-6 py-6 border-b border-red-100"><DialogTitle className="text-xl font-bold text-red-700">Issue Deposit Refund</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveRefund} className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400">Guest Reservation</Label>
              <select className="w-full h-11 border rounded-xl bg-gray-50/50 text-sm ring-1 ring-gray-200 px-3" value={editingEntry?.bookingId || ''} onChange={e => setEditingEntry({...editingEntry, bookingId: e.target.value})} required>
                <option value="">Select Reservation</option>
                {bookings.map(b => {
                   const bal = depositBalances[String(b.id)] || 0;
                   if (bal <= 0) return null;
                   return <option key={b.id} value={String(b.id)}>{b.guestFirstName} {b.guestLastName} (Avail: {formatCurrency(bal)})</option>
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Refund Amt (₱)</Label>
                <Input type="number" min="1" max={editingEntry?.bookingId ? depositBalances[editingEntry.bookingId] : 99999} value={editingEntry?.refundAmount || ''} onChange={e => setEditingEntry({...editingEntry, refundAmount: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-red-200 focus-visible:ring-red-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Refund Date</Label>
                <Input type="date" value={editingEntry?.paidAt?.split('T')[0] || ''} onChange={e => setEditingEntry({...editingEntry, paidAt: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Method</Label>
              <select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingEntry?.method || 'CASH'} onChange={e => setEditingEntry({...editingEntry, method: e.target.value})}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Notes & Reference</Label>
              <Textarea value={editingEntry?.notes || ''} onChange={e => setEditingEntry({...editingEntry, notes: e.target.value})} className="rounded-xl bg-gray-50/50 border-none ring-1 ring-gray-200 min-h-[80px]" placeholder="Optional notes or reference numbers..." />
            </div>
            <Button type="submit" disabled={formLoading} className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg">{formLoading ? <Loader2 className="animate-spin" /> : <Undo2 className="mr-2 h-5 w-5" />} Process Refund</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          document.body.style.pointerEvents = '';
          window.setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-gray-50 px-6 py-6 border-b"><DialogTitle className="text-xl font-bold">Edit Transaction</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateEntry} className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Amount (₱)</Label>
              <Input type="number" value={editingEntry?.amount || ''} onChange={e => setEditingEntry({...editingEntry, amount: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Date</Label>
                <Input type="date" value={editingEntry?.paidAt?.split('T')[0] || ''} onChange={e => setEditingEntry({...editingEntry, paidAt: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Status</Label>
                <select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingEntry?.status || ''} onChange={e => setEditingEntry({...editingEntry, status: e.target.value})}>
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Method</Label>
              <select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingEntry?.method || 'CASH'} onChange={e => setEditingEntry({...editingEntry, method: e.target.value})}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank</option></select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Notes</Label>
              <Textarea value={editingEntry?.notes || ''} onChange={e => setEditingEntry({...editingEntry, notes: e.target.value})} className="rounded-xl bg-gray-50/50 border-none ring-1 ring-gray-200 min-h-[80px]" />
            </div>
            <Button type="submit" disabled={formLoading} className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg">{formLoading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}