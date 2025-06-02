import React from "react";

interface HeadingProps {
  title: string;
  description?: string;
}

export function Heading({ title, description }: HeadingProps) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {description && (
        <p className="text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
