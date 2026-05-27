'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@/firebase';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Handshake, Loader2, Plus, Mail, Percent, Edit2, Trash2, Save, Phone, Calendar, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';

export default function AgentsClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  
  const agentsResources = useAppResources(['agents']);
  const agents = agentsResources.data['agents'] ?? [];
  const loading = agentsResources.loading;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);


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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = { ...editingAgent, uid: user?.uid };
      if (editingAgent?.id) {
        await apiClient.put(`/agent/${editingAgent.id}`, payload, auth);
        toast({ title: "Updated", description: "Agent details saved." });
      } else {
        await apiClient.post('/agent', payload, auth);
        toast({ title: "Created", description: "New agent added." });
      }
      setIsDialogOpen(false);
      await agentsResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save agent." });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this agent?")) return;
    try {
      await apiClient.delete(`/agent/${id}`, auth);
      toast({ title: "Deleted", description: "Agent partnership removed." });
      await agentsResources.refresh();
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: error.message || "Failed to delete agent." 
      });
    }
  };

  const openNewAgentDialog = () => {
    setEditingAgent({
      name: '',
      email: '',
      phone: '',
      commissionType: 'percentage',
      commissionRate: 0,
      joinDate: new Date().toISOString().split('T')[0]
    });
    setIsDialogOpen(true);
  };

  const openEditAgentDialog = (agent: any) => {
    setEditingAgent({
      ...agent,
      commissionType: agent.commissionType || 'percentage',
      commissionRate: agent.commissionRate || 0
    });
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        <p className="text-sm text-muted-foreground">Syncing Agents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div className="text-left">
          <h1 className="text-3xl font-bold">Booking Agents</h1>
          <p className="text-muted-foreground">Manage affiliate and agency referral partnerships</p>
        </div>
        <Button className="gradient-btn text-white gap-2 shadow-sm" onClick={openNewAgentDialog}>
          <Plus className="h-4 w-4" /> Add Agent
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <Card key={agent.id} className="card-shadow border-none bg-white overflow-hidden group hover:ring-2 hover:ring-amber-500/20 transition-all">
            <CardHeader className="bg-gray-50 border-b p-4">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <CardTitle className="text-lg font-bold">{agent.name || 'Unnamed'}</CardTitle>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">
                    Joined: {agent.joinDate || 'N/A'}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <Handshake className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-4 border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                  <Percent className="h-4 w-4 text-amber-500" /> Commission
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-bold">
                  {agent.commissionType === 'fixed_commission' 
                    ? 'Fixed / Surplus' 
                    : `${agent.commissionRate || 0}%`}
                </Badge>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4 text-amber-500" /> {agent.email || 'No email'}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-amber-500" /> {agent.phone || 'No contact'}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50/50 p-2 border-t flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="flex-1 gap-2 text-xs" onClick={() => openEditAgentDialog(agent)}>
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 gap-2 text-xs text-red-600 hover:text-red-700" onClick={() => handleDelete(agent.id)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
        {agents.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl bg-white">
            <p className="text-muted-foreground">No agents found.</p>
          </div>
        )}
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
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="bg-gray-50 px-6 py-6 border-b">
            <DialogTitle className="text-xl font-bold text-gray-800">
              {editingAgent?.id ? 'Edit Agent Profile' : 'Add New Agent'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-left">
            <div className="space-y-2">
              <Label htmlFor="agentName" className="text-xs font-bold uppercase text-gray-400">Full Name</Label>
              <Input 
                id="agentName"
                value={editingAgent?.name || ''} 
                onChange={e => setEditingAgent({...editingAgent, name: e.target.value})}
                required
                className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200"
                placeholder="Agent Full Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agentEmail" className="text-xs font-bold uppercase text-gray-400">Email Address</Label>
                <Input 
                  id="agentEmail"
                  type="email"
                  value={editingAgent?.email || ''} 
                  onChange={e => setEditingAgent({...editingAgent, email: e.target.value})}
                  required
                  className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200"
                  placeholder="agent@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agentPhone" className="text-xs font-bold uppercase text-gray-400">Phone Number</Label>
                <Input 
                  id="agentPhone"
                  value={editingAgent?.phone || ''} 
                  onChange={e => setEditingAgent({...editingAgent, phone: e.target.value})}
                  required
                  className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200"
                  placeholder="+63 9xx..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commissionType" className="text-xs font-bold uppercase text-gray-400">Commission Type</Label>
              <Select 
                value={editingAgent?.commissionType || 'percentage'} 
                onValueChange={(v) => setEditingAgent({...editingAgent, commissionType: v})}
              >
                <SelectTrigger id="commissionType" className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_commission">Fixed Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingAgent?.commissionType === 'percentage' ? (
              <div className="space-y-2">
                <Label htmlFor="agentCommission" className="text-xs font-bold uppercase text-gray-400">Rate (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    id="agentCommission"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="h-11 pl-10 bg-gray-50/50 border-none ring-1 ring-gray-200"
                    value={editingAgent?.commissionRate || 0} 
                    onChange={(e) => setEditingAgent({...editingAgent, commissionRate: parseFloat(e.target.value)})}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-3">
                <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="block mb-1">Fixed Commission:</strong>
                  Agents will earn the surplus amount when they book a unit for a price higher than its base rate. No percentage rate is needed.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="agentJoinDate" className="text-xs font-bold uppercase text-gray-400">Join Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  id="agentJoinDate"
                  type="date"
                  className="h-11 pl-10 bg-gray-50/50 border-none ring-1 ring-gray-200"
                  value={editingAgent?.joinDate || ''} 
                  onChange={(e) => setEditingAgent({...editingAgent, joinDate: e.target.value})}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="submit" disabled={formLoading} className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg">
                {formLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                {editingAgent?.id ? 'Save Changes' : 'Add Agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
