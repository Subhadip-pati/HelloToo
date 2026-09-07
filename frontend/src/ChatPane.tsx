import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import { Avatar, fmtDate, fmtTime, lastSeen, messageTypeFromMime, playNotification, readFileAsDataUrl, showDesktopNotification } from './App';
import type { Message, CallLog } from './types';
import { useApp } from './AppContext';
import { MessageComposer } from './MessageComposer';
import './index.css';

type IncomingTypingEvent = { chatId: string; userId: string; isTyping: boolean };
type PresenceEvent = { userId: string; isOnline: boolean; lastSeenAt: string | null };
type ChatReadEvent = { chatId: string; userId: string; readAt: string };
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
  id?: string;
  name: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  statusText?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};
type ReportDetailTarget = DetailUser | null;
type BlockTarget = DetailUser | null;
type ChatLockConfig = {
  pinHash: string;
  passwordHash: string;
};

const defaultChatLockConfig: ChatLockConfig = {
  pinHash: '',
  passwordHash: '',
};

const reportReasons = [
  'Spam messages',
  'Fraud or scam',
  'Abusive behaviour',
  'Unwanted messages',
  'Fake profile',
] as const;
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

const formatGroupSubtitle = (names: string[]) => {
  if (!names.length) return 'Group conversation';
  if (names.length <= 6) return names.join(', ');
  return `${names.slice(0, 6).join(', ')}...`;
};

