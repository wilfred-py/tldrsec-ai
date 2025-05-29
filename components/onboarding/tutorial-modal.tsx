'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Confetti } from '@/components/ui/confetti';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { updateTutorialProgress } from '@/components/onboarding/actions';
import {
  List,
  ActivityIcon,
  Settings,
  Trash2,
  Search,
  Filter,
  Mail,
  RefreshCw,
  CheckCircle,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: number;
  initialProgress?: number;
}

// Define the tutorial steps
const tutorialSteps = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'Learn how to manage your tracked tickers and preferences.',
    substeps: [
      {
        id: 'add-ticker',
        title: 'Add Ticker',
        description: 'Click the "Add Ticker" button to search and add new companies to track.',
        icon: Search,
        action: 'Try clicking the Add Ticker button.',
      },
      {
        id: 'filter-companies',
        title: 'Filter Companies',
        description: 'Use the search box to filter your tracked companies.',
        icon: Filter,
        action: 'Try typing in the search box to filter.',
      },
      {
        id: 'delete-ticker',
        title: 'Delete Ticker',
        description: 'Click the trash icon to remove a company from your tracked list.',
        icon: Trash2,
        action: 'Try clicking the delete button on any company.',
      },
      {
        id: 'ticker-preferences',
        title: 'Ticker Preferences',
        description: 'Click the settings icon to customize notification preferences for each ticker.',
        icon: Settings,
        action: 'Try clicking the settings icon on any company.',
      },
    ],
  },
  {
    id: 'summaries',
    title: 'SEC Filing Summaries',
    description: 'Understand how to navigate and use the summaries section.',
    substeps: [
      {
        id: 'recent-summaries',
        title: 'Recent Summaries',
        description: 'View your recent filing summaries from all tracked companies.',
        icon: List,
        action: 'Browse through the recent summaries section.',
      },
      {
        id: 'summary-details',
        title: 'Summary Details',
        description: 'Click on any summary to view the full details and analysis.',
        icon: ActivityIcon,
        action: 'Try clicking on a summary to view details.',
      },
    ],
  },
  {
    id: 'logs',
    title: 'Activity Logs',
    description: 'Track your filing notifications and system activity.',
    substeps: [
      {
        id: 'filing-logs',
        title: 'Filing Logs',
        description: 'See when new filings are detected and processed by the system.',
        icon: List,
        action: 'Check the filing logs to see activity.',
      },
      {
        id: 'email-logs',
        title: 'Email Notifications',
        description: 'Track which summaries have been sent to your email.',
        icon: Mail,
        action: 'View the email logs to check notification status.',
      },
      {
        id: 'retry-jobs',
        title: 'Retry Jobs',
        description: 'If you miss an email, you can retry the notification process.',
        icon: RefreshCw,
        action: 'Try the retry button if needed.',
      },
    ],
  },
];

