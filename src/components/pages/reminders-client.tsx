'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useUser, useAuth } from '@/firebase';
import { apiClient } from '@/lib/api-client';
import { useAppResources } from '@/lib/app-data-store';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  Loader2, 
  Calendar, 
  CheckCircle2, 
  Circle,
  Search
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

export default function RemindersClient() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  
  const remindersResources = useAppResources(['reminders']);
  const reminders = remindersResources.data['reminders'] ?? [];
  const loading = remindersResources.loading;
  const [searchQuery, setSearchQuery] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = {
        ...editingReminder,
        uid: user?.uid,
        completed: editingReminder.completed || false,
        createdAt: editingReminder.createdAt || new Date().toISOString()
      };

      if (editingReminder?.id) {
        await apiClient.put(`/reminder/${editingReminder.id}`, payload, auth);
        toast({ title: "Updated", description: "Reminder saved." });
      } else {
        await apiClient.post('/reminder', payload, auth);
        toast({ title: "Created", description: "Reminder added." });
      }
      setIsDialogOpen(false);
      await remindersResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save reminder." });
    } finally {
      setFormLoading(false);
    }
  };

  const toggleCompletion = async (reminder: any) => {
    try {
      const updated = { ...reminder, completed: !reminder.completed, uid: user?.uid };
      await apiClient.put(`/reminder/${reminder.id}`, updated, auth);
      await remindersResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this reminder?")) return;
    try {
      await apiClient.delete(`/reminder/${id}`, auth);
      toast({ title: "Deleted", description: "Reminder removed." });
      await remindersResources.refresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete reminder." });
    }
  };

  const filteredReminders = useMemo(() => {
    return reminders.filter(r => 
      (r.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
      if (a.completed === b.completed) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.completed ? 1 : -1;
    });
  }, [reminders, searchQuery]);

  const openNewDialog = () => {
    setEditingReminder({
      title: '',
      description: '',
      priority: 'medium',
      dueDate: new Date().toISOString().split('T')[0],
      completed: false
    });
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="animate-spin text-amber-500 h-8 w-8" />
        <p className="text-sm text-muted-foreground italic">Syncing tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <Bell className="h-6 w-6" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-bold">Operational Reminders</h1>
            <p className="text-muted-foreground">Keep track of tasks and schedules</p>
          </div>
        </div>
        <Button className="gradient-btn text-white gap-2 shadow-sm" onClick={openNewDialog}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search reminders..." 
          className="pl-9 h-11 bg-white border-none ring-1 ring-gray-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReminders.map((reminder) => (
          <Card 
            key={reminder.id} 
            className={cn(
              "border-none shadow-sm transition-all overflow-hidden group text-left",
              reminder.completed ? "bg-gray-50 opacity-75" : "bg-white hover:ring-2 hover:ring-amber-500/20"
            )}
          >
            <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between space-y-0">
              <div className="flex items-start gap-3">
                <button 
                  onClick={() => toggleCompletion(reminder)}
                  className={cn(
                    "mt-1 transition-colors",
                    reminder.completed ? "text-green-500" : "text-gray-300 hover:text-amber-500"
                  )}
                >
                  {reminder.completed ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                </button>
                <div>
                  <CardTitle className={cn(
                    "text-lg font-bold leading-tight",
                    reminder.completed && "line-through text-gray-400"
                  )}>
                    {reminder.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[9px] uppercase font-black tracking-widest h-4 px-1",
                        reminder.priority === 'high' ? "bg-red-50 text-red-600 border-red-100" :
                        reminder.priority === 'medium' ? "bg-amber-50 text-amber-600 border-amber-100" :
                        "bg-blue-50 text-blue-600 border-blue-100"
                      )}
                    >
                      {reminder.priority}
                    </Badge>
                    <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {reminder.dueDate}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-4">
              <p className={cn(
                "text-sm text-gray-600 line-clamp-2",
                reminder.completed && "text-gray-400"
              )}>
                {reminder.description || "No description provided."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50/50 p-2 border-t flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8 gap-2 text-xs"
                onClick={() => { setEditingReminder(reminder); setIsDialogOpen(true); }}
              >
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8 gap-2 text-xs text-red-600 hover:text-red-700"
                onClick={() => handleDelete(reminder.id)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden text-left border-none shadow-2xl rounded-2xl">
          <DialogHeader className="bg-gray-50 px-6 py-6 border-b">
            <DialogTitle className="text-xl font-bold">
              {editingReminder?.id ? 'Edit Reminder' : 'Add New Reminder'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400">Task Title</Label>
              <Input 
                value={editingReminder?.title || ''} 
                onChange={e => setEditingReminder({...editingReminder, title: e.target.value})}
                required
                className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200"
                placeholder="What needs to be done?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400">Description</Label>
              <Textarea 
                value={editingReminder?.description || ''} 
                onChange={e => setEditingReminder({...editingReminder, description: e.target.value})}
                className="min-h-[100px] bg-gray-50/50 border-none ring-1 ring-gray-200"
                placeholder="Add more details about this task..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Priority</Label>
                <Select 
                  value={editingReminder?.priority || 'medium'} 
                  onValueChange={v => setEditingReminder({...editingReminder, priority: v})}
                >
                  <SelectTrigger className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Due Date</Label>
                <Input 
                  type="date"
                  value={editingReminder?.dueDate || ''} 
                  onChange={e => setEditingReminder({...editingReminder, dueDate: e.target.value})}
                  required
                  className="h-11 bg-gray-50/50 border-none ring-1 ring-gray-200"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="submit" disabled={formLoading} className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg">
                {formLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                {editingReminder?.id ? 'Save Changes' : 'Create Reminder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
