import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  User,
  Chat,
  Contact,
  Message,
  CallLog,
  IncomingRequest,
  ConnectionRecord,
  ConnectionRecordInput,
  AppLockConfig,
  UpdateNotice,
  ChatNotification,
  NotificationEntry,
} from './types';

declare const __APP_BUILD_ID__: string;

// Re-export for convenience
export type { IncomingRequest, ConnectionRecord, ConnectionRecordInput, AppLockConfig, UpdateNotice, ChatNotification, NotificationEntry } from './types';

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
  dismissedRequestIds: string[];
  connectionRecords: ConnectionRecord[];
  activeChatId: string;
  typingUsers: Record<string, string[]>;
  setTypingUsers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  info: string;
  error: string;
  devOtpPreview: string;
  chatNotification: ChatNotification | null;
  notificationHistory: NotificationEntry[];
  setDevOtpPreview: (value: string) => void;
  setChatNotification: React.Dispatch<React.SetStateAction<ChatNotification | null>>;
  setActiveChatId: (id: string) => void;
  setInfo: (msg: string) => void;
  setError: (msg: string) => void;
  serverBaseUrl: string;
  refreshIncomingRequests: () => Promise<void>;
  refreshContacts: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshCalls: () => Promise<void>;
  respondToIncomingRequest: (requestId: string, action: 'accept' | 'reject') => Promise<{ chatId?: string } | void>;
  dismissIncomingRequest: (requestId: string) => void;
  restoreDismissedRequest: (requestId: string) => void;
  saveConnectionRecord: (request: IncomingRequest, disposition: ConnectionRecord['disposition'], note?: string) => void;
  saveConnectionRecordFromUser: (input: ConnectionRecordInput, disposition: ConnectionRecord['disposition'], note?: string) => void;
  removeConnectionRecord: (requestId: string, disposition?: ConnectionRecord['disposition']) => void;
  addNotificationEntry: (input: Omit<NotificationEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void;
  removeNotificationEntry: (notificationId: string) => void;
  clearNotificationHistory: () => void;
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
  lockApp: () => void;
  unlockApp: () => void;
  biometricSupported: boolean;
  hashLockSecret: (value: string) => Promise<string>;
  registerBiometricLock: () => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  updateNotice: UpdateNotice | null;
  applyAvailableUpdate: () => void;
  dismissAvailableUpdate: () => void;
  applyStoredUpdate: (buildId: string) => void;
  dismissStoredUpdate: (buildId: string) => void;
};

const AppContext = createContext<AppState | null>(null);

const defaultAppLockConfig: AppLockConfig = {
  pinHash: '',
  passwordHash: '',
  patternHash: '',
  biometricEnabled: false,
  biometricCredentialId: '',
  autoLockOnHide: false,
};

