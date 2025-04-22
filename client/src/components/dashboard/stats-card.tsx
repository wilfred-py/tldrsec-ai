import { Card, CardContent } from "@/components/ui/card";
import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgClass?: string;
  iconColorClass?: string;
}

export function StatsCard({
  title,
  value,
  icon,
  iconBgClass = "bg-primary/10",
  iconColorClass = "text-primary"
}: StatsCardProps) {
  return (
    <Card className="border-t-4 border-t-primary/50 hover:shadow-md transition-shadow">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold mt-1">{value}</h3>
          </div>
          <div className={`p-3 rounded-full ${iconBgClass}`}>
            <div className={`${iconColorClass}`}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
