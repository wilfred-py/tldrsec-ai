"use client";

import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SECTORS } from "@/app/(auth)/onboarding/types";

interface SectorStepProps {
  selectedSectors: string[];
  onToggle: (sectorId: string) => void;
  onContinue: () => void;
  isTransitioning: boolean;
}

export function SectorStep({
  selectedSectors,
  onToggle,
  onContinue,
  isTransitioning,
}: SectorStepProps) {
  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">What sectors interest you?</h2>
          <p className="text-muted-foreground">
            Select the industries you&apos;d like to track. You can always change
            this later.
          </p>
        </div>

        <ScrollArea className="max-h-[calc(100vh-320px)]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {SECTORS.map((sector, index) => {
              const Icon = sector.icon;
              const isSelected = selectedSectors.includes(sector.id);
              return (
                <button
                  key={sector.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`cursor-pointer rounded-lg border-2 p-3 opacity-0 animate-slideUp transition-all hover:shadow-md text-left ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-md"
                      : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                  }`}
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={() => onToggle(sector.id)}
                >
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg border ${sector.color}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mb-1 text-sm font-medium">{sector.name}</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {sector.description}
                    </p>
                    <div className="h-5 flex items-center justify-center">
                      {isSelected && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="mt-8 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {selectedSectors.length} sector
              {selectedSectors.length !== 1 ? "s" : ""} selected
            </span>
            <Button
              onClick={onContinue}
              disabled={selectedSectors.length === 0 || isTransitioning}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
