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
    <div className={cn("mb-8", className)} {...props}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
} 