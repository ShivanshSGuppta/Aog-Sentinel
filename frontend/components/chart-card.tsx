import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  action?: ReactNode;
}

export function ChartCard({ title, description, children, className, contentClassName, action }: ChartCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-2 max-w-2xl leading-6">{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  );
}