const clientResetVersion = '2026-05-17-clean-launch';
const legacyStorageKeys = [
  'wa_token',
  'helloto_session_token',
  'helloto_saved_account_token',
  'helloto_archived_chats',
  'helloto_locked_chats',
  'helloto_status_items',
  'helloto_viewed_status_ids',
  'helloto_theme',
  'helloto_runtime_build_id',
  'helloto_dismissed_update_build',
  'helloto_tab_id',
] as const;

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
  const [dismissedRequestIds, setDismissedRequestIds] = useState<string[]>([]);
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [devOtpPreview, setDevOtpPreview] = useState('');
  const [chatNotification, setChatNotification] = useState<ChatNotification | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<NotificationEntry[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [appLockConfig, setAppLockConfig] = useState<AppLockConfig>(defaultAppLockConfig);
  const [appLockOwnerUserId, setAppLockOwnerUserId] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('helloto_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  const socketRef = useRef<Socket | null>(null);
  const pageInstanceIdRef = useRef(`page-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const initialChatPickedRef = useRef(false);
  const currentBuildId = __APP_BUILD_ID__;
  const sessionTokenKey = 'helloto_session_token';
  const savedAccountTokenKey = 'helloto_saved_account_token';
  const runtimeBuildIdKey = 'helloto_runtime_build_id';
  const getCurrentTabId = useCallback(() => {
    const saved = sessionStorage.getItem('helloto_tab_id');
    if (saved) return saved;
    const next = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('helloto_tab_id', next);
    return next;
  }, []);
  const biometricSupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window && typeof navigator !== 'undefined' && 'credentials' in navigator;
  const hasAppLock = Boolean(
    appLockConfig.pinHash
    || appLockConfig.passwordHash
    || (appLockConfig.biometricEnabled && appLockConfig.biometricCredentialId),
  );

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

  const getUserLockStorageKey = useCallback((userId: string) => `helloto_app_lock_${userId}`, []);
  const getUserSessionUnlockKey = useCallback((userId: string) => `helloto_app_unlock_${userId}`, []);
  const getUserTabOwnerKey = useCallback((userId: string) => `helloto_active_tab_owner_${userId}`, []);
  const getTabRefreshKey = useCallback((tabId: string) => `helloto_refreshing_tab_${tabId}`, []);
  const getUserConnectionCenterKey = useCallback((userId: string) => `helloto_connection_center_${userId}`, []);
  const getUserNotificationCenterKey = useCallback((userId: string) => `helloto_notification_center_${userId}`, []);
  const getSeenAdminNoticeKey = useCallback((userId: string) => `helloto_seen_admin_notices_${userId}`, []);
  const seenIncomingRequestIdsRef = useRef<string[]>([]);

  const unlockApp = useCallback(() => {
    setIsLocked(false);
    if (me?.id) {
      sessionStorage.setItem(getUserSessionUnlockKey(me.id), '1');
    }
  }, [getUserSessionUnlockKey, me?.id]);

  const lockApp = useCallback(() => {
    setIsLocked(true);
    if (me?.id) {
      sessionStorage.removeItem(getUserSessionUnlockKey(me.id));
    }
  }, [getUserSessionUnlockKey, me?.id]);

  const clearAppLockConfig = useCallback(() => {
    setAppLockConfig(defaultAppLockConfig);
    if (me?.id) {
      sessionStorage.removeItem(getUserSessionUnlockKey(me.id));
    }
    localStorage.removeItem('helloto_admin_biometric_credential_id');
    setIsLocked(false);
  }, [getUserSessionUnlockKey, me?.id]);

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
            name: 'helloto-admin-face-scan',
            displayName: 'HelloToo Admin Face Scan',
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
      localStorage.setItem('helloto_admin_biometric_credential_id', rawId);
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
    if (!biometricSupported || !navigator.credentials) return false;
    const credentialId = appLockConfig.biometricCredentialId || localStorage.getItem('helloto_admin_biometric_credential_id');
    if (!credentialId) return false;
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: base64UrlToBytes(credentialId),
              type: 'public-key',
            },
          ],
          timeout: 60000,
          userVerification: 'required',
        },
      });
      unlockApp();
      return true;
    } catch {
      return false;
    }
  }, [appLockConfig.biometricCredentialId, biometricSupported, unlockApp]);

  const getApiUrl = useCallback(() => {
    const appProtocol = window.location.protocol?.startsWith('http') ? window.location.protocol : 'http:';
    const appHostname = window.location.hostname && window.location.hostname !== '' && window.location.hostname !== 'chrome-error' ? window.location.hostname : 'localhost';
    return import.meta.env.VITE_API_URL ?? `${appProtocol}//${appHostname}:8788`;
  }, []);
  const serverBaseUrl = getApiUrl();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const appliedResetVersion = localStorage.getItem('helloto_client_reset_version');
    if (appliedResetVersion === clientResetVersion) return;

    legacyStorageKeys.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    Object.keys(localStorage)
      .filter((key) =>
        key.startsWith('helloto_app_lock_')
        || key.startsWith('helloto_locked_chats_')
        || key.startsWith('helloto_chat_lock_config_')
        || key.startsWith('helloto_connection_center_')
        || key.startsWith('helloto_notification_center_')
        || key.startsWith('helloto_active_tab_owner_'),
      )
      .forEach((key) => localStorage.removeItem(key));

    Object.keys(sessionStorage)
      .filter((key) =>
        key.startsWith('helloto_app_unlock_')
        || key.startsWith('helloto_chat_lock_open_')
        || key.startsWith('helloto_refreshing_tab_'),
      )
      .forEach((key) => sessionStorage.removeItem(key));

    localStorage.setItem('helloto_client_reset_version', clientResetVersion);
  }, []);

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
      if (typeof body === 'string' && /^\s*<!doctype html>|^\s*<html/i.test(body)) {
        throw new Error(`The HelloToo server at ${API} returned the website HTML for ${path} instead of JSON. Restart the backend so the latest API routes are loaded.`);
      }
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
    getCurrentTabId();
    const savedToken = sessionStorage.getItem(sessionTokenKey) ?? localStorage.getItem(savedAccountTokenKey) ?? '';
    if (!sessionStorage.getItem(runtimeBuildIdKey)) {
      sessionStorage.setItem(runtimeBuildIdKey, currentBuildId);
    }
    localStorage.removeItem('wa_token');
    if (savedToken) setToken(savedToken);
  }, [currentBuildId, getCurrentTabId, savedAccountTokenKey]);

  useEffect(() => {
    if (token) {
      sessionStorage.setItem(sessionTokenKey, token);
      localStorage.setItem(savedAccountTokenKey, token);
      return;
    }
    sessionStorage.removeItem(sessionTokenKey);
  }, [savedAccountTokenKey, sessionTokenKey, token]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('helloto_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!me?.id) {
      initialChatPickedRef.current = false;
      setAppLockOwnerUserId('');
      setAppLockConfig(defaultAppLockConfig);
      setDismissedRequestIds([]);
      setConnectionRecords([]);
      setNotificationHistory([]);
      setIsLocked(false);
      return;
    }
    try {
      const saved = localStorage.getItem(getUserLockStorageKey(me.id));
      setAppLockConfig(saved ? { ...defaultAppLockConfig, ...JSON.parse(saved) as Partial<AppLockConfig> } : defaultAppLockConfig);
      setAppLockOwnerUserId(me.id);
    } catch {
      setAppLockOwnerUserId(me.id);
      setAppLockConfig(defaultAppLockConfig);
    }
    try {
      const savedConnectionCenter = localStorage.getItem(getUserConnectionCenterKey(me.id));
      if (savedConnectionCenter) {
        const parsed = JSON.parse(savedConnectionCenter) as { dismissedRequestIds?: string[]; connectionRecords?: ConnectionRecord[] };
        setDismissedRequestIds(parsed.dismissedRequestIds ?? []);
        setConnectionRecords(parsed.connectionRecords ?? []);
      } else {
        setDismissedRequestIds([]);
        setConnectionRecords([]);
      }
    } catch {
      setDismissedRequestIds([]);
      setConnectionRecords([]);
    }
    try {
      const savedNotificationCenter = localStorage.getItem(getUserNotificationCenterKey(me.id));
      setNotificationHistory(savedNotificationCenter ? JSON.parse(savedNotificationCenter) as NotificationEntry[] : []);
    } catch {
      setNotificationHistory([]);
    }
  }, [me?.id, getUserConnectionCenterKey, getUserLockStorageKey, getUserNotificationCenterKey]);

  useEffect(() => {
    if (!me?.id) return;
    const currentTabId = getCurrentTabId();
    const ownerKey = getUserTabOwnerKey(me.id);
    const refreshKey = getTabRefreshKey(currentTabId);
    const currentInstanceId = pageInstanceIdRef.current;
    const isReloadingSameTab = sessionStorage.getItem(refreshKey) === '1';
    const ownerRaw = localStorage.getItem(ownerKey);
    const owner = ownerRaw
      ? (() => {
          try {
            return JSON.parse(ownerRaw) as { tabId?: string; instanceId?: string };
          } catch {
            return { tabId: ownerRaw, instanceId: '' };
          }
        })()
      : null;

    const claimedByAnotherTab = Boolean(
      owner?.tabId
      && (
        owner.tabId !== currentTabId
        || (owner.tabId === currentTabId && owner.instanceId && owner.instanceId !== currentInstanceId && !isReloadingSameTab)
      ),
    );

    if (claimedByAnotherTab) {
      sessionStorage.removeItem(sessionTokenKey);
      setToken('');
      setMe(null);
      setError('This account is already active in another tab. Opening a new tab requires logging in again from the beginning.');
      return;
    }

    sessionStorage.removeItem(refreshKey);
    localStorage.setItem(ownerKey, JSON.stringify({ tabId: currentTabId, instanceId: currentInstanceId }));

    const releaseOwner = () => {
      sessionStorage.setItem(refreshKey, '1');
      const latestOwner = localStorage.getItem(ownerKey);
      const parsedOwner = latestOwner
        ? (() => {
            try {
              return JSON.parse(latestOwner) as { tabId?: string; instanceId?: string };
            } catch {
              return { tabId: latestOwner, instanceId: '' };
            }
          })()
        : null;
      if (parsedOwner?.tabId === currentTabId && parsedOwner.instanceId === currentInstanceId) {
        localStorage.removeItem(ownerKey);
      }
    };

    window.addEventListener('beforeunload', releaseOwner);
    return () => {
      window.removeEventListener('beforeunload', releaseOwner);
      const latestOwner = localStorage.getItem(ownerKey);
      const parsedOwner = latestOwner
        ? (() => {
            try {
              return JSON.parse(latestOwner) as { tabId?: string; instanceId?: string };
            } catch {
              return { tabId: latestOwner, instanceId: '' };
            }
          })()
        : null;
      if (parsedOwner?.tabId === currentTabId && parsedOwner.instanceId === currentInstanceId) {
        localStorage.removeItem(ownerKey);
      }
    };
  }, [getCurrentTabId, getTabRefreshKey, getUserTabOwnerKey, me?.id, savedAccountTokenKey, sessionTokenKey]);

  useEffect(() => {
    if (!me?.id || appLockOwnerUserId !== me.id) return;
    localStorage.setItem(getUserLockStorageKey(me.id), JSON.stringify(appLockConfig));
  }, [appLockConfig, appLockOwnerUserId, me?.id, getUserLockStorageKey]);

  useEffect(() => {
    if (!me?.id) return;
    localStorage.setItem(getUserConnectionCenterKey(me.id), JSON.stringify({
      dismissedRequestIds,
      connectionRecords,
    }));
  }, [connectionRecords, dismissedRequestIds, getUserConnectionCenterKey, me?.id]);

  useEffect(() => {
    if (!me?.id) return;
    localStorage.setItem(getUserNotificationCenterKey(me.id), JSON.stringify(notificationHistory));
  }, [getUserNotificationCenterKey, me?.id, notificationHistory]);

  useEffect(() => {
    if (!appLockConfig.patternHash) return;
    setAppLockConfig((current) => current.patternHash ? { ...current, patternHash: '' } : current);
  }, [appLockConfig.patternHash]);

  // Load user data
  useEffect(() => {
    if (!token) return;
    api<{ user: User }>('/me', { token }).then(({ user }) => {
      setMe(user);
    }).catch(() => {
      sessionStorage.removeItem(sessionTokenKey);
      localStorage.removeItem(savedAccountTokenKey);
      setToken('');
      setMe(null);
    });
  }, [token, api, savedAccountTokenKey, sessionTokenKey]);

  const refreshContacts = useCallback(async () => {
    if (!token) return;
    const res = await api<{ contacts: Contact[] }>('/contacts', { token });
    setContacts(res.contacts);
  }, [token, api]);

  useEffect(() => {
    if (!me?.id || !hasAppLock) {
      if (me?.id) {
        sessionStorage.removeItem(getUserSessionUnlockKey(me.id));
      }
      setIsLocked(false);
      return;
    }
    const sessionUnlocked = sessionStorage.getItem(getUserSessionUnlockKey(me.id)) === '1';
    setIsLocked(!sessionUnlocked);
  }, [me?.id, hasAppLock, getUserSessionUnlockKey]);

  useEffect(() => {
    if (!me?.id || !hasAppLock || !appLockConfig.autoLockOnHide) return;

    const lockNow = () => lockApp();
    // Do not lock on normal tab switching. Only lock when the page is actually being closed or reloaded.
    const onPageHide = () => lockNow();

    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [me?.id, hasAppLock, appLockConfig.autoLockOnHide, lockApp]);

  const refreshChats = useCallback(async () => {
    if (!token) return;
    const res = await api<{ chats: Chat[] }>('/chats', { token });
    setChats(res.chats);
    setActiveChatId((current) => {
      if (current && res.chats.some((chat) => chat.id === current)) return current;
      initialChatPickedRef.current = true;
      return '';
    });
  }, [token, api]);

  const refreshIncomingRequests = useCallback(async () => {
    if (!token) return;
    const res = await api<{ requests: IncomingRequest[] }>('/connections/requests', { token });
    setIncomingRequests(res.requests);
    setDismissedRequestIds((current) => current.filter((requestId) => res.requests.some((request) => request.id === requestId)));
  }, [token, api]);

  const dismissIncomingRequest = useCallback((requestId: string) => {
    setDismissedRequestIds((current) => current.includes(requestId) ? current : [...current, requestId]);
  }, []);

  const restoreDismissedRequest = useCallback((requestId: string) => {
    setDismissedRequestIds((current) => current.filter((id) => id !== requestId));
  }, []);

  const saveConnectionRecord = useCallback((request: IncomingRequest, disposition: ConnectionRecord['disposition'], note = '') => {
    setConnectionRecords((current) => {
      const nextRecord: ConnectionRecord = {
        requestId: request.id,
        userId: request.fromUser.id,
        name: request.fromUser.name || request.fromUser.username || 'Unknown user',
        avatarUrl: request.fromUser.avatarUrl,
        aliasName: request.aliasName,
        phoneNumber: request.phoneNumber,
        createdAt: request.createdAt,
        disposition,
        note,
      };
      return [nextRecord, ...current.filter((record) => record.requestId !== request.id)];
    });
  }, []);

  const saveConnectionRecordFromUser = useCallback((input: ConnectionRecordInput, disposition: ConnectionRecord['disposition'], note = '') => {
    setConnectionRecords((current) => {
      const nextRecord: ConnectionRecord = {
        requestId: input.requestId,
        userId: input.userId,
        name: input.name,
        avatarUrl: input.avatarUrl,
        aliasName: input.aliasName ?? null,
        phoneNumber: input.phoneNumber ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
        disposition,
        note,
      };
      return [nextRecord, ...current.filter((record) => !(record.requestId === input.requestId && record.disposition === disposition))];
    });
  }, []);

  const removeConnectionRecord = useCallback((requestId: string, disposition?: ConnectionRecord['disposition']) => {
    setConnectionRecords((current) => current.filter((record) => record.requestId !== requestId || (disposition && record.disposition !== disposition)));
  }, []);

  const addNotificationEntry = useCallback((input: Omit<NotificationEntry, 'id' | 'createdAt'> & { createdAt?: string }) => {
    setNotificationHistory((current) => {
      if (input.kind === 'update' && input.updateBuildId) {
        const existing = current.find((entry) => entry.kind === 'update' && entry.updateBuildId === input.updateBuildId);
        if (existing) {
          return current.map((entry) =>
            entry.id === existing.id
              ? {
                  ...entry,
                  title: input.title,
                  detail: input.detail,
                  updateStatus: input.updateStatus ?? entry.updateStatus,
                  createdAt: input.createdAt ?? entry.createdAt,
                }
              : entry,
          );
        }
      }
      const nextEntry: NotificationEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: input.kind,
        title: input.title,
        detail: input.detail,
        createdAt: input.createdAt ?? new Date().toISOString(),
        updateBuildId: input.updateBuildId,
        updateStatus: input.updateStatus,
      };
      return [nextEntry, ...current].slice(0, 120);
    });
  }, []);

  const removeNotificationEntry = useCallback((notificationId: string) => {
    setNotificationHistory((current) => current.filter((entry) => entry.id !== notificationId));
  }, []);

  const clearNotificationHistory = useCallback(() => {
    setNotificationHistory([]);
  }, []);

  const applyStoredUpdate = useCallback((buildId: string) => {
    if (!buildId) return;
    sessionStorage.setItem(runtimeBuildIdKey, buildId);
    sessionStorage.removeItem('helloto_dismissed_update_build');
    addNotificationEntry({
      kind: 'update',
      title: 'Website updated',
      detail: `Version ${buildId} was applied.`,
      updateBuildId: buildId,
      updateStatus: 'accepted',
    });
    setUpdateNotice(null);
    window.location.reload();
  }, [addNotificationEntry]);

  const dismissStoredUpdate = useCallback((buildId: string) => {
    if (!buildId) return;
    sessionStorage.setItem('helloto_dismissed_update_build', buildId);
    addNotificationEntry({
      kind: 'update',
      title: 'Update postponed',
      detail: `Version ${buildId} was kept for later.`,
      updateBuildId: buildId,
      updateStatus: 'rejected',
    });
    setUpdateNotice((current) => current?.latestBuildId === buildId ? null : current);
  }, [addNotificationEntry]);

  useEffect(() => {
    let cancelled = false;
    const checkForUpdates = async () => {
      try {
        const response = await fetch(`/build-meta.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as { buildId?: string };
        const latestBuildId = body.buildId?.trim();
        const runtimeBuildId = sessionStorage.getItem(runtimeBuildIdKey) ?? currentBuildId;
        if (!latestBuildId || latestBuildId === runtimeBuildId) {
          if (!cancelled) setUpdateNotice(null);
          return;
        }
        const dismissedBuild = sessionStorage.getItem('helloto_dismissed_update_build') ?? '';
        addNotificationEntry({
          kind: 'update',
          title: 'Website update available',
          detail: `Version ${latestBuildId} is ready to install.`,
          updateBuildId: latestBuildId,
          updateStatus: dismissedBuild === latestBuildId ? 'rejected' : 'pending',
        });
        if (!cancelled && dismissedBuild !== latestBuildId) {
          setUpdateNotice({ currentBuildId: runtimeBuildId, latestBuildId });
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
  }, [addNotificationEntry, currentBuildId]);

  const applyAvailableUpdate = useCallback(() => {
    if (!updateNotice?.latestBuildId) return;
    applyStoredUpdate(updateNotice.latestBuildId);
  }, [applyStoredUpdate, updateNotice?.latestBuildId]);

  const dismissAvailableUpdate = useCallback(() => {
    if (!updateNotice?.latestBuildId) return;
    dismissStoredUpdate(updateNotice.latestBuildId);
  }, [dismissStoredUpdate, updateNotice?.latestBuildId]);

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
    setDismissedRequestIds((prev) => prev.filter((id) => id !== requestId));

    if (action === 'accept' && res.contact) {
      setConnectionRecords((prev) => prev.filter((record) => record.requestId !== requestId));
      setContacts((prev) => [res.contact!, ...prev.filter((contact) => contact.id !== res.contact!.id)]);
      if (res.chatId) {
        await refreshChats();
        setActiveChatId(res.chatId);
      }
      setInfo(`You are now connected with ${res.fromUser?.name ?? 'this user'}`);
      return { chatId: res.chatId };
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
    api<{ notices: Array<{ id: string; title: string; message: string; createdAt: string }> }>('/me/notices', { token })
      .then(({ notices }) => {
        let seenIds: string[] = [];
        try {
          const saved = localStorage.getItem(getSeenAdminNoticeKey(me.id));
          seenIds = saved ? JSON.parse(saved) as string[] : [];
        } catch {
          seenIds = [];
        }
        const seenSet = new Set(seenIds);
        const freshNotices = notices.filter((notice) => !seenSet.has(notice.id));
        if (!freshNotices.length) return;
        freshNotices
          .slice()
          .reverse()
          .forEach((notice) => {
            addNotificationEntry({
              kind: 'info',
              title: notice.title,
              detail: notice.message,
              createdAt: notice.createdAt,
            });
          });
        localStorage.setItem(getSeenAdminNoticeKey(me.id), JSON.stringify([...seenSet, ...freshNotices.map((notice) => notice.id)]));
      })
      .catch(() => null);
  }, [token, me?.id, api, addNotificationEntry, getSeenAdminNoticeKey]);

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

  useEffect(() => {
    if (!chatNotification) return;
    addNotificationEntry({
      kind: 'message',
      title: chatNotification.senderName,
      detail: `${chatNotification.preview} • ${chatNotification.unreadCount} unread message${chatNotification.unreadCount === 1 ? '' : 's'}`,
    });
  }, [addNotificationEntry, chatNotification]);

  useEffect(() => {
    if (!info) return;
    addNotificationEntry({
      kind: 'info',
      title: 'HelloToo',
      detail: info,
    });
  }, [addNotificationEntry, info]);

  useEffect(() => {
    if (!error) return;
    addNotificationEntry({
      kind: 'error',
      title: 'Error',
      detail: error,
    });
  }, [addNotificationEntry, error]);

  useEffect(() => {
    if (!devOtpPreview) return;
    addNotificationEntry({
      kind: 'otp',
      title: 'OTP received',
      detail: `OTP: ${devOtpPreview}`,
    });
  }, [addNotificationEntry, devOtpPreview]);

  useEffect(() => {
    const previousIds = new Set(seenIncomingRequestIdsRef.current);
    const nextIds = incomingRequests.map((request) => request.id);
    incomingRequests.forEach((request) => {
      if (previousIds.has(request.id)) return;
      addNotificationEntry({
        kind: 'connection',
        title: `${request.fromUser.name || request.fromUser.username || 'Someone'} sent a connection request`,
        detail: request.phoneNumber || request.aliasName || `@${request.fromUser.username}` || 'New connection request',
        createdAt: request.createdAt,
      });
    });
    seenIncomingRequestIdsRef.current = nextIds;
  }, [addNotificationEntry, incomingRequests]);

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
    token, setToken, me, setMe, contacts, setContacts, chats, setChats, messages, setMessages, calls, setCalls, incomingRequests, setIncomingRequests, dismissedRequestIds, connectionRecords, activeChatId, typingUsers, setTypingUsers,
    info, error, devOtpPreview, chatNotification, notificationHistory, setDevOtpPreview, setChatNotification, isMobile, setActiveChatId, setInfo, setError,
    serverBaseUrl, refreshIncomingRequests, refreshContacts, refreshChats, refreshCalls, respondToIncomingRequest, dismissIncomingRequest, restoreDismissedRequest, saveConnectionRecord, saveConnectionRecordFromUser, removeConnectionRecord, addNotificationEntry, removeNotificationEntry, clearNotificationHistory, api, socket,
    theme, setTheme, toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    appLockConfig, updateAppLockConfig, clearAppLockConfig, isLocked, setIsLocked, lockApp, unlockApp, biometricSupported, hashLockSecret, registerBiometricLock, unlockWithBiometric,
    updateNotice, applyAvailableUpdate, dismissAvailableUpdate, applyStoredUpdate, dismissStoredUpdate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
