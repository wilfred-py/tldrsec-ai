"use client";

import React, { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description?: string;
  component: ReactNode;
}

interface MultiStepFormProps {
  steps: Step[];
  onComplete: () => void;
  className?: string;
}

export function MultiStepForm({ steps, onComplete, className }: MultiStepFormProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  
  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };
  
  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };
  
  const currentStep = steps[currentStepIndex];

  return (
    <div className={cn("space-y-8 w-full", className)}>
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex justify-between">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex flex-col items-center"
            >
              <div 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
                  index < currentStepIndex 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : index === currentStepIndex
                    ? "bg-primary/20 text-primary border-primary"
                    : "bg-muted text-muted-foreground border-muted-foreground/25"
                )}
              >
                {index < currentStepIndex ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="mt-2 text-xs font-medium text-center max-w-[80px]">
                {step.title}
              </div>
            </div>
          ))}
        </div>
        <div className="relative flex w-full mt-1">
          {steps.map((_, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <div
                  className={cn(
                    "flex-1 h-1 transition-colors",
                    index <= currentStepIndex ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Current step content */}
      <div className="min-h-[300px]">
        <h3 className="text-lg font-medium mb-2">{currentStep.title}</h3>
        {currentStep.description && (
          <p className="text-muted-foreground mb-4">{currentStep.description}</p>
        )}
        <div className="py-4">
          {currentStep.component}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={isFirstStep}
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
        >
          {isLastStep ? 'Complete' : 'Next'}
        </Button>
      </div>
    </div>
  );
} 