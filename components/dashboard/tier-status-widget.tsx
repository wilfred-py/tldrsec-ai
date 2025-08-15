'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Zap, 
  TrendingUp, 
  AlertTriangle, 
  Crown,
  Building,
  Star,
  Users
} from 'lucide-react';

interface TierStatusWidgetProps {
  user: {
    subscriptionTier: 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE' | 'INSTITUTION';
    budgetUsed: number;
    processingBudget: number;
    budgetResetAt?: Date;
    lastCronProcessed?: Date;
  };
  onUpgrade?: () => void;
}

const TIER_CONFIG = {
  FREE: {
    icon: Users,
    color: 'bg-gray-500',
    textColor: 'text-gray-600',
    marketFrequency: '30 min',
    offHoursFrequency: '2 hrs',
    budget: 5,
    displayName: 'Free'
  },
  PROFESSIONAL: {
    icon: Star,
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    marketFrequency: '15 min',
    offHoursFrequency: '1 hr',
    budget: 15,
    displayName: 'Professional'
  },
  ENTERPRISE: {
    icon: Building,
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    marketFrequency: '5 min',
    offHoursFrequency: '30 min',
    budget: 60,
    displayName: 'Enterprise'
  },
  INSTITUTION: {
    icon: Crown,
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    marketFrequency: '5 min',
    offHoursFrequency: '5 min',
    budget: Infinity,
    displayName: 'Institution'
  }
};