export function TutorialModal({ open, onOpenChange, initialStep = 0, initialProgress = 0 }: TutorialModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0);
  const [progress, setProgress] = useState(initialProgress);
  const [showConfetti, setShowConfetti] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  const totalSteps = tutorialSteps.reduce((total, step) => total + step.substeps.length, 0);
  const currentStep = tutorialSteps[currentStepIndex];
  const currentSubstep = currentStep?.substeps[currentSubstepIndex];
  
  // Calculate the current step number out of the total
  const calculateStepNumber = useCallback(() => {
    let stepNumber = 0;
    for (let i = 0; i < currentStepIndex; i++) {
      stepNumber += tutorialSteps[i].substeps.length;
    }
    return stepNumber + currentSubstepIndex + 1;
  }, [currentStepIndex, currentSubstepIndex]);
  
  // Update progress when step changes
  useEffect(() => {
    const newProgress = Math.round((calculateStepNumber() / totalSteps) * 100);
    setProgress(newProgress);
    
    // Save progress to the server
    updateTutorialProgress(newProgress, {
      currentStep: currentStepIndex,
      currentSubstep: currentSubstepIndex,
      completed: newProgress === 100,
    }).catch((error: unknown) => {
      console.error('Failed to update tutorial progress:', error);
    });
    
    // Show confetti when reaching 100%
    if (newProgress === 100 && !completed) {
      setShowConfetti(true);
      setCompleted(true);
      toast.success('🎉 Onboarding completed! You can now fully explore tldrSEC.');
    }
  }, [currentStepIndex, currentSubstepIndex, totalSteps, completed, calculateStepNumber]);
  
  // Move to the next step or substep
  const handleNext = () => {
    if (currentSubstepIndex < currentStep.substeps.length - 1) {
      // Move to next substep
      setCurrentSubstepIndex(currentSubstepIndex + 1);
    } else if (currentStepIndex < tutorialSteps.length - 1) {
      // Move to next step
      setCurrentStepIndex(currentStepIndex + 1);
      setCurrentSubstepIndex(0);
    } else {
      // Completed all steps
      handleFinish();
    }
  };
  
  // Move to the previous step or substep
  const handlePrevious = () => {
    if (currentSubstepIndex > 0) {
      // Move to previous substep
      setCurrentSubstepIndex(currentSubstepIndex - 1);
    } else if (currentStepIndex > 0) {
      // Move to previous step
      setCurrentStepIndex(currentStepIndex - 1);
      setCurrentSubstepIndex(tutorialSteps[currentStepIndex - 1].substeps.length - 1);
    }
  };
  
  // Finish the tutorial
  const handleFinish = () => {
    // Close the modal
    onOpenChange(false);
    
    // Update progress to 100%
    updateTutorialProgress(100, {
      currentStep: tutorialSteps.length - 1,
      currentSubstep: tutorialSteps[tutorialSteps.length - 1].substeps.length - 1,
      completed: true,
    }).catch((error: unknown) => {
      console.error('Failed to update tutorial progress:', error);
    });
  };
  
  // Skip tutorial
  const handleSkip = () => {
    if (!completed) {
      toast('You can always access the tutorial from the help menu.', {
        description: 'Click the question mark in the top right corner.',
      });
    }
    
    onOpenChange(false);
  };
  
  // Determine if at the final step
  const isLastStep = currentStepIndex === tutorialSteps.length - 1 && 
                     currentSubstepIndex === currentStep.substeps.length - 1;
  
  // Render the step indicator dots
  const renderStepDots = () => {
    return tutorialSteps.map((step, index) => (
      <div key={step.id} className="flex flex-col items-center space-y-1">
        <div 
          className={cn(
            "w-3 h-3 rounded-full transition-colors",
            index < currentStepIndex ? "bg-primary" : 
            index === currentStepIndex ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
          )}
        />
        <span className="text-xs text-muted-foreground">{step.title.split(' ')[0]}</span>
      </div>
    ));
  };
  
  return (
    <>
      <Confetti active={showConfetti} duration={5000} />
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md md:max-w-lg">
          <DialogHeader>
            <div className="flex justify-between items-center mb-2">
              <DialogTitle className="text-xl font-bold">{currentStep?.title}</DialogTitle>
              <span className="text-sm font-medium text-muted-foreground">
                Step {calculateStepNumber()} of {totalSteps}
              </span>
            </div>
            <DialogDescription>{currentStep?.description}</DialogDescription>
            
            {/* Progress bar */}
            <div className="my-4">
              <Progress value={progress} className="h-2" />
            </div>
            
            {/* Step indicator dots */}
            <div className="flex justify-center space-x-4 my-2">
              {renderStepDots()}
            </div>
          </DialogHeader>
          
          {/* Current substep content */}
          <div className="py-4">
            <div className="p-6 bg-card rounded-lg border mb-4 relative overflow-hidden">
              {/* Visual highlight for the current feature */}
              <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
              
              <div className="flex items-start mb-4">
                <div className="mr-4 p-2 rounded-full bg-primary/10 text-primary">
                  {currentSubstep && <currentSubstep.icon className="h-6 w-6" />}
                </div>
                <div>
                  <h3 className="font-medium text-lg">{currentSubstep?.title}</h3>
                  <p className="text-muted-foreground">{currentSubstep?.description}</p>
                </div>
              </div>
              
              <div className="mt-4 flex items-center text-sm text-muted-foreground">
                <span className="flex items-center font-medium">
                  <CheckCircle className="h-4 w-4 mr-1 text-primary" />
                  Try it:
                </span>
                <span className="ml-2">{currentSubstep?.action}</span>
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-col space-y-2 sm:space-y-0 sm:flex-row sm:justify-between">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStepIndex === 0 && currentSubstepIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              
              <Button
                onClick={handleNext}
                className={cn(
                  isLastStep ? "bg-green-600 hover:bg-green-700" : ""
                )}
              >
                {isLastStep ? "Finish" : "Next"}
                {!isLastStep && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </div>
            
            <Button variant="ghost" onClick={handleSkip}>
              {completed ? "Close" : "Skip Tutorial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 