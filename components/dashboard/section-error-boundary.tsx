"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for individual dashboard sections.
 * Catches errors from Suspense-wrapped async server components so one
 * section failing doesn't crash the entire page.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`Dashboard section error (${this.props.sectionName ?? "unknown"}):`, error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700">
              Failed to load {this.props.sectionName ?? "this section"}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
