import { useEffect, useMemo, useState } from 'react';
import { ChatPane } from './ChatPane';
import { ContactsPane } from './ContactsPane';
import { ProfilePane } from './ProfilePane';
import { useApp } from './AppContext';
import LoginPage from './LoginPage';
import { Avatar, BrandMark, playNotification, showDesktopNotification } from './App';
import './index.css';

type Section = 'chats' | 'updates' | 'calls' | 'account';
type AuthTab = 'password' | 'email-otp' | 'phone-otp';
type LoginMode = 'login' | 'register';

const formatCallDuration = (seconds?: number) => {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const formatCallDate = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function MainApp() {
  const {
    me,
    isMobile,
    api,
    setToken,
    setMe,
    setInfo,
    setError,
    info,
    error,
    devOtpPreview,
    setDevOtpPreview,
    chats,
    calls,
    token,
    incomingRequests,
    refreshIncomingRequests,
    respondToIncomingRequest,
    setActiveChatId,
    theme,
    toggleTheme,
    appLockConfig,
    isLocked,
    setIsLocked,
    hashLockSecret,
    unlockWithBiometric,
    biometricSupported,
    updateNotice,
    applyAvailableUpdate,
    dismissAvailableUpdate,
  } = useApp();

  const [section, setSection] = useState<Section>('chats');
  const [mode, setMode] = useState<LoginMode>('login');
  const [authTab, setAuthTab] = useState<AuthTab>('phone-otp');
  const [showRequestPopup, setShowRequestPopup] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [otpEmailForm, setOtpEmailForm] = useState({ email: '', code: '' });
  const [otpPhoneForm, setOtpPhoneForm] = useState({ phoneNumber: '', code: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    password: '',
    avatarUrl: '',
    bio: '',
    statusText: '',
  });
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);

  const runAction = (action: () => Promise<void>) => {
    action().catch((err: unknown) => {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const message = rawMessage.includes('Invalid mobile/email or password')
        ? 'Login failed. Check phone or email and password, or use OTP login.'
        : rawMessage.includes('Could not reach the HelloToo server')
          ? `${rawMessage} If you opened the site from another device, use that same device network address for both frontend and backend.`
          : rawMessage;
      setError(message);
      void showDesktopNotification('HelloToo', message);
    });
  };

  const saveSession = (nextToken: string, user: unknown) => {
    sessionStorage.setItem('helloto_skip_initial_lock', '1');
    localStorage.setItem('wa_token', nextToken);
    setToken(nextToken);
    setMe(user as never);
    setDevOtpPreview('');
    setInfo('Login successful');
    playNotification('received');
    void showDesktopNotification('HelloToo', 'Login successful');
  };

  const submitPasswordLogin = async () => {
    const res = await api<{ token: string; user: unknown }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginForm),
    });
    saveSession(res.token, res.user);
  };

  const submitRegister = async () => {
    const res = await api<{
      token: string;
      user: unknown;
      verification?: { devOtpPreview?: string };
      phoneVerification?: { devOtpPreview?: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerForm),
    });
    setDevOtpPreview(res.verification?.devOtpPreview ?? res.phoneVerification?.devOtpPreview ?? '');
    saveSession(res.token, res.user);
  };

  const requestOtp = async (purpose: 'verify-email' | 'login') => {
    const res = await api<{ devOtpPreview?: string }>('/auth/request-email-otp', {
      method: 'POST',
      body: JSON.stringify({ email: otpEmailForm.email, purpose }),
    });
    setDevOtpPreview(res.devOtpPreview ?? '');
    setInfo('Email OTP sent');
    playNotification('otp');
    void showDesktopNotification('HelloToo OTP', 'Email OTP sent');
  };

  const requestPhoneOtp = async (purpose: 'verify-phone' | 'login-phone') => {
    const res = await api<{ devOtpPreview?: string }>('/auth/request-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: otpPhoneForm.phoneNumber, purpose }),
    });
    setDevOtpPreview(res.devOtpPreview ?? '');
    setInfo('Phone OTP sent');
    playNotification('otp');
    void showDesktopNotification('HelloToo OTP', 'Phone OTP sent');
  };

  const loginWithEmailOtp = async () => {
    const res = await api<{ token: string; user: unknown }>('/auth/login-with-email-otp', {
      method: 'POST',
      body: JSON.stringify(otpEmailForm),
    });
    saveSession(res.token, res.user);
  };

  const loginWithPhoneOtp = async () => {
    const res = await api<{ token: string; user: unknown }>('/auth/login-with-phone-otp', {
      method: 'POST',
      body: JSON.stringify(otpPhoneForm),
    });
    saveSession(res.token, res.user);
  };

  const onPickImage = async (file: File | undefined, target: 'register') => {
    if (!file || target !== 'register') return;
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(file);
    });
    setRegisterForm((prev) => ({ ...prev, avatarUrl: dataUrl }));
  };

  const navItems: Array<{ id: Section; label: string; shortLabel: string }> = [
    { id: 'chats', label: 'Chats', shortLabel: 'Chats' },
    { id: 'updates', label: 'Status', shortLabel: 'Status' },
    { id: 'calls', label: 'Calls', shortLabel: 'Calls' },
    { id: 'account', label: 'You', shortLabel: 'You' },
  ];

  const unreadChats = chats.reduce((count, chat) => count + chat.unreadCount, 0);
  const recentCalls = [...calls].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8);
  const missedCalls = recentCalls.filter((call) => call.status === 'missed');
  const outgoingCalls = recentCalls.filter((call) => call.direction === 'outgoing');
  const completedCalls = recentCalls.filter((call) => call.status === 'completed');
  const railItems: Array<{ id: Section; icon: string; label: string; badge?: number }> = [
    { id: 'chats', icon: 'CH', label: 'Chats', badge: unreadChats || undefined },
    { id: 'updates', icon: 'UP', label: 'Status' },
    { id: 'calls', icon: 'CA', label: 'Calls' },
    { id: 'account', icon: 'ST', label: 'Settings', badge: incomingRequests.length || undefined },
  ];

  useEffect(() => {
    if (!token || !me?.id) return;
    refreshIncomingRequests().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [token, me?.id, refreshIncomingRequests, setError]);

  useEffect(() => {
    setShowRequestPopup(incomingRequests.length > 0);
  }, [incomingRequests.length]);

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      await respondToIncomingRequest(requestId, action);
      if (action === 'accept') setSection('chats');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestBusy(false);
    }
  };

  const openCallChat = (chatId: string) => {
    setActiveChatId(chatId);
    setSection('chats');
  };

  const unlockWithSecret = async (mode: 'pin' | 'password') => {
    const candidate = mode === 'pin' ? unlockPin.trim() : unlockPassword;
    const targetHash = mode === 'pin' ? appLockConfig.pinHash : appLockConfig.passwordHash;
    if (!candidate || !targetHash) return;
    setUnlockBusy(true);
    try {
      const candidateHash = await hashLockSecret(candidate);
      if (candidateHash !== targetHash) {
        setError(`Wrong ${mode}.`);
        return;
      }
      setUnlockPin('');
      setUnlockPassword('');
      setIsLocked(false);
      setInfo('App unlocked');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlockBusy(false);
    }
  };

  const unlockBiometric = async () => {
    setUnlockBusy(true);
    try {
      const ok = await unlockWithBiometric();
      if (ok) {
        setUnlockPin('');
        setUnlockPassword('');
        setInfo('Unlocked with biometric');
      } else {
        setError('Biometric unlock failed on this device.');
      }
    } finally {
      setUnlockBusy(false);
    }
  };

  if (!me) {
    return (
      <LoginPage
        mode={mode}
        setMode={setMode}
        authTab={authTab}
        setAuthTab={setAuthTab}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        otpEmailForm={otpEmailForm}
        setOtpEmailForm={setOtpEmailForm}
        otpPhoneForm={otpPhoneForm}
        setOtpPhoneForm={setOtpPhoneForm}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        devOtpPreview={devOtpPreview}
        setDevOtpPreview={setDevOtpPreview}
        info={info}
        error={error}
        updateNotice={updateNotice}
        applyAvailableUpdate={applyAvailableUpdate}
        dismissAvailableUpdate={dismissAvailableUpdate}
        submitPasswordLogin={submitPasswordLogin}
        submitRegister={submitRegister}
        requestOtp={requestOtp}
        requestPhoneOtp={requestPhoneOtp}
        loginWithEmailOtp={loginWithEmailOtp}
        loginWithPhoneOtp={loginWithPhoneOtp}
        onPickImage={onPickImage}
        runAction={runAction}
        isMobile={isMobile}
        BrandMark={BrandMark}
        Avatar={Avatar}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className={`phoneFrame ${isMobile ? 'fullMobile' : ''}`}>
      {info || error ? (
        <div className="floatingBannerStack">
          {info ? (
            <div className="floatingBanner infoFloat">
              <span className="floatingBannerText">{info}</span>
              <button type="button" className="floatingBannerClose" onClick={() => setInfo('')} aria-label="Close notification">
                x
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="floatingBanner errorFloat">
              <span className="floatingBannerText">{error}</span>
              <button type="button" className="floatingBannerClose" onClick={() => setError('')} aria-label="Close notification">
                x
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {updateNotice ? (
        <div className="updatePromptCard appUpdatePrompt">
          <div className="cardText">
            <strong>Update ready</strong>
            <span>HelloToo has a newer version available. Update now to load the latest changes, or cut it to keep this version running.</span>
          </div>
          <div className="floatingBannerActions">
            <button type="button" className="floatingBannerActionBtn" onClick={applyAvailableUpdate}>
              Update now
            </button>
            <button type="button" className="floatingBannerClose" onClick={dismissAvailableUpdate} aria-label="Close update prompt">
              x
            </button>
          </div>
        </div>
      ) : null}

      <div className="waShell">
        <aside className="waRail">
          <div className="waRailBrand">
            <BrandMark />
            {!isMobile ? <span>HelloToo</span> : null}
          </div>
          <nav className="waRailNav" aria-label="Primary">
            {railItems.map((item) => (
              <button
                key={item.id}
                className={section === item.id ? 'waRailButton activeRailButton' : 'waRailButton'}
                onClick={() => setSection(item.id)}
                aria-label={item.label}
                title={item.label}
              >
                <span className="waRailIcon">{item.icon}</span>
                {!isMobile ? <span className="waRailLabel">{item.label}</span> : null}
                {item.badge ? <span className="waRailBadge">{item.badge}</span> : null}
              </button>
            ))}
          </nav>
          <button className="waRailProfile" onClick={() => setSection('account')} aria-label="Open my profile">
            <Avatar name={me.name} avatarUrl={me.avatarUrl} size={40} />
          </button>
        </aside>

        <div className="waWorkspace">
          {!isMobile ? (
            <header className="waWindowBar">
              <div className="waWindowMeta">
                <BrandMark />
                <span>HelloToo</span>
              </div>
              <div className="waWindowActions">
                <button className="waWindowAction themeToggleAction" onClick={toggleTheme} aria-label="Toggle light and dark theme">
                  {theme === 'dark' ? 'LI' : 'DK'}
                </button>
                <button className="waWindowAction" aria-label="Minimize window">_</button>
                <button className="waWindowAction" aria-label="Maximize window">[]</button>
                <button className="waWindowAction closeWindowAction" aria-label="Close window">X</button>
              </div>
            </header>
          ) : null}

          <div className="waContentStage">
            {section === 'chats' && <ChatPane />}
            {section === 'updates' && <ContactsPane section="updates" />}
            {section === 'account' && <ProfilePane section="account" />}
            {section === 'calls' && (
              <section className="screenPane commandCenter callHubScreen">
                <div className="sectionTop">
                  <h2>Calls hub</h2>
                </div>
                <div className="miniHero callMiniHero">
                  <div>
                    <strong>{calls.length}</strong>
                    <span>total calls</span>
                  </div>
                  <div>
                    <strong>{missedCalls.length}</strong>
                    <span>missed calls</span>
                  </div>
                  <div>
                    <strong>{outgoingCalls.length}</strong>
                    <span>outgoing calls</span>
                  </div>
                </div>

                <div className="callHistoryGrid callHistoryScrollArea">
                  <article className="commandCard callHistoryPanel">
                    <div className="callHistoryHeader">
                      <strong>Recent history</strong>
                      <span>{recentCalls.length ? 'Latest calls across your chats' : 'No calls yet'}</span>
                    </div>
                    <div className="callHistoryList">
                      {recentCalls.length ? recentCalls.map((call) => (
                        <button key={call.id} className="callHistoryRow" onClick={() => openCallChat(call.chatId)}>
                          <div className="rowStart">
                            <Avatar name={call.user.name} avatarUrl={call.user.avatarUrl} size={40} />
                            <div className="cardText">
                              <strong>{call.user.name}</strong>
                              <span className="callHistoryMetaLine">
                                <span className={`callStatusPill ${call.status}`}>{call.status}</span>
                                <span>{call.direction} {call.mode}</span>
                              </span>
                            </div>
                          </div>
                          <div className="cardMeta detailMeta">
                            <p>{formatCallDate(call.createdAt)}</p>
                            <p>{call.status === 'completed' ? formatCallDuration(call.durationSeconds) : 'tap to open chat'}</p>
                          </div>
                        </button>
                      )) : <div className="compactEmpty requestEmptyCard">No call history recorded yet.</div>}
                    </div>
                  </article>

                  <article className="commandCard callHistoryPanel">
                    <div className="callHistoryHeader">
                      <strong>Missed calls</strong>
                      <span>Follow up quickly on unanswered calls</span>
                    </div>
                    <div className="callHistoryStack">
                      {missedCalls.length ? missedCalls.map((call) => (
                        <button key={call.id} className="callSummaryCard missedSummaryCard" onClick={() => openCallChat(call.chatId)}>
                          <strong>{call.user.name}</strong>
                          <span>{formatCallDate(call.createdAt)}</span>
                          <p>Missed {call.mode} call from {call.direction === 'incoming' ? 'incoming ring' : 'your callback attempt'}.</p>
                        </button>
                      )) : <div className="compactEmpty requestEmptyCard">No missed calls right now.</div>}
                    </div>
                  </article>

                  <article className="commandCard callHistoryPanel">
                    <div className="callHistoryHeader">
                      <strong>Outgoing calls</strong>
                      <span>See your recent dialed history and completed durations</span>
                    </div>
                    <div className="callHistoryStack">
                      {outgoingCalls.length ? outgoingCalls.map((call) => (
                        <button key={call.id} className="callSummaryCard outgoingSummaryCard" onClick={() => openCallChat(call.chatId)}>
                          <strong>{call.user.name}</strong>
                          <span>{formatCallDate(call.createdAt)}</span>
                          <p>
                            {call.status === 'completed'
                              ? `Completed ${call.mode} call in ${formatCallDuration(call.durationSeconds)}.`
                              : `${call.status} ${call.mode} call.`}
                          </p>
                        </button>
                      )) : <div className="compactEmpty requestEmptyCard">No outgoing calls yet.</div>}
                    </div>
                  </article>
                </div>

                <div className="commandCenterGrid">
                  <article className="commandCard">
                    <strong>Completed calls</strong>
                    <p>{completedCalls.length} finished calls now stay visible with timestamps and durations.</p>
                  </article>
                  <article className="commandCard">
                    <strong>Missed tracking</strong>
                    <p>Missed calls remain visible in one place so they do not disappear inside the chat stream.</p>
                  </article>
                  <article className="commandCard">
                    <strong>Chat shortcut</strong>
                    <p>Open any history card to jump back into the related conversation immediately.</p>
                  </article>
                </div>
              </section>
            )}
          </div>

          {isMobile ? (
            <nav className="bottomNav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={section === item.id ? 'bottomItem activeBottom' : 'bottomItem'}
                  onClick={() => setSection(item.id)}
                >
                  {item.shortLabel}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </div>

      {me && isLocked ? (
        <div className="appLockOverlay">
          <div className="appLockCard">
            <BrandMark />
            <div className="cardText appLockHeader">
              <strong>HelloToo Security</strong>
              <span>Unlock your local app with PIN, password, or biometric access.</span>
            </div>

            {appLockConfig.pinHash ? (
              <div className="appLockField">
                <span>PIN</span>
                <div className="composerInputRow">
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    placeholder="Enter PIN"
                    value={unlockPin}
                    onChange={(event) => setUnlockPin(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void unlockWithSecret('pin');
                    }}
                  />
                  <button type="button" className="primaryBtn" onClick={() => void unlockWithSecret('pin')} disabled={unlockBusy}>
                    Unlock
                  </button>
                </div>
              </div>
            ) : null}

            {appLockConfig.passwordHash ? (
              <div className="appLockField">
                <span>Password</span>
                <div className="composerInputRow">
                  <input
                    className="input"
                    type="password"
                    placeholder="Enter password"
                    value={unlockPassword}
                    onChange={(event) => setUnlockPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void unlockWithSecret('password');
                    }}
                  />
                  <button type="button" className="primaryBtn" onClick={() => void unlockWithSecret('password')} disabled={unlockBusy}>
                    Unlock
                  </button>
                </div>
              </div>
            ) : null}

            {appLockConfig.biometricEnabled && biometricSupported ? (
              <button type="button" className="ghostBtn appLockBioBtn" onClick={() => void unlockBiometric()} disabled={unlockBusy}>
                Unlock with biometric
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showRequestPopup ? (
        <div className="modalScrim" onClick={() => setShowRequestPopup(false)}>
          <div className="connectModalCard requestPopupCard" onClick={(event) => event.stopPropagation()}>
            <div className="requestPopupHeader">
              <div>
                <span className="heroEyebrow">New connection request</span>
                <h2>Someone wants to connect</h2>
              </div>
              <button className="ghostBtn closeIconBtn" onClick={() => setShowRequestPopup(false)} aria-label="Close request popup">
                x
              </button>
            </div>
            <p className="miniText">When you accept, the person will be added to your chats automatically.</p>
            <div className="requestStack">
              {incomingRequests.map((request) => (
                <div key={request.id} className="requestCard requestPopupItem">
                  <div className="rowStart">
                    <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                    <div className="cardText">
                      <strong>{request.fromUser.name}</strong>
                      <span>{request.phoneNumber || request.aliasName || 'Sent you a chat request'}</span>
                    </div>
                  </div>
                  <div className="contactActions">
                    <button className="ghostBtn smallGhost" onClick={() => void respondToRequest(request.id, 'reject')} disabled={requestBusy}>
                      Reject
                    </button>
                    <button className="primaryBtn smallGhost" onClick={() => void respondToRequest(request.id, 'accept')} disabled={requestBusy}>
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
