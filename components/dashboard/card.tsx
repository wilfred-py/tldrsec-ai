import { cn } from "@/lib/utils";

interface DashboardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  active?: boolean;
}

export function DashboardCard({
  title,
  description,
  footer,
  actions,
  active,
  className,
  children,
  ...props
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        active && "border-primary",
        className
      )}
      {...props}
    >
      {(title || description || actions) && (
        <div className="flex flex-col space-y-1.5 p-6 pb-3">
          <div className="flex items-center justify-between">
            {title && (
              <h3 className="font-semibold leading-none tracking-tight">
                {title}
              </h3>
            )}
            {actions && <div className="ml-auto">{actions}</div>}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children && <div className="p-6 pt-3">{children}</div>}
      {footer && (
        <div className="border-t bg-muted/50 p-4 rounded-b-lg">{footer}</div>
      )}
    </div>
  );
} 