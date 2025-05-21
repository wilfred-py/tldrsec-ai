'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { TickerSubscription } from '@/lib/user/preference-types';
import { Plus, Trash } from 'lucide-react';
import { toast } from 'sonner';

interface SubscriptionManagerProps {
  userId: string;
}

export default function SubscriptionManager({ userId }: SubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<TickerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  
  // Fetch subscriptions on mount
  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/user/subscriptions');
        const data = await response.json();
        
        if (data.success && data.subscriptions) {
          setSubscriptions(data.subscriptions);
        } else {
          toast.error('Failed to load subscriptions');
        }
      } catch (error) {
        console.error('Error fetching subscriptions:', error);
        toast.error('Failed to load subscriptions');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSubscriptions();
  }, []);
  
  // Add new subscription
  const addSubscription = async () => {
    if (!newSymbol || !newCompanyName) {
      toast.error('Please enter both symbol and company name');
      return;
    }
    
    try {
      setAdding(true);
      const response = await fetch('/api/user/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: newSymbol,
          companyName: newCompanyName,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSubscriptions(data.subscriptions || []);
        setNewSymbol('');
        setNewCompanyName('');
        toast.success(`Successfully subscribed to ${newSymbol}`);
      } else {
        toast.error(data.message || 'Failed to add subscription');
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast.error('Failed to add subscription');
    } finally {
      setAdding(false);
    }
  };
  
  // Remove subscription
  const removeSubscription = async (symbol: string) => {
    try {
      const response = await fetch(`/api/user/subscriptions?symbol=${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSubscriptions(data.subscriptions || subscriptions.filter(s => s.symbol !== symbol));
        toast.success(`Successfully unsubscribed from ${symbol}`);
      } else {
        toast.error(data.message || 'Failed to remove subscription');
      }
    } catch (error) {
      console.error('Error removing subscription:', error);
      toast.error('Failed to remove subscription');
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" data-testid="loading-spinner"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Add new subscription */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Add New Ticker</h3>
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-3">
            <Input
              placeholder="Symbol (e.g. AAPL)"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </div>
          <div className="col-span-7">
            <Input
              placeholder="Company Name (e.g. Apple Inc.)"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Button
              onClick={addSubscription}
              disabled={adding || !newSymbol || !newCompanyName}
              className="w-full"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>
      
      {/* Current subscriptions */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Current Subscriptions</h3>
        {subscriptions.length === 0 ? (
          <div className="flex justify-center items-center p-4 border border-dashed rounded-md text-muted-foreground">
            <p>No tickers subscribed yet. Add your first ticker above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((subscription) => (
              <div 
                key={subscription.symbol}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div>
                  <p className="font-medium">{subscription.symbol}</p>
                  <p className="text-sm text-muted-foreground">{subscription.companyName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSubscription(subscription.symbol)}
                >
                  <Trash className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 