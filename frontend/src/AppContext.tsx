import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { User, Chat, Contact, Message, CallLog } from './App'; // Reuse types from App

declare const __APP_BUILD_ID__: string;

export type IncomingRequest = {
  id: string;
  fromUser: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  aliasName: string | null;
  phoneNumber: string | null;
  createdAt: string;
};

export type AppLockConfig = {
  pinHash: string;
  passwordHash: string;
  biometricEnabled: boolean;
  biometricCredentialId: string;
  autoLockOnHide: boolean;
};

export type UpdateNotice = {
  currentBuildId: string;
  latestBuildId: string;
};

type AppState = {
  token: string;
  setToken: (token: string) => void;
  me: User | null;
  setMe: React.Dispatch<React.SetStateAction<User | null>>;
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  calls: CallLog[];
  setCalls: React.Dispatch<React.SetStateAction<CallLog[]>>;
  incomingRequests: IncomingRequest[];
  setIncomingRequests: React.Dispatch<React.SetStateAction<IncomingRequest[]>>;
  activeChatId: string;
  typingUsers: Record<string, string[]>;
  setTypingUsers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  info: string;
  error: string;
  devOtpPreview: string;
  setDevOtpPreview: (value: string) => void;
  setActiveChatId: (id: string) => void;
  setInfo: (msg: string) => void;
  setError: (msg: string) => void;
  serverBaseUrl: string;
  refreshIncomingRequests: () => Promise<void>;
  refreshContacts: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshCalls: () => Promise<void>;
  respondToIncomingRequest: (requestId: string, action: 'accept' | 'reject') => Promise<void>;
  api: <T = any>(path: string, opts?: RequestInit & { token?: string }) => Promise<T>;
  socket: Socket | null;
  isMobile: boolean;
  theme: 'dark' | 'light';
  setTheme: React.Dispatch<React.SetStateAction<'dark' | 'light'>>;
  toggleTheme: () => void;
  appLockConfig: AppLockConfig;
  updateAppLockConfig: (next: Partial<AppLockConfig>) => void;
  clearAppLockConfig: () => void;
  isLocked: boolean;
  setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
  biometricSupported: boolean;
  hashLockSecret: (value: string) => Promise<string>;
  registerBiometricLock: () => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  updateNotice: UpdateNotice | null;
  applyAvailableUpdate: () => void;
  dismissAvailableUpdate: () => void;
};

const AppContext = createContext<AppState | null>(null);

const defaultAppLockConfig: AppLockConfig = {
  pinHash: '',
  passwordHash: '',
  biometricEnabled: false,
  biometricCredentialId: '',
  autoLockOnHide: true,
};

