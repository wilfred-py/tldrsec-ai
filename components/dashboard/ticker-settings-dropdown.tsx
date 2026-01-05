"use client";

import { useState, useCallback } from "react";
import { Settings, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Form type categories with their display info
const FORM_TYPE_CATEGORIES = {
  annual: {
    label: "Annual Reports",
    types: [
      { id: "tenK", label: "10-K", description: "Annual Report" },
      { id: "twentyF", label: "20-F", description: "Foreign Annual" },
      { id: "fortyF", label: "40-F", description: "Canadian Annual" },
    ],
  },
  quarterly: {
    label: "Quarterly Reports",
    types: [
      { id: "tenQ", label: "10-Q", description: "Quarterly Report" },
      { id: "sixK", label: "6-K", description: "Foreign Current" },
    ],
  },
  current: {
    label: "Current Reports",
    types: [{ id: "eightK", label: "8-K", description: "Material Events" }],
  },
  insider: {
    label: "Insider Trading",
    types: [
      { id: "form3", label: "Form 3", description: "Initial Ownership" },
      { id: "form4", label: "Form 4", description: "Ownership Changes" },
      { id: "form5", label: "Form 5", description: "Annual Ownership" },
      { id: "form144", label: "Form 144", description: "Proposed Sale" },
    ],
  },
  beneficial: {
    label: "Beneficial Ownership",
    types: [
      { id: "sc13D", label: "SC 13D", description: "5%+ Ownership (Active)" },
      { id: "sc13G", label: "SC 13G", description: "5%+ Ownership (Passive)" },
      { id: "thirteenF", label: "13F", description: "Institutional Holdings" },
    ],
  },
  proxy: {
    label: "Proxy Materials",
    types: [
      { id: "def14A", label: "DEF 14A", description: "Proxy Statement" },
      { id: "pre14A", label: "PRE 14A", description: "Preliminary Proxy" },
    ],
  },
  registration: {
    label: "Registration",
    types: [
      { id: "sOne", label: "S-1", description: "IPO Registration" },
      { id: "sThree", label: "S-3", description: "Shelf Registration" },
    ],
  },
} as const;

// Mapping from form type ID to preference key
const FORM_TYPE_TO_PREFERENCE: Record<string, string> = {
  tenK: "tenK",
  tenQ: "tenQ",
  eightK: "eightK",
  form4: "form4",
  form3: "form3",
  form5: "form5",
  form144: "form144",
  twentyF: "twentyF",
  fortyF: "fortyF",
  sixK: "sixK",
  sc13D: "sc13D",
  sc13G: "sc13G",
  thirteenF: "thirteenF",
  def14A: "def14A",
  pre14A: "pre14A",
  sOne: "sOne",
  sThree: "sThree",
};

export interface ExtendedFilingPreferences {
  tenK: boolean;
  tenQ: boolean;
  eightK: boolean;
  form4: boolean;
  form3?: boolean;
  form5?: boolean;
  form144?: boolean;
  twentyF?: boolean;
  fortyF?: boolean;
  sixK?: boolean;
  sc13D?: boolean;
  sc13G?: boolean;
  thirteenF?: boolean;
  def14A?: boolean;
  pre14A?: boolean;
  sOne?: boolean;
  sThree?: boolean;
  other: boolean;
}

interface TickerSettingsDropdownProps {
  tickerSymbol: string;
  preferences: ExtendedFilingPreferences;
  onPreferenceChange: (preferenceKey: string, value: boolean) => void;
  disabled?: boolean;
}

// Default preferences for fallback
const DEFAULT_PREFERENCES: ExtendedFilingPreferences = {
  tenK: true,
  tenQ: true,
  eightK: true,
  form4: false,
  form3: false,
  form5: false,
  form144: false,
  twentyF: false,
  fortyF: false,
  sixK: false,
  sc13D: false,
  sc13G: false,
  thirteenF: false,
  def14A: false,
  pre14A: false,
  sOne: false,
  sThree: false,
  other: false,
};

export function TickerSettingsDropdown({
  tickerSymbol,
  preferences: inputPreferences,
  onPreferenceChange,
  disabled = false,
}: TickerSettingsDropdownProps) {
  const [open, setOpen] = useState(false);

  // Use default preferences if input is undefined
  const preferences = inputPreferences || DEFAULT_PREFERENCES;

  const handleToggle = useCallback(
    (formTypeId: string) => {
      const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
      if (prefKey) {
        const currentValue = preferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
        onPreferenceChange(prefKey, !currentValue);
      }
    },
    [preferences, onPreferenceChange]
  );

  const isEnabled = (formTypeId: string): boolean => {
    const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
    if (!prefKey) return false;
    return preferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={`Settings for ${tickerSymbol}`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-h-[400px] overflow-y-auto"
      >
        <DropdownMenuLabel className="font-semibold">
          Filing Preferences for {tickerSymbol}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {Object.entries(FORM_TYPE_CATEGORIES).map(([categoryKey, category]) => (
          <DropdownMenuGroup key={categoryKey}>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {category.label}
            </DropdownMenuLabel>
            {category.types.map((formType) => (
              <DropdownMenuItem
                key={formType.id}
                className="cursor-pointer"
                onSelect={(e: Event) => {
                  e.preventDefault(); // Prevent closing on click
                  handleToggle(formType.id);
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <span className="font-medium">{formType.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formType.description}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "h-5 w-5 rounded-sm border flex items-center justify-center transition-colors",
                      isEnabled(formType.id)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input bg-background"
                    )}
                  >
                    {isEnabled(formType.id) && <Check className="h-3 w-3" />}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
