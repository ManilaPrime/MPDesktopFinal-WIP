'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { useDateStore } from '@/lib/date-store';
import { formatCurrency } from '@/lib/utils-app';
import { cn } from '@/lib/utils';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
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
import { 
  Loader2, 
  Plus, 
  Download, 
  Trash2, 
  Edit2, 
  MoreVertical, 
  Receipt,
  X
} from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'Utilities': '#3b82f6', // Blue
  'Repairs': '#f59e0b',   // Orange
  'Supplies': '#22c55e',  // Green
  'Rent': '#8b5cf6',      // Purple
  'Other Expenses': '#ef4444', // Red
};

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function ExpensesClient() {
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const resources = useAppResources(['expenses', 'units']);
  const expenses = resources.data['expenses'] ?? [];
  const units = resources.data['units'] ?? [];
  const loading = resources.loading;

  // Modals & Forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterUnitId, setFilterUnitId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Filter Data
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const eDate = expense.date?.split('T')[0] || '';
      
      // Default to current month if no explicit date range is set
      let matchesDate = eDate.startsWith(monthKey);
      if (startDate || endDate) {
        matchesDate = true;
        if (startDate && eDate < startDate) matchesDate = false;
        if (endDate && eDate > endDate) matchesDate = false;
      }

      const matchesSearch = (expense.title || expense.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || expense.category === filterCategory;
      const matchesUnit = filterUnitId === 'all' || String(expense.unitId) === filterUnitId;

      return matchesDate && matchesSearch && matchesCategory && matchesUnit;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [expenses, monthKey, startDate, endDate, searchTerm, filterCategory, filterUnitId]);

  // Aggregations
  const { categoryTotals, unitTotals, grandTotal } = useMemo(() => {
    let grandTotal = 0;
    const catMap: Record<string, number> = {};
    const unitMap: Record<string, number> = {};

    filteredExpenses.forEach(exp => {
      const amt = toNumber(exp.amount, 0);
      const cat = exp.category || 'Other Expenses';
      const uName = exp.unitName || 'General/Unassigned';

      grandTotal += amt;
      catMap[cat] = (catMap[cat] || 0) + amt;
      unitMap[uName] = (unitMap[uName] || 0) + amt;
    });

    const categoryTotals = Object.entries(catMap).map(([name, value]) => ({ 
      name, 
      value, 
      color: CATEGORY_COLORS[name] || CATEGORY_COLORS['Other Expenses'] 
    })).sort((a, b) => b.value - a.value);

    const unitTotals = Object.entries(unitMap).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { categoryTotals, unitTotals, grandTotal };
  }, [filteredExpenses]);

  const maxUnitValue = unitTotals.length > 0 ? unitTotals[0].value : 1;

  const handleOpenNew = () => {
    setEditingExpense({
      date: new Date().toISOString().split('T')[0],
      title: '',
      category: 'Utilities',
      unitId: '',
      unitName: 'General/Unassigned',
      paymentMethod: 'CASH',
      amount: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense.title || !editingExpense.amount) {
      toast({ variant: "destructive", title: "Error", description: "Title and Amount are required." });
      return;
    }

    setFormLoading(true);
    try {
      // Find unit name if unit is selected
      const selectedUnit = units.find(u => String(u.id) === String(editingExpense.unitId));
      const payload = {
        ...editingExpense,
        uid: user?.uid,
        amount: toNumber(editingExpense.amount, 0),
        unitName: selectedUnit ? (selectedUnit.name || selectedUnit.unitNumber) : 'General/Unassigned',
        updatedAt: new Date().toISOString()
      };

      if (editingExpense.id) {
        await apiClient.put(`/expense/${editingExpense.id}`, payload, auth).catch(() => null);
        await setDoc(doc(firestore, 'expenses', editingExpense.id), payload, { merge: true });
        toast({ title: "Success", description: "Expense updated successfully." });
      } else {
        payload.createdAt = new Date().toISOString();
        const res = await apiClient.post<any>('/expense', payload, auth).catch(() => ({ id: `exp-${Date.now()}` }));
        const newId = String(res?.id || res?.data?.id || `exp-${Date.now()}`);
        await setDoc(doc(firestore, 'expenses', newId), { ...payload, id: newId }, { merge: true });
        toast({ title: "Success", description: "Expense recorded successfully." });
      }

      setIsModalOpen(false);
      await resources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteExpense = async (expense: any) => {
    if (!confirm(`Delete expense "${expense.title}"?`)) return;
    try {
      await apiClient.delete(`/expense/${expense.id}`, auth).catch(() => null);
      await deleteDoc(doc(firestore, 'expenses', String(expense.id)));
      toast({ title: "Deleted", description: "Expense removed." });
      await resources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCategory('all');
    setFilterUnitId('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchTerm || filterCategory !== 'all' || filterUnitId !== 'all' || startDate || endDate;

  if (loading && !expenses.length) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><Loader2 className="animate-spin text-amber-500 h-8 w-8" /><p className="text-sm text-muted-foreground italic">Syncing Expenses...</p></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 text-left">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Receipt className="text-amber-500" /> Expenses</h1>
          <p className="text-muted-foreground">Track your spending, categories, and unit profitability.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-gray-600 bg-white" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button className="gradient-btn text-white" onClick={handleOpenNew}>
            <Plus className="h-4 w-4 mr-2" /> Add Expense
          </Button>
        </div>
      </div>

      {/* SUMMARIES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SUMMARY EXPENSES PER UNIT */}
        <Card className="border-none shadow-sm rounded-2xl h-[380px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-gray-50/50 rounded-t-2xl">
            <div>
              <CardTitle className="text-lg font-bold text-gray-800">Summary Expenses Per Unit</CardTitle>
              <p className="text-xs text-gray-500 font-medium mt-1">Cost distribution across properties</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Evaluated</p>
              <p className="text-xl font-black text-gray-800">{formatCurrency(grandTotal)}</p>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 overflow-y-auto custom-scrollbar">
            {unitTotals.length > 0 ? (
              <div className="space-y-4">
                {unitTotals.map((u, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-gray-700">{u.name}</span>
                      <span className="font-bold text-gray-900">{formatCurrency(u.value)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div 
                        className="bg-amber-400 h-2.5 rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.max(5, (u.value / maxUnitValue) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No unit expenses found for this period.</div>
            )}
          </CardContent>
        </Card>

        {/* SUMMARY REPORT PER CATEGORY */}
        <Card className="border-none shadow-sm rounded-2xl h-[380px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-0">
             <CardTitle className="text-lg font-bold text-gray-800">Summary Report Per Category</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col md:flex-row items-center justify-center gap-6">
            {categoryTotals.length > 0 ? (
              <>
                <div className="h-[220px] w-[220px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                        {categoryTotals.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total</span>
                    <span className="text-lg font-black text-gray-800">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-3 w-full">
                  {categoryTotals.map(cat => (
                    <div key={cat.name} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }}></div>
                        <span className="text-gray-600 font-medium">{cat.name}</span>
                      </div>
                      <span className="font-bold text-gray-800">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">No categorical expenses found.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Search</Label>
            <Input placeholder="Expense title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-10" />
          </div>
          
          <div className="w-40 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Category</Label>
            <select className="w-full px-3 h-10 border rounded-md text-sm bg-transparent" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="Utilities">Utilities</option>
              <option value="Repairs">Repairs</option>
              <option value="Supplies">Supplies</option>
              <option value="Rent">Rent</option>
              <option value="Other Expenses">Other Expenses</option>
            </select>
          </div>

          <div className="w-40 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Unit</Label>
            <select className="w-full px-3 h-10 border rounded-md text-sm bg-transparent" value={filterUnitId} onChange={(e) => setFilterUnitId(e.target.value)}>
              <option value="all">All Units (Incl. General)</option>
              {units.map((u) => <option key={u.id} value={String(u.id)}>{u.name || u.unitNumber}</option>)}
            </select>
          </div>

          <div className="w-36 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Date From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" />
          </div>

          <div className="w-36 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Date To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10" />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="h-10 text-gray-500 hover:text-red-600 hover:bg-red-50">
              <X className="h-4 w-4 mr-2" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* DETAILED EXPENSE RECORD TABLE */}
      <div className="rounded-xl border bg-white shadow-md overflow-hidden text-left">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="font-bold">Date</TableHead>
              <TableHead className="font-bold">Expense Title</TableHead>
              <TableHead className="font-bold">Category</TableHead>
              <TableHead className="font-bold">Affected Unit</TableHead>
              <TableHead className="font-bold">Mode of Payment</TableHead>
              <TableHead className="text-right font-bold">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map((expense) => {
              const catColor = CATEGORY_COLORS[expense.category || 'Other Expenses'];
              return (
                <TableRow key={expense.id} className="hover:bg-gray-50/50">
                  <TableCell className="text-sm font-medium">{expense.date?.split('T')[0]}</TableCell>
                  <TableCell className="font-bold text-gray-800">{expense.title || expense.name}</TableCell>
                  <TableCell>
                    <Badge className="border-none text-[10px] uppercase font-bold" style={{ backgroundColor: `${catColor}15`, color: catColor }}>
                      {expense.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{expense.unitName || 'General/Unassigned'}</TableCell>
                  <TableCell className="text-[10px] font-bold text-gray-400">{expense.paymentMethod || 'CASH'}</TableCell>
                  <TableCell className="text-right font-black text-red-600">{formatCurrency(expense.amount)}</TableCell>
                  <TableCell>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditingExpense({...expense}); setIsModalOpen(true); }}><Edit2 className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteExpense(expense)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">No expenses match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* POP-UP ADD EXPENSES MODAL */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) {
          document.body.style.pointerEvents = '';
          window.setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
        }
      }}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-gray-50 px-6 py-5 border-b"><DialogTitle className="text-xl font-bold">{editingExpense?.id ? 'Edit Expense' : 'Add New Expense'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
            
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Expense Title / Description</Label>
              <Input value={editingExpense?.title || ''} onChange={e => setEditingExpense({...editingExpense, title: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" placeholder="e.g. Meralco Bill, Cleaning Supplies..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Date</Label>
                <Input type="date" value={editingExpense?.date?.split('T')[0] || ''} onChange={e => setEditingExpense({...editingExpense, date: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Amount (₱)</Label>
                <Input type="number" min="0" step="0.01" value={editingExpense?.amount || ''} onChange={e => setEditingExpense({...editingExpense, amount: e.target.value})} required className="rounded-xl h-11 bg-gray-50/50 border-none ring-1 ring-gray-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Category</Label>
                <select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingExpense?.category || 'Utilities'} onChange={e => setEditingExpense({...editingExpense, category: e.target.value})}>
                  <option value="Utilities">Utilities</option>
                  <option value="Repairs">Repairs</option>
                  <option value="Supplies">Supplies</option>
                  <option value="Rent">Rent</option>
                  <option value="Other Expenses">Other Expenses</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Mode of Payment</Label>
                <select className="w-full h-11 border rounded-xl text-sm bg-gray-50/50 ring-1 ring-gray-200 px-3" value={editingExpense?.paymentMethod || 'CASH'} onChange={e => setEditingExpense({...editingExpense, paymentMethod: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="GCASH">GCash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400">Affected Unit</Label>
              <select className="w-full h-11 border rounded-xl bg-gray-50/50 text-sm ring-1 ring-gray-200 px-3" value={editingExpense?.unitId || ''} onChange={e => setEditingExpense({...editingExpense, unitId: e.target.value})}>
                <option value="">General / Unassigned</option>
                {units.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.unitNumber}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-gray-400">Additional Notes</Label>
              <Textarea value={editingExpense?.notes || ''} onChange={e => setEditingExpense({...editingExpense, notes: e.target.value})} className="rounded-xl bg-gray-50/50 border-none ring-1 ring-gray-200 min-h-[80px]" placeholder="Optional details, receipt numbers..." />
            </div>

            <Button type="submit" disabled={formLoading} className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg mt-2">
              {formLoading ? <Loader2 className="animate-spin" /> : (editingExpense?.id ? <Edit2 className="mr-2 h-5 w-5" /> : <Plus className="mr-2 h-5 w-5" />)} 
              {editingExpense?.id ? 'Save Changes' : 'Record Expense'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}