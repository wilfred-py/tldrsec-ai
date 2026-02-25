'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Confetti } from '@/components/ui/confetti';
import { toast } from 'sonner';
import { updateTutorialProgress } from '@/components/onboarding/actions';
import { sendLatestSummariesEmail } from '@/lib/email/summary-service';
import { useRouter } from 'next/navigation';
import {
  List,
  ActivityIcon,
  Settings,
  Trash2,
  Search,
  Mail,
  ArrowRight,
  ArrowLeft,
  X,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface TutorialGuideProps {
  active: boolean;
  onComplete: () => void;
  initialStep?: number;
  initialProgress?: number;
}

// Define the tutorial steps with selectors for highlighting elements

export function TutorialGuide({ 
  active, 
  onComplete,
  initialStep = 0,
  initialProgress = 0 
}: TutorialGuideProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [progress, setProgress] = useState(initialProgress);
  const [showConfetti, setShowConfetti] = useState(false);
  const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const router = useRouter();
  
  // Define the tutorial steps
  const tutorialSteps = useMemo(() => [
    {
      title: "Add",
      description: "Click the 'Add Ticker' button to start tracking a company's SEC filings.",
      selector: '[data-tutorial="add-ticker"]',
      icon: <List className="h-5 w-5" />,
      position: 'bottom'
    },
    {
      title: "Filter Companies",
      description: "Use the search box to quickly filter your tracked companies by name or symbol.",
      selector: '[data-tutorial="filter-companies"]',
      icon: <Search className="h-5 w-5" />,
      position: 'bottom'
    },
    {
      title: "Manage Preferences",
      description: "Click the settings icon to customize notification preferences for each company.",
      selector: '[data-tutorial="ticker-preferences"]',
      icon: <Settings className="h-5 w-5" />,
      position: 'left'
    },
    {
      title: "Remove Companies",
      description: "Use the trash icon to remove companies you no longer want to track.",
      selector: '[data-tutorial="delete-ticker"]',
      icon: <Trash2 className="h-5 w-5" />,
      position: 'left'
    },
    {
      title: "View Summaries",
      description: "Click the 'Summaries' link in the sidebar to view all your SEC filing summaries.",
      selector: '[data-tutorial="sidebar-summaries"]',
      icon: <ActivityIcon className="h-5 w-5" />,
      position: 'right'
    },
    {
      title: "Explore Details",
      description: "After navigating to Summaries, you can click on any filing to view its full analysis.",
      selector: '[data-tutorial="summary-card"]',
      icon: <Mail className="h-5 w-5" />,
      position: 'top'
    },
    {
      title: "Email Summaries",
      description: "Would you like to receive an email with the latest 10-K and 10-Q summaries for your tracked companies?",
      selector: '.tutorial-highlight-placeholder', // This won't actually highlight anything
      icon: <Mail className="h-5 w-5" />,
      position: 'center'
    }
  ], []);
  
  const totalSteps = tutorialSteps.length;
  
  // Calculate tooltip position with improved edge detection
  const calculateTooltipPosition = useCallback(() => {
    if (!highlightedElement) return { top: '50%', left: '50%' };
    
    const rect = highlightedElement.getBoundingClientRect();
    const position = tutorialSteps[currentStep]?.position || 'bottom';
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Responsive tooltip width
    const tooltipWidth = viewportWidth < 640 ? Math.min(viewportWidth * 0.9, 350) : 350;
    const tooltipHeight = 200;
    
    // Add padding from edges
    const edgePadding = 20;
    
    let top, left;
    
    switch (position) {
      case 'top':
        top = Math.max(edgePadding, rect.top - tooltipHeight - 16); // Extra gap
        left = Math.max(edgePadding, Math.min(viewportWidth - tooltipWidth - edgePadding, rect.left + rect.width/2 - tooltipWidth/2));
        
        // If tooltip would be too close to top, position it below
        if (top < edgePadding * 2) {
          top = Math.min(viewportHeight - tooltipHeight - edgePadding, rect.bottom + 16);
        }
        break;
        
      case 'right':
        top = Math.max(edgePadding, Math.min(viewportHeight - tooltipHeight - edgePadding, rect.top + rect.height/2 - tooltipHeight/2));
        left = Math.min(viewportWidth - tooltipWidth - edgePadding, rect.right + 16);
        
        // If tooltip would be too close to right edge, position it to the left
        if (left + tooltipWidth > viewportWidth - edgePadding) {
          left = Math.max(edgePadding, rect.left - tooltipWidth - 16);
        }
        break;
        
      case 'bottom':
        top = Math.min(viewportHeight - tooltipHeight - edgePadding, rect.bottom + 16);
        left = Math.max(edgePadding, Math.min(viewportWidth - tooltipWidth - edgePadding, rect.left + rect.width/2 - tooltipWidth/2));
        
        // If tooltip would be too close to bottom, position it above
        if (top + tooltipHeight > viewportHeight - edgePadding * 2) {
          top = Math.max(edgePadding, rect.top - tooltipHeight - 16);
        }
        break;
        
      case 'left':
        top = Math.max(edgePadding, Math.min(viewportHeight - tooltipHeight - edgePadding, rect.top + rect.height/2 - tooltipHeight/2));
        left = Math.max(edgePadding, rect.left - tooltipWidth - 16);
        
        // If tooltip would be too close to left edge, position it to the right
        if (left < edgePadding) {
          left = Math.min(viewportWidth - tooltipWidth - edgePadding, rect.right + 16);
        }
        break;
        
      case 'center':
      default:
        // Center in the viewport
        top = (viewportHeight - tooltipHeight) / 2;
        left = (viewportWidth - tooltipWidth) / 2;
        break;
    }
    
    return { top: `${top}px`, left: `${left}px` };
  }, [highlightedElement, currentStep, tutorialSteps]);
  
  // Activate highlighting for the current step
  const highlightCurrentElement = useCallback(() => {
    if (!isActive || !tutorialSteps[currentStep]) return;
    
    const selector = tutorialSteps[currentStep].selector;
    
    // Special case for the email summaries step which has no element to highlight
    if (selector === '.tutorial-highlight-placeholder') {
      setHighlightedElement(null);
      return;
    }
    
    // Clear previous highlighting
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
      el.classList.remove('tutorial-highlight');
    });
    
    // Find and highlight new element
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.classList.add('tutorial-highlight');
      setHighlightedElement(element);
      
      // Ensure the element is visible and scrolled into view if needed
      if (element.scrollIntoView) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setHighlightedElement(null);
      console.warn(`Tutorial element not found: ${selector}`);
    }
  }, [isActive, currentStep, tutorialSteps]);
  
  // Handle next step
  const handleNextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Last step - complete tutorial
      completeTutorial();
    }
  };
  
  // Complete the tutorial
  const completeTutorial = async () => {
    try {
      // Show confetti
      setShowConfetti(true);
      
      // Update tutorial progress in database
      const result = await updateTutorialProgress(100, {
        currentStep: currentStep,
        currentSubstep: 0,
        completed: true
      });
      
      if (!result.success) {
        console.error('Failed to update tutorial progress:', result.error);
        toast.error('Failed to save your progress');
      }
      
      // Send welcome email in the background
      // We don't await this to prevent UI stalling
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {}
        })
      }).catch(err => {
        console.error('Failed to send welcome email:', err);
        // Don't show error to user since this is a background task
      });
      
      // Hide the tutorial after a delay
      setTimeout(() => {
        setIsActive(false);
        onComplete();
      }, 3000);
    } catch (error) {
      console.error('Error completing tutorial:', error);
      toast.error('Something went wrong. Please try again.');
    }
  };
  
  // Handle yes/no for email summaries
  const handleEmailSummariesResponse = async (sendEmail: boolean) => {
    try {
      setIsSendingEmail(true);
      
      // First complete the tutorial to prevent UI stalling
      // This ensures the confetti shows and the tutorial closes properly
      completeTutorial();
      
      if (sendEmail) {
        // Send the email summaries in the background
        // We don't await this to prevent stalling the UI
        toast.promise(
          sendLatestSummariesEmail(),
          {
            loading: 'Sending email summaries...',
            success: 'Email summaries sent successfully!',
            error: (err) => `Failed to send email: ${err?.error || 'Unknown error'}`
          }
        );
      }
    } catch (error) {
      console.error('Error handling email summaries response:', error);
      toast.error('Something went wrong. Please try again.');
      setIsSendingEmail(false);
    }
  };
  
  // Handle previous step
  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };
  
  // Handle skip tutorial
  const handleSkipTutorial = () => {
    // Mark tutorial as complete
    updateTutorialProgress(100, {
      currentStep: currentStep,
      currentSubstep: 0,
      completed: true,
    }).catch(error => {
      console.error('Failed to mark tutorial as complete:', error);
    });
    
    setIsActive(false);
    onComplete();
    toast('Tutorial skipped. You can always revisit it from your profile settings.');
    router.push('/dashboard');
  };
  
  // Update active state based on props
  useEffect(() => {
    setIsActive(active);
  }, [active]);
  
  // Update highlight when active state or current step changes
  useEffect(() => {
    highlightCurrentElement();
    
    // Cleanup function to remove highlighting when component unmounts or step changes
    return () => {
      document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
      });
    };
  }, [isActive, currentStep, highlightCurrentElement]);
  
  // Update progress when step changes
  useEffect(() => {
    const newProgress = Math.round(((currentStep + 1) / totalSteps) * 100);
    setProgress(newProgress);
    
    // Save progress to the server
    updateTutorialProgress(newProgress, {
      currentStep: currentStep,
      currentSubstep: 0,
      completed: newProgress === 100,
    }).catch((error) => {
      console.error('Failed to update tutorial progress:', error);
    });
  }, [currentStep, totalSteps]);
  
  // Add resize listener to reposition tooltip on window resize
  useEffect(() => {
    const handleResize = () => {
      if (highlightedElement) {
        // Force re-calculation of tooltip position
        setHighlightedElement(highlightedElement);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [highlightedElement]);
  
  if (!isActive) return null;
  
  const tooltipPosition = calculateTooltipPosition();
  
  // Special rendering for the email summaries step
  const isEmailSummariesStep = currentStep === tutorialSteps.length - 1;
  
  return (
    <>
      {/* Click-blocking overlay for steps with no highlighted element (e.g. email step) */}
      {!highlightedElement && (
        <div
          className="fixed inset-0 bg-black/50 z-[9998]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}

      {/* Tutorial tooltip */}
      <div
        className="fixed z-[10000] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-2xl w-[90vw] sm:w-[350px] max-w-[350px] p-4 animate-in fade-in slide-in-from-top-4 duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-1 rounded-full">
              {tutorialSteps[currentStep]?.icon || <ActivityIcon className="h-5 w-5" />}
            </div>
            <h3 className="font-medium">{tutorialSteps[currentStep]?.title || 'Tutorial'}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSkipTutorial}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
        
        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">
          {tutorialSteps[currentStep]?.description || 'Learn how to use tldrSEC effectively.'}
        </p>
        
        {/* Navigation buttons */}
        <div className="flex justify-between">
          {isEmailSummariesStep ? (
            // Yes/No buttons for email summaries step
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleEmailSummariesResponse(false)}
                className="gap-1"
                disabled={isSendingEmail}
              >
                <ThumbsDown className="h-4 w-4" />
                No, thanks
              </Button>
              
              <Button 
                variant="default" 
                size="sm"
                onClick={() => handleEmailSummariesResponse(true)}
                className="gap-1"
                disabled={isSendingEmail}
              >
                {isSendingEmail ? (
                  <>
                    <span className="animate-spin mr-1">⟳</span>
                    Sending...
                  </>
                ) : (
                  <>
                    <ThumbsUp className="h-4 w-4" />
                    Yes, send it!
                  </>
                )}
              </Button>
            </>
          ) : (
            // Standard navigation for other steps
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handlePrevStep}
                disabled={currentStep === 0}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              
              <Button 
                variant="default" 
                size="sm"
                onClick={handleNextStep}
                className="gap-1"
              >
                {currentStep === totalSteps - 2 ? 'Next' : 'Next'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Confetti celebration for completion */}
      <Confetti active={showConfetti} explosion={true} particleCount={100} />
    </>
  );
} 