import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ContextualUpsellBannerProps {
  show: boolean;
  currentTier: 'FREE' | 'PRO' | 'MAX';
}

export function ContextualUpsellBanner({ show, currentTier }: ContextualUpsellBannerProps) {
  if (!show) return null;

  // Define upsell logic based on current tier
  const upsellConfig = {
    FREE: {
      targetTier: 'PRO',
      currentLimit: 3,
      price: 199,
      show: true
    },
    PRO: {
      targetTier: 'MAX',
      currentLimit: 25,
      price: 349,
      show: true
    },
    MAX: {
      show: false // No upsell for MAX tier (unlimited)
    }
  };

  const config = upsellConfig[currentTier];
  if (!config.show) return null;

  return (
    <Alert className="mb-4 border-orange-200 bg-orange-50">
      <AlertDescription>
        You&apos;ve reached your {config.currentLimit} ticker limit. 
        <Link href="/dashboard/billing" className="ml-2">
          <Button size="sm" variant="outline">
            Upgrade to {config.targetTier} - ${config.price}/month
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}