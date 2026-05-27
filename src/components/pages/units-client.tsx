'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useUser, useAuth } from '@/firebase';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Loader2, 
  Plus, 
  Wifi, 
  MoreVertical,
  Save,
  Edit2,
  Copy,
  Trash2
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils-app';
import { cn } from '@/lib/utils';

export default function UnitsClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  
  const unitsResources = useAppResources(['units', 'bookings']);
  const units = unitsResources.data['units'] ?? [];
  const bookings = unitsResources.data['bookings'] ?? [];
  const loading = unitsResources.loading;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

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

const normalizeUnitForForm = (unit?: any) => {
  if (!unit) {
    return {
      name: '',
      type: 'Studio',
      capacity: 2,
      rate: 0,
      wifiNetwork: '',
      wifiPassword: '',
      maxOccupancy: 2,
      baseOccupancy: 2,
      extraGuestFee: 0,
      airbnb: '',
      bookingCom: '',
      directCalendar: '',
    };
  }

  return {
    ...unit,
    airbnb: unit?.airbnb || unit?.calendars?.airbnb || '',
    bookingCom: unit?.bookingCom || unit?.calendars?.bookingCom || '',
    directCalendar: unit?.directCalendar || unit?.calendars?.direct || '',
    capacity: unit?.capacity ?? unit?.maxOccupancy ?? 2,
    maxOccupancy: unit?.maxOccupancy ?? unit?.capacity ?? 2,
    baseOccupancy: unit?.baseOccupancy ?? unit?.capacity ?? 2,
    extraGuestFee: unit?.extraGuestFee ?? 0,
    wifiNetwork: unit?.wifiNetwork || '',
    wifiPassword: unit?.wifiPassword || '',
    rate: unit?.rate ?? 0,
    type: unit?.type || 'Studio',
    name: unit?.name || '',
  };
};

const openUnitDialog = async (unit?: any) => {
  const baseUnit = normalizeUnitForForm(unit);
  setEditingUnit(baseUnit);
  setIsDialogOpen(true);

  if (!unit?.id) return;

  try {
    const freshUnit = await apiClient.get<any>(`/unit/${unit.id}`, auth);
    const resolvedUnit = freshUnit?.data || freshUnit;
    setEditingUnit((current: any) => {
      const merged = normalizeUnitForForm({ ...current, ...resolvedUnit });
      return {
        ...merged,
        directCalendar:
          resolvedUnit?.calendars?.direct ||
          resolvedUnit?.directCalendar ||
          merged.directCalendar ||
          '',
        airbnb:
          resolvedUnit?.calendars?.airbnb ||
          resolvedUnit?.airbnb ||
          merged.airbnb ||
          '',
        bookingCom:
          resolvedUnit?.calendars?.bookingCom ||
          resolvedUnit?.bookingCom ||
          merged.bookingCom ||
          '',
      };
    });
  } catch {
    // keep the optimistic form state if unit detail fetch is unavailable
  }
};

