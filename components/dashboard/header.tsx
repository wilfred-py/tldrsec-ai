import { cn } from "@/lib/utils";

interface DashboardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  heading: string;
  description?: string;
  actions?: React.ReactNode;
}

export function DashboardHeader({
  heading,
  description,
  actions,
  className,
  ...props
}: DashboardHeaderProps) {
  return (
<div className={cn("mb-4", className)} {...props}>
  <div className="flex flex-col items-center justify-center text-center">
    <div className="space-y-1">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--brand-secondary)' }}>{heading}</h1>
      {description && (
        <p className="text-sm md:text-base" style={{ color: 'var(--brand-text-muted)' }}>{description}</p>
      )}
    </div>
    {actions && <div className="mt-4 flex items-center gap-2">{actions}</div>}
  </div>
</div>
  );
}
