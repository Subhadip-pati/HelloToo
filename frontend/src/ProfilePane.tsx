import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Avatar, fmtDate } from './App';
import { useApp } from './AppContext';
import './index.css';

type ChatLockConfig = {
  pinHash: string;
  passwordHash: string;
};

const defaultChatLockConfig: ChatLockConfig = {
  pinHash: '',
  passwordHash: '',
};

type AccountView =
  | 'general'
  | 'profile'
  | 'account'
  | 'credentials'
  | 'security'
  | 'app-lock'
  | 'locked-members'
  | 'privacy'
  | 'chats'
  | 'video'
  | 'notifications'
  | 'update-history'
  | 'connections'
  | 'calls'
  | 'help';

export function ProfilePane({ section }: { section: string }) {
  const {
    me,
    token,
    api,
    setInfo,
    setError,
    setMe,
    setDevOtpPreview,
    chats,
    calls,
    incomingRequests,
    dismissedRequestIds,
    connectionRecords,
    notificationHistory,
    removeNotificationEntry,
    clearNotificationHistory,
    dismissIncomingRequest,
    restoreDismissedRequest,
    saveConnectionRecord,
    removeConnectionRecord,
    refreshIncomingRequests,
    respondToIncomingRequest,
    isMobile,
    theme,
    toggleTheme,
    appLockConfig,
    updateAppLockConfig,
    clearAppLockConfig,
    lockApp,
    unlockApp,
    biometricSupported,
    hashLockSecret,
    registerBiometricLock,
    applyStoredUpdate,
    dismissStoredUpdate,
  } = useApp();
  const [saving, setSaving] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<AccountView>('general');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [showPinValue, setShowPinValue] = useState(false);
  const [showPasswordValue, setShowPasswordValue] = useState(false);
  const [accountCurrentPassword, setAccountCurrentPassword] = useState('');
  const [accountNewPassword, setAccountNewPassword] = useState('');
  const [showAccountCurrentPassword, setShowAccountCurrentPassword] = useState(false);
  const [showAccountNewPassword, setShowAccountNewPassword] = useState(false);
  const [verifySecretValue, setVerifySecretValue] = useState('');
  const [showVerifySecretValue, setShowVerifySecretValue] = useState(false);
  const [chatLockConfig, setChatLockConfig] = useState<ChatLockConfig>(defaultChatLockConfig);
  const [chatLockPinValue, setChatLockPinValue] = useState('');
  const [chatLockPinConfirmValue, setChatLockPinConfirmValue] = useState('');
  const [chatLockPasswordValue, setChatLockPasswordValue] = useState('');
  const [chatLockPasswordConfirmValue, setChatLockPasswordConfirmValue] = useState('');
  const [showChatLockPinValue, setShowChatLockPinValue] = useState(false);
  const [showChatLockPinConfirmValue, setShowChatLockPinConfirmValue] = useState(false);
  const [showChatLockPasswordValue, setShowChatLockPasswordValue] = useState(false);
  const [showChatLockPasswordConfirmValue, setShowChatLockPasswordConfirmValue] = useState(false);
  const [verifyChatLockSecretValue, setVerifyChatLockSecretValue] = useState('');
  const [showVerifyChatLockSecretValue, setShowVerifyChatLockSecretValue] = useState(false);
  const [pendingChatLockAction, setPendingChatLockAction] = useState<null | {
    kind: 'save-pin' | 'save-password' | 'delete-pin' | 'delete-password';
    title: string;
    detail: string;
  }>(null);
  const [chatLockRecoveryStep, setChatLockRecoveryStep] = useState<'identify' | 'reset'>('identify');
  const [showChatLockRecovery, setShowChatLockRecovery] = useState(false);
  const [chatLockRecoveryIdentifier, setChatLockRecoveryIdentifier] = useState('');
  const [chatLockRecoveryCode, setChatLockRecoveryCode] = useState('');
  const [chatLockRecoveryMode, setChatLockRecoveryMode] = useState<'pin' | 'password'>('pin');
  const [chatLockRecoverySecret, setChatLockRecoverySecret] = useState('');
  const [chatLockRecoveryConfirmSecret, setChatLockRecoveryConfirmSecret] = useState('');
  const [showChatLockRecoverySecret, setShowChatLockRecoverySecret] = useState(false);
  const [showChatLockRecoveryConfirmSecret, setShowChatLockRecoveryConfirmSecret] = useState(false);
  const [lockedChatIds, setLockedChatIds] = useState<string[]>([]);
  const [pendingSecurityAction, setPendingSecurityAction] = useState<null | {
    kind: 'save-pin' | 'save-password' | 'delete-pin' | 'delete-password';
    title: string;
    detail: string;
  }>(null);
  const [profileForm, setProfileForm] = useState({
    name: me?.name ?? '',
    phoneNumber: me?.phoneNumber ?? '',
    email: me?.email ?? '',
    avatarUrl: me?.avatarUrl ?? '',
    bio: me?.bio ?? '',
    statusText: me?.statusText ?? '',
  });

  useEffect(() => {
    setProfileForm({
      name: me?.name ?? '',
      phoneNumber: me?.phoneNumber ?? '',
      email: me?.email ?? '',
      avatarUrl: me?.avatarUrl ?? '',
      bio: me?.bio ?? '',
      statusText: me?.statusText ?? '',
    });
  }, [me?.avatarUrl, me?.bio, me?.email, me?.name, me?.phoneNumber, me?.statusText]);

  const getChatLockConfigStorageKey = (userId: string) => `helloto_chat_lock_config_${userId}`;
  const getLockedChatIdsStorageKey = (userId: string) => `helloto_locked_chats_${userId}`;
  const getChatLockSessionKey = (userId: string) => `helloto_chat_lock_open_${userId}`;

  useEffect(() => {
    if (!me?.id) {
      setChatLockConfig(defaultChatLockConfig);
      setLockedChatIds([]);
      return;
    }
    try {
      const saved = localStorage.getItem(getChatLockConfigStorageKey(me.id));
      setChatLockConfig(saved ? { ...defaultChatLockConfig, ...JSON.parse(saved) as Partial<ChatLockConfig> } : defaultChatLockConfig);
    } catch {
      setChatLockConfig(defaultChatLockConfig);
    }
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return;
    try {
      const saved = localStorage.getItem(getLockedChatIdsStorageKey(me.id));
      setLockedChatIds(saved ? JSON.parse(saved) as string[] : []);
    } catch {
      setLockedChatIds([]);
    }
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return;
    localStorage.setItem(getChatLockConfigStorageKey(me.id), JSON.stringify(chatLockConfig));
    window.dispatchEvent(new CustomEvent('helloto:chat-lock-updated'));
  }, [chatLockConfig, me?.id]);

  useEffect(() => {
    if (section !== 'account' || !token) return;
    refreshIncomingRequests().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [section, token, refreshIncomingRequests, setError]);

  const saveProfile = async () => {
    if (!token || saving) return;
    setSaving(true);
    try {
      const res = await api<{ user: typeof me }>('/me/profile', {
        method: 'PUT',
        token,
        body: JSON.stringify(profileForm),
      });
      setMe(res.user);
      setInfo('Profile updated');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const requestOtp = async () => {
    try {
      await api('/auth/request-email-otp', {
        method: 'POST',
        body: JSON.stringify({ email: profileForm.email, purpose: 'verify-email' }),
      });
      setInfo('Verification OTP sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const changeAccountPassword = async () => {
    if (!token || saving) return;
    if (!accountCurrentPassword.trim()) {
      setError('Enter your current password first.');
      return;
    }
    if (accountNewPassword.trim().length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await api('/me/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify({
          currentPassword: accountCurrentPassword,
          newPassword: accountNewPassword,
        }),
      });
      setAccountCurrentPassword('');
      setAccountNewPassword('');
      setInfo('Password changed successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleProfilePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your profile photo.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setError('Could not read that image. Please try another one.');
        return;
      }
      setProfileForm((current) => ({ ...current, avatarUrl: result }));
      setInfo('Profile photo selected. Save profile to keep it.');
    };
    reader.onerror = () => setError('Could not read that image. Please try another one.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const resetSession = () => {
    const tabId = sessionStorage.getItem('helloto_tab_id') ?? '';
    if (me?.id) {
      localStorage.removeItem(`helloto_active_tab_owner_${me.id}`);
    }
    if (tabId) {
      sessionStorage.removeItem(`helloto_refreshing_tab_${tabId}`);
    }
    sessionStorage.removeItem('helloto_session_token');
    localStorage.removeItem('helloto_saved_account_token');
    window.location.reload();
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      const request = incomingRequests.find((entry) => entry.id === requestId);
      if (action === 'reject' && request) {
        saveConnectionRecord(request, 'rejected');
      }
      await respondToIncomingRequest(requestId, action);
      if (action === 'accept') setInfo('Connected. The chat is ready now.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestBusy(false);
    }
  };

  const reportIncomingRequest = async (request: (typeof incomingRequests)[number]) => {
    if (!token || requestBusy) return;
    setRequestBusy(true);
    try {
      await api('/reports', {
        method: 'POST',
        token,
        body: JSON.stringify({
          targetUserId: request.fromUser.id,
          reason: 'Connection request report',
          detail: 'Reported for spam, scam or unwanted messages',
        }),
      });
      saveConnectionRecord(request, 'reported', 'Reported for spam, scam or unwanted messages');
      await respondToIncomingRequest(request.id, 'reject');
      setInfo(`${request.fromUser.name} reported`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestBusy(false);
    }
  };

  const recentCalls = useMemo(
    () => [...calls].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12),
    [calls],
  );
  const inboxConnections = useMemo(() => incomingRequests.filter((request) => dismissedRequestIds.includes(request.id)), [dismissedRequestIds, incomingRequests]);
  const queuedPopupConnections = useMemo(() => incomingRequests.filter((request) => !dismissedRequestIds.includes(request.id)), [dismissedRequestIds, incomingRequests]);
  const rejectedConnections = useMemo(() => connectionRecords.filter((record) => record.disposition === 'rejected'), [connectionRecords]);
  const blockedConnections = useMemo(() => connectionRecords.filter((record) => record.disposition === 'blocked'), [connectionRecords]);
  const reportedConnections = useMemo(() => connectionRecords.filter((record) => record.disposition === 'reported'), [connectionRecords]);
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
  const updateNotifications = useMemo(
    () => notificationHistory.filter((entry) => entry.kind === 'update' && entry.updateBuildId),
    [notificationHistory],
  );
  const rejectedUpdates = useMemo(
    () => updateNotifications.filter((entry) => entry.updateStatus === 'rejected'),
    [updateNotifications],
  );
  const lockedChats = useMemo(
    () => chats.filter((chat) => lockedChatIds.includes(chat.id)),
    [chats, lockedChatIds],
  );

  const settingsItems: Array<{ id: AccountView; icon: string; label: string; detail: string; badge?: string; tone?: 'danger' }> = [
    { id: 'general', icon: 'GE', label: 'General', detail: 'Startup and close' },
    { id: 'profile', icon: 'PR', label: 'Profile', detail: 'Name, profile photo, username' },
    { id: 'account', icon: 'AC', label: 'Account', detail: 'Advanced account and security options', badge: me?.emailVerified ? 'OK' : 'OTP' },
    { id: 'credentials', icon: 'GM', label: 'Gmail, mobile and password', detail: 'Change Gmail, mobile number and login password', badge: me?.emailVerified ? 'OK' : 'OTP' },
    { id: 'app-lock', icon: 'BL', label: 'Biometric and app lock', detail: 'Fingerprint, PIN, password and auto lock', badge: appLockConfig.pinHash || appLockConfig.passwordHash || appLockConfig.biometricEnabled ? 'ON' : undefined },
    { id: 'security', icon: 'SC', label: 'Locked chat security', detail: 'PIN and password for locked chats', badge: chatLockConfig.pinHash || chatLockConfig.passwordHash ? 'ON' : undefined },
    { id: 'locked-members', icon: 'LM', label: 'Locked chat members', detail: 'See chats and people inside locked chats', badge: lockedChats.length ? String(lockedChats.length) : undefined },
    { id: 'privacy', icon: 'PV', label: 'Privacy', detail: 'Blocked contacts, disappearing messages' },
    { id: 'chats', icon: 'CH', label: 'Chats', detail: 'Theme, wallpaper, chat settings' },
    { id: 'video', icon: 'VD', label: 'Video & voice', detail: 'Camera, microphone & speakers' },
    { id: 'notifications', icon: 'NT', label: 'Notifications', detail: 'Message notifications' },
    { id: 'update-history', icon: 'UP', label: 'Update history', detail: 'Applied and rejected website updates', badge: rejectedUpdates.length ? String(rejectedUpdates.length) : undefined },
    { id: 'connections', icon: 'CN', label: 'Connections', detail: 'Pending, rejected, blocked and reported users', badge: incomingRequests.length ? String(incomingRequests.length) : undefined },
    { id: 'calls', icon: 'CA', label: 'Calls', detail: 'Recent call history', badge: recentCalls.length ? String(recentCalls.length) : undefined },
    { id: 'help', icon: 'HP', label: 'Help and feedback', detail: 'Help centre, contact us, privacy policy' },
  ];

  const filteredItems = settingsItems.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${item.label} ${item.detail}`.toLowerCase().includes(needle);
  });

  const resetVerifyModal = () => {
    setVerifySecretValue('');
    setShowVerifySecretValue(false);
    setPendingSecurityAction(null);
  };

  const resetChatLockVerifyModal = () => {
    setVerifyChatLockSecretValue('');
    setShowVerifyChatLockSecretValue(false);
    setPendingChatLockAction(null);
  };

  const resetChatLockRecovery = () => {
    setShowChatLockRecovery(false);
    setChatLockRecoveryStep('identify');
    setChatLockRecoveryIdentifier((me?.email || me?.phoneNumber || '').trim());
    setChatLockRecoveryCode('');
    setChatLockRecoverySecret('');
    setChatLockRecoveryConfirmSecret('');
    setShowChatLockRecoverySecret(false);
    setShowChatLockRecoveryConfirmSecret(false);
  };

  const openChatLockRecovery = () => {
    setShowChatLockRecovery(true);
    setChatLockRecoveryStep('identify');
    setChatLockRecoveryIdentifier((me?.email || me?.phoneNumber || '').trim());
    setChatLockRecoveryCode('');
    setChatLockRecoverySecret('');
    setChatLockRecoveryConfirmSecret('');
    setShowChatLockRecoverySecret(false);
    setShowChatLockRecoveryConfirmSecret(false);
  };

  const verifyCurrentSecuritySecret = async (candidate: string) => {
    const hasPin = Boolean(appLockConfig.pinHash);
    const hasPassword = Boolean(appLockConfig.passwordHash);
    if (!hasPin && !hasPassword) return true;

    const enteredSecret = candidate.trim();
    if (!enteredSecret) {
      setError('Enter your old PIN or old password first.');
      return false;
    }

    if (hasPin) {
      const currentPinHash = await hashLockSecret(enteredSecret);
      if (currentPinHash === appLockConfig.pinHash) return true;
    }

    if (hasPassword) {
      const currentPasswordHash = await hashLockSecret(enteredSecret);
      if (currentPasswordHash === appLockConfig.passwordHash) return true;
    }

    setError('Old PIN or password is wrong.');
    return false;
  };

  const savePinLock = async (verified = false) => {
    if (!pinValue.trim()) {
      setError('Enter a PIN before adding it.');
      return;
    }
    if (!/^\d{4,8}$/.test(pinValue.trim())) {
      setError('PIN must be 4 to 8 digits.');
      return;
    }
    setSecurityBusy(true);
    try {
      if (!verified && (appLockConfig.pinHash || appLockConfig.passwordHash)) {
        setPendingSecurityAction({
          kind: 'save-pin',
          title: 'Verify before saving PIN',
          detail: 'Enter your current PIN or password first. Saving a new PIN will remove the current password automatically.',
        });
        return;
      }
      const pinHash = await hashLockSecret(pinValue.trim());
      updateAppLockConfig({ pinHash, passwordHash: '' });
      setPinValue('');
      resetVerifyModal();
      unlockApp();
      setInfo(appLockConfig.passwordHash ? 'PIN lock saved and password removed' : 'PIN lock saved');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  const savePasswordLock = async (verified = false) => {
    if (!passwordValue.trim()) {
      setError('Enter a password before adding it.');
      return;
    }
    if (passwordValue.trim().length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    setSecurityBusy(true);
    try {
      if (!verified && (appLockConfig.pinHash || appLockConfig.passwordHash)) {
        setPendingSecurityAction({
          kind: 'save-password',
          title: 'Verify before saving password',
          detail: 'Enter your current PIN or password first. Saving a new password will remove the current PIN automatically.',
        });
        return;
      }
      const passwordHash = await hashLockSecret(passwordValue.trim());
      updateAppLockConfig({ passwordHash, pinHash: '' });
      setPasswordValue('');
      resetVerifyModal();
      unlockApp();
      setInfo(appLockConfig.pinHash ? 'Password saved and PIN removed' : 'Security password saved');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  const setupBiometric = async () => {
    setSecurityBusy(true);
    try {
      if (appLockConfig.biometricEnabled) {
        updateAppLockConfig({ biometricEnabled: false, biometricCredentialId: '' });
        setInfo('Biometric unlock removed');
        return;
      }
      const ok = await registerBiometricLock();
      if (ok) {
        unlockApp();
        setInfo('Biometric unlock is ready');
      }
      else setError('Biometric setup was cancelled or is not available on this device.');
    } finally {
      setSecurityBusy(false);
    }
  };

  const removePinLock = async (verified = false) => {
    if (!verified && appLockConfig.pinHash) {
      setPendingSecurityAction({
        kind: 'delete-pin',
        title: 'Verify before deleting PIN',
        detail: 'Enter your current PIN or password first to delete this PIN.',
      });
      return;
    }
    updateAppLockConfig({ pinHash: '' });
    setPinValue('');
    resetVerifyModal();
    setInfo('PIN lock removed');
  };

  const removePasswordLock = async (verified = false) => {
    if (!verified && appLockConfig.passwordHash) {
      setPendingSecurityAction({
        kind: 'delete-password',
        title: 'Verify before deleting password',
        detail: 'Enter your current PIN or password first to delete this password.',
      });
      return;
    }
    updateAppLockConfig({ passwordHash: '' });
    setPasswordValue('');
    resetVerifyModal();
    setInfo('Security password removed');
  };

  const confirmPendingSecurityAction = async () => {
    if (!pendingSecurityAction) return;
    setSecurityBusy(true);
    try {
      const canContinue = await verifyCurrentSecuritySecret(verifySecretValue);
      if (!canContinue) return;

      if (pendingSecurityAction.kind === 'save-pin') {
        await savePinLock(true);
        return;
      }
      if (pendingSecurityAction.kind === 'save-password') {
        await savePasswordLock(true);
        return;
      }
      if (pendingSecurityAction.kind === 'delete-pin') {
        await removePinLock(true);
        return;
      }
      await removePasswordLock(true);
    } finally {
      setSecurityBusy(false);
    }
  };

  const removeBiometricLock = () => {
    updateAppLockConfig({ biometricEnabled: false, biometricCredentialId: '' });
    setInfo('Biometric unlock removed');
  };

  const verifyCurrentChatLockSecret = async (candidate: string) => {
    const hasPin = Boolean(chatLockConfig.pinHash);
    const hasPassword = Boolean(chatLockConfig.passwordHash);
    if (!hasPin && !hasPassword) return true;

    const enteredSecret = candidate.trim();
    if (!enteredSecret) {
      setError('Enter your current chat lock PIN or password first.');
      return false;
    }

    if (hasPin) {
      const currentPinHash = await hashLockSecret(enteredSecret);
      if (currentPinHash === chatLockConfig.pinHash) return true;
    }

    if (hasPassword) {
      const currentPasswordHash = await hashLockSecret(enteredSecret);
      if (currentPasswordHash === chatLockConfig.passwordHash) return true;
    }

    setError('Current chat lock PIN or password is wrong.');
    return false;
  };

  const saveChatLockPin = async (verified = false) => {
    const nextPin = chatLockPinValue.trim();
    if (!/^\d{4,8}$/.test(nextPin)) {
      setError('Chat lock PIN must be 4 to 8 digits.');
      return;
    }
    if (nextPin !== chatLockPinConfirmValue.trim()) {
      setError('Chat lock PIN and confirm PIN do not match.');
      return;
    }
    setSecurityBusy(true);
    try {
      if (!verified && (chatLockConfig.pinHash || chatLockConfig.passwordHash)) {
        setPendingChatLockAction({
          kind: 'save-pin',
          title: 'Verify old chat lock',
          detail: 'Enter your current chat lock PIN or password before saving a new PIN.',
        });
        return;
      }
      const pinHash = await hashLockSecret(nextPin);
      setChatLockConfig({ pinHash, passwordHash: '' });
      setChatLockPinValue('');
      setChatLockPinConfirmValue('');
      if (me?.id) sessionStorage.setItem(getChatLockSessionKey(me.id), '1');
      resetChatLockVerifyModal();
      setInfo('Chat lock PIN saved');
    } finally {
      setSecurityBusy(false);
    }
  };

  const saveChatLockPassword = async (verified = false) => {
    const nextPassword = chatLockPasswordValue.trim();
    if (nextPassword.length < 4) {
      setError('Chat lock password must be at least 4 characters.');
      return;
    }
    if (nextPassword !== chatLockPasswordConfirmValue.trim()) {
      setError('Chat lock password and confirm password do not match.');
      return;
    }
    setSecurityBusy(true);
    try {
      if (!verified && (chatLockConfig.pinHash || chatLockConfig.passwordHash)) {
        setPendingChatLockAction({
          kind: 'save-password',
          title: 'Verify old chat lock',
          detail: 'Enter your current chat lock PIN or password before saving a new password.',
        });
        return;
      }
      const passwordHash = await hashLockSecret(nextPassword);
      setChatLockConfig({ pinHash: '', passwordHash });
      setChatLockPasswordValue('');
      setChatLockPasswordConfirmValue('');
      if (me?.id) sessionStorage.setItem(getChatLockSessionKey(me.id), '1');
      resetChatLockVerifyModal();
      setInfo('Chat lock password saved');
    } finally {
      setSecurityBusy(false);
    }
  };

  const deleteChatLock = async (kind: 'pin' | 'password', verified = false) => {
    setSecurityBusy(true);
    try {
      if (!verified) {
        setPendingChatLockAction({
          kind: kind === 'pin' ? 'delete-pin' : 'delete-password',
          title: 'Verify old chat lock',
          detail: 'Enter your current chat lock PIN or password before deleting it.',
        });
        return;
      }
      setChatLockConfig(defaultChatLockConfig);
      setChatLockPinValue('');
      setChatLockPinConfirmValue('');
      setChatLockPasswordValue('');
      setChatLockPasswordConfirmValue('');
      if (me?.id) {
        localStorage.removeItem(getLockedChatIdsStorageKey(me.id));
        sessionStorage.removeItem(getChatLockSessionKey(me.id));
      }
      window.dispatchEvent(new CustomEvent('helloto:chat-lock-updated'));
      resetChatLockVerifyModal();
      setInfo('Chat lock removed');
    } finally {
      setSecurityBusy(false);
    }
  };

  const confirmPendingChatLockAction = async () => {
    if (!pendingChatLockAction) return;
    setSecurityBusy(true);
    try {
      const canContinue = await verifyCurrentChatLockSecret(verifyChatLockSecretValue);
      if (!canContinue) return;

      if (pendingChatLockAction.kind === 'save-pin') {
        await saveChatLockPin(true);
        return;
      }
      if (pendingChatLockAction.kind === 'save-password') {
        await saveChatLockPassword(true);
        return;
      }
      if (pendingChatLockAction.kind === 'delete-pin') {
        await deleteChatLock('pin', true);
        return;
      }
      await deleteChatLock('password', true);
    } finally {
      setSecurityBusy(false);
    }
  };

  const requestChatLockRecoveryOtp = async () => {
    const identifier = chatLockRecoveryIdentifier.trim() || me?.email || me?.phoneNumber || '';
    if (!identifier) {
      setError('Enter your email or mobile number first.');
      return;
    }
    setSecurityBusy(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/auth/request-pin-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setChatLockRecoveryIdentifier(identifier);
      setDevOtpPreview(res.devOtpPreview ?? '');
      setInfo('OTP sent for chat lock recovery');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  const verifyChatLockRecoveryOtp = () => {
    if (!chatLockRecoveryIdentifier.trim()) {
      setError('Enter your email or mobile number first.');
      return;
    }
    if (!chatLockRecoveryCode.trim()) {
      setError('Enter the OTP first.');
      return;
    }
    setChatLockRecoveryStep('reset');
    setInfo('OTP verified. Set your new chat lock secret.');
  };

  const submitChatLockRecovery = async () => {
    const identifier = chatLockRecoveryIdentifier.trim();
    const nextSecret = chatLockRecoverySecret.trim();
    const confirmSecret = chatLockRecoveryConfirmSecret.trim();
    if (!identifier) {
      setError('Enter your email or mobile number first.');
      return;
    }
    if (chatLockRecoveryMode === 'pin') {
      if (!/^\d{4,8}$/.test(nextSecret)) {
        setError('New chat lock PIN must be 4 to 8 digits.');
        return;
      }
    } else if (nextSecret.length < 4) {
      setError('New chat lock password must be at least 4 characters.');
      return;
    }
    if (nextSecret !== confirmSecret) {
      setError('New secret and confirm secret do not match.');
      return;
    }
    setSecurityBusy(true);
    try {
      await api('/auth/reset-pin-with-otp', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          code: chatLockRecoveryCode,
          newPin: chatLockRecoveryMode === 'pin' ? nextSecret : '1234',
        }),
      });
      const nextHash = await hashLockSecret(nextSecret);
      setChatLockConfig(
        chatLockRecoveryMode === 'pin'
          ? { pinHash: nextHash, passwordHash: '' }
          : { pinHash: '', passwordHash: nextHash },
      );
      if (me?.id) sessionStorage.setItem(getChatLockSessionKey(me.id), '1');
      resetChatLockRecovery();
      setInfo('Chat lock changed successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  if (section !== 'account') return null;

  return (
    <section className={isMobile ? 'accountShell helloTooSettingsShell mobileSettingsScreen' : 'accountShell helloTooSettingsShell'}>
      <aside className={isMobile ? 'accountSidebar helloTooSettingsSidebar mobileSettingsSidebar' : 'accountSidebar helloTooSettingsSidebar'}>
        <div className="accountSidebarHeader">
          <div className="cardText">
            <strong>Settings</strong>
          </div>
        </div>

        <label className="settingsSearchWrap" aria-label="Search settings">
          <input
            className="input settingsSearchInput"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <button type="button" className="settingsProfileBlock settingsProfileHeroBtn" onClick={() => setActiveView('profile')}>
          <div className="settingsStatusBubble settingsStatusBanner">I am using HelloToo</div>
          <div className="settingsProfileAvatarWrap">
            <Avatar name={profileForm.name || 'You'} avatarUrl={profileForm.avatarUrl} size={96} />
          </div>
          <div className="settingsProfileCaption">
            <strong>{profileForm.name || 'Your profile'}</strong>
            <span>Tap to open personal details</span>
          </div>
        </button>

        <nav className="settingsNav" aria-label="Account sections">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'settingsNavItem helloTooSettingsItem activeSettingsNavItem' : 'settingsNavItem helloTooSettingsItem'}
              onClick={() => setActiveView(item.id)}
            >
              <span className="settingsItemIcon">{item.icon}</span>
              <div className="cardText">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              {item.badge ? <span className="settingsBadge">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <button type="button" className="settingsLogoutBtn" onClick={resetSession}>
          <span className="settingsItemIcon settingsDangerIcon">LO</span>
          <span>Log out</span>
        </button>
      </aside>

      <div className="accountContent helloTooSettingsContent">
        <div className="accountPanel helloTooSettingsPanel">
          <div className="settingsShortcutStage">
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('chats')}>
              <span className="settingsShortcutIcon">DC</span>
              <span>Send document</span>
            </button>
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('security')}>
              <span className="settingsShortcutIcon">SC</span>
              <span>Security</span>
            </button>
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('credentials')}>
              <span className="settingsShortcutIcon">GM</span>
              <span>Gmail & mobile</span>
            </button>
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('app-lock')}>
              <span className="settingsShortcutIcon">BL</span>
              <span>App lock</span>
            </button>
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('help')}>
              <span className="settingsShortcutIcon">AI</span>
              <span>Open DIP AI</span>
            </button>
          </div>

          <div className="settingsDetailSurface">
            <div className="accountContentHeader helloTooDetailHeader">
              <div className="cardText">
                <strong>{settingsItems.find((item) => item.id === activeView)?.label ?? 'Settings'}</strong>
                <span>{settingsItems.find((item) => item.id === activeView)?.detail ?? 'Choose a section to continue'}</span>
              </div>
            </div>

            {activeView === 'general' ? (
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Desktop layout</strong>
                  <span>The website now keeps each panel inside a fixed-height workspace with independent scrolling.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Startup</strong>
                  <span>Your last active account stays signed in until you log out from this device.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>System status</strong>
                  <span>{incomingRequests.length} pending connections and {recentCalls.length} recent calls are ready.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Theme</strong>
                  <span>Current mode: {theme === 'dark' ? 'Night' : 'Day'}</span>
                  <button type="button" className="ghostBtn" onClick={toggleTheme}>
                    Switch to {theme === 'dark' ? 'light' : 'dark'} mode
                  </button>
                </article>
              </div>
            ) : null}

            {activeView === 'profile' ? (
              <>
                <div className="formGrid twoCol">
                  <label className="field">
                    <span>Name</span>
                    <input className="input" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <input className="input" value={profileForm.statusText} onChange={(e) => setProfileForm({ ...profileForm, statusText: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input className="input" value={profileForm.phoneNumber} onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input className="input" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </label>
                  <label className="field spanTwo devicePhotoField">
                    <span>Profile photo</span>
                    <div className="devicePhotoPicker">
                      <div className="devicePhotoPreview rowStart">
                        <Avatar name={profileForm.name || 'You'} avatarUrl={profileForm.avatarUrl} size={70} />
                        <div className="cardText">
                          <strong>Choose from device</strong>
                          <span>Upload directly from your phone or computer.</span>
                        </div>
                      </div>
                      <label className="ghostBtn devicePhotoButton">
                        Select photo
                        <input type="file" accept="image/*" onChange={handleProfilePhotoChange} />
                      </label>
                    </div>
                  </label>
                  <label className="field spanTwo">
                    <span>Bio</span>
                    <textarea className="input textArea" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} />
                  </label>
                </div>
                <div className="accountActionRow">
                  <button type="button" className="primaryBtn" onClick={() => void saveProfile()} disabled={saving}>
                    {saving ? 'Saving...' : 'Save profile'}
                  </button>
                </div>
              </>
            ) : null}

            {activeView === 'account' ? (
              <>
                <div className="advancedSettingsLaunchGrid">
                  <button type="button" className="advancedSettingsLaunchCard" onClick={() => setActiveView('credentials')}>
                    <span className="settingsItemIcon">GM</span>
                    <div className="cardText">
                      <strong>Gmail, mobile number and password</strong>
                      <span>Open the full account-change section for your Gmail, mobile number, recovery contact and login password.</span>
                    </div>
                    <span className="settingsBadge">Open</span>
                  </button>
                  <button type="button" className="advancedSettingsLaunchCard" onClick={() => setActiveView('app-lock')}>
                    <span className="settingsItemIcon">BL</span>
                    <div className="cardText">
                      <strong>Biometric and app lock</strong>
                      <span>Open the full local lock section for fingerprint, PIN, password, auto lock and lock-now controls.</span>
                    </div>
                    <span className="settingsBadge">Open</span>
                  </button>
                </div>
                <div className="accountInfoGrid">
                  <article className="accountInfoCard">
                    <strong>Email verification</strong>
                    <span>{me?.emailVerified ? 'Your email is verified.' : 'Your email is not verified yet.'}</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Recovery contact</strong>
                    <span>{profileForm.phoneNumber || profileForm.email || 'Add a phone number or email for recovery.'}</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Session security</strong>
                    <span>Log out from this browser when you want to switch to another account.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Update history</strong>
                    <span>{updateNotifications.length} website update record{updateNotifications.length === 1 ? '' : 's'} are saved with time and status.</span>
                    <button type="button" className="ghostBtn" onClick={() => setActiveView('update-history')}>
                      Open update history
                    </button>
                  </article>
                </div>
                {!me?.emailVerified && profileForm.email ? (
                  <div className="accountActionRow">
                    <button type="button" className="ghostBtn" onClick={() => void requestOtp()}>
                      Send email OTP
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeView === 'credentials' ? (
              <>
                <div className="accountNotice securityLeadCard">
                  <strong>Gmail, mobile number and password</strong>
                  <span>Change the login contact details for this account. Save Gmail/mobile first, then update the password with your current password.</span>
                </div>
                <div className="accountInfoGrid securityGrid">
                  <article className="accountInfoCard securityCard">
                    <strong>Gmail address</strong>
                    <span>{me?.emailVerified ? 'Verified Gmail is active.' : 'After changing Gmail, verify it with OTP from this page.'}</span>
                    <input
                      className="input securityInput"
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })}
                      placeholder="yourname@gmail.com"
                    />
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void requestOtp()} disabled={!profileForm.email.trim()}>
                        Send Gmail OTP
                      </button>
                    </div>
                  </article>
                  <article className="accountInfoCard securityCard">
                    <strong>Mobile number</strong>
                    <span>Use a mobile number with country code when you want real SMS OTP delivery.</span>
                    <input
                      className="input securityInput"
                      type="tel"
                      value={profileForm.phoneNumber}
                      onChange={(event) => setProfileForm({ ...profileForm, phoneNumber: event.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </article>
                  <article className="accountInfoCard securityCard">
                    <strong>Save contact changes</strong>
                    <span>Updates your Gmail and mobile number on this account. At least one login contact must stay present.</span>
                    <div className="accountActionRow">
                      <button type="button" className="primaryBtn securityActionBtn" onClick={() => void saveProfile()} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Gmail and mobile'}
                      </button>
                    </div>
                  </article>
                </div>

                <div className="accountInfoGrid securityGrid">
                  <article className="accountInfoCard securityCard">
                    <strong>Current password</strong>
                    <span>Required before changing your login password.</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showAccountCurrentPassword ? 'text' : 'password'}
                        value={accountCurrentPassword}
                        onChange={(event) => setAccountCurrentPassword(event.target.value)}
                        placeholder="Current password"
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowAccountCurrentPassword((current) => !current)}>
                        {showAccountCurrentPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </article>
                  <article className="accountInfoCard securityCard">
                    <strong>New password</strong>
                    <span>Use at least 6 characters. A longer password is better.</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showAccountNewPassword ? 'text' : 'password'}
                        value={accountNewPassword}
                        onChange={(event) => setAccountNewPassword(event.target.value)}
                        placeholder="New password"
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowAccountNewPassword((current) => !current)}>
                        {showAccountNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </article>
                  <article className="accountInfoCard securityCard">
                    <strong>Apply password change</strong>
                    <span>You will stay logged in after the password is changed.</span>
                    <div className="accountActionRow">
                      <button type="button" className="primaryBtn securityActionBtn" onClick={() => void changeAccountPassword()} disabled={saving}>
                        {saving ? 'Updating...' : 'Change password'}
                      </button>
                    </div>
                  </article>
                </div>
              </>
            ) : null}

            {activeView === 'app-lock' ? (
              <>
                <div className="accountNotice securityLeadCard">
                  <strong>Biometric and app lock</strong>
                  <span>Protect this browser with a local PIN, password, biometric unlock and auto-lock controls. These locks stay on this device.</span>
                </div>
                <div className="accountInfoGrid securityGrid">
                  <article className="accountInfoCard securityCard">
                    <strong>PIN lock</strong>
                    <span>{appLockConfig.pinHash ? 'A PIN is active for fast app unlock.' : appLockConfig.passwordHash ? 'Saving a PIN will remove the current password after verification.' : 'Set a simple 4 to 8 digit PIN for quick entry on this device.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showPinValue ? 'text' : 'password'}
                        inputMode="numeric"
                        placeholder="Set or update PIN"
                        value={pinValue}
                        onChange={(event) => setPinValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowPinValue((current) => !current)} disabled={securityBusy}>
                        {showPinValue ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void savePinLock()} disabled={securityBusy}>
                        {appLockConfig.pinHash ? 'Save PIN' : 'Add PIN'}
                      </button>
                      {appLockConfig.pinHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void removePinLock()} disabled={securityBusy}>
                          Delete PIN
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Security password</strong>
                    <span>{appLockConfig.passwordHash ? 'A security password is active.' : appLockConfig.pinHash ? 'Saving a password will remove the current PIN after verification.' : 'Set a stronger password if you want extra protection beyond a PIN.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showPasswordValue ? 'text' : 'password'}
                        placeholder="Set or update password"
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowPasswordValue((current) => !current)} disabled={securityBusy}>
                        {showPasswordValue ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void savePasswordLock()} disabled={securityBusy}>
                        {appLockConfig.passwordHash ? 'Save password' : 'Add password'}
                      </button>
                      {appLockConfig.passwordHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void removePasswordLock()} disabled={securityBusy}>
                          Delete password
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Fingerprint or face unlock</strong>
                    <span>{isMobile ? (biometricSupported ? (appLockConfig.biometricEnabled ? 'Biometric unlock is active on this mobile browser profile.' : 'Use your device fingerprint or face unlock when supported.') : 'This mobile browser does not support biometric unlock here.') : 'Biometric unlock is available only on mobile devices.'}</span>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void setupBiometric()} disabled={securityBusy || !biometricSupported || !isMobile}>
                        {appLockConfig.biometricEnabled ? 'Set again' : 'Add biometric'}
                      </button>
                      {appLockConfig.biometricEnabled ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={removeBiometricLock} disabled={securityBusy}>
                          Delete biometric
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Auto lock and emergency controls</strong>
                    <span>{appLockConfig.autoLockOnHide ? 'The app locks when this tab is closed or reloaded.' : 'The app stays open while you switch tabs and only locks when you do it manually.'}</span>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => updateAppLockConfig({ autoLockOnHide: !appLockConfig.autoLockOnHide })}>
                        Turn {appLockConfig.autoLockOnHide ? 'off' : 'on'} auto lock
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={lockApp}>
                        Lock now
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={clearAppLockConfig}>
                        Delete all local locks
                      </button>
                    </div>
                  </article>
                </div>
              </>
            ) : null}

            {activeView === 'security' ? (
              <>
                <div className="accountNotice securityLeadCard">
                  <strong>Secured by INFINITY</strong>
                  <span>Choose either a PIN or a password. They cannot stay active at the same time. When you switch to one, the other is removed automatically after verification.</span>
                </div>
                <div className="accountInfoGrid securityGrid">
                  <article className="accountInfoCard securityCard">
                    <strong>Locked chats PIN</strong>
                    <span>{chatLockConfig.pinHash ? 'A locked chats PIN is active.' : chatLockConfig.passwordHash ? 'Saving a PIN will replace the current locked chats password after verification.' : 'Set a 4 to 8 digit PIN before moving chats into Locked chats.'}</span>
                    <input
                      className="input securityInput"
                      type={showChatLockPinValue ? 'text' : 'password'}
                      inputMode="numeric"
                      placeholder="Set new locked chats PIN"
                      value={chatLockPinValue}
                      onChange={(event) => setChatLockPinValue(event.target.value)}
                    />
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showChatLockPinConfirmValue ? 'text' : 'password'}
                        inputMode="numeric"
                        placeholder="Confirm PIN"
                        value={chatLockPinConfirmValue}
                        onChange={(event) => setChatLockPinConfirmValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockPinValue((current) => !current)} disabled={securityBusy}>
                        {showChatLockPinValue ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockPinConfirmValue((current) => !current)} disabled={securityBusy}>
                        {showChatLockPinConfirmValue ? 'Hide confirm' : 'Show confirm'}
                      </button>
                    </div>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void saveChatLockPin()} disabled={securityBusy}>
                        {chatLockConfig.pinHash ? 'Update PIN' : 'Add PIN'}
                      </button>
                      {chatLockConfig.pinHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void deleteChatLock('pin')} disabled={securityBusy}>
                          Delete PIN
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Locked chats password</strong>
                    <span>{chatLockConfig.passwordHash ? 'A locked chats password is active.' : chatLockConfig.pinHash ? 'Saving a password will replace the current locked chats PIN after verification.' : 'Set a locked chats password if you want something stronger than a PIN.'}</span>
                    <input
                      className="input securityInput"
                      type={showChatLockPasswordValue ? 'text' : 'password'}
                      placeholder="Set new locked chats password"
                      value={chatLockPasswordValue}
                      onChange={(event) => setChatLockPasswordValue(event.target.value)}
                    />
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showChatLockPasswordConfirmValue ? 'text' : 'password'}
                        placeholder="Confirm password"
                        value={chatLockPasswordConfirmValue}
                        onChange={(event) => setChatLockPasswordConfirmValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockPasswordValue((current) => !current)} disabled={securityBusy}>
                        {showChatLockPasswordValue ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockPasswordConfirmValue((current) => !current)} disabled={securityBusy}>
                        {showChatLockPasswordConfirmValue ? 'Hide confirm' : 'Show confirm'}
                      </button>
                    </div>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void saveChatLockPassword()} disabled={securityBusy}>
                        {chatLockConfig.passwordHash ? 'Update password' : 'Add password'}
                      </button>
                      {chatLockConfig.passwordHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void deleteChatLock('password')} disabled={securityBusy}>
                          Delete password
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>PIN lock</strong>
                    <span>{appLockConfig.pinHash ? 'A PIN is active for fast app unlock.' : appLockConfig.passwordHash ? 'Saving a PIN will remove the current password after verification.' : 'Set a simple 4 to 8 digit PIN for quick entry on this device.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showPinValue ? 'text' : 'password'}
                        inputMode="numeric"
                        placeholder="Set or update PIN"
                        value={pinValue}
                        onChange={(event) => setPinValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowPinValue((current) => !current)} disabled={securityBusy}>
                        {showPinValue ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void savePinLock()} disabled={securityBusy}>
                        {appLockConfig.pinHash ? 'Save PIN' : 'Add PIN'}
                      </button>
                      {appLockConfig.pinHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void removePinLock()} disabled={securityBusy}>
                          Delete PIN
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Security password</strong>
                    <span>{appLockConfig.passwordHash ? 'A security password is active.' : appLockConfig.pinHash ? 'Saving a password will remove the current PIN after verification.' : 'Set a stronger password if you want extra protection beyond a PIN.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input securityInput"
                        type={showPasswordValue ? 'text' : 'password'}
                        placeholder="Set or update password"
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowPasswordValue((current) => !current)} disabled={securityBusy}>
                        {showPasswordValue ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void savePasswordLock()} disabled={securityBusy}>
                        {appLockConfig.passwordHash ? 'Save password' : 'Add password'}
                      </button>
                      {appLockConfig.passwordHash ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={() => void removePasswordLock()} disabled={securityBusy}>
                          Delete password
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Fingerprint unlock</strong>
                    <span>{isMobile ? (biometricSupported ? (appLockConfig.biometricEnabled ? 'Fingerprint unlock is active on this mobile browser profile.' : 'Use your device fingerprint or face unlock when supported.') : 'This mobile browser does not support fingerprint unlock here.') : 'Fingerprint unlock is available only on mobile devices.'}</span>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => void setupBiometric()} disabled={securityBusy || !biometricSupported || !isMobile}>
                        {appLockConfig.biometricEnabled ? 'Set again' : 'Add fingerprint'}
                      </button>
                      {appLockConfig.biometricEnabled ? (
                        <button type="button" className="ghostBtn securityActionBtn" onClick={removeBiometricLock} disabled={securityBusy}>
                          Delete fingerprint
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Auto lock</strong>
                    <span>{appLockConfig.autoLockOnHide ? 'The app locks when this tab is closed or reloaded.' : 'The app stays open while you switch tabs and only locks when you do it manually.'}</span>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn securityActionBtn" onClick={() => updateAppLockConfig({ autoLockOnHide: !appLockConfig.autoLockOnHide })}>
                        Turn {appLockConfig.autoLockOnHide ? 'off' : 'on'} auto lock
                      </button>
                      <button type="button" className="ghostBtn securityActionBtn" onClick={lockApp}>
                        Lock now
                      </button>
                    </div>
                  </article>
                </div>

                <div className="accountActionRow">
                  <button
                    type="button"
                    className="ghostBtn securityActionBtn"
                    onClick={openChatLockRecovery}
                  >
                    Forgot locked chats PIN or password?
                  </button>
                  <button type="button" className="ghostBtn securityActionBtn" onClick={clearAppLockConfig}>
                    Delete all local locks
                  </button>
                </div>
              </>
            ) : null}

            {activeView === 'locked-members' ? (
              <>
                <div className="accountInfoGrid">
                  <article className="accountInfoCard">
                    <strong>Locked chats</strong>
                    <span>{lockedChats.length} protected chat{lockedChats.length === 1 ? '' : 's'} are saved in your locked section.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Members visible</strong>
                    <span>See the people or groups that are currently inside your locked chats section.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Security</strong>
                    <span>{chatLockConfig.pinHash || chatLockConfig.passwordHash ? 'Your locked chats are protected by a PIN or password.' : 'Set a locked chats PIN or password from Security first.'}</span>
                  </article>
                </div>

                {lockedChats.length ? (
                  <div className="requestStack accountRequestList">
                    {lockedChats.map((chat) => (
                      <div key={`locked-${chat.id}`} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={chat.title} avatarUrl={chat.avatarUrl} group={chat.isGroup} />
                          <div className="cardText">
                            <strong>{chat.title}</strong>
                            <span>
                              {chat.isGroup
                                ? `${chat.members.length} member${chat.members.length === 1 ? '' : 's'} in this locked group`
                                : chat.peer?.phoneNumber || chat.peer?.email || 'Private direct chat'}
                            </span>
                            <span>
                              {chat.isGroup
                                ? chat.members.map((member) => member.name).join(', ')
                                : chat.peer?.name || 'Locked member'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="compactEmpty requestEmptyCard">No locked chat members yet.</div>
                )}
              </>
            ) : null}

            {activeView === 'privacy' ? (
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Presence</strong>
                  <span>Your online status and last seen stay connected to the live chat presence system.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Connection approval</strong>
                  <span>People need approval before appearing in your main chats list.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Profile sharing</strong>
                  <span>Only saved profile details are shown to your chat contacts.</span>
                </article>
              </div>
            ) : null}

            {activeView === 'chats' ? (
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Wallpaper</strong>
                  <span>The chat panel now uses a fixed HelloToo desktop wallpaper surface.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Scrolling</strong>
                  <span>Scrolling stays inside the message list and the sidebar instead of stretching the website.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Unread indicator</strong>
                  <span>New messages remain visible without forcing the conversation to jump.</span>
                </article>
              </div>
            ) : null}

            {activeView === 'video' ? (
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Voice calls</strong>
                  <span>Start audio calls directly from the chat header when a contact is selected.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Video calls</strong>
                  <span>Use the video button in the chat header to start face-to-face calls.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Devices</strong>
                  <span>Your browser permissions still control microphone and camera access.</span>
                </article>
              </div>
            ) : null}

            {activeView === 'notifications' ? (
              <>
                <div className="accountInfoGrid">
                  <article className="accountInfoCard">
                    <strong>Desktop notifications</strong>
                    <span>Incoming messages and calls can trigger browser notifications when the page is hidden.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Unread count</strong>
                    <span>The sidebar badge updates when new chats or connection requests arrive.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Saved history</strong>
                    <span>{notificationHistory.length} notification{notificationHistory.length === 1 ? '' : 's'} stored with date and time.</span>
                  </article>
                </div>

                <div className="accountActionRow">
                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={clearNotificationHistory}
                    disabled={!notificationHistory.length}
                  >
                    Delete all notifications
                  </button>
                </div>

                {notificationGroups.length ? (
                  <div className="notificationHistoryList">
                    {notificationGroups.map(([dayLabel, entries]) => (
                      <div key={dayLabel} className="notificationDayGroup">
                        <div className="notificationDayLabel">{dayLabel}</div>
                        <div className="requestStack accountRequestList">
                          {entries.map((entry) => (
                            <div key={entry.id} className="requestCard notificationCard">
                              <div className="rowStart">
                                <div className={`settingsItemIcon notificationKindBadge notificationKind-${entry.kind}`}>{entry.kind.slice(0, 2).toUpperCase()}</div>
                                <div className="cardText">
                                  <strong>{entry.title}</strong>
                                  <span>{entry.detail}</span>
                                  <span>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                              <div className="contactActions">
                                {entry.kind === 'update' && entry.updateBuildId ? (
                                  <>
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
                                  </>
                                ) : null}
                                <button type="button" className="ghostBtn smallGhost" onClick={() => removeNotificationEntry(entry.id)}>
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
                  <div className="compactEmpty requestEmptyCard">No notification history yet.</div>
                )}
              </>
            ) : null}

            {activeView === 'update-history' ? (
              <>
                <div className="accountInfoGrid">
                  <article className="accountInfoCard">
                    <strong>Total updates</strong>
                    <span>{updateNotifications.length} update record{updateNotifications.length === 1 ? '' : 's'} stored with date and time.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Rejected updates</strong>
                    <span>{rejectedUpdates.length} update{rejectedUpdates.length === 1 ? '' : 's'} were kept for later.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Apply later</strong>
                    <span>Rejected updates stay here with only an Update button, so you can install them later.</span>
                  </article>
                </div>

                {updateNotifications.length ? (
                  <div className="requestStack accountRequestList">
                    {updateNotifications.map((entry) => (
                      <div key={`update-${entry.id}`} className="requestCard notificationCard">
                        <div className="rowStart">
                          <div className={`settingsItemIcon notificationKindBadge notificationKind-${entry.kind}`}>UP</div>
                          <div className="cardText">
                            <strong>{entry.title}</strong>
                            <span>{entry.detail}</span>
                            <span>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          {entry.updateBuildId && entry.updateStatus !== 'accepted' ? (
                            <button type="button" className="primaryBtn smallGhost" onClick={() => applyStoredUpdate(entry.updateBuildId!)}>
                              Update
                            </button>
                          ) : null}
                          <button type="button" className="ghostBtn smallGhost" onClick={() => removeNotificationEntry(entry.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="compactEmpty requestEmptyCard">No update history yet.</div>
                )}
              </>
            ) : null}

            {activeView === 'connections' ? (
              <>
                <div className="accountInfoGrid">
                  <article className="accountInfoCard">
                    <strong>Inbox</strong>
                    <span>{inboxConnections.length} connection{inboxConnections.length === 1 ? '' : 's'} saved for later from the popup.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Rejected</strong>
                    <span>{rejectedConnections.length} rejected connection{rejectedConnections.length === 1 ? '' : 's'} stored here.</span>
                  </article>
                  <article className="accountInfoCard">
                    <strong>Safety</strong>
                    <span>{blockedConnections.length} blocked and {reportedConnections.length} reported user{blockedConnections.length + reportedConnections.length === 1 ? '' : 's'} tracked here.</span>
                  </article>
                </div>

                {queuedPopupConnections.length ? (
                  <div className="requestStack accountRequestList">
                    {queuedPopupConnections.map((request) => (
                      <div key={request.id} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                          <div className="cardText">
                            <strong>{request.fromUser.name}</strong>
                            <span>{request.phoneNumber || request.aliasName || 'Waiting in your connection popup'}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          <button type="button" className="ghostBtn smallGhost" onClick={() => dismissIncomingRequest(request.id)}>
                            Move to inbox
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {inboxConnections.length ? (
                  <div className="requestStack accountRequestList">
                    {inboxConnections.map((request) => (
                      <div key={request.id} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                          <div className="cardText">
                            <strong>{request.fromUser.name}</strong>
                            <span>{request.phoneNumber || request.aliasName || 'Saved from the popup for later review'}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          <button type="button" className="ghostBtn smallGhost" onClick={() => void respondToRequest(request.id, 'reject')} disabled={requestBusy}>
                            Reject
                          </button>
                          <button type="button" className="primaryBtn smallGhost" onClick={() => void respondToRequest(request.id, 'accept')} disabled={requestBusy}>
                            Accept
                          </button>
                          <button type="button" className="ghostBtn smallGhost" onClick={() => restoreDismissedRequest(request.id)}>
                            Show popup
                          </button>
                          <button type="button" className="ghostBtn smallGhost" onClick={() => saveConnectionRecord(request, 'blocked', 'Blocked from connection inbox')}>
                            Block
                          </button>
                          <button type="button" className="ghostBtn smallGhost" onClick={() => void reportIncomingRequest(request)}>
                            Report
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {rejectedConnections.length ? (
                  <div className="requestStack accountRequestList">
                    {rejectedConnections.map((record) => (
                      <div key={`${record.requestId}-rejected`} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={record.name} avatarUrl={record.avatarUrl} />
                          <div className="cardText">
                            <strong>{record.name}</strong>
                            <span>{record.phoneNumber || record.aliasName || 'Rejected connection request'}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          <button type="button" className="ghostBtn smallGhost" onClick={() => removeConnectionRecord(record.requestId, 'rejected')}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {blockedConnections.length ? (
                  <div className="requestStack accountRequestList">
                    {blockedConnections.map((record) => (
                      <div key={`${record.requestId}-blocked`} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={record.name} avatarUrl={record.avatarUrl} />
                          <div className="cardText">
                            <strong>{record.name}</strong>
                            <span>{record.note || 'Blocked for unwanted messages or scam behaviour'}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          <button type="button" className="ghostBtn smallGhost" onClick={() => removeConnectionRecord(record.requestId, 'blocked')}>
                            Unblock
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {reportedConnections.length ? (
                  <div className="requestStack accountRequestList">
                    {reportedConnections.map((record) => (
                      <div key={`${record.requestId}-reported`} className="requestCard">
                        <div className="rowStart">
                          <Avatar name={record.name} avatarUrl={record.avatarUrl} />
                          <div className="cardText">
                            <strong>{record.name}</strong>
                            <span>{record.note || 'Reported for unwanted messages or scam behaviour'}</span>
                          </div>
                        </div>
                        <div className="contactActions">
                          <button type="button" className="ghostBtn smallGhost" onClick={() => removeConnectionRecord(record.requestId, 'reported')}>
                            Remove report
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!queuedPopupConnections.length && !inboxConnections.length && !rejectedConnections.length && !blockedConnections.length && !reportedConnections.length ? (
                  <div className="compactEmpty requestEmptyCard">No connection activity right now.</div>
                ) : null}
              </>
            ) : null}

            {activeView === 'calls' ? (
              recentCalls.length ? (
                <div className="callList accountCallList">
                  {recentCalls.map((call) => (
                    <div key={call.id} className="callRow detailRow">
                      <div className="rowStart">
                        <Avatar name={call.user.name} avatarUrl={call.user.avatarUrl} />
                        <div className="cardText">
                          <strong>{call.user.name}</strong>
                          <span>{call.status} {call.mode} call</span>
                          <span>{fmtDate(call.createdAt)}{call.durationSeconds ? ` | ${Math.floor(call.durationSeconds / 60).toString().padStart(2, '0')}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="compactEmpty requestEmptyCard">No calls yet.</div>
            ) : null}

            {activeView === 'help' ? (
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Help centre</strong>
                  <span>Use the chat, account and call sections to test the full messaging flow.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Feedback</strong>
                  <span>If a panel still feels off on your screen size, I can tune that exact area next.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Current device</strong>
                  <span>{profileForm.email || profileForm.phoneNumber || 'Signed in on this desktop browser.'}</span>
                </article>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {pendingSecurityAction ? (
        <div className="modalScrim" onClick={resetVerifyModal}>
          <div className="connectModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>{pendingSecurityAction.title}</h2>
              <button type="button" className="ghostBtn smallGhost" onClick={resetVerifyModal}>
                Close
              </button>
            </div>
            <p className="miniText">{pendingSecurityAction.detail}</p>
            <div className="composerInputRow">
              <input
                className="input"
                type={showVerifySecretValue ? 'text' : 'password'}
                inputMode="text"
                placeholder="Enter old PIN or old password"
                value={verifySecretValue}
                onChange={(event) => setVerifySecretValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmPendingSecurityAction();
                }}
              />
              <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowVerifySecretValue((current) => !current)} disabled={securityBusy}>
                {showVerifySecretValue ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="accountActionRow">
              <button type="button" className="ghostBtn securityActionBtn" onClick={resetVerifyModal} disabled={securityBusy}>
                Cancel
              </button>
              <button type="button" className="primaryBtn securityActionBtn" onClick={() => void confirmPendingSecurityAction()} disabled={securityBusy}>
                Verify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingChatLockAction ? (
        <div className="modalScrim" onClick={resetChatLockVerifyModal}>
          <div className="connectModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>{pendingChatLockAction.title}</h2>
              <button type="button" className="ghostBtn smallGhost" onClick={resetChatLockVerifyModal}>
                Close
              </button>
            </div>
            <p className="miniText">{pendingChatLockAction.detail}</p>
            <div className="composerInputRow">
              <input
                className="input"
                type={showVerifyChatLockSecretValue ? 'text' : 'password'}
                placeholder="Enter old locked chats PIN or password"
                value={verifyChatLockSecretValue}
                onChange={(event) => setVerifyChatLockSecretValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmPendingChatLockAction();
                }}
              />
              <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowVerifyChatLockSecretValue((current) => !current)} disabled={securityBusy}>
                {showVerifyChatLockSecretValue ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="accountActionRow">
              <button type="button" className="ghostBtn securityActionBtn" onClick={resetChatLockVerifyModal} disabled={securityBusy}>
                Cancel
              </button>
              <button type="button" className="primaryBtn securityActionBtn" onClick={() => void confirmPendingChatLockAction()} disabled={securityBusy}>
                Verify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showChatLockRecovery ? (
        <div className="modalScrim" onClick={resetChatLockRecovery}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>{chatLockRecoveryStep === 'identify' ? 'Recover locked chats secret' : 'Create new locked chats secret'}</h2>
              <button type="button" className="ghostBtn smallGhost" onClick={resetChatLockRecovery}>
                Close
              </button>
            </div>
            {chatLockRecoveryStep === 'identify' ? (
              <>
                <p className="miniText">Enter your email or mobile number, send OTP, copy it from the popup if needed, then verify it here.</p>
                <input
                  className="input securityInput"
                  placeholder="Email or mobile number"
                  value={chatLockRecoveryIdentifier}
                  onChange={(event) => setChatLockRecoveryIdentifier(event.target.value)}
                />
                <div className="composerInputRow">
                  <input
                    className="input securityInput"
                    placeholder="Enter OTP"
                    value={chatLockRecoveryCode}
                    onChange={(event) => setChatLockRecoveryCode(event.target.value)}
                  />
                  <button type="button" className="ghostBtn securityActionBtn" onClick={() => void requestChatLockRecoveryOtp()} disabled={securityBusy}>
                    Send OTP
                  </button>
                  <button type="button" className="primaryBtn securityActionBtn" onClick={verifyChatLockRecoveryOtp} disabled={securityBusy}>
                    Verify OTP
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tabRow tabRowSecondary authReferenceMethodTabs">
                  <button type="button" className={chatLockRecoveryMode === 'pin' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setChatLockRecoveryMode('pin')}>
                    PIN
                  </button>
                  <button type="button" className={chatLockRecoveryMode === 'password' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setChatLockRecoveryMode('password')}>
                    Password
                  </button>
                </div>
                <div className="composerInputRow">
                  <input
                    className="input securityInput"
                    type={showChatLockRecoverySecret ? 'text' : 'password'}
                    inputMode={chatLockRecoveryMode === 'pin' ? 'numeric' : 'text'}
                    placeholder={chatLockRecoveryMode === 'pin' ? 'Set new PIN' : 'Set new password'}
                    value={chatLockRecoverySecret}
                    onChange={(event) => setChatLockRecoverySecret(event.target.value)}
                  />
                  <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockRecoverySecret((current) => !current)}>
                    {showChatLockRecoverySecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="composerInputRow">
                  <input
                    className="input securityInput"
                    type={showChatLockRecoveryConfirmSecret ? 'text' : 'password'}
                    inputMode={chatLockRecoveryMode === 'pin' ? 'numeric' : 'text'}
                    placeholder={chatLockRecoveryMode === 'pin' ? 'Confirm new PIN' : 'Confirm new password'}
                    value={chatLockRecoveryConfirmSecret}
                    onChange={(event) => setChatLockRecoveryConfirmSecret(event.target.value)}
                  />
                  <button type="button" className="ghostBtn securityActionBtn" onClick={() => setShowChatLockRecoveryConfirmSecret((current) => !current)}>
                    {showChatLockRecoveryConfirmSecret ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className="primaryBtn securityActionBtn" onClick={() => void submitChatLockRecovery()} disabled={securityBusy}>
                    Update
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
