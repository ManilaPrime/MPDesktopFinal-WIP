'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function SettingsClient() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // FIX: Memoize the document reference to prevent infinite re-renders
  const settingsRef = useMemo(() => {
    return user ? doc(firestore, 'users', user.uid, 'settings', 'config') : null;
  }, [user, firestore]);
  
  const { data: settings, isLoading } = useDoc(settingsRef);

  const [formData, setFormData] = useState({
    systemTitle: '',
    companyName: '',
    wifiName: '',
    wifiPassword: '',
    checkIn: '14:00',
    checkOut: '12:00',
    contactName: '',
    contactPhone: '',
    paymentOptions: '',
    specialDetails: ''
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        systemTitle: settings.systemTitle || '',
        companyName: settings.companyName || '',
        wifiName: settings.wifiName || '',
        wifiPassword: settings.wifiPassword || '',
        checkIn: settings.checkIn || '14:00',
        checkOut: settings.checkOut || '12:00',
        contactName: settings.contactName || '',
        contactPhone: settings.contactPhone || '',
        paymentOptions: settings.paymentOptions || '',
        specialDetails: settings.specialDetails || ''
      });
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settingsRef) return;
    
    try {
      await setDoc(settingsRef, {
        ...formData,
        id: 'config'
      }, { merge: true });
      
      toast({
        title: "Settings Saved",
        description: "System configuration updated successfully.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings.",
      });
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-xl mx-auto space-y-6 text-left">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>⚙️ System Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>System Title</Label>
            <Input 
              value={formData.systemTitle} 
              onChange={e => setFormData({...formData, systemTitle: e.target.value})}
              placeholder="e.g. Manila Prime Property Management"
            />
          </div>
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input 
              value={formData.companyName} 
              onChange={e => setFormData({...formData, companyName: e.target.value})}
              placeholder="e.g. Manila Prime Staycation"
            />
          </div>

          <hr className="my-6" />
          <h4 className="font-semibold text-gray-800 mb-3">🧾 Receipt & Guide Settings</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>WiFi Name</Label>
              <Input value={formData.wifiName} onChange={e => setFormData({...formData, wifiName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>WiFi Password</Label>
              <Input value={formData.wifiPassword} onChange={e => setFormData({...formData, wifiPassword: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Time</Label>
              <Input type="time" value={formData.checkIn} onChange={e => setFormData({...formData, checkIn: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Check-out Time</Label>
              <Input type="time" value={formData.checkOut} onChange={e => setFormData({...formData, checkOut: e.target.value})} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input value={formData.contactName} onChange={e => setFormData({...formData, contactName: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input value={formData.contactPhone} onChange={e => setFormData({...formData, contactPhone: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <Label>Payment Options</Label>
            <Textarea value={formData.paymentOptions} onChange={e => setFormData({...formData, paymentOptions: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Special Details</Label>
            <Textarea value={formData.specialDetails} onChange={e => setFormData({...formData, specialDetails: e.target.value})} />
          </div>

          <Button onClick={handleSave} className="w-full gradient-btn text-white">💾 Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}