export function ChatPane({ isSectionActive = true }: { isSectionActive?: boolean }) {
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
    setToken,
    setMe,
    setInfo,
    setError,
    setChatNotification,
    notificationHistory,
    removeNotificationEntry,
    clearNotificationHistory,
    saveConnectionRecordFromUser,
    connectionRecords,
    removeConnectionRecord,
    calls,
    setCalls,
    refreshCalls,
    updateNotice,
    applyStoredUpdate,
    dismissStoredUpdate,
    hashLockSecret,
    lockApp,
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
  const [showChatsMenu, setShowChatsMenu] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [connectIdentifier, setConnectIdentifier] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<LookupUser | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [detailUser, setDetailUser] = useState<DetailUser | null>(null);
  const [reportDetailTarget, setReportDetailTarget] = useState<ReportDetailTarget>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget>(null);
  const [blockReason, setBlockReason] = useState('');
  const [reportReasonDetail, setReportReasonDetail] = useState('');
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
  const [lockedChatIds, setLockedChatIds] = useState<string[]>([]);
  const [chatLockConfig, setChatLockConfig] = useState<ChatLockConfig>(defaultChatLockConfig);
  const [lockedChatsUnlocked, setLockedChatsUnlocked] = useState(false);
  const [pendingLockChatId, setPendingLockChatId] = useState<string | null>(null);
  const [showChatLockSetupModal, setShowChatLockSetupModal] = useState(false);
  const [showChatUnlockModal, setShowChatUnlockModal] = useState(false);
  const [chatLockMode, setChatLockMode] = useState<'pin' | 'password'>('pin');
  const [chatLockSecret, setChatLockSecret] = useState('');
  const [chatLockConfirmSecret, setChatLockConfirmSecret] = useState('');
  const [showChatLockSecret, setShowChatLockSecret] = useState(false);
  const [showChatLockConfirmSecret, setShowChatLockConfirmSecret] = useState(false);
  const [chatUnlockSecret, setChatUnlockSecret] = useState('');
  const [showChatUnlockSecret, setShowChatUnlockSecret] = useState(false);

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
  const chatsMenuRef = useRef<HTMLDivElement>(null);
  const messageActionRef = useRef<HTMLDivElement>(null);
  const connectIdentifierRef = useRef<HTMLInputElement>(null);
  const outgoingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousTimelineLengthRef = useRef(0);

  const getLockedChatIdsStorageKey = useCallback((userId: string) => `helloto_locked_chats_${userId}`, []);
  const getChatLockConfigStorageKey = useCallback((userId: string) => `helloto_chat_lock_config_${userId}`, []);
  const getChatLockSessionKey = useCallback((userId: string) => `helloto_chat_lock_open_${userId}`, []);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId]);
  const blockedUserIds = useMemo(
    () => new Set(connectionRecords.filter((record) => record.disposition === 'blocked').map((record) => record.userId)),
    [connectionRecords],
  );
  const filteredChats = useMemo(
    () => chats.filter((chat) => {
      const matchesSearch = chat.title.toLowerCase().includes(search.trim().toLowerCase());
      if (!matchesSearch) return false;
      if (chat.peer?.id && blockedUserIds.has(chat.peer.id)) return false;
      const isArchived = archivedChatIds.includes(chat.id);
      const isLocked = lockedChatIds.includes(chat.id);
      if (chatFilter === 'archived') return isArchived;
      if (chatFilter === 'locked') return isLocked;
      if (isArchived) return false;
      if (chatFilter === 'unread') return chat.unreadCount > 0;
      if (chatFilter === 'groups') return chat.isGroup;
      return true;
    }),
    [chats, search, chatFilter, archivedChatIds, lockedChatIds, blockedUserIds],
  );
  const unreadChats = useMemo(() => chats.reduce((count, chat) => count + chat.unreadCount, 0), [chats]);
  const groupChats = useMemo(() => chats.filter((chat) => chat.isGroup).length, [chats]);
  const archivedChats = useMemo(() => chats.filter((chat) => archivedChatIds.includes(chat.id)).length, [chats, archivedChatIds]);
  const lockedChats = useMemo(() => chats.filter((chat) => lockedChatIds.includes(chat.id)).length, [chats, lockedChatIds]);
  const hasLockedSection = useMemo(() => lockedChats > 0 || Boolean(chatLockConfig.pinHash || chatLockConfig.passwordHash), [lockedChats, chatLockConfig.passwordHash, chatLockConfig.pinHash]);
  const notificationCount = notificationHistory.length;
  const notificationGroups = useMemo(() => {
    const groups = new Map<string, typeof notificationHistory>();
    notificationHistory.forEach((entry) => {
      const dayLabel = new Date(entry.createdAt).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const current = groups.get(dayLabel) ?? [];
      current.push(entry);
      groups.set(dayLabel, current);
    });
    return Array.from(groups.entries());
  }, [notificationHistory]);
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
  const activeTypingNames = useMemo(() => {
    if (!activeTypingUsers.length || !activeChat) return [];
    const roster = activeChat.isGroup
      ? activeChat.members
      : activeChat.peer
        ? [activeChat.peer]
        : [];
    return activeTypingUsers
      .map((userId) => roster.find((user) => user.id === userId)?.name)
      .filter((name): name is string => Boolean(name));
  }, [activeTypingUsers, activeChat]);
  const activeTypingLabel = useMemo(() => {
    if (!activeTypingNames.length) return '';
    if (activeTypingNames.length === 1) return `${activeTypingNames[0]} is typing...`;
    if (activeTypingNames.length === 2) return `${activeTypingNames[0]} and ${activeTypingNames[1]} are typing...`;
    return `${activeTypingNames[0]} and others are typing...`;
  }, [activeTypingNames]);
  const activeChatSubtitle = useMemo(() => {
    if (!activeChat) return '';
    if (activeTypingLabel) return activeTypingLabel;
    if (activeChat.peer) return lastSeen(activeChat.peer);
    if (activeChat.isGroup) return formatGroupSubtitle(activeChat.members.map((member) => member.name));
    return 'offline';
  }, [activeChat, activeTypingLabel]);
  const chatPaneTitle = chatFilter === 'archived' ? 'Archived' : chatFilter === 'locked' ? 'Locked chats' : isMobile ? 'HelloToo' : 'Chats';
  const chatPaneDescription = chatFilter === 'archived'
    ? 'These chats stay archived when new messages arrive.'
    : chatFilter === 'locked'
      ? 'Protected conversations stay hidden until you verify them.'
      : '';
  const activeChatArchived = activeChat ? archivedChatIds.includes(activeChat.id) : false;
  const activeChatLocked = activeChat ? lockedChatIds.includes(activeChat.id) : false;
  const canViewLockedChats = !chatLockConfig.pinHash && !chatLockConfig.passwordHash ? true : lockedChatsUnlocked;
  const activeChatBlocked = Boolean(activeChat?.peer?.id && blockedUserIds.has(activeChat.peer.id));
  const activeBlockedRecord = useMemo(
    () => activeChat?.peer?.id
      ? connectionRecords.find((record) => record.disposition === 'blocked' && record.userId === activeChat.peer?.id) ?? null
      : null,
    [activeChat?.peer?.id, connectionRecords],
  );

  const loadActiveChatMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!token || !activeChatId) return;
    if (!options?.silent) setLoadingMessages(true);
    try {
      const res = await api<{ messages: Message[] }>(`/chats/${activeChatId}/messages`, { token });
      setMessages(res.messages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!options?.silent) setLoadingMessages(false);
    }
  }, [token, activeChatId, api, setMessages, setError]);

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
    if (!me?.id) return;
    window.localStorage.setItem(getLockedChatIdsStorageKey(me.id), JSON.stringify(lockedChatIds));
    window.dispatchEvent(new CustomEvent('helloto:chat-lock-updated'));
  }, [getLockedChatIdsStorageKey, lockedChatIds, me?.id]);

  useEffect(() => {
    if (!me?.id) {
      setLockedChatIds([]);
      setChatLockConfig(defaultChatLockConfig);
      setLockedChatsUnlocked(false);
      return;
    }
    try {
      const savedIds = window.localStorage.getItem(getLockedChatIdsStorageKey(me.id));
      setLockedChatIds(savedIds ? JSON.parse(savedIds) as string[] : []);
    } catch {
      setLockedChatIds([]);
    }
    try {
      const savedConfig = window.localStorage.getItem(getChatLockConfigStorageKey(me.id));
      const nextConfig = savedConfig ? { ...defaultChatLockConfig, ...JSON.parse(savedConfig) as Partial<ChatLockConfig> } : defaultChatLockConfig;
      setChatLockConfig(nextConfig);
      setLockedChatsUnlocked(!(nextConfig.pinHash || nextConfig.passwordHash) || sessionStorage.getItem(getChatLockSessionKey(me.id)) === '1');
    } catch {
      setChatLockConfig(defaultChatLockConfig);
      setLockedChatsUnlocked(true);
    }
  }, [getChatLockConfigStorageKey, getChatLockSessionKey, getLockedChatIdsStorageKey, me?.id]);

  useEffect(() => {
    const syncChatLockState = () => {
      if (!me?.id) return;
      try {
        const savedIds = window.localStorage.getItem(getLockedChatIdsStorageKey(me.id));
        setLockedChatIds(savedIds ? JSON.parse(savedIds) as string[] : []);
      } catch {
        setLockedChatIds([]);
      }
      try {
        const savedConfig = window.localStorage.getItem(getChatLockConfigStorageKey(me.id));
        const nextConfig = savedConfig ? { ...defaultChatLockConfig, ...JSON.parse(savedConfig) as Partial<ChatLockConfig> } : defaultChatLockConfig;
        setChatLockConfig(nextConfig);
        setLockedChatsUnlocked(!(nextConfig.pinHash || nextConfig.passwordHash) || sessionStorage.getItem(getChatLockSessionKey(me.id)) === '1');
      } catch {
        setChatLockConfig(defaultChatLockConfig);
      }
    };

    window.addEventListener('helloto:chat-lock-updated', syncChatLockState as EventListener);
    window.addEventListener('storage', syncChatLockState);
    return () => {
      window.removeEventListener('helloto:chat-lock-updated', syncChatLockState as EventListener);
      window.removeEventListener('storage', syncChatLockState);
    };
  }, [getChatLockConfigStorageKey, getChatLockSessionKey, getLockedChatIdsStorageKey, me?.id]);

  const markAllChatsRead = () => {
    setChats((prev) => prev.map((chat) => ({ ...chat, unreadCount: 0 })));
    setInfo('All chats marked as read');
    setShowConversationMenu(false);
  };

  const openNewGroup = () => {
    setChatFilter('groups');
    setShowChatsMenu(false);
    setInfo('Group creation setup will be added here next. For now, your group chats are filtered in the list.');
  };

  const openStarredMessages = () => {
    setShowChatsMenu(false);
    setInfo('Starred messages view will be added here next.');
  };

  const selectChats = () => {
    setShowChatsMenu(false);
    setInfo('Select chats mode will be added here next.');
  };

  const markAllChatsReadFromMenu = () => {
    setChats((prev) => prev.map((chat) => ({ ...chat, unreadCount: 0 })));
    setInfo('All chats marked as read');
    setShowChatsMenu(false);
  };

  const lockWholeApp = () => {
    setShowChatsMenu(false);
    lockApp();
    setInfo('App locked');
  };

  const logoutNow = () => {
    sessionStorage.removeItem('helloto_session_token');
    localStorage.removeItem('helloto_saved_account_token');
    setShowChatsMenu(false);
    setToken('');
    setMe(null);
  };

  const openArchivedSection = () => {
    setChatFilter('archived');
    setShowChatsMenu(false);
    setInfo('Showing archived chats');
  };

  const openLockedSection = () => {
    if (!canViewLockedChats && (chatLockConfig.pinHash || chatLockConfig.passwordHash)) {
      setShowChatUnlockModal(true);
      setShowChatsMenu(false);
      return;
    }
    setChatFilter('locked');
    setShowChatsMenu(false);
    setInfo('Showing locked chats');
  };

  const openAllChatsSection = () => {
    setChatFilter('all');
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
    const chat = chats.find((entry) => entry.id === chatId);
    const isLocked = lockedChatIds.includes(chatId);
    if (isLocked) {
      if (!canViewLockedChats) {
        setPendingLockChatId(chatId);
        setShowChatUnlockModal(true);
        return;
      }
      setLockedChatIds((prev) => prev.filter((id) => id !== chatId));
      setInfo(`${chat?.title ?? 'Chat'} removed from locked chats`);
      return;
    }
    if (!chatLockConfig.pinHash && !chatLockConfig.passwordHash) {
      setPendingLockChatId(chatId);
      setChatLockMode('pin');
      setChatLockSecret('');
      setChatLockConfirmSecret('');
      setShowChatLockSecret(false);
      setShowChatLockConfirmSecret(false);
      setShowChatLockSetupModal(true);
      return;
    }
    if (!canViewLockedChats) {
      setPendingLockChatId(chatId);
      setShowChatUnlockModal(true);
      return;
    }
    setLockedChatIds((prev) => [chatId, ...prev]);
    setInfo(`${chat?.title ?? 'Chat'} moved to locked chats`);
    setShowConversationMenu(false);
  };

  useEffect(() => {
    setUnseenNewMessages(0);
    void loadActiveChatMessages();
  }, [activeChatId, loadActiveChatMessages]);

  useEffect(() => {
    if (!token || !activeChatId) return;

    const refreshReceipts = () => {
      void loadActiveChatMessages({ silent: true });
    };

    const interval = window.setInterval(refreshReceipts, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshReceipts();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, activeChatId, loadActiveChatMessages]);

  useEffect(() => {
    const pane = messagesPaneRef.current;
    const changedChat = lastActiveChatIdRef.current !== activeChatId;
    const previousTimelineLength = previousTimelineLengthRef.current;
    const timelineExpanded = timelineBlocks.length > previousTimelineLength;
    const nearBottom = isPaneNearBottom(pane);

    if (changedChat) {
      msgEndRef.current?.scrollIntoView({ behavior: 'auto' });
      setShowScrollToBottom(false);
      setUnseenNewMessages(0);
      lastActiveChatIdRef.current = activeChatId;
      isNearBottomRef.current = true;
      previousTimelineLengthRef.current = timelineBlocks.length;
      return;
    }

    if (timelineExpanded && (nearBottom || isNearBottomRef.current)) {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollToBottom(false);
      setUnseenNewMessages(0);
    }
    previousTimelineLengthRef.current = timelineBlocks.length;
  }, [activeChatId, loadingMessages, timelineBlocks.length]);

  useEffect(() => {
    if (!socket || !me?.id) return;

    const handleNewMessage = (message: (typeof messages)[number]) => {
      if (blockedUserIds.has(message.sender.id)) return;
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
        setChatNotification((current) => {
          const nextPreview = message.text || message.mediaName || 'New message';
          if (current?.chatId === message.chatId) {
            return {
              ...current,
              senderName: message.sender.name,
              senderAvatarUrl: message.sender.avatarUrl ?? null,
              preview: nextPreview,
              unreadCount: current.unreadCount + 1,
            };
          }
          const existingUnread = chats.find((chat) => chat.id === message.chatId)?.unreadCount ?? 0;
          return {
            chatId: message.chatId,
            senderName: message.sender.name,
            senderAvatarUrl: message.sender.avatarUrl ?? null,
            preview: nextPreview,
            unreadCount: Math.max(existingUnread + (message.chatId === activeChatId ? 0 : 1), 1),
          };
        });
        if (typeof document !== 'undefined' && (document.hidden || !isSectionActive)) {
          void showDesktopNotification('HelloToo', `${message.sender.name}: ${message.text || message.mediaName || 'New message'}`, {
            icon: message.sender.avatarUrl ?? undefined,
            tag: `chat-${message.chatId}`,
            onClick: () => {
              window.dispatchEvent(new CustomEvent('helloto:open-chat', { detail: { chatId: message.chatId } }));
            },
          });
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
      let shouldRefreshReceipts = false;
      setChats((prev) =>
        prev.map((chat) => {
          if (!chat.peer || chat.peer.id !== userId) return chat;
          if (chat.id === activeChatId && isOnline) shouldRefreshReceipts = true;
          return { ...chat, peer: { ...chat.peer, isOnline, lastSeenAt } };
        }),
      );

      if (!shouldRefreshReceipts && isOnline && activeChatId) {
        const activeChatEntry = chats.find((chat) => chat.id === activeChatId);
        if (activeChatEntry?.isGroup && activeChatEntry.members.some((member) => member.id === userId)) {
          shouldRefreshReceipts = true;
        }
      }

      if (shouldRefreshReceipts) {
        void loadActiveChatMessages({ silent: true });
      }
    };

    const handleChatRead = ({ chatId, userId }: ChatReadEvent) => {
      if (userId === me.id) return;
      if (chatId !== activeChatId) return;
      void loadActiveChatMessages({ silent: true });
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
    socket.on('chat:read', handleChatRead);
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
      socket.off('chat:read', handleChatRead);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleAcceptedCall);
      socket.off('call:declined', handleDeclinedCall);
      socket.off('call:missed', handleMissedCall);
      socket.off('call:ended', handleEndedCall);
      socket.off('message:deleted', handleDeletedMessage);
    };
  }, [socket, me?.id, activeChatId, setMessages, setTypingUsers, setChats, chats, setCalls, refreshCalls, isSectionActive, setChatNotification, blockedUserIds, loadActiveChatMessages]);

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
    if (!showChatsMenu) return;
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showChatsMenu && !chatsMenuRef.current?.contains(target)) {
        setShowChatsMenu(false);
      }
    };
    window.addEventListener('pointerdown', handleClickAway);
    return () => window.removeEventListener('pointerdown', handleClickAway);
  }, [showChatsMenu]);

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
    if (lockedChatIds.includes(activeChatId) && !canViewLockedChats) {
      setError('Verify your locked chats PIN or password before sending messages.');
      return;
    }
    if (activeChatBlocked) {
      setError('This contact is blocked. Unblock them to send messages again.');
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

  const openChat = useCallback((chatId: string) => {
    if (lockedChatIds.includes(chatId) && !canViewLockedChats) {
      setPendingLockChatId(chatId);
      setShowChatUnlockModal(true);
    }
    setActiveChatId(chatId);
    setChatNotification((current) => current?.chatId === chatId ? null : current);
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)));
    if (isMobile) setShowMobileChat(true);
  }, [canViewLockedChats, isMobile, lockedChatIds, setActiveChatId, setChatNotification, setChats]);

  const completePendingLockChat = useCallback((chatId: string | null) => {
    if (!chatId) return;
    setLockedChatIds((prev) => (prev.includes(chatId) ? prev : [chatId, ...prev]));
    const chat = chats.find((entry) => entry.id === chatId);
    setInfo(`${chat?.title ?? 'Chat'} moved to locked chats`);
    setPendingLockChatId(null);
  }, [chats, setInfo]);

  const saveChatLockCredential = async () => {
    const nextSecret = chatLockSecret.trim();
    const confirmSecret = chatLockConfirmSecret.trim();
    if (chatLockMode === 'pin') {
      if (!/^\d{4,8}$/.test(nextSecret)) {
        setError('Chat lock PIN must be 4 to 8 digits.');
        return;
      }
    } else if (nextSecret.length < 4) {
      setError('Chat lock password must be at least 4 characters.');
      return;
    }
    if (nextSecret !== confirmSecret) {
      setError('Secret and confirm secret do not match.');
      return;
    }
    if (!me?.id) return;
    const nextHash = await hashLockSecret(nextSecret);
    const nextConfig = chatLockMode === 'pin'
      ? { pinHash: nextHash, passwordHash: '' }
      : { pinHash: '', passwordHash: nextHash };
    window.localStorage.setItem(getChatLockConfigStorageKey(me.id), JSON.stringify(nextConfig));
    sessionStorage.setItem(getChatLockSessionKey(me.id), '1');
    setChatLockConfig(nextConfig);
    setLockedChatsUnlocked(true);
    setShowChatLockSetupModal(false);
    setChatLockSecret('');
    setChatLockConfirmSecret('');
    window.dispatchEvent(new CustomEvent('helloto:chat-lock-updated'));
    completePendingLockChat(pendingLockChatId);
  };

  const verifyChatUnlockSecret = async () => {
    if (!me?.id) return;
    const candidate = chatUnlockSecret.trim();
    if (!candidate) {
      setError('Enter your locked chats PIN or password first.');
      return;
    }
    const pinHash = chatLockConfig.pinHash ? await hashLockSecret(candidate) : '';
    const passwordHash = chatLockConfig.passwordHash ? await hashLockSecret(candidate) : '';
    if ((chatLockConfig.pinHash && pinHash === chatLockConfig.pinHash) || (chatLockConfig.passwordHash && passwordHash === chatLockConfig.passwordHash)) {
      sessionStorage.setItem(getChatLockSessionKey(me.id), '1');
      setLockedChatsUnlocked(true);
      setShowChatUnlockModal(false);
      setChatUnlockSecret('');
      window.dispatchEvent(new CustomEvent('helloto:chat-lock-updated'));
      setInfo('Locked chats verified');
      if (pendingLockChatId && !lockedChatIds.includes(pendingLockChatId)) {
        completePendingLockChat(pendingLockChatId);
      } else {
        setPendingLockChatId(null);
      }
      return;
    }
    setError('Locked chats PIN or password is wrong.');
  };

  const resetConnectFlow = () => {
    setConnectIdentifier('');
    setLookupResult(null);
    setSelectedMatch(null);
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

  const markDetailUserSafety = (disposition: 'blocked' | 'reported') => {
    if (!detailUser) return;
    if (disposition === 'reported') {
      setReportReasonDetail('');
      setReportDetailTarget(detailUser);
      return;
    }
    setBlockReason('');
    setBlockTarget(detailUser);
  };

  const submitDetailReportReason = async (reason: (typeof reportReasons)[number]) => {
    if (!reportDetailTarget) return;
    try {
      if (token && reportDetailTarget.id) {
        await api('/reports', {
          method: 'POST',
          token,
          body: JSON.stringify({
            targetUserId: reportDetailTarget.id,
            reason,
            detail: reportReasonDetail.trim() || 'Reported from contact detail view',
          }),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    saveConnectionRecordFromUser({
      requestId: `contact-detail-${reportDetailTarget.id ?? reportDetailTarget.phoneNumber ?? reportDetailTarget.email ?? reportDetailTarget.name}`,
      userId: reportDetailTarget.id ?? reportDetailTarget.phoneNumber ?? reportDetailTarget.email ?? reportDetailTarget.name,
      name: reportDetailTarget.name,
      avatarUrl: reportDetailTarget.avatarUrl ?? null,
      aliasName: reportDetailTarget.email ?? null,
      phoneNumber: reportDetailTarget.phoneNumber ?? null,
    }, 'reported', reportReasonDetail.trim() ? `${reason}: ${reportReasonDetail.trim()}` : reason);
    setInfo(`${reportDetailTarget.name} reported for ${reason.toLowerCase()}.`);
    setReportReasonDetail('');
    setReportDetailTarget(null);
  };

  const confirmBlockTarget = () => {
    if (!blockTarget) return;
    const targetId = blockTarget.id ?? blockTarget.phoneNumber ?? blockTarget.email ?? blockTarget.name;
    saveConnectionRecordFromUser({
      requestId: `contact-detail-${targetId}`,
      userId: targetId,
      name: blockTarget.name,
      avatarUrl: blockTarget.avatarUrl ?? null,
      aliasName: blockTarget.email ?? null,
      phoneNumber: blockTarget.phoneNumber ?? null,
    }, 'blocked', blockReason.trim() || 'Blocked contact');
    setChats((prev) => prev.filter((chat) => chat.peer?.id !== targetId));
    setContacts((prev) => prev.filter((contact) => contact.registeredUser?.id !== targetId && contact.id !== targetId));
    if (activeChat?.peer?.id === targetId) {
      setMessages([]);
      setActiveChatId('');
    }
    setInfo(`${blockTarget.name} blocked. They cannot message you again until you unblock them.`);
    setBlockReason('');
    setBlockTarget(null);
    setDetailUser(null);
  };

  const unblockActiveContact = () => {
    if (!activeBlockedRecord) return;
    removeConnectionRecord(activeBlockedRecord.requestId, 'blocked');
    setInfo(`${activeBlockedRecord.name} unblocked. They can send messages again.`);
  };

  const deleteBlockedMessages = () => {
    if (!activeChat) return;
    setMessages([]);
    setChats((prev) => prev.map((chat) => (chat.id === activeChat.id ? { ...chat, lastMessage: null } : chat)));
    setInfo('All messages in this blocked chat were cleared.');
  };

  const deleteBlockedContact = () => {
    if (!activeChat?.peer?.id) return;
    const blockedUserId = activeChat.peer.id;
    setContacts((prev) => prev.filter((contact) => contact.registeredUser?.id !== blockedUserId && contact.id !== blockedUserId));
    setChats((prev) => prev.filter((chat) => chat.peer?.id !== blockedUserId));
    setMessages([]);
    setActiveChatId('');
    setInfo('Blocked contact removed from chats and contacts.');
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
    return `${call.mode === 'video' ? 'Video' : 'Voice'} call â€¢ ${minutes}:${seconds}`;
  };

  const lookupContact = async () => {
    if (!token || connectBusy || !connectIdentifier.trim()) return;
    setConnectBusy(true);
    try {
      const res = await api<LookupResult>(`/connections/lookup?identifier=${encodeURIComponent(connectIdentifier.trim())}`, { token });
      setLookupResult(res);
      setSelectedMatch(res.user);
      if (!res.user) {
        setInfo('No matching HelloToo account was found for that number or email.');
      }
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
          aliasName: selectedMatch.name,
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
      setInfo(`Connect request sent to ${selectedMatch.name}. They can accept it from their Connections section.`);
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
            {call.direction === 'outgoing' ? 'You called' : `${call.user.name} called`} â€¢ {new Date(call.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

  const getReceiptLabel = (message: Message) => {
    const status = message.receipt?.status ?? 'sent';
    if (status === 'read') return 'Read';
    if (status === 'delivered') return 'Delivered';
    return 'Sent';
  };

  const renderReceiptIcon = (message: Message) => {
    const status = message.receipt?.status ?? 'sent';
    return (
      <svg className="messageReceiptIcon" viewBox="0 0 16 12" aria-hidden="true">
        <path
          d="M1.7 6.6L4.5 9.3L9.2 3.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {status !== 'sent' ? (
          <path
            d="M6.5 6.6L9.3 9.3L14 3.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
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
              {group.mine ? (
                <span
                  className={`messageReceiptStamp ${message.receipt?.status === 'read' ? 'readStamp' : message.receipt?.status === 'delivered' ? 'deliveredStamp' : 'sentStamp'}`}
                  aria-label={getReceiptLabel(message)}
                  title={getReceiptLabel(message)}
                >
                  {renderReceiptIcon(message)}
                </span>
              ) : null}
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
            <div className="chatPaneHeaderCopy">
              <h2>{chatPaneTitle}</h2>
              {chatPaneDescription ? <p className="chatSectionHeaderCopy">{chatPaneDescription}</p> : null}
            </div>
            <div className="waPaneActions">
              <button className="waPaneActionBtn" onClick={openConnectModal} aria-label="New chat">
                <span className="waPaneActionGlyph waPaneActionGlyph-compose" aria-hidden="true" />
              </button>
              <div className="chatMenuWrap" ref={chatsMenuRef}>
                <button className="waPaneActionBtn" onClick={() => setShowChatsMenu((value) => !value)} aria-label="Open chats menu" aria-expanded={showChatsMenu}>
                  <span className="waPaneActionGlyph waPaneActionGlyph-more" aria-hidden="true" />
                </button>
                {showChatsMenu ? (
                  <div className="chatMenuPanel sidebarChatsMenuPanel">
                    <div className="chatMenuGroupLabel">Create</div>
                    <button type="button" className="chatMenuItem sidebarMenuItem newGroupMenuItem" onClick={openNewGroup}>
                      New group
                    </button>
                    <div className="sidebarMenuDivider" />
                    <div className="chatMenuGroupLabel">Chats</div>
                    <button type="button" className="chatMenuItem sidebarMenuItem starredMenuItem" onClick={openStarredMessages}>
                      Starred messages
                    </button>
                    <button type="button" className="chatMenuItem sidebarMenuItem selectChatsMenuItem" onClick={selectChats}>
                      Select chats
                    </button>
                    <button type="button" className="chatMenuItem sidebarMenuItem markReadMenuItem" onClick={markAllChatsReadFromMenu}>
                      Mark all as read
                    </button>
                    <button type="button" className="chatMenuItem sidebarMenuItem lockedChatsMenuItem" onClick={openLockedSection}>
                      Locked chats
                    </button>
                    <div className="sidebarMenuDivider" />
                    <div className="chatMenuGroupLabel">Security</div>
                    <button type="button" className="chatMenuItem sidebarMenuItem appLockMenuItem" onClick={lockWholeApp}>
                      App lock
                    </button>
                    <button type="button" className="chatMenuItem sidebarMenuItem logoutMenuItem" onClick={logoutNow}>
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <label className="waSearchField">
          <span className="waSearchIcon" aria-hidden="true" />
          <input
            className="input searchInput"
            placeholder={isMobile ? 'Ask HelloToo AI or Search' : 'Search or start a new chat'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="chatFilterRow">
          <button className={chatFilter === 'all' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('all')}>
            All
          </button>
          <button className={chatFilter === 'unread' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('unread')}>
            Unread {unreadChats ? <span className="chatFilterCount">{unreadChats}</span> : null}
          </button>
          <button className={chatFilter === 'groups' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('groups')}>
            Favourites
          </button>
          {isMobile ? (
            <button className="chatFilterChip" type="button" onClick={openNewGroup}>
              Groups
            </button>
          ) : null}
          <button className={chatFilter === 'archived' ? 'chatFilterChip activeFilterChip' : 'chatFilterChip'} onClick={() => setChatFilter('archived')}>
            Archived {archivedChats ? <span className="chatFilterCount">{archivedChats}</span> : null}
          </button>
          {groupChats || archivedChats || lockedChats ? (
            <div className="chatFilterMeta">
              {groupChats ? <span>{groupChats} groups</span> : null}
              {archivedChats ? <span>{archivedChats} archived</span> : null}
              {lockedChats ? <span>{lockedChats} locked</span> : null}
            </div>
          ) : null}
        </div>

        <div className="chatList">
          {chatFilter !== 'all' ? (
            <button type="button" className="chatSectionCard chatSectionBackCard" onClick={openAllChatsSection}>
              <div className="rowStart">
                <div className="chatSectionIcon chatSectionIcon-back" aria-hidden="true" />
                <div className="cardText">
                  <strong>All chats</strong>
                  <span>Back to your main conversations</span>
                </div>
              </div>
            </button>
          ) : null}
          {chatFilter === 'archived' ? (
            <div className="archivedIntroCard">
              <p>
                These chats stay archived when new messages are received. Change this experience from Settings to Chats on your phone.
              </p>
            </div>
          ) : null}
          {chatFilter === 'all' && archivedChats > 0 ? (
            <button type="button" className="chatSectionCard" onClick={openArchivedSection}>
              <div className="rowStart">
                <div className="chatSectionIcon chatSectionIcon-archived" aria-hidden="true" />
                <div className="cardText">
                  <strong>Archived</strong>
                  <span>{archivedChats} chat{archivedChats === 1 ? '' : 's'} moved out of the main list</span>
                </div>
              </div>
              <div className="cardMeta">
                <p>{archivedChats}</p>
              </div>
            </button>
          ) : null}
          {chatFilter === 'all' && hasLockedSection ? (
            <button type="button" className="chatSectionCard" onClick={openLockedSection}>
              <div className="rowStart">
                <div className="chatSectionIcon chatSectionIcon-locked" aria-hidden="true" />
                <div className="cardText">
                  <strong>Locked chats</strong>
                  <span>{lockedChats ? `${lockedChats} protected chat${lockedChats === 1 ? '' : 's'}` : 'Protected by your locked chats PIN or password'}</span>
                </div>
              </div>
              <div className="cardMeta">
                <p>{lockedChats || ''}</p>
              </div>
            </button>
          ) : null}
          {filteredChats.length ? filteredChats.map((chat) => (
            <button key={chat.id} className={chat.id === activeChatId ? 'chatCard activeCard' : 'chatCard'} onClick={() => openChat(chat.id)}>
              <div className="rowStart">
                <Avatar name={chat.title} avatarUrl={chat.avatarUrl} group={chat.isGroup} />
                <div className="cardText">
                  <strong>{lockedChatIds.includes(chat.id) && !canViewLockedChats ? 'Locked chat' : chat.title}</strong>
                  <span className="chatPreviewLine">
                    {(typingUsers[chat.id] ?? []).filter((id) => id !== me.id).length
                      ? 'Typing...'
                      : lockedChatIds.includes(chat.id) && !canViewLockedChats
                        ? 'Verify to view messages'
                        : chat.lastMessage?.text || (chat.peer ? lastSeen(chat.peer) : 'No messages yet')}
                  </span>
                  <div className="chatCardFlags">
                    {archivedChatIds.includes(chat.id) ? <span className="chatStatePill">Archived</span> : null}
                    {lockedChatIds.includes(chat.id) ? <span className="chatStatePill lockedStatePill">Locked</span> : null}
                  </div>
                </div>
              </div>
              <div className="cardMeta">
                <p>{chat.lastMessage?.createdAt ? fmtTime(chat.lastMessage.createdAt) : ''}</p>
                <div className="chatMetaLine">
                  {chat.peer?.isOnline ? <span className="statusDot onlineDot" /> : null}
                  {chat.unreadCount > 0 ? <span className="unreadBadge">{chat.unreadCount}</span> : null}
                </div>
              </div>
            </button>
          )) : <div className="compactEmpty chatListEmpty">{chatFilter === 'archived' ? 'No archived chats yet.' : chatFilter === 'locked' ? 'No locked chats yet.' : 'No chats match this search yet.'}</div>}
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
                            id: activeChat.peer.id,
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
                            id: activeChat.id,
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
                  <span className="presenceLine">{activeChatSubtitle}</span>
                </div>
              </div>
              <div className="contactActions callActionRow">
                <button className="ghostBtn smallGhost callActionBtn voiceActionBtn callActionBtn-compact" onClick={() => void startCall('voice')}>
                  <span className="callActionIcon callActionIcon-phone" aria-hidden="true" />
                  <span className="callActionText">
                    <strong>Call</strong>
                  </span>
                </button>
                <button className="ghostBtn smallGhost callActionBtn videoActionBtn callActionBtn-compact" onClick={() => void startCall('video')}>
                  <span className="callActionIcon callActionIcon-video" aria-hidden="true" />
                  <span className="callActionText">
                    <strong>Video</strong>
                  </span>
                </button>
                <button className="ghostBtn smallGhost chatTopIconBtn" onClick={() => setInfo('Search in conversation will be added here next.')} aria-label="Search in conversation">
                  <span className="waPaneActionGlyph waPaneActionGlyph-search" aria-hidden="true" />
                </button>
                <div className="chatMenuWrap" ref={conversationMenuRef}>
                  <button
                    className="ghostBtn smallGhost menuToggleBtn chatTopIconBtn"
                    onClick={() => setShowConversationMenu((value) => !value)}
                    aria-label="Chat options"
                    aria-expanded={showConversationMenu}
                  >
                    <span className="waPaneActionGlyph waPaneActionGlyph-more" aria-hidden="true" />
                  </button>
                  {showConversationMenu ? (
                    <div className="chatMenuPanel">
                      <div className="chatMenuGroupLabel">Contact</div>
                      <button className="chatMenuItem" onClick={openConnectModal}>
                        Add contact
                      </button>
                      <button className="chatMenuItem" onClick={() => {
                        openProfileDetails(
                          activeChat.peer
                            ? {
                                id: activeChat.peer.id,
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
                                id: activeChat.id,
                                name: activeChat.title,
                                avatarUrl: activeChat.avatarUrl,
                                statusText: activeChat.isGroup ? `${activeChat.members.length} members in this chat` : 'Conversation details',
                              },
                        );
                        setShowConversationMenu(false);
                      }}>
                        View contact
                      </button>
                      <div className="sidebarMenuDivider" />
                      <div className="chatMenuGroupLabel">Chat</div>
                      <button className="chatMenuItem" onClick={markAllChatsRead}>
                        Mark all as read
                      </button>
                      <button className="chatMenuItem" onClick={() => activeChat && toggleArchiveChat(activeChat.id)}>
                        {activeChatArchived ? 'Unarchive chat' : 'Archive chat'}
                      </button>
                  <button className="chatMenuItem" onClick={() => activeChat && toggleLockChat(activeChat.id)}>
                        {activeChatLocked ? (canViewLockedChats ? 'Remove from locked chats' : 'Verify locked chats') : 'Move to locked chats'}
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
                {canViewLockedChats
                  ? 'This chat stays inside Locked chats until you remove it from the locked section.'
                  : 'This chat is locked. Verify your locked chats PIN or password to show all locked chats and messages.'}
              </div>
            ) : null}

            {activeChatBlocked && activeBlockedRecord ? (
              <div className="privacyBar chatStateBanner lockedBanner">
                <strong>{activeBlockedRecord.name} is blocked.</strong> They cannot send you messages until you unblock them again.
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
              {activeChatLocked && !canViewLockedChats ? (
                <div className="chatStartMarker">
                  <div className="chatSecurityNotice">
                    Locked chats are hidden until you verify your PIN or password.
                  </div>
                  <div className="chatStartCard">
                    <strong>Locked chat</strong>
                    <span>Verify once to show all locked chats and messages in this session.</span>
                  </div>
                  <div className="contactActions centerActions">
                    <button type="button" className="primaryBtn" onClick={() => setShowChatUnlockModal(true)}>
                      Verify locked chats
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {!loadingMessages && timelineItems.length === 0 && activeChat ? (
                <div className="chatStartMarker" aria-label="Chat start time">
                  <div className="timelineDateDivider">
                    <span>{new Date(activeChat.updatedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="chatSecurityNotice">
                    Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
                  </div>
                  <div className="chatStartCard">
                    <strong>Chat started</strong>
                    <span>{fmtDate(activeChat.updatedAt)}</span>
                  </div>
                </div>
              ) : null}
              {timelineBlocks.map((item, index) => {
                if (item.kind === 'date') {
                  return (
                    <div key={item.id}>
                      <div className="timelineDateDivider">
                        <span>{item.label}</span>
                      </div>
                      {index === 0 ? (
                        <div className="chatSecurityNotice">
                          Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
                        </div>
                      ) : null}
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
              {activeTypingLabel ? <div className="typingPill">{activeTypingLabel}</div> : null}
              <div ref={msgEndRef} />
                </>
              )}
            </div>
            {showScrollToBottom ? (
              <button
                className="scrollToBottomBtn"
                onClick={scrollToBottom}
                aria-label="Scroll to latest messages"
                data-count={unseenNewMessages > 0 ? String(unseenNewMessages) : ''}
              >
                {unseenNewMessages > 0 ? `â†“ ${unseenNewMessages} new messages` : 'â†“'}
              </button>
            ) : null}
            </div>

            {activeChatBlocked ? (
              <div className="requestCard">
                <div className="cardText">
                  <strong>This contact is blocked</strong>
                  <span>{activeBlockedRecord?.note || 'Messaging stays off until you unblock this contact.'}</span>
                </div>
                <div className="contactActions">
                  <button type="button" className="primaryBtn smallGhost" onClick={unblockActiveContact}>
                    Unblock
                  </button>
                  <button type="button" className="ghostBtn smallGhost" onClick={deleteBlockedMessages}>
                    Delete all messages
                  </button>
                  <button type="button" className="ghostBtn smallGhost" onClick={deleteBlockedContact}>
                    Delete contact
                  </button>
                </div>
              </div>
            ) : activeChatLocked && !canViewLockedChats ? null : (
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
            )}
          </>
        ) : (
          <div className={chatFilter === 'archived' ? 'emptyPanel emptyPanel-quiet' : 'emptyPanel'}>
            <div className="emptyHub">
              <div className="cardText emptyHubLead">
                <strong>{chatFilter === 'archived' ? 'Archived chats' : 'Select a chat to open it'}</strong>
                <span>{chatFilter === 'archived' ? 'Choose any archived conversation from the left side.' : 'Tap any user from the left side and their conversation will open here.'}</span>
              </div>
              {chatFilter === 'archived' ? null : (
                <div className="emptyHubActions">
                  <button className="emptyHubAction" type="button">
                    <span className="emptyHubIcon emptyHubIcon-doc" aria-hidden="true" />
                    <span>Send document</span>
                  </button>
                  <button className="emptyHubAction" type="button" onClick={openConnectModal}>
                    <span className="emptyHubIcon emptyHubIcon-contact" aria-hidden="true" />
                    <span>Add contact</span>
                  </button>
                  <button
                    className="emptyHubAction"
                    type="button"
                    onClick={() => setInfo('DIP AI shortcut added to the home screen')}
                  >
                    <span className="emptyHubIcon emptyHubIcon-ai" aria-hidden="true" />
                    <span>Open DIP AI</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {showChatLockSetupModal ? (
        <div className="modalScrim" onClick={() => setShowChatLockSetupModal(false)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Set locked chats {chatLockMode === 'pin' ? 'PIN' : 'password'}</h2>
              <button className="ghostBtn smallGhost" onClick={() => setShowChatLockSetupModal(false)}>
                Close
              </button>
            </div>
            <p className="miniText">Before moving a chat into Locked chats, set a PIN or password and confirm it.</p>
            <div className="tabRow tabRowSecondary authReferenceMethodTabs">
              <button type="button" className={chatLockMode === 'pin' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setChatLockMode('pin')}>
                PIN
              </button>
              <button type="button" className={chatLockMode === 'password' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setChatLockMode('password')}>
                Password
              </button>
            </div>
            <div className="composerInputRow">
              <input
                className="input"
                type={showChatLockSecret ? 'text' : 'password'}
                inputMode={chatLockMode === 'pin' ? 'numeric' : 'text'}
                placeholder={chatLockMode === 'pin' ? 'Set PIN' : 'Set password'}
                value={chatLockSecret}
                onChange={(event) => setChatLockSecret(event.target.value)}
              />
              <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockSecret((current) => !current)}>
                {showChatLockSecret ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="composerInputRow">
              <input
                className="input"
                type={showChatLockConfirmSecret ? 'text' : 'password'}
                inputMode={chatLockMode === 'pin' ? 'numeric' : 'text'}
                placeholder={chatLockMode === 'pin' ? 'Confirm PIN' : 'Confirm password'}
                value={chatLockConfirmSecret}
                onChange={(event) => setChatLockConfirmSecret(event.target.value)}
              />
              <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockConfirmSecret((current) => !current)}>
                {showChatLockConfirmSecret ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="primaryBtn securityActionBtn" onClick={() => void saveChatLockCredential()}>
                Save and lock chat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showChatUnlockModal ? (
        <div className="modalScrim" onClick={() => setShowChatUnlockModal(false)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Verify locked chats</h2>
              <button className="ghostBtn smallGhost" onClick={() => setShowChatUnlockModal(false)}>
                Close
              </button>
            </div>
            <p className="miniText">Enter your locked chats PIN or password. After verification, all locked chats and messages will be visible in this session.</p>
            <div className="composerInputRow">
              <input
                className="input"
                type={showChatUnlockSecret ? 'text' : 'password'}
                placeholder="Enter locked chats PIN or password"
                value={chatUnlockSecret}
                onChange={(event) => setChatUnlockSecret(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void verifyChatUnlockSecret();
                }}
              />
              <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatUnlockSecret((current) => !current)}>
                {showChatUnlockSecret ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="primaryBtn securityActionBtn" onClick={() => void verifyChatUnlockSecret()}>
                Verify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showConnectModal ? (
        <div className="modalScrim" onClick={() => setShowConnectModal(false)}>
          <div className="connectModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Connect with someone</h2>
              <button className="ghostBtn smallGhost" onClick={() => setShowConnectModal(false)}>
                Close
              </button>
            </div>
            <p className="miniText">
              Search by mobile number or Gmail. When a match appears, send a connect request directly.
            </p>

            <div className="formGrid">
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
                  <strong>Connection status</strong>
                  <span>
                    {lookupResult?.existingContact
                      ? 'You are already connected with this person. Open the chat from your chat list.'
                      : lookupResult?.existingRequest
                        ? lookupResult.existingRequest.direction === 'incoming'
                          ? 'This person already sent you a request. Accept it from the People section.'
                          : 'A connect request is already pending for this person.'
                        : 'Send the connect request and wait for them to accept.'}
                  </span>
                </div>
                <div className="contactActions">
                  <button
                    className="primaryBtn"
                    onClick={() => void sendChatRequest()}
                    disabled={connectBusy || lookupResult?.existingContact || Boolean(lookupResult?.existingRequest)}
                  >
                    {lookupResult?.existingRequest?.direction === 'outgoing' ? 'Sent' : 'Send connect request'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showNotificationsModal ? (
        <div className="modalScrim" onClick={() => {
          setShowNotificationsModal(false);
        }}>
          <div className="connectModalCard notificationCenterCard" onClick={(event) => event.stopPropagation()}>
            <div className="requestPopupHeader">
              <div>
                <span className="heroEyebrow">Notifications</span>
                <h2>All notifications</h2>
              </div>
              <div className="contactActions notificationCenterHeaderActions">
                <button
                  type="button"
                  className="ghostBtn smallGhost notificationClearAllBtn"
                  onClick={clearNotificationHistory}
                  disabled={!notificationHistory.length}
                >
                  Clear all notifications
                </button>
                <button
                  type="button"
                  className="ghostBtn closeIconBtn"
                  onClick={() => {
                    setShowNotificationsModal(false);
                  }}
                  aria-label="Close notifications"
                >
                  x
                </button>
              </div>
            </div>
            <p className="miniText">Update notices, chat alerts and connection events are saved here with date and time.</p>
            {notificationGroups.length ? (
              <div className="notificationCenterList">
                {notificationGroups.map(([dayLabel, entries]) => (
                  <div key={dayLabel} className="notificationDayGroup">
                    <div className="notificationDayLabel">{dayLabel}</div>
                    <div className="requestStack">
                      {entries.map((entry) => (
                        <div key={entry.id} className="requestCard notificationCard notificationCenterItem">
                          <div className="rowStart notificationCenterRow">
                            <div className={`settingsItemIcon notificationKindBadge notificationKind-${entry.kind}`}>{entry.kind.slice(0, 2).toUpperCase()}</div>
                            <div className="cardText">
                              <strong>{entry.title}</strong>
                              <span>{entry.detail}</span>
                              <span>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <div className="notificationCardTools">
                            {entry.kind === 'update' && entry.updateBuildId ? (
                              <div className="contactActions">
                                {entry.updateStatus !== 'accepted' ? (
                                  <button type="button" className="primaryBtn smallGhost" onClick={() => applyStoredUpdate(entry.updateBuildId!)}>
                                    Update
                                  </button>
                                ) : null}
                                {entry.updateStatus === 'pending' ? (
                                  <button type="button" className="ghostBtn smallGhost" onClick={() => dismissStoredUpdate(entry.updateBuildId!)}>
                                    Reject
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className="ghostBtn smallGhost notificationDeleteBtn"
                              onClick={() => removeNotificationEntry(entry.id)}
                              aria-label="Delete notification"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="compactEmpty requestEmptyCard">No notifications saved yet.</div>
            )}
            {updateNotice ? (
              <div className="requestCard notificationCenterFooterCard">
                <div className="cardText">
                  <strong>Latest update is still available</strong>
                  <span>Version {updateNotice.latestBuildId} can be applied from here any time.</span>
                </div>
                <div className="contactActions">
                  <button type="button" className="primaryBtn smallGhost" onClick={() => applyStoredUpdate(updateNotice.latestBuildId)}>
                    Update
                  </button>
                  <button type="button" className="ghostBtn smallGhost" onClick={() => dismissStoredUpdate(updateNotice.latestBuildId)}>
                    Reject
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
            <div className="accountActionRow">
              <button type="button" className="ghostBtn smallGhost" onClick={() => markDetailUserSafety('blocked')}>
                Block contact
              </button>
              <button type="button" className="ghostBtn smallGhost" onClick={() => markDetailUserSafety('reported')}>
                Report contact
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blockTarget ? (
        <div className="modalScrim" onClick={() => setBlockTarget(null)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Block {blockTarget.name}?</h2>
              <button className="ghostBtn smallGhost" onClick={() => setBlockTarget(null)}>
                Close
              </button>
            </div>
            <p className="miniText">Confirm the block and explain why you are blocking this contact.</p>
            <label className="field">
              <span>Why are you blocking this contact?</span>
              <textarea
                className="input"
                rows={4}
                placeholder="Explain why you want to block this user"
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
              />
            </label>
            <div className="accountActionRow">
              <button type="button" className="ghostBtn smallGhost" onClick={() => setBlockTarget(null)}>
                Cancel
              </button>
              <button type="button" className="primaryBtn smallGhost" onClick={confirmBlockTarget}>
                Confirm block
              </button>
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

      {reportDetailTarget ? (
        <div className="modalScrim" onClick={() => setReportDetailTarget(null)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Report {reportDetailTarget.name}</h2>
              <button className="ghostBtn smallGhost" onClick={() => setReportDetailTarget(null)}>
                Close
              </button>
            </div>
            <p className="miniText">Choose the type of report you want to make.</p>
            <label className="field">
              <span>Explain something about this report</span>
              <textarea
                className="input"
                rows={4}
                placeholder="Write more details about spam, scam, behaviour or fraud"
                value={reportReasonDetail}
                onChange={(event) => setReportReasonDetail(event.target.value)}
              />
            </label>
            <div className="requestStack">
              {reportReasons.map((reason) => (
                <button key={reason} type="button" className="requestCard chatMatchCard" onClick={() => void submitDetailReportReason(reason)}>
                  <div className="cardText">
                    <strong>{reason}</strong>
                    <span>{reason === 'Spam messages' ? 'Repeated spam or promotional messages.' : reason === 'Fraud or scam' ? 'Fraud, money scam, cheating or fake payment attempt.' : reason === 'Abusive behaviour' ? 'Harassment, threats or abusive behaviour.' : reason === 'Unwanted messages' ? 'Messages you do not want from this contact.' : 'Fake identity or misleading profile details.'}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="accountActionRow">
              <button type="button" className="ghostBtn smallGhost" onClick={() => {
                setReportDetailTarget(null);
                setReportReasonDetail('');
              }}>
                x
              </button>
              <button type="button" className="ghostBtn smallGhost" onClick={() => {
                setBlockTarget(reportDetailTarget);
                setReportDetailTarget(null);
              }}>
                Block contact
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

