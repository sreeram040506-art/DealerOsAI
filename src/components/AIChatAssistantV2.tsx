import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Volume2, VolumeX, Mic } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatAssistant() {
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: "Hi! I'm Synax, your AI business assistant. Ask me anything about your dealership — inventory, sales, profits, workflows, and more."
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = async (rawText: string) => {
    const userMsg = rawText.trim();
    if (!userMsg || isLoadingRef.current) return;

    const newMessages = [...messagesRef.current, { role: 'user', content: userMsg } as Message];
    messagesRef.current = newMessages;
    setMessages(newMessages);
    setIsLoading(true);
    isLoadingRef.current = true;

    try {
      const response = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMsg,
          history: newMessages.slice(1, -1)
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to communicate with AI');

      const withReply = [...newMessages, { role: 'assistant', content: data.reply }];
      messagesRef.current = withReply;
      setMessages(withReply);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Error communicating with AI assistant.');
      const withError = [...newMessages, { role: 'assistant', content: 'Sorry, I am having trouble accessing the business data right now. Please try again later.' }];
      messagesRef.current = withError;
      setMessages(withError);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleVoiceResult = React.useCallback((transcript: string) => {
    setInput(transcript);
    // Auto-send when speaking is done
    setTimeout(() => {
      sendMessage(transcript);
    }, 500);
  }, [sendMessage]);

  const {
    isListening,
    supported,
    toggleListening,
    speak,
    cancelSpeech
  } = useVoice(handleVoiceResult);

  // Handle bot speech
  useEffect(() => {
    if (voiceEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        speak(lastMessage.content);
      }
    }
  }, [messages, voiceEnabled, speak]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Only allow ADMIN to see the business assistant
  if (!user || !token || user.role !== 'ADMIN') return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoadingRef.current) return;
    const userMsg = input;
    setInput('');
    await sendMessage(userMsg);
  };

  const handleSendWithText = async (text: string) => {
    await sendMessage(text);
  };

  return (
    <div className="fixed top-20 right-6 z-40 flex flex-col items-end pointer-events-none">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-card/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl w-80 sm:w-96 h-[500px] max-h-[80vh] flex flex-col mt-4 overflow-hidden animate-in slide-in-from-top-5 fade-in duration-300 pointer-events-auto ring-1 ring-black/5">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/20 via-card to-card border-b border-white/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary to-primary/80 rounded-xl text-white shadow-lg shadow-primary/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-foreground text-[15px]">Synax</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-black">Online</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Voice Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  if (!supported.synthesis) {
                    toast.error('Text-to-speech is not supported by your browser.');
                    return;
                  }
                  if (voiceEnabled) cancelSpeech();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${voiceEnabled ? 'bg-primary/10 border-primary/30 text-primary shadow-inner' : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'} ${!supported.synthesis ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!supported.synthesis ? 'Speech not supported' : (voiceEnabled ? 'Disable Voice' : 'Enable Voice')}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 hover:bg-muted/80 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-gradient-to-b from-transparent to-muted/10">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-foreground text-background' : 'bg-gradient-to-br from-primary/20 to-primary/10 text-primary border border-primary/20'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] p-3.5 text-[13.5px] leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-foreground text-background rounded-2xl rounded-tr-sm font-medium' 
                    : 'bg-card/80 backdrop-blur-sm text-card-foreground border border-white/10 rounded-2xl rounded-tl-sm'
                }`}>
                   {/* Simple line break rendering for text */}
                   {msg.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i !== msg.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-card/80 backdrop-blur-sm border border-white/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-primary/80 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} className="p-3 bg-card/95 backdrop-blur-xl border-t border-white/5">
            <div className="relative flex items-center bg-muted/40 rounded-full border border-border/50 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-inner">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening..." : "Ask anything about this site..."}
                className="w-full bg-transparent pl-5 pr-28 py-3.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none font-body"
                disabled={isLoading}
              />
              <div className="absolute right-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!supported.speech) {
                      toast.error('Speech recognition is not supported by your browser.');
                      return;
                    }
                    toggleListening();
                  }}
                  className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                    isListening 
                      ? 'bg-primary text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                      : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                  } ${!supported.speech ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!supported.speech ? 'Speech recognition not supported' : 'Voice Input'}
                >
                  {isListening ? (
                    <div className="flex gap-0.5 items-center justify-center h-full">
                      <span className="w-0.5 h-2 bg-white rounded-full animate-[bounce_1s_infinite_0ms]"></span>
                      <span className="w-0.5 h-3 bg-white rounded-full animate-[bounce_1s_infinite_200ms]"></span>
                      <span className="w-0.5 h-2 bg-white rounded-full animate-[bounce_1s_infinite_400ms]"></span>
                    </div>
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-8 h-8 flex items-center justify-center bg-foreground text-background rounded-full shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 ml-0.5" />}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative px-4 h-12 bg-gradient-to-br from-primary to-emerald-600 text-white rounded-lg shadow-xl shadow-primary/30 flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95 animate-in zoom-in pointer-events-auto"
        >
          <div className="absolute inset-0 rounded-lg border border-white/20"></div>
          <MessageSquare className="w-5 h-5 transition-transform group-hover:rotate-12" />
          <span className="font-bold tracking-wide text-sm">Synax</span>
          
          {/* Unread badge indicator */}
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-primary"></span>
          </span>
        </button>
      )}
    </div>
  );
}
