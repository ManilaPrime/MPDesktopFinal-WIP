"use client"

import React, { useEffect, useState, useMemo } from "react"
import { useUser, useAuth } from "@/firebase"
import { apiClient } from "@/lib/api-client"
import { useAppResources } from "@/lib/app-data-store"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { 
  ArrowLeft, 
  Loader2, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Printer,
  BarChart3,
  Layers,
  Trophy,
  Calculator,
  Sparkles,
  Wand2
} from "lucide-react"
import { formatCurrency, calculateProratedRevenue, calculateProratedBaseRevenue } from "@/lib/utils-app"
import { useDateStore } from "@/lib/date-store"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts'
import { useToast } from "@/hooks/use-toast"

export default function AnalyticsClient() {
  const { user } = useUser()
  const auth = useAuth()
  const { toast } = useToast()
  const { month, year } = useDateStore()
  
  const analyticsResources = useAppResources(['bookings', 'units', 'expenses', 'agents', 'investors'])
  const loading = analyticsResources.loading
  const data = useMemo(() => ({
    bookings: analyticsResources.data['bookings'] ?? [],
    units: analyticsResources.data['units'] ?? [],
    expenses: analyticsResources.data['expenses'] ?? [],
    agents: analyticsResources.data['agents'] ?? [],
    investors: analyticsResources.data['investors'] ?? [],
  }), [analyticsResources.data])

  const [reportType, setReportType] = useState("unit")
  const [selectedEntity, setSelectedEntity] = useState("all")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedReport, setGeneratedReport] = useState<any>(null)
  
  // AI Summary State
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

  const overviewMetrics = useMemo(() => {
    if (!data) return null
    const revenue = data.bookings.reduce((sum, b) => sum + calculateProratedRevenue(b, month, year), 0);
    const filteredExpenses = data.expenses.filter(e => e.date?.startsWith(monthKey))
    const expense = filteredExpenses.reduce((sum, e) => sum + Number(e.calculatedTotal || e.amount || 0), 0)
    return { revenue, expense, profit: revenue - expense }
  }, [data, month, year, monthKey])

  const chartData = useMemo(() => {
    if (!overviewMetrics) return []
    return [
      { name: 'Revenue', value: overviewMetrics.revenue, color: '#10b981' },
      { name: 'Expenses', value: overviewMetrics.expense, color: '#ef4444' },
      { name: 'Net Profit', value: overviewMetrics.profit, color: '#f59e0b' }
    ]
  }, [overviewMetrics])

  const unitRankings = useMemo(() => {
    if (!data) return []
    return data.units.map(u => {
      const uId = String(u.id)
      const bookings = data.bookings.filter(b => String(b.unitId || b.unit_id) === uId);
      const revenue = bookings.reduce((sum, b) => sum + calculateProratedRevenue(b, month, year), 0);
      const grossIncome = bookings.reduce((sum, b) => sum + calculateProratedBaseRevenue(b, month, year), 0);
      const unitExpenses = data.expenses
        .filter(e => {
          const matchesDate = e.date?.startsWith(monthKey);
          const targetsUnit = e.unitIds && e.unitIds.map(String).includes(String(u.id));
          return matchesDate && targetsUnit && e.category !== 'Agent Commission';
        })
        .reduce((sum, e) => {
          const total = Number(e.calculatedTotal || e.amount || 0);
          const targetedUnitsCount = (e.unitIds && e.unitIds.length > 0) ? e.unitIds.length : data.units.length;
          return sum + (total / targetedUnitsCount);
        }, 0);
      return { name: u.name || u.unitNumber, revenue, expenses: unitExpenses, profit: grossIncome - unitExpenses }
    }).sort((a, b) => b.profit - a.profit)
  }, [data, month, year, monthKey])

  const handleGenerate = () => {
    setIsGenerating(true)
    setAiSummary(null)
    
    {
      let revenue = 0, grossIncome = 0, expense = 0, entityName = "All Entities", commission = 0, investorShare = 0

      if (reportType === "unit") {
        const filteredBookings = data.bookings.filter(b => selectedEntity === "all" || String(b.unitId || b.unit_id) === selectedEntity)
        revenue = filteredBookings.reduce((sum, b) => sum + calculateProratedRevenue(b, month, year), 0)
        grossIncome = filteredBookings.reduce((sum, b) => sum + calculateProratedBaseRevenue(b, month, year), 0)
        
        expense = data.expenses.filter(e => {
          const matchesDate = e.date?.startsWith(monthKey);
          const isTargeted = selectedEntity === "all" || (e.unitIds && e.unitIds.map(String).includes(selectedEntity));
          return matchesDate && isTargeted && e.category !== 'Agent Commission';
        }).reduce((sum, e) => {
          const total = Number(e.calculatedTotal || e.amount || 0);
          const targetedUnitsCount = (e.unitIds && e.unitIds.length > 0) ? e.unitIds.length : data.units.length;
          return sum + (selectedEntity === "all" ? total : (total / targetedUnitsCount));
        }, 0)

        entityName = selectedEntity === "all" ? "All Units" : data.units.find(u => String(u.id) === selectedEntity)?.name || "Unknown Unit"
      } 
      else if (reportType === "agent") {
        const agent = data.agents.find(a => String(a.id) === selectedEntity);
        if (agent) {
          entityName = agent.name;
          const agentBookings = data.bookings.filter(b => String(b.agentId) === selectedEntity);
          
          agentBookings.forEach(b => {
            const bRevenue = calculateProratedRevenue(b, month, year);
            const bGrossIncome = calculateProratedBaseRevenue(b, month, year);
            revenue += bRevenue;
            grossIncome += bGrossIncome;

            const unit = data.units.find(u => String(u.id) === String(b.unitId));
            if (unit) {
              const checkin = new Date(b.checkinDate);
              const checkout = new Date(b.checkoutDate);
              const nights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)));
              const baseCost = nights * Number(unit.rate || 0);
              const surplus = Math.max(0, Number(b.totalAmount || 0) - baseCost);
              commission += (surplus * (bRevenue / Number(b.totalAmount || 1)));
            }
          });
        }
      }
      else if (reportType === "investor") {
        const investor = data.investors.find(i => String(i.id) === selectedEntity);
        if (investor) {
          entityName = investor.name;
          const assignedUnitIds = investor.unitIds?.map(String) || [];
          
          assignedUnitIds.forEach((uId: string) => {
            const uRevenue = data.bookings.filter(b => String(b.unitId || b.unit_id) === uId).reduce((sum, b) => sum + calculateProratedRevenue(b, month, year), 0)
            const uGrossIncome = data.bookings.filter(b => String(b.unitId || b.unit_id) === uId).reduce((sum, b) => sum + calculateProratedBaseRevenue(b, month, year), 0)
            const uExpense = data.expenses.filter(e => e.date?.startsWith(monthKey) && e.unitIds?.map(String).includes(uId) && e.category !== 'Agent Commission').reduce((sum, e) => {
              const total = Number(e.calculatedTotal || e.amount || 0);
              return sum + (total / (e.unitIds?.length || 1));
            }, 0);
            
            revenue += uRevenue;
            grossIncome += uGrossIncome;
            expense += uExpense;
          });

          const netProfit = grossIncome - expense;
          const companyShare = netProfit * (5 / 6);
          investorShare = Math.max(0, companyShare * (Number(investor.sharePercentage || 0) / 100));
        }
      }

      setGeneratedReport({ 
        type: reportType, 
        name: entityName, 
        period: monthKey, 
        revenue, 
        grossIncome,
        expenses: expense, 
        profit: grossIncome - expense,
        commission,
        investorShare
      })
      setIsGenerating(false)
    }
  }

  const handleGenerateAiSummary = async () => {
    if (!generatedReport) return;
    setIsAiLoading(true);
    try {
      const { summary } = await apiClient.post<{ summary: string }>('/ai/report-summary', {
        reportData: generatedReport
      }, auth);
      setAiSummary(summary);
    } catch (error: any) {
      toast({
        title: "AI Analysis Failed",
        description: "Could not generate report summary.",
        variant: "destructive"
      });
    } finally {
      setIsAiLoading(false);
    }
  }

  const dropdownEntities = useMemo(() => {
    if (!data) return [];
    if (reportType === "unit") return [{ id: "all", name: "All Units" }, ...data.units];
    if (reportType === "agent") return data.agents;
    if (reportType === "investor") return data.investors;
    return [];
  }, [data, reportType]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
      <p className="text-muted-foreground font-medium">Syncing Reporting Tools...</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-20 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-left">
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground">Financial period: {monthKey}</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Export View
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md mb-8">
          <TabsTrigger value="overview">General Overview</TabsTrigger>
          <TabsTrigger value="generate">Report Builder</TabsTrigger>
          <TabsTrigger value="performance">Unit Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard title="Revenue" value={formatCurrency(overviewMetrics?.revenue || 0)} icon={<ArrowUpRight className="text-green-600" />} bgColor="bg-green-50" textColor="text-green-600" />
            <MetricCard title="Expenses" value={formatCurrency(overviewMetrics?.expense || 0)} icon={<ArrowDownRight className="text-red-600" />} bgColor="bg-red-50" textColor="text-red-600" />
            <MetricCard title="Net Profit" value={formatCurrency(overviewMetrics?.profit || 0)} icon={<TrendingUp className="text-amber-600" />} bgColor="bg-amber-50" textColor="text-amber-600" />
          </div>
          
          <Card className="border-none shadow-sm ring-1 ring-gray-100 bg-white h-[400px] w-full p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={80}>
                  {chartData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="border-none shadow-sm ring-1 ring-gray-100 bg-white">
              <CardHeader className="text-left">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5 text-amber-500" /> Configurator
                </CardTitle>
                <CardDescription>Select target and period for breakdown.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-gray-400 block">Report Type</label>
                    <Select value={reportType} onValueChange={(v) => { setReportType(v); setSelectedEntity("all"); }}>
                      <SelectTrigger className="bg-gray-50/50">
                        <SelectValue placeholder="Type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unit">Property Unit</SelectItem>
                        <SelectItem value="agent">Booking Agent</SelectItem>
                        <SelectItem value="investor">Investor Share</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-gray-400 block">Select Name</label>
                    <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                      <SelectTrigger className="bg-gray-50/50">
                        <SelectValue placeholder="Choose entity..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownEntities.map(e => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.name || e.unitNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleGenerate} disabled={isGenerating || selectedEntity === "all" && reportType !== "unit"} className="w-full gradient-btn text-white font-bold h-12 shadow-md">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />} 
                    Calculate Statement
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              {generatedReport ? (
                <div className="space-y-6">
                  <Card className="border-none shadow-xl bg-white overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b flex justify-between items-center text-left">
                      <div>
                        <h3 className="font-black text-gray-800 uppercase tracking-tight">{generatedReport.name}</h3>
                        <p className="text-xs text-muted-foreground">{reportType.toUpperCase()} STATEMENT • {generatedReport.period}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                          onClick={handleGenerateAiSummary}
                          disabled={isAiLoading}
                        >
                          {isAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          AI Summary
                        </Button>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 h-8">Generated</Badge>
                      </div>
                    </div>
                    <CardContent className="p-8">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-green-50 rounded-2xl border border-green-100 text-left">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Total Revenue</span>
                          <div className="text-2xl font-black text-green-600">{formatCurrency(generatedReport.revenue)}</div>
                        </div>
                        
                        {reportType === 'unit' && (
                          <div className="p-6 bg-red-50 rounded-2xl border border-red-100 text-left">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Total Expenses</span>
                            <div className="text-2xl font-black text-red-600">{formatCurrency(generatedReport.expenses)}</div>
                          </div>
                        )}

                        {reportType === 'agent' && (
                          <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-left">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Commission Due</span>
                            <div className="text-2xl font-black text-blue-600">{formatCurrency(generatedReport.commission)}</div>
                          </div>
                        )}

                        {reportType === 'investor' && (
                          <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100 text-left">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Investor Share</span>
                            <div className="text-2xl font-black text-purple-600">{formatCurrency(generatedReport.investorShare)}</div>
                          </div>
                        )}

                        <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 text-left">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Net Flow/Profit</span>
                          <p className="text-3xl font-black text-amber-600 tracking-tight">{formatCurrency(generatedReport.profit)}</p>
                        </div>
                        <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-left">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Gross Income (Base)</span>
                          <p className="text-3xl font-black text-blue-600 tracking-tight">{formatCurrency(generatedReport.grossIncome || 0)}</p>
                        </div>
                      </div>

                      {aiSummary && (
                        <div className="mt-8 p-6 bg-amber-50/50 rounded-2xl border border-amber-100 animate-in fade-in slide-in-from-top-2 duration-500 text-left">
                          <div className="flex items-center gap-2 mb-3 text-amber-700">
                            <Wand2 className="h-4 w-4" />
                            <span className="text-xs font-black uppercase tracking-widest">AI Financial Insight</span>
                          </div>
                          <p className="text-sm leading-relaxed text-gray-700 italic">
                            {aiSummary}
                          </p>
                        </div>
                      )}

                      <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-xs text-gray-500 italic text-center">
                          This report is a prorated financial summary based on check-in/check-out dates within the selected month.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed rounded-3xl bg-gray-50/30">
                  <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                    <BarChart3 className="h-10 w-10 text-gray-200" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">Select an entity to generate a statement.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {unitRankings.map((unit, index) => (
              <Card key={index} className="border-none shadow-sm ring-1 ring-gray-100 bg-white p-5 hover:ring-2 hover:ring-amber-500/20 transition-all text-left">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-black">
                      #{index + 1}
                    </div>
                    <CardTitle className="text-base font-bold">{unit.name}</CardTitle>
                  </div>
                  <Trophy className={cn("h-5 w-5", index === 0 ? "text-amber-500" : "text-gray-100")} />
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-center mb-6">
                  <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                    <span className="text-[9px] uppercase font-bold text-green-700 block mb-1">Revenue</span>
                    <span className="text-sm font-black text-green-600">{formatCurrency(unit.revenue)}</span>
                  </div>
                  <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                    <span className="text-[9px] uppercase font-bold text-red-700 block mb-1">Costs</span>
                    <span className="text-sm font-black text-red-600">{formatCurrency(unit.expenses)}</span>
                  </div>
                </div>
                
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex justify-between items-center font-black">
                  <span className="text-xs uppercase text-amber-700">Net Profit</span>
                  <span className="text-lg text-amber-600">{formatCurrency(unit.profit)}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({ title, value, icon, bgColor, textColor }: { title: string, value: string, icon: React.ReactNode, bgColor: string, textColor: string }) {
  return (
    <Card className="border-none shadow-sm ring-1 ring-gray-100 bg-white p-6 text-left">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</span>
        <div className={cn("p-2.5 rounded-xl shadow-sm", bgColor)}>
          {icon}
        </div>
      </div>
      <div className={cn("text-3xl font-black tracking-tight", textColor)}>{value}</div>
    </Card>
  )
}
