'use client';

import { Building2, FileText, TrendingUp } from 'lucide-react';

export function ProfessionalFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center gap-12 text-sm text-fintech-text-secondary">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-fintech-accent" />
            <span>SEC EDGAR Integration</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-fintech-accent" />
            <span>Enterprise-grade Infrastructure</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-fintech-accent" />
            <span>AI-partnered Analysis</span>
          </div>
        </div>
        
        <div className="text-center mt-6 text-xs text-gray-400">
          Professional SEC filing analysis for focused investors
        </div>
      </div>
    </footer>
  );
}