export function TierStatusWidget({ user, onUpgrade }: TierStatusWidgetProps) {
  const [marketHours, setMarketHours] = useState<boolean>(false);
  const [nextUpdate, setNextUpdate] = useState<string>('');

  const tierConfig = TIER_CONFIG[user.subscriptionTier];
  const budgetUsagePercent = user.processingBudget > 0 
    ? Math.min((user.budgetUsed / user.processingBudget) * 100, 100)
    : 0;

  const isNearBudgetLimit = budgetUsagePercent >= 80;
  const isBudgetExhausted = budgetUsagePercent >= 100;

  useEffect(() => {
    // Determine if markets are currently open
    const checkMarketHours = () => {
      const now = new Date();
      const estNow = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const day = estNow.getDay();
      const hour = estNow.getHours();
      const minute = estNow.getMinutes();
      const currentTime = hour * 60 + minute;
      
      // Market hours: Monday-Friday 9:30 AM - 4:00 PM EST
      const isWeekday = day >= 1 && day <= 5;
      const isMarketTime = currentTime >= 570 && currentTime < 960; // 9:30 AM - 4:00 PM in minutes
      
      return isWeekday && isMarketTime;
    };

    const updateMarketStatus = () => {
      const isMarketOpen = checkMarketHours();
      setMarketHours(isMarketOpen);
      
      // Calculate next update time
      const lastProcessed = user.lastCronProcessed ? new Date(user.lastCronProcessed) : new Date(0);
      const frequencyMinutes = isMarketOpen 
        ? parseInt(tierConfig.marketFrequency.split(' ')[0])
        : parseInt(tierConfig.offHoursFrequency.split(' ')[0]) * (tierConfig.offHoursFrequency.includes('hr') ? 60 : 1);
      
      const nextUpdateTime = new Date(lastProcessed.getTime() + frequencyMinutes * 60 * 1000);
      const timeUntilNext = Math.max(0, nextUpdateTime.getTime() - Date.now());
      
      if (timeUntilNext === 0) {
        setNextUpdate('Processing now...');
      } else {
        const minutes = Math.floor(timeUntilNext / 60000);
        const seconds = Math.floor((timeUntilNext % 60000) / 1000);
        if (minutes > 0) {
          setNextUpdate(`${minutes}m ${seconds}s`);
        } else {
          setNextUpdate(`${seconds}s`);
        }
      }
    };

    updateMarketStatus();
    const interval = setInterval(updateMarketStatus, 1000);

    return () => clearInterval(interval);
  }, [user.lastCronProcessed, tierConfig]);

  const getTierIcon = () => {
    const IconComponent = tierConfig.icon;
    return <IconComponent className="h-5 w-5" />;
  };

  const getBudgetStatusColor = () => {
    if (isBudgetExhausted) return 'bg-red-500';
    if (isNearBudgetLimit) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getBudgetResetText = () => {
    if (!user.budgetResetAt) return 'Unknown';
    
    const resetDate = new Date(user.budgetResetAt);
    const nextReset = new Date(resetDate);
    nextReset.setMonth(nextReset.getMonth() + 1);
    
    const daysUntilReset = Math.ceil((nextReset.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilReset === 1) return '1 day';
    if (daysUntilReset < 7) return `${daysUntilReset} days`;
    if (daysUntilReset < 30) return `${Math.ceil(daysUntilReset / 7)} weeks`;
    return 'Next month';
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`${tierConfig.color} text-white`}>
              <div className="flex items-center gap-1">
                {getTierIcon()}
                {tierConfig.displayName}
              </div>
            </Badge>
          </div>
          {user.subscriptionTier !== 'INSTITUTION' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUpgrade}
              className="h-7 text-xs"
            >
              Upgrade
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Processing Frequency */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {marketHours ? 'Market Hours' : 'Off Hours'}: 
                Updates every {marketHours ? tierConfig.marketFrequency : tierConfig.offHoursFrequency}
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Next update in:</span>
            <span className="font-mono">{nextUpdate}</span>
          </div>
        </div>

        {/* Budget Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span>Processing Budget</span>
            </div>
            {isNearBudgetLimit && (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={budgetUsagePercent} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {user.budgetUsed.toFixed(1)} / {user.processingBudget === Infinity ? '∞' : user.processingBudget} min used
              </span>
              <span>Resets in {getBudgetResetText()}</span>
            </div>
          </div>
          
          {isBudgetExhausted && (
            <div className="rounded-md bg-red-50 p-2">
              <div className="flex items-center gap-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4" />
                <span>Daily budget exhausted. Processing will resume tomorrow.</span>
              </div>
              {user.subscriptionTier === 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUpgrade}
                  className="mt-2 h-7 text-xs"
                >
                  Upgrade for more budget
                </Button>
              )}
            </div>
          )}
          
          {isNearBudgetLimit && !isBudgetExhausted && (
            <div className="rounded-md bg-yellow-50 p-2">
              <div className="flex items-center gap-2 text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  {budgetUsagePercent >= 95 
                    ? 'Budget nearly exhausted' 
                    : 'Budget running low'
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Tier Benefits */}
        {user.subscriptionTier !== 'INSTITUTION' && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span>Upgrade Benefits</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {user.subscriptionTier === 'FREE' && (
                <div>
                  <span className={TIER_CONFIG.PROFESSIONAL.textColor}>Professional:</span> 
                  {` Updates every ${TIER_CONFIG.PROFESSIONAL.marketFrequency} (market) / ${TIER_CONFIG.PROFESSIONAL.offHoursFrequency} (off), ${TIER_CONFIG.PROFESSIONAL.budget}min budget`}
                </div>
              )}
              {(user.subscriptionTier === 'FREE' || user.subscriptionTier === 'PROFESSIONAL') && (
                <div>
                  <span className={TIER_CONFIG.ENTERPRISE.textColor}>Enterprise:</span> 
                  {` Updates every ${TIER_CONFIG.ENTERPRISE.marketFrequency}, ${TIER_CONFIG.ENTERPRISE.budget}min budget`}
                </div>
              )}
              {user.subscriptionTier !== 'INSTITUTION' && (
                <div>
                  <span className={TIER_CONFIG.INSTITUTION.textColor}>Institution:</span> 
                  {` Updates every ${TIER_CONFIG.INSTITUTION.marketFrequency} continuously, unlimited budget`}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}