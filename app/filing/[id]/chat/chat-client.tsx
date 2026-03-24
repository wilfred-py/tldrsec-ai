'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatClientProps {
  summaryId: string;
  companyName: string;
  ticker: string;
  formType: string;
  filingDate: string;
  importance: string | null;
  summaryText: string;
}

const RATE_LIMIT = 10;

function formatFilingType(type: string): string {
  const upper = type.toUpperCase();
  const map: Record<string, string> = {
    '10-K': '10-K', '10K': '10-K',
    '10-Q': '10-Q', '10Q': '10-Q',
    '8-K': '8-K', '8K': '8-K',
  };
  return map[upper] || type;
}

function ImportanceBadge({ importance }: { importance: string | null }) {
  if (!importance) return null;
  const variants: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  };
  return (
    <Badge variant="outline" className={variants[importance] || ''}>
      {importance}
    </Badge>
  );
}

export function ChatClient({
  summaryId,
  companyName,
  ticker,
  formType,
  filingDate,
  importance,
  summaryText,
}: ChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch initial rate limit status
  useEffect(() => {
    fetch(`/api/filing/${summaryId}/chat`)
      .then((res) => res.json())
      .then((data: unknown) => {
        const d = data as { used?: number };
        if (d.used !== undefined) setQuestionsUsed(d.used);
      })
      .catch(() => {});
  }, [summaryId]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || questionsUsed >= RATE_LIMIT) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`/api/filing/${summaryId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });

      if (response.status === 429) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'You have reached the question limit for this filing.',
          };
          return updated;
        });
        setQuestionsUsed(RATE_LIMIT);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Something went wrong' })) as { error?: string };
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Error: ${errorData.error || 'Failed to get response'}`,
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) {
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const content = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content };
          return updated;
        });
      }

      setQuestionsUsed((prev) => prev + 1);
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Failed to connect. Please try again.',
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formattedDate = new Date(filingDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="container max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)] py-4 px-4 md:px-6">
      {/* Header */}
      <div className="flex-none space-y-3 pb-4 border-b">
        <div className="flex items-center gap-2">
          <Link href={`/summary/${summaryId}`}>
            <Button variant="ghost" size="icon" aria-label="Back to summary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold truncate">
                {ticker}: {formatFilingType(formType)}
              </h1>
              <Badge variant="secondary">{formatFilingType(formType)}</Badge>
              <ImportanceBadge importance={importance} />
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {companyName} &middot; Filed {formattedDate}
            </p>
          </div>
        </div>

        {/* Collapsible summary */}
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showSummary ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showSummary ? 'Hide summary' : 'Show summary'}
        </button>
        {showSummary && (
          <Card className="p-4 text-sm max-h-60 overflow-y-auto">
            <div className="whitespace-pre-wrap">{summaryText}</div>
          </Card>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-40" />
            <div className="space-y-2">
              <p className="font-medium text-foreground">Ask anything about this filing</p>
              <div className="space-y-1 text-sm">
                <p>Try: &ldquo;What are the key financial metrics?&rdquo;</p>
                <p>Try: &ldquo;Summarize the risk factors&rdquo;</p>
                <p>Try: &ldquo;What changed from last quarter?&rdquo;</p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {msg.content || (isLoading && i === messages.length - 1 ? <BouncingDots /> : null)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex-none border-t pt-4 space-y-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              questionsUsed >= RATE_LIMIT
                ? 'Question limit reached'
                : 'Ask about this filing...'
            }
            disabled={isLoading || questionsUsed >= RATE_LIMIT}
            maxLength={2000}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim() || questionsUsed >= RATE_LIMIT}
            size="icon"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {questionsUsed}/{RATE_LIMIT} questions used
        </p>
      </div>
    </div>
  );
}

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot-1" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot-2" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot-3" />
    </span>
  );
}
