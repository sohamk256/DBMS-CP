import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Copy, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import type { AuthSession, ChatMessage } from '../types/db';

interface GeminiChatbotProps {
  screen: 'home' | 'login' | 'dashboard';
  session?: AuthSession | null;
  activeTab?: string | null;
}

function renderFormattedAssistantText(text: string) {
  const lines = text.split('\n');
  const blocks: { type: 'code' | 'table' | 'text'; content: string[] }[] = [];
  let inCode = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      if (inCode) {
        blocks.push({ type: 'code', content: [] });
      }
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (inCode && last?.type === 'code') {
      last.content.push(line);
      continue;
    }

    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
    if (isTableRow) {
      if (last?.type === 'table') {
        last.content.push(trimmed);
      } else {
        blocks.push({ type: 'table', content: [trimmed] });
      }
    } else if (last?.type === 'text') {
      last.content.push(line);
    } else {
      blocks.push({ type: 'text', content: [line] });
    }
  }

  const renderInlineBold = (lineText: string) => {
    const parts = lineText.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={idx}
            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-teal-800"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const parseCells = (row: string) =>
    row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());

  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-700">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <pre
              key={bIdx}
              className="overflow-x-auto rounded-md bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100"
            >
              <code>{block.content.join('\n')}</code>
            </pre>
          );
        }

        if (block.type === 'table') {
          const filtered = block.content.filter(
            (r) => !parseCells(r).every((c) => /^:?-{2,}:?$/.test(c)),
          );
          const header = filtered[0] ? parseCells(filtered[0]) : [];
          const bodyRows = filtered.slice(1).map(parseCells);
          return (
            <div key={bIdx} className="overflow-x-auto rounded border border-slate-200 my-1">
              <table className="w-full text-left border-collapse text-[11px]">
                {header.length > 0 && (
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <tr>
                      {header.map((cell, cIdx) => (
                        <th key={cIdx} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                          {renderInlineBold(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-slate-100">
                  {bodyRows.map((cells, rIdx) => (
                    <tr key={rIdx} className="bg-white">
                      {cells.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2 py-1.5 text-slate-600 align-top">
                          {renderInlineBold(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={bIdx} className="space-y-1">
            {block.content.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;
              if (trimmed === '---' || trimmed === '***') {
                return <hr key={lIdx} className="border-slate-200 my-1.5" />;
              }
              if (trimmed.startsWith('#### ') || trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
                return (
                  <p key={lIdx} className="font-semibold text-slate-900 pt-1">
                    {renderInlineBold(trimmed.replace(/^#{2,4}\s+/, ''))}
                  </p>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-teal-700 font-bold mt-0.5">·</span>
                    <span>{renderInlineBold(trimmed.slice(2))}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineBold(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function GeminiChatbot({ screen, session, activeTab }: GeminiChatbotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Welcome to the **OrganLink DBMS Assistant**. Ask me anything about the **User, Hospital, or Administrator dashboards**, the **SQLite relational schema & triggers**, **ABO/Rh compatibility scoring**, or live registry statistics.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, sending]);

  const suggestedPrompts = useMemo(() => {
    if (!session) {
      return [
        'Explain the differences between the User, Hospital, and Admin dashboards.',
        'Which demo credentials can I use to sign into each portal?',
        'How many hospitals and available organs are currently in the registry?',
      ];
    }
    if (session.role === 'user') {
      return [
        'How is my waitlist rank and compatibility score calculated?',
        'Where can I view my lab tests and update my profile or consent?',
        'Which organs are currently available in the network?',
      ];
    }
    if (session.role === 'hospital') {
      return [
        'How does the Compatibility Matching Engine score waiting recipients?',
        'What happens in SQLite when I propose an organ allocation?',
        'How do I switch between My Hospital and Full Network scope?',
      ];
    }
    return [
      'How do the D3 regional charts, SQL triggers, and audit logs work together?',
      'Give me a SQL query to find waiting Emergency recipients by city.',
      'Summarize current organ supply vs. waiting demand across Maharashtra.',
    ];
  }, [session]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const historyPayload = nextMessages
        .filter((m) => m.id !== 'welcome' && !m.error)
        .slice(0, -1)
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('model' as const),
          text: m.text,
        }));

      const res = await api.sendChatMessage({
        message: trimmed,
        history: historyPayload,
        context: {
          screen,
          role: session?.role ?? null,
          subRole: session?.subRole ?? null,
          activeTab: activeTab ?? null,
          displayName: session?.displayName ?? null,
          linkedEntityId: session?.linkedEntityId ?? null,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach Gemini assistant.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Conversation cleared. Ask any question about OrganLink dashboards, database tables, triggers, or live registry data.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open OrganLink Gemini Assistant"
          className="inline-flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <MessageSquare className="w-4 h-4 text-teal-300" />
          <span>Ask OrganLink AI</span>
        </button>
      ) : (
        <section
          aria-label="OrganLink Gemini Assistant"
          className="w-[380px] sm:w-[430px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Chat Header */}
          <header className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-teal-700 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-white truncate">OrganLink DBMS Assistant</h2>
                <p className="text-[11px] text-slate-300 truncate">
                  {session
                    ? `Context: ${session.role} portal${activeTab ? ` · ${activeTab}` : ''}`
                    : `Context: ${screen === 'login' ? 'Sign In Gateway' : 'Home Overview'}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear chat history"
                title="Clear conversation"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-teal-700 text-white text-xs leading-relaxed'
                      : msg.error
                      ? 'border border-rose-200 bg-rose-50 text-rose-800 text-xs'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p>{msg.text}</p>
                  ) : msg.error ? (
                    <p className="font-medium">{msg.text}</p>
                  ) : (
                    renderFormattedAssistantText(msg.text)
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-slate-400">
                  <span className="font-mono">{msg.timestamp}</span>
                  {msg.role === 'assistant' && !msg.error && (
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      aria-label="Copy response"
                      className="inline-flex items-center gap-1 hover:text-slate-600"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-teal-700" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-start">
                <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
                  Querying OrganLink registry &amp; Gemini...
                </div>
              </div>
            )}

            {/* Quick Prompt Starters (when conversation has only welcome) */}
            {messages.length <= 2 && !sending && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500">Suggested Questions</p>
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="w-full text-left rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              aria-label="Ask OrganLink Assistant"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about dashboards, SQL, or live data..."
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="inline-flex items-center justify-center rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