const copyToClipboard = async (value: string | undefined, label: string) => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: 'Copied', description: `${label} copied to clipboard.` });
  } catch {
    toast({ variant: 'destructive', title: 'Copy failed', description: `Could not copy ${label.toLowerCase()}.` });
  }
};

  const handleDeleteUnit = async (unit: any) => {
    if (!unit?.id) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'This unit cannot be deleted because it has no ID.'
      });
      return;
    }

    const unitName = unit?.name || unit?.unitNumber || 'this unit';
    const relatedBookings = bookings.filter((booking: any) =>
      String(booking.unitId || booking.unit_id || booking.unitName || '').trim().toLowerCase() === String(unit.id).trim().toLowerCase() ||
      String(booking.unitName || '').trim().toLowerCase() === String(unitName).trim().toLowerCase()
    );
    const warning = relatedBookings.length > 0
      ? `\n\nWarning: ${relatedBookings.length} booking${relatedBookings.length === 1 ? '' : 's'} reference this unit.`
      : '';
    const confirmed = window.confirm(`Delete unit "${unitName}"? This cannot be undone.${warning}`);
    if (!confirmed) return;

    setFormLoading(true);
    try {
      await apiClient.delete(`/unit/${unit.id}`, auth);
      toast({ title: 'Unit deleted', description: `${unitName} was removed.` });
      if (editingUnit?.id === unit.id) {
        setIsDialogOpen(false);
        setEditingUnit(null);
      }
      await unitsResources.refresh();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Failed to delete unit.'
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = {
        ...editingUnit,
        uid: user?.uid,
        rate: parseFloat(editingUnit?.rate || 0),
        capacity: parseInt(editingUnit?.capacity || editingUnit?.maxOccupancy || 0),
        maxOccupancy: parseInt(editingUnit?.maxOccupancy || editingUnit?.capacity || 0),
        baseOccupancy: parseInt(editingUnit?.baseOccupancy || editingUnit?.capacity || 0),
        extraGuestFee: parseFloat(editingUnit?.extraGuestFee || 0),
        airbnb: editingUnit?.airbnb || '',
        bookingCom: editingUnit?.bookingCom || '',
        calendars: {
          ...(editingUnit?.calendars || {}),
          airbnb: editingUnit?.airbnb || '',
          bookingCom: editingUnit?.bookingCom || '',
          direct: editingUnit?.directCalendar || editingUnit?.calendars?.direct || '',
        },
      };
      if (editingUnit?.id) {
        await apiClient.put(`/unit/${editingUnit.id}`, payload, auth);
        toast({ title: "Success", description: "Unit updated." });
      } else {
        await apiClient.post('/unit', payload, auth);
        toast({ title: "Success", description: "Unit created." });
      }
      setIsDialogOpen(false);
      await unitsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save unit." });
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4"><Loader2 className="animate-spin text-amber-500" /><p className="text-sm text-muted-foreground italic">Syncing Units...</p></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div className="text-left"><h1 className="text-3xl font-bold">Properties</h1><p className="text-muted-foreground">Manage your staycation units</p></div>
        <Button className="gradient-btn text-white gap-2 shadow-sm" onClick={() => openUnitDialog()}><Plus className="h-4 w-4" /> Add Unit</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {units.map((unit) => {
          const isBooked = bookings.some(b => String(b.unitId || b.unit_id) === String(unit.id) && today >= b.checkinDate?.split('T')[0] && today < b.checkoutDate?.split('T')[0]);
          return (
            <Card key={unit.id} className="shadow-sm border-none overflow-hidden group hover:ring-2 hover:ring-amber-500/20 transition-all">
              <CardHeader className="bg-gray-50 border-b p-4">
                <div className="flex justify-between items-center text-left">
                  <div><CardTitle className="text-lg font-bold">{unit.name}</CardTitle><p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{unit.type}</p></div>
                  <div className="flex items-center gap-1">
                    <Badge className={cn("border-none text-[10px] uppercase font-bold px-2", isBooked ? "bg-red-500 text-white" : "bg-green-500 text-white")}>{isBooked ? 'Booked' : 'Available'}</Badge>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditingUnit(normalizeUnitForForm(unit)); requestAnimationFrame(() => requestAnimationFrame(() => openUnitDialog(unit))); }}><Edit2 className="h-3.5 w-3.5 mr-2" /> Edit Details</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-700"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDeleteUnit(unit);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete Unit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="text-2xl font-black text-amber-600 tracking-tight text-left">{formatCurrency(unit.rate)}<span className="text-xs font-normal text-muted-foreground ml-1">/ night</span></div>
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50/40 p-2.5 rounded-xl border border-blue-100"><Wifi className="h-4 w-4 text-blue-500" /> {unit.wifiNetwork || 'No Network'}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          document.body.style.pointerEvents = '';
          window.setTimeout(() => {
            document.body.style.pointerEvents = '';
          }, 0);
        }
      }}>
        <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-gray-50 px-6 py-6 border-b"><DialogTitle className="text-xl font-bold">{editingUnit?.id ? 'Edit Unit Details' : 'Add Unit'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveUnit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="space-y-1">
              <Label className="text-xs uppercase font-bold text-gray-400">Unit Name / Number</Label>
              <Input value={editingUnit?.name || ''} onChange={e => setEditingUnit({...editingUnit, name: e.target.value})} required className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Unit Type</Label>
                <Input value={editingUnit?.type || ''} onChange={e => setEditingUnit({...editingUnit, type: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Nightly Rate (₱)</Label>
                <Input type="number" value={editingUnit?.rate || ''} onChange={e => setEditingUnit({...editingUnit, rate: e.target.value})} required className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Capacity</Label>
                <Input type="number" value={editingUnit?.capacity ?? ''} onChange={e => setEditingUnit({...editingUnit, capacity: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Max Occupancy</Label>
                <Input type="number" value={editingUnit?.maxOccupancy ?? ''} onChange={e => setEditingUnit({...editingUnit, maxOccupancy: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Base Occupancy</Label>
                <Input type="number" value={editingUnit?.baseOccupancy ?? ''} onChange={e => setEditingUnit({...editingUnit, baseOccupancy: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Extra Guest Fee (₱)</Label>
                <Input type="number" value={editingUnit?.extraGuestFee ?? ''} onChange={e => setEditingUnit({...editingUnit, extraGuestFee: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Wi‑Fi Network</Label>
                <Input value={editingUnit?.wifiNetwork || ''} onChange={e => setEditingUnit({...editingUnit, wifiNetwork: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase font-bold text-gray-400">Wi‑Fi Password</Label>
                <Input value={editingUnit?.wifiPassword || ''} onChange={e => setEditingUnit({...editingUnit, wifiPassword: e.target.value})} className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Airbnb ICS URL</Label>
              <div className="flex gap-2">
                <Input value={editingUnit?.airbnb || ''} onChange={e => setEditingUnit({...editingUnit, airbnb: e.target.value})} placeholder="https://..." className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
                <Button type="button" variant="outline" className="h-11 px-3" onClick={() => copyToClipboard(editingUnit?.airbnb, 'Airbnb ICS URL')} disabled={!editingUnit?.airbnb}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Booking.com ICS URL</Label>
              <div className="flex gap-2">
                <Input value={editingUnit?.bookingCom || ''} onChange={e => setEditingUnit({...editingUnit, bookingCom: e.target.value})} placeholder="https://..." className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
                <Button type="button" variant="outline" className="h-11 px-3" onClick={() => copyToClipboard(editingUnit?.bookingCom, 'Booking.com ICS URL')} disabled={!editingUnit?.bookingCom}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Direct ICS URL</Label>
              <div className="flex gap-2">
                <Input value={editingUnit?.directCalendar || ''} readOnly placeholder="Fetched from calendars.direct" className="h-11 bg-gray-100 border-none ring-1 ring-gray-200" />
                <Button type="button" variant="outline" className="h-11 px-3" onClick={() => copyToClipboard(editingUnit?.directCalendar, 'Direct ICS URL')} disabled={!editingUnit?.directCalendar}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Loaded from your API response under calendars.direct when available.</p>
            </div>

            <div className={cn("grid gap-2", editingUnit?.id ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
              {editingUnit?.id ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold rounded-xl"
                  onClick={() => handleDeleteUnit(editingUnit)}
                  disabled={formLoading}
                >
                  <Trash2 className="mr-2 h-5 w-5" />
                  Delete Unit
                </Button>
              ) : null}
              <Button type="submit" disabled={formLoading} className="h-12 gradient-btn text-white font-bold rounded-xl shadow-lg">{formLoading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Save Unit</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
