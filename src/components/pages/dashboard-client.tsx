'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useUser, useAuth } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDateStore } from '@/lib/date-store';
import { formatCurrency, calculateProratedRevenue } from '@/lib/utils-app';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { cn } from '@/lib/utils';
import { 
  CalendarDays, 
  DollarSign, 
  BedDouble, 
  Wallet, 
  TrendingUp, 
  Plus, 
  FileText, 
  Bell, 
  UserCheck, 
  Bot, 
  ChevronRight, 
  MoreVertical, 
  CheckCircle2, 
  AlertCircle,
  ArrowUpRight,
  Clock,
  CircleDashed,
  Loader2,
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import Link from 'next/link';

export default function DashboardClient() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { month, year } = useDateStore();
  
  const dashboardResources = useAppResources(['units', 'bookings', 'expenses', 'booking-payments', 'reminders']);
  const apiData = useMemo(() => ({
    units: dashboardResources.data['units'] ?? [],
    bookings: dashboardResources.data['bookings'] ?? [],
    expenses: dashboardResources.data['expenses'] ?? [],
    bookingPayments: dashboardResources.data['booking-payments'] ?? [],
    reminders: dashboardResources.data['reminders'] ?? [],
  }), [dashboardResources.data]);
  const apiLoading = dashboardResources.loading || isUserLoading;
  const error = dashboardResources.error;

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const stats = useMemo(() => {
    if (!apiData) return null;
    const { units, bookings, expenses, bookingPayments } = apiData;
    
    const currentMonthBookings = bookings.filter(b => b.checkIn?.startsWith(monthKey) || b.checkOut?.startsWith(monthKey));
    const income = bookings.reduce((sum, b) => sum + calculateProratedRevenue(b, month, year), 0);
    const totalExpenses = expenses.filter(e => e.date?.startsWith(monthKey)).reduce((sum, e) => sum + Number(e.calculatedTotal || e.amount || 0), 0);
    const collected = bookingPayments.filter(p => p.paidAt?.startsWith(monthKey)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const uncollected = Math.max(0, income - collected);
    const netProfit = income - totalExpenses;
    
    const activeUnitIds = new Set(bookings
      .filter(b => calculateProratedRevenue(b, month, year) > 0)
      .map(b => String(b.unitId || b.unit_id)));
    
    const activeCount = activeUnitIds.size;
    const occupancyRate = units.length > 0 ? Math.round((activeCount / units.length) * 100) : 0;
    const pendingBookingsCount = bookings.filter(b => b.status === 'pending' || b.paymentStatus === 'unpaid').length;

    return {
      totalUnits: units.length,
      totalBookings: currentMonthBookings.length,
      income,
      collected,
      uncollected,
      expenses: totalExpenses,
      netProfit,
      activeCount,
      occupancyRate,
      pendingBookingsCount
    };
  }, [apiData, month, year, monthKey]);

  // Derived Data for Lists
  const upcomingCheckins = useMemo(() => {
    if (!apiData) return [];
    const today = new Date().toISOString().split('T')[0];
    return apiData.bookings
      .filter(b => b.checkIn >= today)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 5);
  }, [apiData]);

  const recentBookings = useMemo(() => {
    if (!apiData) return [];
    return [...apiData.bookings]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 5);
  }, [apiData]);

  const handleGenerateInsight = async () => {
    if (!stats) return;
    setIsAiLoading(true);
    try {
      const { summary } = await apiClient.post<{ summary: string }>('/ai/report-summary', {
        reportData: { ...stats, period: monthKey }
      }, auth);
      setAiInsight(summary);
    } catch (e) {
      console.error("AI Insight Error:", e);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    // Auto-generate insight once data is loaded
    if (stats && !aiInsight && !isAiLoading) {
      handleGenerateInsight();
    }
  }, [stats]);

  if (isUserLoading || apiLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-amber-500 h-10 w-10" />
      </div>
    );
  }

  if (error || !stats) return null;

  // Chart Data
  const paymentChartData = [
    { name: 'Fully Paid', value: stats.collected, color: '#16a34a' },
    { name: 'Partial/Unpaid', value: stats.uncollected, color: '#ef4444' },
  ];

  const mockRevenueData = [
    { name: 'May 1', value: 20000 }, { name: 'May 8', value: 45000 },
    { name: 'May 15', value: 38000 }, { name: 'May 22', value: 85000 },
    { name: 'May 29', value: stats.income }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto pb-10">
      
      {/* ROW 1: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          title="Total Bookings" 
          value={stats.totalBookings.toString()} 
          subtext="+12% vs last month"
          icon={<CalendarDays size={24} className="text-blue-500" />} 
          iconBg="bg-blue-50"
          trend="up"
        />
        <KPICard 
          title={`Revenue (${new Date(year, month).toLocaleString('default', { month: 'short', year: 'numeric' })})`} 
          value={formatCurrency(stats.income)} 
          subtext="+18% vs last month"
          icon={<DollarSign size={24} className="text-green-500" />} 
          iconBg="bg-green-50"
          trend="up"
        />
        <KPICard 
          title="Occupied Units" 
          value={`${stats.activeCount} / ${stats.totalUnits}`} 
          subtext={`${stats.occupancyRate}% Occupancy Rate`}
          icon={<BedDouble size={24} className="text-orange-500" />} 
          iconBg="bg-orange-50"
        />
        <KPICard 
          title="Pending Payments" 
          value={formatCurrency(stats.uncollected)} 
          subtext={`${stats.pendingBookingsCount} Bookings`}
          icon={<Wallet size={24} className="text-red-500" />} 
          iconBg="bg-red-50"
        />
        <KPICard 
          title="Net Profit (May)" 
          value={formatCurrency(stats.netProfit)} 
          subtext="+22% vs last month"
          icon={<TrendingUp size={24} className="text-purple-500" />} 
          iconBg="bg-purple-50"
          trend="up"
        />
      </div>

      {/* ROW 2: Quick Actions & AI */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3 border-none shadow-sm rounded-2xl">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <span className="font-semibold text-gray-800 ml-2">Quick Actions</span>
            <div className="flex flex-wrap items-center gap-6 mr-4">
              <QuickAction icon={<CalendarDays className="h-4 w-4 text-blue-600" />} label="New Booking" bg="bg-blue-50" />
              <QuickAction icon={<DollarSign className="h-4 w-4 text-green-600" />} label="Add Expense" bg="bg-green-50" />
              <QuickAction icon={<Bell className="h-4 w-4 text-orange-600" />} label="Send Reminder" bg="bg-orange-50" />
              <QuickAction icon={<UserCheck className="h-4 w-4 text-blue-600" />} label="Check-in Guest" bg="bg-blue-50" />
              <QuickAction icon={<FileText className="h-4 w-4 text-purple-600" />} label="Generate Report" bg="bg-purple-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-none shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-all">
          <CardContent className="p-4 flex items-center justify-between h-full">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white rounded-full shadow-sm">
                <Bot className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-bold text-gray-800 text-sm">AI Assistant</h4>
                <p className="text-xs text-gray-500">Ask anything about your bookings...</p>
              </div>
            </div>
            <ChevronRight className="text-gray-400 h-5 w-5" />
          </CardContent>
        </Card>
      </div>

      {/* ROW 3: Check-ins, Recent Bookings, Payment Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upcoming Check-ins */}
        <Card className="border-none shadow-sm rounded-2xl flex flex-col h-[380px]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-bold text-gray-800">Upcoming Check-ins</CardTitle>
            <Link href="/bookings" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-4">
              {upcomingCheckins.length > 0 ? upcomingCheckins.map((booking, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                      {booking.guestName?.substring(0, 2).toUpperCase() || 'GU'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800 line-clamp-1">{booking.guestName || 'Unknown Guest'}</p>
                      <p className="text-xs text-gray-500">{booking.unitId || 'Unassigned'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">{booking.checkIn}</p>
                    <p className="text-xs text-gray-400">{booking.checkInTime || '2:00 PM'}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center text-gray-400 text-sm mt-10">No upcoming check-ins</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Bookings */}
        <Card className="border-none shadow-sm rounded-2xl flex flex-col h-[380px]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-bold text-gray-800">Recent Bookings</CardTitle>
            <Link href="/bookings" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-4">
              {recentBookings.length > 0 ? recentBookings.map((booking, i) => {
                const isPaid = booking.paymentStatus === 'paid';
                const isDeposit = booking.paymentStatus === 'partial';
                return (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-800 line-clamp-1">{booking.guestName || 'Unknown Guest'}</p>
                      <p className="text-xs text-gray-500">{booking.unitId} • {booking.checkIn}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-md uppercase",
                        isPaid ? "bg-green-50 text-green-600" : isDeposit ? "bg-orange-50 text-orange-600" : "bg-red-50 text-red-600"
                      )}>
                        {booking.paymentStatus || 'Unpaid'}
                      </span>
                      <p className="text-sm font-bold text-gray-800 w-16 text-right">
                        {formatCurrency(calculateProratedRevenue(booking, month, year))}
                      </p>
                      <MoreVertical className="h-4 w-4 text-gray-400 cursor-pointer" />
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center text-gray-400 text-sm mt-10">No recent bookings</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card className="border-none shadow-sm rounded-2xl flex flex-col h-[380px]">
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <CardTitle className="text-base font-bold text-gray-800">Payment Summary</CardTitle>
            <Link href="/reports" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="flex flex-col justify-center flex-1">
            <div className="h-[160px] relative mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-gray-800">{formatCurrency(stats.collected)}</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Total Collected</span>
              </div>
            </div>
            
            <div className="space-y-3 px-4">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-green-600"></div><span className="text-gray-600">Fully Paid ({Math.round((stats.collected/(stats.income||1))*100)}%)</span></div>
                <span className="font-bold text-gray-800">{formatCurrency(stats.collected)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-red-500"></div><span className="text-gray-600">Unpaid/Balance ({Math.round((stats.uncollected/(stats.income||1))*100)}%)</span></div>
                <span className="font-bold text-gray-800">{formatCurrency(stats.uncollected)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 4: Deposits, Revenue Chart, Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Deposit Records (Mocked based on design) */}
        <Card className="border-none shadow-sm rounded-2xl h-[280px]">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-bold text-gray-800">Deposit Records</CardTitle>
            <Link href="#" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-green-50 rounded-xl border border-green-100 flex flex-col items-center text-center">
                <ArrowDownRight className="h-5 w-5 text-green-600 mb-2" />
                <span className="text-[10px] text-gray-500 uppercase mb-1">Received</span>
                <span className="text-sm font-black text-gray-800">{formatCurrency(32500)}</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center text-center">
                <ArrowUpRight className="h-5 w-5 text-blue-600 mb-2" />
                <span className="text-[10px] text-gray-500 uppercase mb-1">Refunded</span>
                <span className="text-sm font-black text-gray-800">{formatCurrency(8000)}</span>
              </div>
              <div className="p-3 bg-orange-50 rounded-xl border border-orange-100 flex flex-col items-center text-center">
                <AlertCircle className="h-5 w-5 text-orange-600 mb-2" />
                <span className="text-[10px] text-gray-500 uppercase mb-1">Unpaid</span>
                <span className="text-sm font-black text-gray-800">{formatCurrency(11500)}</span>
              </div>
            </div>
            <div className="text-center pt-2">
               <Link href="#" className="text-xs text-blue-600 font-medium hover:underline flex items-center justify-center gap-1">
                 View all deposit transactions <ChevronRight className="h-3 w-3" />
               </Link>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Overview */}
        <Card className="border-none shadow-sm rounded-2xl h-[280px]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-bold text-gray-800">Revenue Overview</CardTitle>
            <span className="text-xs text-gray-500 border rounded px-2 py-1 bg-gray-50">This Month</span>
          </CardHeader>
          <CardContent>
            <div className="mb-2">
              <span className="text-2xl font-black text-gray-800 mr-2">{formatCurrency(stats.income)}</span>
              <span className="text-xs text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded">↑ 18% vs last month</span>
            </div>
            <div className="h-[120px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockRevenueData}>
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Channel Sources (Mocked) */}
        <Card className="border-none shadow-sm rounded-2xl h-[280px]">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-bold text-gray-800">Channel Sources</CardTitle>
            <span className="text-xs text-gray-500 border rounded px-2 py-1 bg-gray-50">This Month</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelRow name="Direct Booking" count={45} percent={40} color="bg-green-500" />
            <ChannelRow name="Facebook" count={30} percent={27} color="bg-blue-600" />
            <ChannelRow name="Airbnb" count={20} percent={18} color="bg-red-500" />
            <ChannelRow name="Walk-in" count={13} percent={12} color="bg-orange-400" />
            <ChannelRow name="Other" count={5} percent={3} color="bg-purple-500" />
          </CardContent>
        </Card>
      </div>

      {/* ROW 5: Housekeeping, Activity, Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Housekeeping Tasks (Mocked) */}
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-bold text-gray-800">Housekeeping Tasks</CardTitle>
            <Link href="#" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col">
                <span className="font-bold text-gray-800 text-sm mb-1">953 D</span>
                <span className="text-[10px] text-gray-500 mb-3">Check-out: May 9, 11:00 AM</span>
                <div className="mt-auto flex justify-between items-center">
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">Cleaning</span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col">
                <span className="font-bold text-gray-800 text-sm mb-1">1537 C2</span>
                <span className="text-[10px] text-gray-500 mb-3">Check-out: May 6, 10:00 AM</span>
                <div className="mt-auto flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-2 py-1 rounded">Pending</span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col">
                <span className="font-bold text-gray-800 text-sm mb-1">372 S3T1</span>
                <span className="text-[10px] text-gray-500 mb-3">Check-out: May 14, 11:00 AM</span>
                <div className="mt-auto flex justify-between items-center">
                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Ready</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity (Mocked + AI Insight hook) */}
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-bold text-gray-800">Recent Activity</CardTitle>
            <Link href="#" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex gap-3">
               <div className="mt-0.5"><CheckCircle2 className="h-5 w-5 text-green-500" /></div>
               <div>
                 <p className="text-sm text-gray-800">Payment received from <b>Rey Arjay Patiag</b></p>
                 <p className="text-[10px] text-gray-400">P1,500 • 2 minutes ago</p>
               </div>
             </div>
             <div className="flex gap-3">
               <div className="mt-0.5"><CalendarDays className="h-5 w-5 text-blue-500" /></div>
               <div>
                 <p className="text-sm text-gray-800">New booking for <b>Juan Dela Cruz</b> (855 S3T1)</p>
                 <p className="text-[10px] text-gray-400">May 28-30, 2026 • 10 minutes ago</p>
               </div>
             </div>
             <div className="flex gap-3">
               <div className="mt-0.5"><CheckSquare className="h-5 w-5 text-blue-400" /></div>
               <div>
                 <p className="text-sm text-gray-800">Housekeeping completed in <b>1571 C2</b></p>
                 <p className="text-[10px] text-gray-400">20 minutes ago</p>
               </div>
             </div>
          </CardContent>
        </Card>

        {/* Business Insight (Wired to your AI) */}
        <Card className="border border-orange-100 shadow-sm rounded-2xl bg-orange-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-orange-500" /> Business Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isAiLoading ? (
              <div className="flex flex-col items-center justify-center py-6">
                <Loader2 className="animate-spin text-orange-500 h-6 w-6 mb-2" />
                <p className="text-xs text-gray-500">Analyzing performance...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700 font-medium leading-relaxed mb-4">
                  {aiInsight || "Your occupancy rate is steady. Keep up the good work! Consider increasing weekend rates for higher demand."}
                </p>
                <Button onClick={handleGenerateInsight} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm h-10">
                  Generate Fresh Insight
                </Button>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// Subcomponents for cleaner code
function KPICard({ title, value, subtext, icon, iconBg, trend }: { title: string, value: string, subtext: string, icon: React.ReactNode, iconBg: string, trend?: 'up' | 'down' }) {
  return (
    <Card className="shadow-sm border-none bg-white p-5 rounded-2xl">
      <div className="flex items-start justify-between">
        <div className={cn("p-3 rounded-xl", iconBg)}>
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[12px] text-gray-500 font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-black text-gray-800">{value}</h3>
        <p className={cn(
          "text-[11px] font-bold mt-2", 
          trend === 'up' ? "text-green-600" : trend === 'down' ? "text-red-500" : "text-gray-400"
        )}>
          {subtext}
        </p>
      </div>
    </Card>
  );
}

function QuickAction({ icon, label, bg }: { icon: React.ReactNode, label: string, bg: string }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer group">
      <div className={cn("p-2 rounded-lg transition-transform group-hover:scale-110", bg)}>
        {icon}
      </div>
      <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900">{label}</span>
    </div>
  );
}

function ChannelRow({ name, count, percent, color }: { name: string, count: number, percent: number, color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 w-28 text-xs">{name}</span>
      <span className="text-gray-500 text-xs w-24 text-right pr-4">{count} Bookings ({percent}%)</span>
      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-800 w-8 text-right">{percent}%</span>
    </div>
  );
}