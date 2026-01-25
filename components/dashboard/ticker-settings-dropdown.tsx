"use client";

import { useState, useCallback, useEffect } from "react";
import { Settings, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  prospectus: {
    label: "Prospectus Filings",
    types: [
      { id: "fourTwoFourB2", label: "424B2", description: "Prospectus Supplement" },
      { id: "fourTwoFourB3", label: "424B3", description: "Term Sheet" },
      { id: "fwp", label: "FWP", description: "Free Writing Prospectus" },
      { id: "schedule", label: "SCHEDULE", description: "Schedule Forms" },
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
  fourTwoFourB2: "fourTwoFourB2",
  fourTwoFourB3: "fourTwoFourB3",
  fwp: "fwp",
  schedule: "schedule",
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
  fourTwoFourB2?: boolean;
  fourTwoFourB3?: boolean;
  fwp?: boolean;
  schedule?: boolean;
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
  fourTwoFourB2: false,
  fourTwoFourB3: false,
  fwp: false,
  schedule: false,
  other: false,
};

export function TickerSettingsDropdown({
  tickerSymbol,
  preferences: inputPreferences,
  onPreferenceChange,
  disabled = false,
}: TickerSettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Use default preferences if input is undefined
  const originalPreferences = inputPreferences || DEFAULT_PREFERENCES;

  // Local state to track pending changes before save
  const [pendingPreferences, setPendingPreferences] =
    useState<ExtendedFilingPreferences>(originalPreferences);

  // Reset pending preferences when dialog opens or original preferences change
  useEffect(() => {
    if (open) {
      setPendingPreferences(originalPreferences);
    }
  }, [open, originalPreferences]);

  const handleToggle = useCallback((formTypeId: string) => {
    const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
    if (prefKey) {
      setPendingPreferences((prev) => ({
        ...prev,
        [prefKey]: !prev[prefKey as keyof ExtendedFilingPreferences],
      }));
    }
  }, []);

  const isEnabled = (formTypeId: string): boolean => {
    const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
    if (!prefKey) return false;
    return pendingPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
  };

  const handleCancel = useCallback(() => {
    setPendingPreferences(originalPreferences);
    setOpen(false);
  }, [originalPreferences]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    // Find all changed preferences and apply them
    const changedKeys: string[] = [];
    Object.keys(FORM_TYPE_TO_PREFERENCE).forEach((formTypeId) => {
      const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
      const originalValue =
        originalPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
      const newValue =
        pendingPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
      if (originalValue !== newValue) {
        changedKeys.push(prefKey);
      }
    });

    // Apply all changes
    for (const prefKey of changedKeys) {
      const newValue =
        pendingPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
      await onPreferenceChange(prefKey, newValue);
    }

    setIsSaving(false);
    setOpen(false);
  }, [originalPreferences, pendingPreferences, onPreferenceChange]);

  // Check if there are any pending changes
  const hasChanges = Object.keys(FORM_TYPE_TO_PREFERENCE).some((formTypeId) => {
    const prefKey = FORM_TYPE_TO_PREFERENCE[formTypeId];
    const originalValue =
      originalPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
    const newValue =
      pendingPreferences[prefKey as keyof ExtendedFilingPreferences] ?? false;
    return originalValue !== newValue;
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label={`Settings for ${tickerSymbol}`}
      >
        <Settings className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Filing Preferences for {tickerSymbol}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2">
            {Object.entries(FORM_TYPE_CATEGORIES).map(
              ([categoryKey, category], categoryIndex) => (
                <div
                  key={categoryKey}
                  className={cn(
                    categoryIndex > 0 && "mt-6 pt-4 border-t border-gray-100 dark:border-zinc-800"
                  )}
                >
                  <h4 className="font-semibold text-sm text-foreground mb-3">
                    {category.label}
                  </h4>
                  <div className="space-y-1">
                    {category.types.map((formType) => (
                      <button
                        key={formType.id}
                        type="button"
                        onClick={() => handleToggle(formType.id)}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-left"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {formType.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formType.description}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0 ml-3",
                            isEnabled(formType.id)
                              ? "bg-black border-black text-white dark:bg-white dark:border-white dark:text-black"
                              : "border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
                          )}
                        >
                          {isEnabled(formType.id) && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="bg-black hover:bg-gray-800 text-white sm:order-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
