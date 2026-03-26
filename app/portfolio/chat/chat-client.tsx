'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PortfolioChatClientProps {
  tickers: Array<{ symbol: string; companyName: string; summaryCount: number }>;
  totalSummaries: number;
}

const SUGGESTED_QUESTIONS = [
  'What insider trading happened this week?',
  'Compare recent earnings across my holdings',
  'Which filings had the highest importance?',
  'Summarize the most material events this month',
];

export function PortfolioChatClient({ tickers, totalSummaries }: PortfolioChatClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remaining, setRemaining] = useState(50);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Fetch rate limit on mount
  useEffect(() => {
    fetch('/api/portfolio/chat')
      .then(r => r.json())
      .then((data: { remaining?: number }) => {
        if (typeof data.remaining === 'number') setRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || remaining <= 0) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/portfolio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const remainingHeader = response.headers.get('X-Remaining-Questions');
      if (remainingHeader) setRemaining(parseInt(remainingHeader, 10));

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: error.error || 'Something went wrong.' };
          return updated;
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Failed to get a response. Please try again.' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4">
      {/* Header */}
      <div className="py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold">Portfolio Chat</h1>
            <p className="text-xs text-muted-foreground">
              {tickers.length} tickers &middot; {totalSummaries} summaries
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{remaining}/50 questions today</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-6">
            <div>
              <h2 className="text-lg font-medium">Ask about your portfolio</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cross-reference filings across {tickers.map(t => t.symbol).join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
              {SUGGESTED_QUESTIONS.map(q => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <Card className={`max-w-[80%] px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content || (isLoading && i === messages.length - 1 ? '...' : '')}</p>
            </Card>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="py-4 border-t">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your portfolio..."
            disabled={isLoading || remaining <= 0}
            className="flex-1"
            aria-label="Ask a question about your portfolio"
          />
          <Button type="submit" disabled={!input.trim() || isLoading || remaining <= 0}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        {remaining <= 0 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Daily limit reached. Questions reset at midnight UTC.
          </p>
        )}
      </div>
    </div>
  );
}
