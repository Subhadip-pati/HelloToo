import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import { Avatar, fmtTime, lastSeen, messageTypeFromMime, playNotification, readFileAsDataUrl, showDesktopNotification } from './App';
import type { Message, CallLog } from './App';
import { useApp } from './AppContext';
import { MessageComposer } from './MessageComposer';
import './index.css';

type IncomingTypingEvent = { chatId: string; userId: string; isTyping: boolean };
type PresenceEvent = { userId: string; isOnline: boolean; lastSeenAt: string | null };
type MessageDeletedEvent = {
  messageId: string;
  chatId: string;
  updatedAt?: string;
  lastMessage?: { text: string; createdAt: string; senderId: string } | null;
};
type ComposerMedia = { type: string; mediaUrl: string; mediaName: string; mediaMime: string } | null;
type ActiveCall = {
  id: string;
  chatId: string;
  targetUserId: string;
  mode: 'voice' | 'video';
  title: string;
  startedAt: number;
  status: 'ringing' | 'connected';
} | null;
type IncomingCall = {
  id: string;
  chatId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: 'voice' | 'video';
  createdAt: string;
} | null;
type LookupUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  statusText: string;
  phoneNumber?: string | null;
  email?: string | null;
};
type LookupResult = {
  user: LookupUser | null;
  existingContact: boolean;
  existingRequest: null | { id: string; status: string; direction: 'incoming' | 'outgoing' };
};
type DetailUser = {
  name: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  statusText?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};
type TimelineItem =
  | { kind: 'message'; createdAt: string; id: string; message: Message }
  | { kind: 'call'; createdAt: string; id: string; call: CallLog };

type TimelineBlock =
  | { kind: 'date'; id: string; label: string }
  | {
      kind: 'message-group';
      id: string;
      mine: boolean;
      senderName?: string;
      messages: Message[];
    }
  | { kind: 'call'; id: string; call: CallLog };

const sameCalendarDay = (leftIso: string, rightIso: string) => {
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
};

const formatTimelineDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const isPaneNearBottom = (pane: HTMLDivElement | null, offset = 120) =>
  !pane || pane.scrollHeight - pane.scrollTop - pane.clientHeight < offset;

