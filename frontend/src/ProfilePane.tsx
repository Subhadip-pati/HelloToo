import { useEffect, useMemo, useState } from 'react';
import { Avatar, fmtDate } from './App';
import { useApp } from './AppContext';
import './index.css';

type AccountView =
  | 'general'
  | 'profile'
  | 'account'
  | 'security'
  | 'privacy'
  | 'chats'
  | 'video'
  | 'notifications'
  | 'requests'
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
    calls,
    incomingRequests,
    refreshIncomingRequests,
    respondToIncomingRequest,
    theme,
    toggleTheme,
    appLockConfig,
    updateAppLockConfig,
    clearAppLockConfig,
    setIsLocked,
    biometricSupported,
    hashLockSecret,
    registerBiometricLock,
  } = useApp();
  const [saving, setSaving] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<AccountView>('general');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
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

  const resetSession = () => {
    localStorage.removeItem('wa_token');
    window.location.reload();
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      await respondToIncomingRequest(requestId, action);
      if (action === 'accept') setInfo('Connected. The chat is ready now.');
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

  const settingsItems: Array<{ id: AccountView; icon: string; label: string; detail: string; badge?: string; tone?: 'danger' }> = [
    { id: 'general', icon: 'GE', label: 'General', detail: 'Startup and close' },
    { id: 'profile', icon: 'PR', label: 'Profile', detail: 'Name, profile photo, username' },
    { id: 'account', icon: 'AC', label: 'Account', detail: 'Security notifications, account info', badge: me?.emailVerified ? 'OK' : 'OTP' },
    { id: 'security', icon: 'SC', label: 'Security', detail: 'PIN, password, fingerprint app lock', badge: appLockConfig.pinHash || appLockConfig.passwordHash || appLockConfig.biometricEnabled ? 'ON' : undefined },
    { id: 'privacy', icon: 'PV', label: 'Privacy', detail: 'Blocked contacts, disappearing messages' },
    { id: 'chats', icon: 'CH', label: 'Chats', detail: 'Theme, wallpaper, chat settings' },
    { id: 'video', icon: 'VD', label: 'Video & voice', detail: 'Camera, microphone & speakers' },
    { id: 'notifications', icon: 'NT', label: 'Notifications', detail: 'Message notifications' },
    { id: 'requests', icon: 'RQ', label: 'Requests', detail: 'Incoming chat approvals', badge: incomingRequests.length ? String(incomingRequests.length) : undefined },
    { id: 'calls', icon: 'CA', label: 'Calls', detail: 'Recent call history', badge: recentCalls.length ? String(recentCalls.length) : undefined },
    { id: 'help', icon: 'HP', label: 'Help and feedback', detail: 'Help centre, contact us, privacy policy' },
  ];

  const filteredItems = settingsItems.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${item.label} ${item.detail}`.toLowerCase().includes(needle);
  });

  const savePinLock = async () => {
    if (!pinValue.trim()) {
      updateAppLockConfig({ pinHash: '' });
      setInfo('PIN lock removed');
      return;
    }
    if (!/^\d{4,8}$/.test(pinValue.trim())) {
      setError('PIN must be 4 to 8 digits.');
      return;
    }
    setSecurityBusy(true);
    try {
      const pinHash = await hashLockSecret(pinValue.trim());
      updateAppLockConfig({ pinHash });
      setPinValue('');
      setInfo('PIN lock saved');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSecurityBusy(false);
    }
  };

  const savePasswordLock = async () => {
    if (!passwordValue.trim()) {
      updateAppLockConfig({ passwordHash: '' });
      setInfo('Security password removed');
      return;
    }
    if (passwordValue.trim().length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    setSecurityBusy(true);
    try {
      const passwordHash = await hashLockSecret(passwordValue.trim());
      updateAppLockConfig({ passwordHash });
      setPasswordValue('');
      setInfo('Security password saved');
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
      if (ok) setInfo('Biometric unlock is ready');
      else setError('Biometric setup was cancelled or is not available on this device.');
    } finally {
      setSecurityBusy(false);
    }
  };

  if (section !== 'account') return null;

  return (
    <section className="accountShell helloTooSettingsShell">
      <aside className="accountSidebar helloTooSettingsSidebar">
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

        <div className="settingsProfileBlock">
          <Avatar name={profileForm.name || 'You'} avatarUrl={profileForm.avatarUrl} size={100} />
          <div className="settingsStatusBubble">{profileForm.statusText || 'Set your status'}</div>
        </div>

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
            <button type="button" className="settingsShortcutCard" onClick={() => setActiveView('help')}>
              <span className="settingsShortcutIcon">AI</span>
              <span>Ask Meta AI</span>
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
                  <span>{incomingRequests.length} pending requests and {recentCalls.length} recent calls are ready.</span>
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
                  <label className="field spanTwo">
                    <span>Avatar URL</span>
                    <input className="input" value={profileForm.avatarUrl} onChange={(e) => setProfileForm({ ...profileForm, avatarUrl: e.target.value })} />
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

            {activeView === 'security' ? (
              <>
                <div className="accountInfoGrid securityGrid">
                  <article className="accountInfoCard securityCard">
                    <strong>PIN lock</strong>
                    <span>{appLockConfig.pinHash ? 'A PIN is active for app unlock.' : 'Set a 4 to 8 digit PIN manually for quick unlock on this device.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input"
                        type="password"
                        inputMode="numeric"
                        placeholder="Set PIN manually"
                        value={pinValue}
                        onChange={(event) => setPinValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn" onClick={() => void savePinLock()} disabled={securityBusy}>
                        {appLockConfig.pinHash ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Security password</strong>
                    <span>{appLockConfig.passwordHash ? 'A security password is active.' : 'Set a password manually for the local app lock screen.'}</span>
                    <div className="composerInputRow">
                      <input
                        className="input"
                        type="password"
                        placeholder="Set password manually"
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                      />
                      <button type="button" className="ghostBtn" onClick={() => void savePasswordLock()} disabled={securityBusy}>
                        {appLockConfig.passwordHash ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Fingerprint unlock</strong>
                    <span>{biometricSupported ? (appLockConfig.biometricEnabled ? 'Fingerprint unlock is active on this browser profile.' : 'Use your device fingerprint or face unlock when supported.') : 'This browser does not support fingerprint unlock here.'}</span>
                    <button type="button" className="ghostBtn" onClick={() => void setupBiometric()} disabled={securityBusy || !biometricSupported}>
                      {appLockConfig.biometricEnabled ? 'Remove fingerprint' : 'Enable fingerprint'}
                    </button>
                  </article>

                  <article className="accountInfoCard securityCard">
                    <strong>Auto lock</strong>
                    <span>{appLockConfig.autoLockOnHide ? 'The app locks when the tab loses focus or becomes hidden.' : 'The app stays open until you lock it manually.'}</span>
                    <div className="accountActionRow">
                      <button type="button" className="ghostBtn" onClick={() => updateAppLockConfig({ autoLockOnHide: !appLockConfig.autoLockOnHide })}>
                        Turn {appLockConfig.autoLockOnHide ? 'off' : 'on'} auto lock
                      </button>
                      <button type="button" className="ghostBtn" onClick={() => setIsLocked(true)}>
                        Lock now
                      </button>
                    </div>
                  </article>
                </div>

                <div className="accountActionRow">
                  <button type="button" className="ghostBtn" onClick={clearAppLockConfig}>
                    Clear all local locks
                  </button>
                </div>
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
              <div className="accountInfoGrid">
                <article className="accountInfoCard">
                  <strong>Desktop notifications</strong>
                  <span>Incoming messages and calls can trigger browser notifications when the page is hidden.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Unread count</strong>
                  <span>The sidebar badge updates when new chats or requests arrive.</span>
                </article>
                <article className="accountInfoCard">
                  <strong>Sound alerts</strong>
                  <span>Notification sounds are used for OTP, messages and incoming calls.</span>
                </article>
              </div>
            ) : null}

            {activeView === 'requests' ? (
              incomingRequests.length ? (
                <div className="requestStack accountRequestList">
                  {incomingRequests.map((request) => (
                    <div key={request.id} className="requestCard">
                      <div className="rowStart">
                        <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                        <div className="cardText">
                          <strong>{request.fromUser.name}</strong>
                          <span>{request.phoneNumber || request.aliasName || 'Sent you a chat request'}</span>
                        </div>
                      </div>
                      <div className="contactActions">
                        <button type="button" className="ghostBtn smallGhost" onClick={() => void respondToRequest(request.id, 'reject')} disabled={requestBusy}>
                          Reject
                        </button>
                        <button type="button" className="primaryBtn smallGhost" onClick={() => void respondToRequest(request.id, 'accept')} disabled={requestBusy}>
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="compactEmpty requestEmptyCard">No pending requests right now.</div>
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
    </section>
  );
}