const bufferToBase64Url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlToBytes = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  // All state extracted from App.tsx
  const [token, setToken] = useState('');
  const [me, setMe] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [devOtpPreview, setDevOtpPreview] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [appLockConfig, setAppLockConfig] = useState<AppLockConfig>(() => {
    try {
      const saved = localStorage.getItem('helloto_app_lock');
      return saved ? { ...defaultAppLockConfig, ...JSON.parse(saved) as Partial<AppLockConfig> } : defaultAppLockConfig;
    } catch {
      return defaultAppLockConfig;
    }
  });
  const [isLocked, setIsLocked] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('helloto_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  const socketRef = useRef<Socket | null>(null);
  const currentBuildId = __APP_BUILD_ID__;
  const biometricSupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window && typeof navigator !== 'undefined' && 'credentials' in navigator;
  const hasAppLock = Boolean(appLockConfig.pinHash || appLockConfig.passwordHash || (appLockConfig.biometricEnabled && appLockConfig.biometricCredentialId));

  const hashLockSecret = useCallback(async (value: string) => {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const bytes = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest('SHA-256', bytes);
      return bufferToBase64Url(digest);
    }
    return btoa(value);
  }, []);

  const updateAppLockConfig = useCallback((next: Partial<AppLockConfig>) => {
    setAppLockConfig((current) => ({ ...current, ...next }));
  }, []);

  const clearAppLockConfig = useCallback(() => {
    setAppLockConfig(defaultAppLockConfig);
    setIsLocked(false);
  }, []);

  const registerBiometricLock = useCallback(async () => {
    if (!biometricSupported || !window.PublicKeyCredential || !navigator.credentials) return false;
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const userId = window.crypto.getRandomValues(new Uint8Array(16));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'HelloToo' },
          user: {
            id: userId,
            name: 'helloto-app-lock',
            displayName: 'HelloToo App Lock',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      const rawId = credential?.rawId ? bufferToBase64Url(credential.rawId) : '';
      if (!rawId) return false;
      setAppLockConfig((current) => ({
        ...current,
        biometricEnabled: true,
        biometricCredentialId: rawId,
      }));
      return true;
    } catch {
      return false;
    }
  }, [biometricSupported]);

  const unlockWithBiometric = useCallback(async () => {
    if (!biometricSupported || !appLockConfig.biometricCredentialId || !navigator.credentials) return false;
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: base64UrlToBytes(appLockConfig.biometricCredentialId),
              type: 'public-key',
            },
          ],
          timeout: 60000,
          userVerification: 'required',
        },
      });
      setIsLocked(false);
      return true;
    } catch {
      return false;
    }
  }, [appLockConfig.biometricCredentialId, biometricSupported]);

  const getApiUrl = useCallback(() => {
    const appProtocol = window.location.protocol?.startsWith('http') ? window.location.protocol : 'http:';
    const appHostname = window.location.hostname && window.location.hostname !== '' && window.location.hostname !== 'chrome-error' ? window.location.hostname : 'localhost';
    return import.meta.env.VITE_API_URL ?? `${appProtocol}//${appHostname}:8787`;
  }, []);
  const serverBaseUrl = getApiUrl();

  const api = useCallback(async <T,>(path: string, opts: RequestInit & { token?: string } = {}) => {
    const API = getApiUrl();
    try {
      const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers ?? {}),
        },
      });
      const contentType = res.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(typeof body === 'string' ? body : (body as any).error || `HTTP ${res.status}`);
      return body as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        throw new Error(`Could not reach the HelloToo server at ${API}. Make sure the backend is running and open this site from the same network.`);
      }
      throw err;
    }
  }, [getApiUrl]);

  // Load token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('wa_token') ?? '';
    if (savedToken) setToken(savedToken);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('helloto_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('helloto_app_lock', JSON.stringify(appLockConfig));
  }, [appLockConfig]);

  useEffect(() => {
    let cancelled = false;
    const checkForUpdates = async () => {
      try {
        const response = await fetch(`/build-meta.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as { buildId?: string };
        const latestBuildId = body.buildId?.trim();
        if (!latestBuildId || latestBuildId === currentBuildId) {
          if (!cancelled) setUpdateNotice(null);
          return;
        }
        const dismissedBuild = sessionStorage.getItem('helloto_dismissed_update_build') ?? '';
        if (!cancelled && dismissedBuild !== latestBuildId) {
          setUpdateNotice({ currentBuildId, latestBuildId });
        }
      } catch {
        // ignore update check errors
      }
    };

    void checkForUpdates();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentBuildId]);

  const applyAvailableUpdate = useCallback(() => {
    sessionStorage.removeItem('helloto_dismissed_update_build');
    window.location.reload();
  }, []);

  const dismissAvailableUpdate = useCallback(() => {
    if (updateNotice?.latestBuildId) {
      sessionStorage.setItem('helloto_dismissed_update_build', updateNotice.latestBuildId);
    }
    setUpdateNotice(null);
  }, [updateNotice?.latestBuildId]);

  // Load user data
  useEffect(() => {
    if (!token) return;
    api<{ user: User }>('/me', { token }).then(({ user }) => {
      setMe(user);
    }).catch(() => {
      localStorage.removeItem('wa_token');
      setToken('');
      setMe(null);
    });
  }, [token, api]);

  const refreshContacts = useCallback(async () => {
    if (!token) return;
    const res = await api<{ contacts: Contact[] }>('/contacts', { token });
    setContacts(res.contacts);
  }, [token, api]);

  useEffect(() => {
    if (!me?.id || !hasAppLock) {
      setIsLocked(false);
      return;
    }
    if (sessionStorage.getItem('helloto_skip_initial_lock') === '1') {
      sessionStorage.removeItem('helloto_skip_initial_lock');
      setIsLocked(false);
      return;
    }
    setIsLocked(true);
  }, [me?.id, hasAppLock]);

  useEffect(() => {
    if (!me?.id || !hasAppLock || !appLockConfig.autoLockOnHide) return;

    const lockNow = () => setIsLocked(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') lockNow();
    };

    window.addEventListener('blur', lockNow);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', lockNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [me?.id, hasAppLock, appLockConfig.autoLockOnHide]);

  const refreshChats = useCallback(async () => {
    if (!token) return;
    const res = await api<{ chats: Chat[] }>('/chats', { token });
    setChats(res.chats);
    setActiveChatId((current) => {
      if (current && res.chats.some((chat) => chat.id === current)) return current;
      return res.chats[0]?.id || '';
    });
  }, [token, api]);

  const refreshIncomingRequests = useCallback(async () => {
    if (!token) return;
    const res = await api<{ requests: IncomingRequest[] }>('/connections/requests', { token });
    setIncomingRequests(res.requests);
  }, [token, api]);

  const refreshCalls = useCallback(async () => {
    if (!token) return;
    const res = await api<{ calls: CallLog[] }>('/calls', { token });
    setCalls(res.calls);
  }, [token, api]);

  const respondToIncomingRequest = useCallback(async (requestId: string, action: 'accept' | 'reject') => {
    if (!token) return;
    const res = await api<{ contact?: Contact; chatId?: string; fromUser?: { name: string } }>(`/connections/requests/${requestId}/respond`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action }),
    });

    setIncomingRequests((prev) => prev.filter((request) => request.id !== requestId));

    if (action === 'accept' && res.contact) {
      setContacts((prev) => [res.contact!, ...prev.filter((contact) => contact.id !== res.contact!.id)]);
      if (res.chatId) {
        await refreshChats();
        setActiveChatId(res.chatId);
      }
      setInfo(`You are now connected with ${res.fromUser?.name ?? 'this user'}`);
      return;
    }

    setInfo('Connection request declined');
  }, [token, api, refreshChats]);

  useEffect(() => {
    if (!token || !me?.id) return;
    Promise.all([
      refreshContacts(),
      refreshChats(),
      refreshIncomingRequests(),
      refreshCalls(),
    ]).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [token, me?.id, refreshContacts, refreshChats, refreshIncomingRequests, refreshCalls, setError]);

  useEffect(() => {
    if (!token || !me?.id) return;

    const refresh = () => {
      refreshChats().catch(() => null);
      refreshContacts().catch(() => null);
      refreshIncomingRequests().catch(() => null);
      refreshCalls().catch(() => null);
    };

    const interval = window.setInterval(refresh, 5000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, me?.id, refreshChats, refreshContacts, refreshIncomingRequests, refreshCalls]);

  // Socket setup (simplified from App.tsx)
  useEffect(() => {
    if (!token || !me?.id) return;
    const socketInstance = io(getApiUrl(), { auth: { token } });
    socketRef.current = socketInstance;
    setSocket(socketInstance);
    // Add all socket event handlers here (message:new, typing, etc.)
    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token, me?.id, getApiUrl]);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 960);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-clear messages
  useEffect(() => {
    if (info) {
      const t = setTimeout(() => setInfo(''), 3000);
      return () => clearTimeout(t);
    }
  }, [info]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 3000);
      return () => clearTimeout(t);
    }
  }, [error]);
  useEffect(() => {
    if (devOtpPreview) {
      const t = setTimeout(() => setDevOtpPreview(''), 5000);
      return () => clearTimeout(t);
    }
  }, [devOtpPreview]);

  const value: AppState = {
    token, setToken, me, setMe, contacts, setContacts, chats, setChats, messages, setMessages, calls, setCalls, incomingRequests, setIncomingRequests, activeChatId, typingUsers, setTypingUsers,
    info, error, devOtpPreview, setDevOtpPreview, isMobile, setActiveChatId, setInfo, setError,
    serverBaseUrl, refreshIncomingRequests, refreshContacts, refreshChats, refreshCalls, respondToIncomingRequest, api, socket,
    theme, setTheme, toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    appLockConfig, updateAppLockConfig, clearAppLockConfig, isLocked, setIsLocked, biometricSupported, hashLockSecret, registerBiometricLock, unlockWithBiometric,
    updateNotice, applyAvailableUpdate, dismissAvailableUpdate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

