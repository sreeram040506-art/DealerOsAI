import AppLayout from '@/components/AppLayout';
import { MessageSquare, Phone, Users, Hash, Search, Send, Plus, MoreVertical, Paperclip, Image as ImageIcon, Smile, Bell, ChevronLeft, Video, Loader2, WifiOff, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';
import { useChannels, useMessages, useSendMessage, useDirectory, useSeedCommunication, useCreateChannel } from '@/hooks/useCommunication';

export default function Communication() {
  const { user } = useAuth();
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [showChatMobile, setShowChatMobile] = useState(false);
  const [message, setMessage] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const { data: channels = [], isLoading: channelsLoading, isError: channelsError } = useChannels();
  const { data: directory = [], isLoading: directoryLoading } = useDirectory();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(activeChat);
  const sendMessage = useSendMessage();
  const seedCommunication = useSeedCommunication();
  const createChannel = useCreateChannel();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const newChannelInputRef = useRef<HTMLInputElement>(null);

  // Auto scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChatMobile]);

  // Auto-select first channel on desktop
  useEffect(() => {
    if (channels.length > 0 && !activeChat && window.innerWidth >= 768) {
      setActiveChat(channels[0].id);
    }
  }, [channels, activeChat]);

  // Focus new channel input
  useEffect(() => {
    if (showNewChannel && newChannelInputRef.current) {
      newChannelInputRef.current.focus();
    }
  }, [showNewChannel]);

  const handleChatSelect = (id: string) => {
    setActiveChat(id);
    setShowChatMobile(true);
  };

  const handleSend = () => {
    if (!message.trim() || !activeChat) return;
    sendMessage.mutate({ channelId: activeChat, text: message });
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateChannel = () => {
    if (!newChannelName.trim()) return;
    createChannel.mutate({ name: newChannelName }, {
      onSuccess: () => {
        setNewChannelName('');
        setShowNewChannel(false);
      }
    });
  };

  const activeChannelData = channels.find(c => c.id === activeChat);
  const activeDirUser = directory.find(d => d.id === activeChat);
  const isChannelsEmpty = !channelsLoading && channels.length === 0;

  // Derive header info
  const chatName = activeChannelData
    ? `# ${activeChannelData.name}`
    : activeDirUser
    ? activeDirUser.name
    : 'Select a chat';

  const chatSubtitle = activeChannelData
    ? `${activeChannelData.memberCount || 0} members`
    : activeDirUser
    ? activeDirUser.role
    : '';

  return (
    <AppLayout>
      <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)] flex flex-col page-enter">
        {/* Page Header */}
        <section className="mb-4 md:mb-6 shrink-0 px-1 md:px-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
            <div>
              <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm mb-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Communication Hub
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-foreground">
                Messaging & Inter-Dealership
              </h1>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              {isChannelsEmpty && (
                <Button
                  onClick={() => seedCommunication.mutate()}
                  disabled={seedCommunication.isPending}
                  className="rounded-xl h-9 md:h-10 px-3 md:px-4 text-[10px] md:text-xs font-black uppercase tracking-widest gap-2 whitespace-nowrap shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {seedCommunication.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Initialize Channels
                </Button>
              )}
              <Button variant="outline" className="rounded-xl h-9 md:h-10 px-3 md:px-4 text-[10px] md:text-xs font-black uppercase tracking-widest gap-2 whitespace-nowrap shrink-0">
                <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Directory
              </Button>
            </div>
          </div>
        </section>

        {/* Chat Interface */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl md:rounded-[32px] border border-border shadow-xl shadow-black/[0.02] overflow-hidden flex relative">

          {/* ===== SIDEBAR ===== */}
          <div className={cn(
            "w-full md:w-80 lg:w-[340px] border-r border-border flex flex-col bg-muted/10 shrink-0",
            "absolute md:relative inset-0 z-10 transition-transform duration-300 ease-in-out md:translate-x-0",
            showChatMobile ? "-translate-x-full" : "translate-x-0"
          )}>
            {/* Search */}
            <div className="p-3 md:p-4 border-b border-border bg-white/60 backdrop-blur-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages..."
                  className="pl-9 bg-muted/30 border-transparent rounded-xl h-10 text-sm font-medium focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-border transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-5">
              {/* Channels */}
              <div>
                <div className="flex items-center justify-between mb-2.5 px-2">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Channels</h3>
                  <button
                    onClick={() => setShowNewChannel(v => !v)}
                    className="text-muted-foreground hover:text-primary p-1 rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* New channel inline form */}
                {showNewChannel && (
                  <div className="flex items-center gap-1.5 px-2 mb-2">
                    <div className="flex-1 relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        ref={newChannelInputRef}
                        value={newChannelName}
                        onChange={e => setNewChannelName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateChannel(); if (e.key === 'Escape') setShowNewChannel(false); }}
                        placeholder="channel-name"
                        className="w-full pl-8 pr-2 py-1.5 text-sm font-medium rounded-lg border border-primary/30 bg-primary/5 outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <Button size="icon" className="h-7 w-7 rounded-lg shrink-0" onClick={handleCreateChannel} disabled={createChannel.isPending || !newChannelName.trim()}>
                      {createChannel.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg shrink-0 text-muted-foreground" onClick={() => { setShowNewChannel(false); setNewChannelName(''); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <div className="space-y-0.5">
                  {channelsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels...
                    </div>
                  ) : channelsError ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-red-500">
                      <WifiOff className="w-3.5 h-3.5" /> Failed to load channels
                    </div>
                  ) : channels.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      No channels yet. Click <span className="font-bold text-primary">Initialize Channels</span> above to get started.
                    </div>
                  ) : channels.map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => handleChatSelect(channel.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all",
                        activeChat === channel.id
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-foreground/80 hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                          activeChat === channel.id ? "bg-primary/20" : "bg-muted/50"
                        )}>
                          <Hash className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-left overflow-hidden">
                          <span className="truncate block">{channel.name}</span>
                          {channel.lastMessage && (
                            <span className="text-[10px] font-medium text-muted-foreground truncate block">
                              {channel.lastMessage.text.length > 30 ? channel.lastMessage.text.slice(0, 30) + '...' : channel.lastMessage.text}
                            </span>
                          )}
                        </div>
                      </div>
                      {channel.unread > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] min-w-[20px] text-center px-1.5 py-0.5 rounded-full font-black shrink-0 ml-2">
                          {channel.unread}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Directory / Team Members */}
              <div>
                <div className="flex items-center justify-between mb-2.5 px-2">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Team Members</h3>
                  <span className="text-[10px] font-bold text-muted-foreground">{directory.length}</span>
                </div>
                <div className="space-y-0.5">
                  {directoryLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team...
                    </div>
                  ) : directory.filter(d => d.id !== user?.id).length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      No other team members found.
                    </div>
                  ) : directory.filter(d => d.id !== user?.id).map(dm => (
                    <div
                      key={dm.id}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/60 transition-all"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-black text-foreground">
                            {dm.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          {dm.online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                          )}
                        </div>
                        <div className="text-left overflow-hidden">
                          <div className="text-[14px] font-bold truncate text-foreground">{dm.name}</div>
                          <div className="text-[11px] text-muted-foreground font-semibold truncate">{dm.role}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== CHAT AREA ===== */}
          <div className={cn(
            "flex-1 flex flex-col bg-slate-50/50",
            "absolute md:relative inset-0 z-20 transition-transform duration-300 ease-in-out md:translate-x-0 w-full",
            showChatMobile ? "translate-x-0" : "translate-x-full"
          )}>
            {/* Chat Header */}
            {activeChat ? (
              <div className="h-14 md:h-16 px-2 md:px-6 border-b border-border flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0 shadow-sm md:shadow-none">
                <div className="flex items-center gap-1.5 md:gap-3 overflow-hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden text-muted-foreground hover:text-foreground shrink-0 w-9 h-9 rounded-full"
                    onClick={() => setShowChatMobile(false)}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>

                  {activeChannelData ? (
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black shrink-0">
                      <Hash className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                      {activeDirUser ? activeDirUser.name.split(' ').map(n => n[0]).join('') : '?'}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <h2 className="text-sm md:text-[15px] font-black text-foreground truncate">{chatName}</h2>
                    <p className="text-[10px] md:text-[11px] font-semibold text-muted-foreground truncate">{chatSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center shrink-0">
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-primary hidden sm:inline-flex"><Video className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-primary"><Phone className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-primary hidden sm:inline-flex"><Bell className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-primary"><MoreVertical className="w-4 h-4" /></Button>
                </div>
              </div>
            ) : (
              <div className="h-16 px-6 border-b border-border hidden md:flex items-center justify-center bg-white shrink-0">
                <p className="text-sm font-bold text-muted-foreground">Select a channel to start messaging</p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
              {!activeChat && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3 pb-10">
                  <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-primary/40" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">Welcome to Communication</p>
                    <p className="text-xs">Select a channel from the sidebar to get started</p>
                  </div>
                </div>
              )}

              {activeChat && messagesLoading && (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading messages...
                </div>
              )}

              {activeChat && !messagesLoading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3 pb-10">
                  <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-primary/40" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">No messages yet</p>
                    <p className="text-xs">Be the first to start the conversation!</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isSelf = msg.senderId === user?.id;
                const avatar = msg.senderName ? msg.senderName.split(' ').map((n: string) => n[0]).join('') : '?';
                const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={msg.id} className={cn("flex gap-2.5 md:gap-3 max-w-[88%] md:max-w-[75%]", isSelf ? "ml-auto flex-row-reverse" : "")}>
                    <div className={cn(
                      "w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black shadow-sm",
                      isSelf
                        ? "bg-primary text-primary-foreground"
                        : "bg-white border border-border text-foreground"
                    )}>
                      {avatar}
                    </div>
                    <div className={cn("flex flex-col gap-1", isSelf ? "items-end" : "items-start")}>
                      <div className="flex items-center gap-2 px-0.5">
                        <span className="text-[11px] font-bold text-foreground">{isSelf ? 'You' : msg.senderName}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">{time}</span>
                      </div>
                      <div className={cn(
                        "px-3.5 py-2.5 rounded-2xl text-[13px] md:text-sm font-medium shadow-sm break-words whitespace-pre-wrap leading-relaxed",
                        isSelf
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-white border border-border text-foreground rounded-bl-sm"
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Input Area */}
            {activeChat && (
              <div className="p-2.5 md:p-4 bg-white border-t border-border shrink-0 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.04)]">
                <div className="flex items-end gap-1 md:gap-2 bg-muted/20 border border-border rounded-2xl p-1.5 md:p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all focus-within:bg-white/80 focus-within:shadow-sm">
                  <div className="flex gap-0.5 pb-0.5 px-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl shrink-0"><Plus className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl shrink-0"><ImageIcon className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl shrink-0"><Paperclip className="w-4 h-4" /></Button>
                  </div>

                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent border-0 focus:ring-0 resize-none max-h-28 md:max-h-32 min-h-[36px] md:min-h-[40px] text-[15px] md:text-sm font-medium p-1.5 md:p-2 placeholder:text-muted-foreground outline-none leading-snug"
                    rows={1}
                    disabled={sendMessage.isPending}
                  />

                  <div className="flex gap-0.5 pb-0.5 px-0.5 items-end">
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl shrink-0"><Smile className="w-4 h-4" /></Button>
                    <Button
                      onClick={handleSend}
                      className="h-9 w-9 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shrink-0 shadow-md hover:shadow-lg transition-all"
                      disabled={!message.trim() || sendMessage.isPending}
                    >
                      {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                    </Button>
                  </div>
                </div>
                <div className="hidden md:block px-4 mt-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