export function ChatPane() {
  const {
    contacts,
    setContacts,
    chats,
    setChats,
    messages,
    setMessages,
    activeChatId,
    setActiveChatId,
    typingUsers,
    setTypingUsers,
    token,
    me,
    api,
    socket,
    isMobile,
    setInfo,
    setError,
    calls,
    setCalls,
    refreshCalls,
  } = useApp();

  const [search, setSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'archived' | 'locked'>('all');
  const [text, setText] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [composerMedia, setComposerMedia] = useState<ComposerMedia>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectName, setConnectName] = useState('');
  const [connectIdentifier, setConnectIdentifier] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<LookupUser | null>(null);
  const [contactSaved, setContactSaved] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [detailUser, setDetailUser] = useState<DetailUser | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unseenNewMessages, setUnseenNewMessages] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [inspectMessage, setInspectMessage] = useState<Message | null>(null);
  const [archivedChatIds, setArchivedChatIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('helloto_archived_chats');
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });
  const [lockedChatIds, setLockedChatIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('helloto_locked_chats');
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });

  const msgEndRef = useRef<HTMLDivElement>(null);
  const messagesPaneRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const lastActiveChatIdRef = useRef('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationMenuRef = useRef<HTMLDivElement>(null);
  const messageActionRef = useRef<HTMLDivElement>(null);
  const connectIdentifierRef = useRef<HTMLInputElement>(null);
  const outgoingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId]);
  const filteredChats = useMemo(
    () => chats.filter((chat) => {
      const matchesSearch = chat.title.toLowerCase().includes(search.trim().toLowerCase());
      if (!matchesSearch) return false;
      const isArchived = archivedChatIds.includes(chat.id);
      const isLocked = lockedChatIds.includes(chat.id);
      if (chatFilter === 'archived') return isArchived;
      if (chatFilter === 'locked') return isLocked;
      if (isArchived) return false;
      if (chatFilter === 'unread') return chat.unreadCount > 0;
      if (chatFilter === 'groups') return chat.isGroup;
      return true;
    }),
    [chats, search, chatFilter, archivedChatIds, lockedChatIds],
  );
  const unreadChats = useMemo(() => chats.reduce((count, chat) => count + chat.unreadCount, 0), [chats]);
  const groupChats = useMemo(() => chats.filter((chat) => chat.isGroup).length, [chats]);
  const archivedChats = useMemo(() => chats.filter((chat) => archivedChatIds.includes(chat.id)).length, [chats, archivedChatIds]);
  const lockedChats = useMemo(() => chats.filter((chat) => lockedChatIds.includes(chat.id)).length, [chats, lockedChatIds]);
  const activeChatCalls = useMemo(() => calls.filter((call) => call.chatId === activeChatId), [calls, activeChatId]);
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const callItems: TimelineItem[] = activeChatCalls.map((call) => ({
      kind: 'call',
      createdAt: call.createdAt,
      id: call.id,
      call,
    }));
    const messageItems: TimelineItem[] = messages.map((message) => ({
      kind: 'message',
      createdAt: message.createdAt,
      id: message.id,
      message,
    }));
    return [...messageItems, ...callItems].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, [messages, activeChatCalls]);

  const timelineBlocks = useMemo<TimelineBlock[]>(() => {
    const blocks: TimelineBlock[] = [];
    let currentGroup: Extract<TimelineBlock, { kind: 'message-group' }> | null = null;
    let previousCreatedAt: string | null = null;

    const flushGroup = () => {
      if (currentGroup) {
        blocks.push(currentGroup);
        currentGroup = null;
      }
    };

    for (const item of timelineItems) {
      if (!previousCreatedAt || !sameCalendarDay(previousCreatedAt, item.createdAt)) {
        flushGroup();
        blocks.push({
          kind: 'date',
          id: `date-${item.id}`,
          label: formatTimelineDay(item.createdAt),
        });
      }

      if (item.kind === 'call') {
        flushGroup();
        blocks.push({ kind: 'call', id: item.id, call: item.call });
        previousCreatedAt = item.createdAt;
        continue;
      }

      const mine = item.message.sender.id === me?.id;
      const lastMessageInGroup = currentGroup?.messages[currentGroup.messages.length - 1];
      const withinGroupWindow = lastMessageInGroup
        ? +new Date(item.message.createdAt) - +new Date(lastMessageInGroup.createdAt) < 5 * 60 * 1000
        : false;
      const sameSender = lastMessageInGroup ? lastMessageInGroup.sender.id === item.message.sender.id : false;

      if (!currentGroup || currentGroup.mine !== mine || !sameSender || !withinGroupWindow) {
        flushGroup();
        currentGroup = {
          kind: 'message-group',
          id: `group-${item.id}`,
          mine,
          senderName: mine ? undefined : item.message.sender.name,
          messages: [item.message],
        };
      } else {
        currentGroup.messages.push(item.message);
      }

      previousCreatedAt = item.createdAt;
    }

    flushGroup();
    return blocks;
  }, [timelineItems, me?.id]);

  const activeTypingUsers = useMemo(() => {
    if (!activeChatId) return [];
    return (typingUsers[activeChatId] ?? []).filter((id) => id !== me?.id);
  }, [typingUsers, activeChatId, me?.id]);
  const activeChatArchived = activeChat ? archivedChatIds.includes(activeChat.id) : false;
  const activeChatLocked = activeChat ? lockedChatIds.includes(activeChat.id) : false;

  const applyDeletedMessageUpdate = (payload: MessageDeletedEvent) => {
    setMessages((prev) => prev.filter((message) => message.id !== payload.messageId));
    setChats((prev) =>
      prev
        .map((chat) =>
          chat.id === payload.chatId
            ? {
                ...chat,
                updatedAt: payload.updatedAt ?? chat.updatedAt,
                lastMessage: payload.lastMessage ?? null,
              }
            : chat,
        )
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('helloto_archived_chats', JSON.stringify(archivedChatIds));
  }, [archivedChatIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('helloto_locked_chats', JSON.stringify(lockedChatIds));
  }, [lockedChatIds]);

  const markAllChatsRead = () => {
    setChats((prev) => prev.map((chat) => ({ ...chat, unreadCount: 0 })));
    setInfo('All chats marked as read');
    setShowConversationMenu(false);
  };

  const toggleArchiveChat = (chatId: string) => {
    setArchivedChatIds((prev) => {
      const next = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [chatId, ...prev];
      return next;
    });
    const chat = chats.find((entry) => entry.id === chatId);
    setInfo(archivedChatIds.includes(chatId) ? `${chat?.title ?? 'Chat'} moved back to chats` : `${chat?.title ?? 'Chat'} archived`);
    setShowConversationMenu(false);
    if (chatFilter !== 'archived' && !archivedChatIds.includes(chatId) && activeChatId === chatId) {
      const nextVisible = chats.find((entry) => entry.id !== chatId && !archivedChatIds.includes(entry.id));
      if (nextVisible) openChat(nextVisible.id);
    }
  };

  const toggleLockChat = (chatId: string) => {
    setLockedChatIds((prev) => {
      const next = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [chatId, ...prev];
      return next;
    });
    const chat = chats.find((entry) => entry.id === chatId);
    setInfo(lockedChatIds.includes(chatId) ? `${chat?.title ?? 'Chat'} unlocked` : `${chat?.title ?? 'Chat'} locked`);
    setShowConversationMenu(false);
  };

  useEffect(() => {
    if (!token || !activeChatId) return;
    setLoadingMessages(true);
    setUnseenNewMessages(0);
    api<{ messages: typeof messages }>(`/chats/${activeChatId}/messages`, { token })
      .then((res) => setMessages(res.messages))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingMessages(false));
  }, [token, activeChatId, api, setMessages, setError]);

  useEffect(() => {
    const pane = messagesPaneRef.current;
    const changedChat = lastActiveChatIdRef.current !== activeChatId;
    const nearBottom = isPaneNearBottom(pane);

    if (changedChat) {
      msgEndRef.current?.scrollIntoView({ behavior: 'auto' });
      setShowScrollToBottom(false);
      setUnseenNewMessages(0);
      lastActiveChatIdRef.current = activeChatId;
      isNearBottomRef.current = true;
      return;
    }

    if (nearBottom || isNearBottomRef.current) {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollToBottom(false);
      setUnseenNewMessages(0);
    }
  }, [timelineBlocks.length, activeChatId]);

  useEffect(() => {
    if (!socket || !me?.id) return;

    const handleNewMessage = (message: (typeof messages)[number]) => {
      const nearBottom = isPaneNearBottom(messagesPaneRef.current);
      const isMine = message.sender.id === me.id;

      setChats((prev) => {
        const exists = prev.some((c) => c.id === message.chatId);
        if (!exists) return prev;
        return prev
          .map((chat) => {
            if (chat.id !== message.chatId) return chat;
            return {
              ...chat,
              updatedAt: message.createdAt,
              lastMessage: {
                text: message.text || (message.mediaName ?? 'Media'),
                createdAt: message.createdAt,
                senderId: message.sender.id,
              },
              unreadCount: isMine || message.chatId === activeChatId ? 0 : chat.unreadCount + 1,
            };
          })
          .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
      });

      if (message.chatId === activeChatId) {
        setMessages((prev) => (prev.some((entry) => entry.id === message.id) ? prev : [...prev, message]));
        if (!isMine && !nearBottom) {
          setShowScrollToBottom(true);
          setUnseenNewMessages((count) => count + 1);
        }
      }
      if (!isMine) {
        playNotification('received');
        if (typeof document !== 'undefined' && document.hidden) {
          void showDesktopNotification(message.sender.name, message.text || message.mediaName || 'New message');
        }
      }
    };

    const handleTypingUpdate = (event: IncomingTypingEvent) => {
      setTypingUsers((prev) => {
        const current = prev[event.chatId] ?? [];
        const next = event.isTyping ? Array.from(new Set([...current, event.userId])) : current.filter((id) => id !== event.userId);
        return { ...prev, [event.chatId]: next };
      });
    };

    const handlePresence = ({ userId, isOnline, lastSeenAt }: PresenceEvent) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (!chat.peer || chat.peer.id !== userId) return chat;
          return { ...chat, peer: { ...chat.peer, isOnline, lastSeenAt } };
        }),
      );
    };

    const handleIncomingCall = (payload: IncomingCall) => {
      if (!payload) return;
      setIncomingCall(payload);
      playNotification('received');
      void showDesktopNotification(`${payload.fromName} is calling`, `${payload.mode === 'video' ? 'Video' : 'Voice'} call incoming`);
    };

    const handleDeletedMessage = (payload: MessageDeletedEvent) => {
      applyDeletedMessageUpdate(payload);
      setSelectedMessageId((current) => (current === payload.messageId ? null : current));
      setInspectMessage((current) => (current?.id === payload.messageId ? null : current));
    };

    const handleAcceptedCall = (payload: { callId: string; byName: string; mode: 'voice' | 'video' }) => {
      if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
      setActiveCall((prev) => {
        if (!prev) return prev;
        updateCallLog(prev.id, (call) => ({ ...call, status: 'completed', answeredAt: new Date().toISOString() }));
        return { ...prev, status: 'connected', startedAt: Date.now() };
      });
      void refreshCalls();
      setInfo(`${payload.byName} accepted your ${payload.mode} call`);
    };

    const handleDeclinedCall = (payload: { callId: string; byName: string; mode: 'voice' | 'video' }) => {
      if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
      setActiveCall((prev) => {
        if (prev) {
          updateCallLog(prev.id, (call) => ({ ...call, status: 'declined', endedAt: new Date().toISOString(), durationSeconds: 0 }));
        }
        return null;
      });
      callStreamRef.current?.getTracks().forEach((track) => track.stop());
      callStreamRef.current = null;
      void refreshCalls();
      setInfo(`${payload.byName} declined your ${payload.mode} call`);
    };

    const handleMissedCall = (payload: { callId: string; fromName: string; fromUserId?: string; mode: 'voice' | 'video'; chatId?: string }) => {
      setIncomingCall(null);
      if (payload.fromUserId) {
        const chat = chats.find((entry) => entry.peer?.id === payload.fromUserId);
        const peer = chat?.peer;
        if (chat && peer) {
          setCalls((prev) => [
            {
              id: `missed-${Date.now()}`,
              chatId: chat.id,
              user: peer,
              mode: payload.mode,
              direction: 'incoming',
              status: 'missed',
              createdAt: new Date().toISOString(),
              answeredAt: null,
              endedAt: new Date().toISOString(),
              durationSeconds: 0,
            },
            ...prev,
          ]);
        }
      }
      void refreshCalls();
      setInfo(`Missed ${payload.mode} call from ${payload.fromName}`);
      void showDesktopNotification('Missed call', `${payload.fromName} tried to call you`);
    };

    const handleEndedCall = (payload: { callId: string; byName: string; mode: 'voice' | 'video'; durationSeconds?: number }) => {
      if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
      setActiveCall((prev) => {
        if (prev) {
          const durationSeconds = prev.status === 'connected' ? Math.max(Math.floor((Date.now() - prev.startedAt) / 1000), 0) : 0;
          updateCallLog(prev.id, (call) => ({ ...call, status: 'completed', endedAt: new Date().toISOString(), durationSeconds }));
        }
        return null;
      });
      callStreamRef.current?.getTracks().forEach((track) => track.stop());
      callStreamRef.current = null;
      setIncomingCall(null);
      void refreshCalls();
      setInfo(`${payload.byName} ended the ${payload.mode} call`);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('presence:update', handlePresence);
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleAcceptedCall);
    socket.on('call:declined', handleDeclinedCall);
    socket.on('call:missed', handleMissedCall);
    socket.on('call:ended', handleEndedCall);
    socket.on('message:deleted', handleDeletedMessage);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('presence:update', handlePresence);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleAcceptedCall);
      socket.off('call:declined', handleDeclinedCall);
      socket.off('call:missed', handleMissedCall);
      socket.off('call:ended', handleEndedCall);
      socket.off('message:deleted', handleDeletedMessage);
    };
  }, [socket, me?.id, activeChatId, setMessages, setTypingUsers, setChats, chats, setCalls, refreshCalls]);

  useEffect(() => {
    if (!socket || !activeChatId) return;
    socket.emit('chat:join', activeChatId);
  }, [socket, activeChatId]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => setCallSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (videoRef.current && callStreamRef.current) {
      videoRef.current.srcObject = callStreamRef.current;
    }
  }, [activeCall]);

  useEffect(() => () => {
    callStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!showConversationMenu) return;
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showConversationMenu && !conversationMenuRef.current?.contains(target)) {
        setShowConversationMenu(false);
      }
    };
    window.addEventListener('pointerdown', handleClickAway);
    return () => window.removeEventListener('pointerdown', handleClickAway);
  }, [showConversationMenu]);

  useEffect(() => {
    if (!selectedMessageId) return;
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!messageActionRef.current?.contains(target)) {
        setSelectedMessageId(null);
      }
    };
    window.addEventListener('pointerdown', handleClickAway);
    return () => window.removeEventListener('pointerdown', handleClickAway);
  }, [selectedMessageId]);

  useEffect(() => {
    setSelectedMessageId(null);
    setInspectMessage(null);
  }, [activeChatId]);

  useEffect(() => {
    if (!showConnectModal) return;
    const focusTimer = window.setTimeout(() => {
      connectIdentifierRef.current?.focus();
    }, 80);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConnectModal(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showConnectModal]);

  const onComposerChange = (nextText: string) => {
    setText(nextText);
    if (!socket || !activeChatId) return;

    if (!nextText.trim()) {
      socket.emit('typing:stop', { chatId: activeChatId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    socket.emit('typing:start', { chatId: activeChatId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { chatId: activeChatId });
    }, 1300);
  };

  const handleMessagesScroll = () => {
    const pane = messagesPaneRef.current;
    if (!pane) return;
    const nearBottom = isPaneNearBottom(pane);
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) setUnseenNewMessages(0);
  };

  const scrollToBottom = () => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollToBottom(false);
    setUnseenNewMessages(0);
    isNearBottomRef.current = true;
  };

  const clearComposerMedia = () => setComposerMedia(null);

  const sendMessage = async () => {
    if (!token || !activeChatId || (!text.trim() && !composerMedia) || sending) return;
    if (lockedChatIds.includes(activeChatId)) {
      setError('Unlock this chat before sending new messages.');
      return;
    }
    setSending(true);
    try {
      const payload = composerMedia
        ? {
            chatId: activeChatId,
            text: text.trim(),
            type: composerMedia.type,
            mediaUrl: composerMedia.mediaUrl,
            mediaName: composerMedia.mediaName,
            mediaMime: composerMedia.mediaMime,
          }
        : {
            chatId: activeChatId,
            text: text.trim(),
            type: 'text',
          };

      const res = await api<{ message: (typeof messages)[number] }>('/messages', {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      });
      setMessages((prev) => (prev.some((entry) => entry.id === res.message.id) ? prev : [...prev, res.message]));
      playNotification('sent');
      setChats((prev) =>
        prev
          .map((chat) =>
            chat.id === activeChatId
              ? {
                  ...chat,
                  updatedAt: res.message.createdAt,
                  lastMessage: {
                    text: res.message.text || res.message.mediaName || 'Media',
                    createdAt: res.message.createdAt,
                    senderId: me?.id ?? '',
                  },
                  unreadCount: 0,
                }
              : chat,
          )
          .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
      );
      setText('');
      setComposerMedia(null);
      setShowEmojiPicker(false);
      socket?.emit('typing:stop', { chatId: activeChatId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const mediaUrl = await readFileAsDataUrl(file);
      const type = messageTypeFromMime(file.type || '');
      setComposerMedia({
        type,
        mediaUrl,
        mediaName: file.name,
        mediaMime: file.type || 'application/octet-stream',
      });
      setInfo(`${file.name} ready to send`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addEmoji = (emojiData: EmojiClickData) => {
    const next = `${text}${emojiData.emoji}`;
    onComposerChange(next);
  };

  const toggleVoice = async () => {
    const mediaError = getMediaSupportError('voice note');
    if (mediaError) {
      setError(mediaError);
      return;
    }

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setInfo('Voice note saved to the composer.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        mediaRecorderRef.current = null;
        if (!blob.size) return;
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' });
        await attachFile(file);
      };
      recorder.start();
      setComposerMedia(null);
      setIsRecording(true);
      setInfo('Recording voice note...');
    } catch (err: unknown) {
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      setIsRecording(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startCall = async (mode: 'voice' | 'video') => {
    if (!activeChat || !activeChat.peer || !socket || !me) return;
    const mediaError = getMediaSupportError('call');
    if (mediaError) {
      setError(mediaError);
      return;
    }
    try {
      const callId = `${Date.now()}`;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video',
      });
      callStreamRef.current?.getTracks().forEach((track) => track.stop());
      callStreamRef.current = stream;
      setActiveCall({ id: callId, chatId: activeChat.id, targetUserId: activeChat.peer.id, mode, title: activeChat.title, startedAt: Date.now(), status: 'ringing' });
      setCalls((prev) => [
        {
          id: callId,
          chatId: activeChat.id,
          user: activeChat.peer ?? me!,
          mode,
          direction: 'outgoing',
          status: 'ringing',
          createdAt: new Date().toISOString(),
          answeredAt: null,
          endedAt: null,
          durationSeconds: 0,
        },
        ...prev,
      ]);
      socket.emit('call:initiate', {
        callId,
        chatId: activeChat.id,
        targetUserId: activeChat.peer.id,
        mode,
        callerName: me.name,
        callerAvatarUrl: me.avatarUrl,
      });
      if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
      outgoingCallTimeoutRef.current = setTimeout(() => {
        socket.emit('call:missed', {
          callId,
          chatId: activeChat.id,
          targetUserId: activeChat.peer!.id,
          mode,
          callerName: me.name,
        });
        callStreamRef.current?.getTracks().forEach((track) => track.stop());
        callStreamRef.current = null;
        updateCallLog(callId, (call) => ({ ...call, status: 'missed', endedAt: new Date().toISOString(), durationSeconds: 0 }));
        setActiveCall(null);
        setInfo(`${activeChat.title} did not answer. Missed call sent.`);
      }, 18000);
      setInfo(`${mode === 'video' ? 'Video' : 'Voice'} call ringing ${activeChat.title}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not start ${mode} call: ${message}`);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall || !socket || !me) return;
    const mediaError = getMediaSupportError('call');
    if (mediaError) {
      setError(mediaError);
      return;
    }
    try {
      const currentIncoming = incomingCall;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: currentIncoming.mode === 'video',
      });
      callStreamRef.current?.getTracks().forEach((track) => track.stop());
      callStreamRef.current = stream;
      const chat = chats.find((entry) => entry.id === currentIncoming.chatId);
      const peer = chat?.peer;
      if (peer) {
        setCalls((prev) => [
          {
            id: currentIncoming.id,
            chatId: currentIncoming.chatId,
            user: peer,
            mode: currentIncoming.mode,
            direction: 'incoming',
            status: 'completed',
            createdAt: new Date().toISOString(),
            answeredAt: new Date().toISOString(),
            endedAt: null,
            durationSeconds: 0,
          },
          ...prev,
        ]);
      }
      socket.emit('call:accept', {
        callId: currentIncoming.id,
        chatId: currentIncoming.chatId,
        targetUserId: currentIncoming.fromUserId,
        mode: currentIncoming.mode,
        answererName: me.name,
      });
      setActiveCall({ id: currentIncoming.id, chatId: currentIncoming.chatId, targetUserId: currentIncoming.fromUserId, mode: currentIncoming.mode, title: currentIncoming.fromName, startedAt: Date.now(), status: 'connected' });
      setIncomingCall(null);
      setInfo(`Connected ${currentIncoming.mode} call with ${currentIncoming.fromName}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const declineIncomingCall = () => {
    if (!incomingCall || !socket || !me) return;
    const chat = chats.find((entry) => entry.id === incomingCall.chatId);
    const peer = chat?.peer;
    if (peer) {
      setCalls((prev) => [
        {
          id: `declined-${Date.now()}`,
          chatId: incomingCall.chatId,
          user: peer,
          mode: incomingCall.mode,
          direction: 'incoming',
          status: 'declined',
          createdAt: new Date().toISOString(),
          answeredAt: null,
          endedAt: new Date().toISOString(),
          durationSeconds: 0,
        },
        ...prev,
      ]);
    }
    socket.emit('call:decline', {
      callId: incomingCall.id ?? `declined-${Date.now()}`,
      chatId: incomingCall.chatId,
      targetUserId: incomingCall.fromUserId,
      mode: incomingCall.mode,
      declinerName: me.name,
    });
    setInfo(`Declined ${incomingCall.mode} call from ${incomingCall.fromName}`);
    setIncomingCall(null);
  };

  const endCall = () => {
    if (outgoingCallTimeoutRef.current) clearTimeout(outgoingCallTimeoutRef.current);
    if (socket && activeChat?.peer && activeCall && me) {
      socket.emit('call:end', {
        callId: activeCall.id,
        chatId: activeChat.id,
        targetUserId: activeChat.peer.id,
        mode: activeCall.mode,
        endedByName: me.name,
        durationSeconds: activeCall.status === 'connected' ? Math.max(Math.floor((Date.now() - activeCall.startedAt) / 1000), 0) : 0,
      });
    }
    if (activeCall) {
      const durationSeconds = activeCall.status === 'connected' ? Math.max(Math.floor((Date.now() - activeCall.startedAt) / 1000), 0) : 0;
      updateCallLog(activeCall.id, (call) => ({ ...call, status: 'completed', endedAt: new Date().toISOString(), durationSeconds }));
    }
      callStreamRef.current?.getTracks().forEach((track) => track.stop());
    callStreamRef.current = null;
    setActiveCall(null);
    setInfo('Call ended');
  };

  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)));
    if (isMobile) setShowMobileChat(true);
  };

  const resetConnectFlow = () => {
    setConnectName('');
    setConnectIdentifier('');
    setLookupResult(null);
    setSelectedMatch(null);
    setContactSaved(false);
    setConnectBusy(false);
  };

  const openConnectModal = () => {
    setShowConversationMenu(false);
    resetConnectFlow();
    setShowConnectModal(true);
  };

  const openProfileDetails = (user: DetailUser | null | undefined) => {
    if (!user) return;
    setDetailUser(user);
  };

  const getMediaSupportError = (feature: 'voice note' | 'call') => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return `${feature === 'call' ? 'Calling' : 'Voice notes'} are not supported in this browser.`;
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `Mobile ${feature === 'call' ? 'calls' : 'voice notes'} need HTTPS. Open HelloToo on a secure https URL, because microphone and camera access are blocked on normal LAN http pages.`;
    }
    return null;
  };

  const updateCallLog = (callId: string, updater: (call: (typeof calls)[number]) => (typeof calls)[number]) => {
    setCalls((prev) => prev.map((call) => (call.id === callId ? updater(call) : call)));
  };

  const createCallSummary = (call: (typeof calls)[number]) => {
    if (call.status === 'missed') return `Missed ${call.mode} call`;
    if (call.status === 'declined') return `${call.mode === 'video' ? 'Video' : 'Voice'} call declined`;
    if (call.status === 'ringing') return `${call.mode === 'video' ? 'Video' : 'Voice'} call`;
    const minutes = Math.floor((call.durationSeconds ?? 0) / 60).toString().padStart(2, '0');
    const seconds = ((call.durationSeconds ?? 0) % 60).toString().padStart(2, '0');
    return `${call.mode === 'video' ? 'Video' : 'Voice'} call • ${minutes}:${seconds}`;
  };

  const lookupContact = async () => {
    if (!token || connectBusy || !connectIdentifier.trim()) return;
    setConnectBusy(true);
    try {
      const res = await api<LookupResult>(`/connections/lookup?identifier=${encodeURIComponent(connectIdentifier.trim())}`, { token });
      setLookupResult(res);
      setSelectedMatch(res.user);
      setContactSaved(false);
      if (!res.user) {
        setInfo('No matching HelloToo account was found for that number or email.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectBusy(false);
    }
  };

  const saveMatchedContact = async () => {
    if (!token || connectBusy || !selectedMatch) return;
    const name = connectName.trim();
    if (!name) {
      setError('Enter the name you want to save for this contact.');
      return;
    }

    setConnectBusy(true);
    try {
      const res = await api<{ contact: (typeof contacts)[number] }>('/contacts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name,
          phoneNumber: selectedMatch.phoneNumber ?? (connectIdentifier.includes('@') ? '' : connectIdentifier.trim()),
          email: selectedMatch.email ?? (connectIdentifier.includes('@') ? connectIdentifier.trim() : ''),
          avatarUrl: selectedMatch.avatarUrl ?? '',
        }),
      });
      setContacts((prev) => {
        const withoutSame = prev.filter((contact) => contact.id !== res.contact.id);
        return [res.contact, ...withoutSame];
      });
      setContactSaved(true);
      setInfo(`Saved ${name}. You can send a chat request now.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectBusy(false);
    }
  };

  const sendChatRequest = async () => {
    if (!token || connectBusy || !selectedMatch) return;
    setConnectBusy(true);
    try {
      await api('/connections/request', {
        method: 'POST',
        token,
        body: JSON.stringify({
          targetUserId: selectedMatch.id,
          aliasName: connectName.trim() || selectedMatch.name,
          phoneNumber: selectedMatch.phoneNumber ?? (connectIdentifier.includes('@') ? '' : connectIdentifier.trim()),
        }),
      });
      setLookupResult((prev) =>
        prev
          ? {
              ...prev,
              existingRequest: { id: 'pending', status: 'pending', direction: 'outgoing' },
            }
          : prev,
      );
      setInfo(`Chat request sent to ${selectedMatch.name}. They can accept it from their People section.`);
      setShowConnectModal(false);
      resetConnectFlow();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectBusy(false);
    }
  };

  const renderMessageBody = (msg: (typeof messages)[number]) => {
    if (msg.type === 'image' && msg.mediaUrl) {
      return (
        <>
          <img className="messageMedia" src={msg.mediaUrl} alt={msg.mediaName || 'image'} />
          {msg.text ? <p className="messageCaption">{msg.text}</p> : null}
        </>
      );
    }
    if (msg.type === 'video' && msg.mediaUrl) {
      return (
        <>
          <video className="messageMedia" src={msg.mediaUrl} controls />
          {msg.text ? <p className="messageCaption">{msg.text}</p> : null}
        </>
      );
    }
    if (msg.type === 'audio' && msg.mediaUrl) {
      return (
        <>
          <audio className="audioPlayer" src={msg.mediaUrl} controls />
          {msg.text ? <p className="messageCaption">{msg.text}</p> : null}
        </>
      );
    }
    if (msg.mediaUrl && msg.type === 'file') {
      return (
        <>
          <a className="fileCard" href={msg.mediaUrl} download={msg.mediaName || 'file'}>
            {msg.mediaName || 'Download file'}
          </a>
          {msg.text ? <p className="messageCaption">{msg.text}</p> : null}
        </>
      );
    }
    return <p>{msg.text || msg.mediaName || 'Media message'}</p>;
  };

  const deleteMessage = async (messageId: string) => {
    if (!token) return;
    try {
      const res = await api<MessageDeletedEvent & { ok: boolean }>(`/messages/${messageId}`, {
        method: 'DELETE',
        token,
      });
      applyDeletedMessageUpdate(res);
      setSelectedMessageId(null);
      setInfo('Message deleted for everyone');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderCallItem = (call: (typeof calls)[number]) => {
    const isMissed = call.status === 'missed';
    const duration = `${Math.floor((call.durationSeconds ?? 0) / 60).toString().padStart(2, '0')}:${((call.durationSeconds ?? 0) % 60).toString().padStart(2, '0')}`;
    return (
      <div className={call.direction === 'outgoing' ? 'messageBubble mine callEventBubble' : 'messageBubble theirs callEventBubble'}>
        <div className="cardText">
          <strong>{createCallSummary(call)}</strong>
          <span>
            {call.direction === 'outgoing' ? 'You called' : `${call.user.name} called`} • {new Date(call.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {call.status === 'completed' ? <span>Duration {duration}</span> : null}
        </div>
        <div className="contactActions">
          {isMissed && (
            <button className="ghostBtn smallGhost" onClick={() => void startCall(call.mode)}>
              Call back
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMessageGroup = (group: Extract<TimelineBlock, { kind: 'message-group' }>) => (
    <div key={group.id} className={group.mine ? 'timelineRow mineTimelineRow' : 'timelineRow theirsTimelineRow'}>
      <div className={group.mine ? 'messageGroup mineGroup' : 'messageGroup theirsGroup'}>
      {!group.mine && group.senderName ? <div className="senderName">{group.senderName}</div> : null}
      {group.messages.map((message, index) => {
        const isLast = index === group.messages.length - 1;
        return (
          <div
            key={message.id}
            className={`${group.mine ? 'messageBubble mine' : 'messageBubble theirs'} ${isLast ? 'tailBubble' : 'stackBubble'}`}
            onClick={() => setSelectedMessageId((current) => (current === message.id ? null : message.id))}
          >
            {renderMessageBody(message)}
            {selectedMessageId === message.id ? (
              <div className="messageActionPanel" ref={messageActionRef}>
                {group.mine ? (
                  <button type="button" className="messageActionBtn" onClick={(event) => {
                    event.stopPropagation();
                    setInspectMessage(message);
                  }}>
                    Inspect
                  </button>
                ) : null}
                {group.mine ? (
                  <button type="button" className="messageActionBtn deleteMessageBtn" onClick={(event) => {
                    event.stopPropagation();
                    void deleteMessage(message.id);
                  }}>
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="messageMeta">
              <span className="messageStamp">{fmtTime(message.createdAt)}</span>
              {group.mine ? <span className={message.receipt?.status === 'read' ? 'readStamp' : ''}>{message.receipt?.status ?? 'sent'}</span> : null}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );

  if (!token || !me) return null;

  return (
    <div className="mobileSplit">
      <section className={showMobileChat ? 'screenPane chatSidebarPane hiddenMobile' : 'screenPane chatSidebarPane'}>
        <div className="waPaneHeader">
          <div className="sectionTitleRow">
            <h2>Chats</h2>
            <div className="waPaneActions">
              <button className="waPaneActionBtn" onClick={openConnectModal} aria-label="Add contact">+</button>
            </div>
          </div>
          <p className="chatSectionHeaderCopy">{filteredChats.length} conversations ready{unreadChats ? ` - ${unreadChats} unread` : ''}</p>
        </div>
        <input
          className="input searchInput"
          placeholder="Search or start new chat"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chatFilterRow">
          <button className={chatFilter === 'all' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('all')}>
            All
          </button>
          <button className={chatFilter === 'unread' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('unread')}>
            Unread {unreadChats ? `(${unreadChats})` : ''}
          </button>
          <button className={chatFilter === 'groups' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('groups')}>
            Groups {groupChats ? `(${groupChats})` : ''}
          </button>
          <button className={chatFilter === 'archived' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('archived')}>
            Archived {archivedChats ? `(${archivedChats})` : ''}
          </button>
          <button className={chatFilter === 'locked' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('locked')}>
            Locked {lockedChats ? `(${lockedChats})` : ''}
          </button>
        </div>

        <div className="chatList">
          {filteredChats.length ? filteredChats.map((chat) => (
            <button key={chat.id} className={chat.id === activeChatId ? 'chatCard activeCard' : 'chatCard'} onClick={() => openChat(chat.id)}>
              <div className="rowStart">
                <Avatar name={chat.title} avatarUrl={chat.avatarUrl} group={chat.isGroup} />
                <div className="cardText">
                  <strong>{chat.title}</strong>
                  <span>{chat.lastMessage?.text || (chat.peer ? lastSeen(chat.peer) : 'No messages yet')}</span>
                  <div className="chatCardFlags">
                    {archivedChatIds.includes(chat.id) ? <span className="chatStatePill">Archived</span> : null}
                    {lockedChatIds.includes(chat.id) ? <span className="chatStatePill lockedStatePill">Locked</span> : null}
                  </div>
                  {chat.peer ? <span className="presenceLine">{chat.peer.isOnline ? 'online' : lastSeen(chat.peer)}</span> : null}
                  <span className="tapHint">Tap to open chat</span>
                </div>
              </div>
              <div className="cardMeta">
                <p>{chat.lastMessage?.createdAt ? fmtTime(chat.lastMessage.createdAt) : ''}</p>
                <div className="chatMetaLine">
                  {chat.peer?.isOnline ? <span className="statusDot onlineDot" /> : <span className="statusDot offlineDot" />}
                  {chat.unreadCount > 0 ? <span className="unreadBadge">{chat.unreadCount}</span> : null}
                </div>
              </div>
            </button>
          )) : <div className="compactEmpty chatListEmpty">No chats match this search yet.</div>}
        </div>
      </section>

      <section className={showMobileChat ? 'screenPane chatScreen chatConversationPane' : 'screenPane chatScreen chatConversationPane hiddenMobile'}>
        {activeChat ? (
          <>
            <div className="chatTop">
              <div className="rowStart">
                {isMobile ? (
                  <button className="ghostBtn backBtn" onClick={() => setShowMobileChat(false)}>
                    Back
                  </button>
                ) : null}
                <button
                  className="avatarTrigger"
                  onClick={() =>
                    openProfileDetails(
                      activeChat.peer
                        ? {
                            name: activeChat.peer.name,
                            avatarUrl: activeChat.peer.avatarUrl,
                            phoneNumber: activeChat.peer.phoneNumber,
                            email: activeChat.peer.email,
                            statusText: activeChat.peer.statusText,
                            bio: activeChat.peer.bio,
                            isOnline: activeChat.peer.isOnline,
                            lastSeenAt: activeChat.peer.lastSeenAt,
                          }
                        : {
                            name: activeChat.title,
                            avatarUrl: activeChat.avatarUrl,
                            statusText: activeChat.isGroup ? `${activeChat.members.length} members in this chat` : 'Conversation details',
                          },
                    )
                  }
                  aria-label="Open chat details"
                >
                  <Avatar name={activeChat.title} avatarUrl={activeChat.avatarUrl} group={activeChat.isGroup} />
                </button>
                <div className="cardText">
                  <strong>{activeChat.title}</strong>
                  <span className="presenceLine">
                    {activeTypingUsers.length
                      ? 'typing...'
                      : activeChat.peer
                        ? lastSeen(activeChat.peer)
                        : activeChat.isGroup
                          ? `${activeChat.members.length} members active`
                          : 'offline'}
                  </span>
                </div>
              </div>
              <div className="contactActions callActionRow">
                <button className="ghostBtn smallGhost callActionBtn voiceActionBtn" onClick={() => void startCall('voice')}>
                  <span className="callActionIcon" aria-hidden="true">AU</span>
                  <span className="callActionText">
                    <strong>Voice</strong>
                    <small>Audio call</small>
                  </span>
                </button>
                <button className="ghostBtn smallGhost callActionBtn videoActionBtn" onClick={() => void startCall('video')}>
                  <span className="callActionIcon" aria-hidden="true">VD</span>
                  <span className="callActionText">
                    <strong>Video</strong>
                    <small>Face to face</small>
                  </span>
                </button>
                <div className="chatMenuWrap" ref={conversationMenuRef}>
                  <button
                    className="ghostBtn smallGhost menuToggleBtn"
                    onClick={() => setShowConversationMenu((value) => !value)}
                    aria-label="Chat options"
                    aria-expanded={showConversationMenu}
                  >
                    ...
                  </button>
                  {showConversationMenu ? (
                    <div className="chatMenuPanel">
                      <button className="chatMenuItem" onClick={openConnectModal}>
                        Add contact
                      </button>
                      <button className="chatMenuItem" onClick={markAllChatsRead}>
                        Mark all as read
                      </button>
                      <button className="chatMenuItem" onClick={() => activeChat && toggleArchiveChat(activeChat.id)}>
                        {activeChatArchived ? 'Unarchive chat' : 'Archive chat'}
                      </button>
                      <button className="chatMenuItem" onClick={() => activeChat && toggleLockChat(activeChat.id)}>
                        {activeChatLocked ? 'Unlock chat' : 'Lock chat'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {activeChatArchived ? (
              <div className="privacyBar chatStateBanner">
                This chat is archived. It stays hidden from your main chat list until you unarchive it.
              </div>
            ) : null}

            {activeChatLocked ? (
              <div className="privacyBar chatStateBanner lockedBanner">
                This chat is locked. Unlock it from the menu to send new messages again.
              </div>
            ) : null}

            {activeCall ? (
              <div className="callPanel">
                <div className="callPanelHeader">
                  <div className="callHeroBadge">{activeCall.mode === 'video' ? 'VIDEO' : 'VOICE'}</div>
                  <div className="cardText">
                    <strong>{activeCall.mode === 'video' ? 'Video call' : 'Voice call'} with {activeCall.title}</strong>
                    <span>
                      {activeCall.status === 'ringing'
                        ? 'Ringing...'
                        : `${Math.floor(callSeconds / 60).toString().padStart(2, '0')}:${(callSeconds % 60).toString().padStart(2, '0')}`}
                    </span>
                  </div>
                </div>
                {activeCall.mode === 'video' ? <video ref={videoRef} className="callPreview" autoPlay muted playsInline /> : null}
                <div className="callPanelActions">
                  <button className="primaryBtn endCallBtn" onClick={endCall}>End call</button>
                </div>
              </div>
            ) : null}

            {incomingCall ? (
              <div className="callPanel incomingCallPanel">
                <div className="rowStart incomingCallHeader">
                  <Avatar name={incomingCall.fromName} avatarUrl={incomingCall.fromAvatarUrl} />
                  <div className="cardText">
                    <strong>{incomingCall.fromName}</strong>
                    <span>{incomingCall.mode === 'video' ? 'Incoming video call' : 'Incoming voice call'}</span>
                  </div>
                </div>
                <div className="contactActions callPanelActions">
                  <button className="ghostBtn smallGhost declineCallBtn" onClick={declineIncomingCall}>
                    Reject
                  </button>
                  <button className="primaryBtn smallGhost acceptCallBtn" onClick={() => void acceptIncomingCall()}>
                    Accept
                  </button>
                </div>
              </div>
            ) : null}

            <div className="messagesPaneWrap chatWallpaperPane">
            <div className="messagesPane" ref={messagesPaneRef} onScroll={handleMessagesScroll}>
              {loadingMessages ? <div className="typingPill">Loading messages...</div> : null}
              {!loadingMessages && timelineItems.length === 0 ? <div className="typingPill">No messages yet. Say hi.</div> : null}
              {timelineBlocks.map((item) => {
                if (item.kind === 'date') {
                  return (
                    <div key={item.id} className="timelineDateDivider">
                      <span>{item.label}</span>
                    </div>
                  );
                }
                if (item.kind === 'message-group') {
                  return renderMessageGroup(item);
                }
                return (
                  <div key={item.id} className={item.call.direction === 'outgoing' ? 'timelineRow mineTimelineRow' : 'timelineRow theirsTimelineRow'}>
                    {renderCallItem(item.call)}
                  </div>
                );
              })}
              {activeTypingUsers.length ? <div className="typingPill">Typing...</div> : null}
              <div ref={msgEndRef} />
            </div>
            {showScrollToBottom ? (
              <button className="scrollToBottomBtn" onClick={scrollToBottom} aria-label="Scroll to latest messages">
                {unseenNewMessages > 0 ? `${unseenNewMessages} new messages` : 'Newest'}
              </button>
            ) : null}
            </div>

            <MessageComposer
              text={text}
              onTextChange={onComposerChange}
              composerMedia={composerMedia}
              onClearMedia={clearComposerMedia}
              onSendMessage={() => void sendMessage()}
              onAttachFile={attachFile}
              onToggleEmoji={() => setShowEmojiPicker((value) => !value)}
              onToggleVoice={() => void toggleVoice()}
              showEmojiPicker={showEmojiPicker}
              isRecording={isRecording}
              sending={sending}
              addEmoji={addEmoji}
            />
          </>
        ) : (
          <div className="emptyPanel">
            <div>
              <h3>Your conversation hub is ready</h3>
              <p>Select a chat to start talking, or create a contact first if your list is still empty.</p>
              <div className="contactActions centerActions">
                <button className="ghostBtn" onClick={openConnectModal}>
                  Add Contact
                </button>
                <button
                  className="primaryBtn"
                  onClick={() => {
                    if (chats.length) openChat(chats[0].id);
                    else setInfo('Create a contact first to start chatting');
                  }}
                >
                  Open first chat
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {showConnectModal ? (
        <div className="modalScrim" onClick={() => setShowConnectModal(false)}>
          <div className="connectModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Add Contact To Chat</h2>
              <button className="ghostBtn smallGhost" onClick={() => setShowConnectModal(false)}>
                Close
              </button>
            </div>
            <p className="miniText">
              Search by mobile number or Gmail. When a match appears, add your saved contact name first, then send a chat request.
            </p>

            <div className="formGrid">
              <label className="field">
                <span>Your contact name</span>
                <input
                  className="input"
                  placeholder="Enter the name you want to save"
                  value={connectName}
                  onChange={(event) => setConnectName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Mobile number or email</span>
                <div className="composerInputRow">
                  <input
                    ref={connectIdentifierRef}
                    className="input"
                    placeholder="Enter phone number or Gmail"
                    value={connectIdentifier}
                    onChange={(event) => setConnectIdentifier(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void lookupContact();
                    }}
                  />
                  <button className="ghostBtn" onClick={() => void lookupContact()} disabled={connectBusy || !connectIdentifier.trim()}>
                    {connectBusy ? 'Checking...' : 'Check'}
                  </button>
                </div>
              </label>
            </div>

            {selectedMatch ? (
              <button type="button" className="requestCard chatMatchCard" onClick={() => setSelectedMatch(selectedMatch)}>
                <div className="rowStart">
                  <Avatar name={selectedMatch.name} avatarUrl={selectedMatch.avatarUrl} />
                  <div className="cardText">
                    <strong>{selectedMatch.name}</strong>
                    <span>{selectedMatch.phoneNumber || selectedMatch.email || `@${selectedMatch.username}`}</span>
                  </div>
                </div>
                <div className="cardText">
                  <strong>Matched account</strong>
                  <span>{selectedMatch.statusText || `@${selectedMatch.username}`}</span>
                </div>
              </button>
            ) : lookupResult ? (
              <div className="compactEmpty">No matching account found yet for that number or email.</div>
            ) : null}

            {selectedMatch ? (
              <div className="requestCard">
                <div className="cardText">
                  <strong>Connection flow</strong>
                  <span>
                    {lookupResult?.existingContact
                      ? 'You are already connected with this person.'
                      : lookupResult?.existingRequest
                        ? lookupResult.existingRequest.direction === 'incoming'
                          ? 'This person already sent you a request. Accept it from the People section.'
                          : 'A chat request is already pending for this person.'
                        : contactSaved
                          ? 'Contact saved. Send the request and wait for them to accept.'
                          : 'Add the contact first. Then the chat request button becomes available.'}
                  </span>
                </div>
                <div className="contactActions">
                  <button
                    className="ghostBtn"
                    onClick={() => void saveMatchedContact()}
                    disabled={connectBusy || lookupResult?.existingContact || Boolean(lookupResult?.existingRequest)}
                  >
                    {contactSaved ? 'Added' : 'Add contact'}
                  </button>
                  <button
                    className="primaryBtn"
                    onClick={() => void sendChatRequest()}
                    disabled={connectBusy || !contactSaved || lookupResult?.existingContact || Boolean(lookupResult?.existingRequest)}
                  >
                    Send chat request
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {detailUser ? (
        <div className="modalScrim" onClick={() => setDetailUser(null)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Contact Details</h2>
              <button className="ghostBtn smallGhost" onClick={() => setDetailUser(null)}>
                Close
              </button>
            </div>
            <div className="profileDetailHero">
              <Avatar name={detailUser.name} avatarUrl={detailUser.avatarUrl} size={86} />
              <div className="cardText">
                <strong>{detailUser.name}</strong>
                <span>{detailUser.statusText || 'HelloToo user'}</span>
                <span>{detailUser.isOnline ? 'online now' : detailUser.lastSeenAt ? `last seen ${new Date(detailUser.lastSeenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'offline'}</span>
              </div>
            </div>
            <div className="detailInfoGrid">
              <div className="detailInfoCard">
                <strong>Mobile</strong>
                <span>{detailUser.phoneNumber || 'Not shared'}</span>
              </div>
              <div className="detailInfoCard">
                <strong>Email</strong>
                <span>{detailUser.email || 'Not shared'}</span>
              </div>
              <div className="detailInfoCard detailInfoWide">
                <strong>About</strong>
                <span>{detailUser.bio || detailUser.statusText || 'No extra details yet.'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {inspectMessage ? (
        <div className="modalScrim" onClick={() => setInspectMessage(null)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Message Info</h2>
              <button className="ghostBtn smallGhost" onClick={() => setInspectMessage(null)}>
                Close
              </button>
            </div>
            <div className="detailInfoGrid">
              <div className="detailInfoCard">
                <strong>Status</strong>
                <span>{inspectMessage.receipt?.status ?? 'sent'}</span>
              </div>
              <div className="detailInfoCard">
                <strong>Sent at</strong>
                <span>{new Date(inspectMessage.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="detailInfoCard">
                <strong>Delivered</strong>
                <span>{inspectMessage.receipt?.deliveredTo ?? 0} user(s)</span>
              </div>
              <div className="detailInfoCard">
                <strong>Read</strong>
                <span>{inspectMessage.receipt?.readBy ?? 0} user(s)</span>
              </div>
              <div className="detailInfoCard detailInfoWide">
                <strong>Message</strong>
                <span>{inspectMessage.text || inspectMessage.mediaName || 'Media message'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
