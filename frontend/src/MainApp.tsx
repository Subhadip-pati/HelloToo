import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatPane } from './ChatPane';
import { ConnectionPane } from './ConnectionPane';
import { ContactsPane } from './ContactsPane';
import { ProfilePane } from './ProfilePane';
import { AISection } from './AISection';
import { AdminConsole } from './AdminConsole';
import { useApp } from './AppContext';
import LoginPage from './LoginPage';
import { Avatar, BrandMark, playNotification, showDesktopNotification } from './App';
import './index.css';

type Section = 'chats' | 'connections' | 'updates' | 'calls' | 'ai' | 'account';
type AuthTab = 'password' | 'otp';
type LoginMode = 'login' | 'register';
type AuthPortal = 'chooser' | 'user' | 'admin';
type AdminProfile = {
  email: string;
  phoneNumber: string | null;
  name: string;
  hasPin?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};
type AdminAuthResponse = {
  token: string;
  admin?: AdminProfile | null;
  user?: AdminProfile | null;
  mustChangePassword?: boolean;
};
type NavIcon = 'chat' | 'connections' | 'status' | 'call' | 'ai' | 'settings';
const defaultAdminEmail = 'subhadip123@gmail.com';
const defaultAdminPassword = 'Subha@123';

const isAdminProfile = (value: unknown): value is AdminProfile => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AdminProfile>;
  return typeof candidate.email === 'string' && candidate.email.length > 0 && typeof candidate.name === 'string';
};

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

function SectionIcon({ icon }: { icon: NavIcon }) {
  return (
    <span className={`waRailIcon waRailIcon-${icon}`}>
      <span className="waRailGlyph" aria-hidden="true">
        <span className="waRailGlyphCore" />
        {(icon === 'chat' || icon === 'connections' || icon === 'status') ? <span className="waRailGlyphAccent" /> : null}
      </span>
    </span>
  );
}

function UpdateBanner({
  updateNotice,
  applyAvailableUpdate,
  dismissAvailableUpdate,
  stackClassName,
}: {
  updateNotice: { currentBuildId: string; latestBuildId: string } | null;
  applyAvailableUpdate: () => void;
  dismissAvailableUpdate: () => void;
  stackClassName?: string;
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!updateNotice) {
      setIsUpdating(false);
    }
  }, [updateNotice]);

  useEffect(() => {
    if (!updateNotice || isUpdating) return;
    const timeout = window.setTimeout(() => dismissAvailableUpdate(), 5000);
    return () => window.clearTimeout(timeout);
  }, [dismissAvailableUpdate, isUpdating, updateNotice]);

  if (!updateNotice) return null;

  const startUpdate = () => {
    setIsUpdating(true);
    window.setTimeout(() => applyAvailableUpdate(), 100);
  };

  return (
    <div className={`floatingBannerStack updateBannerStack ${stackClassName ?? ''}`.trim()}>
      <div className="floatingBanner infoFloat updateFloatBanner">
        <span className="floatingBannerText">
          <strong>{isUpdating ? 'Updating...' : 'Website update ready.'}</strong> {isUpdating ? 'Applying the latest changes now.' : 'New changes were found for HelloToo.'}
        </span>
        <div className="floatingBannerActions">
          {isUpdating ? null : (
            <>
              <button type="button" className="floatingBannerActionBtn" onClick={startUpdate}>
                Update
              </button>
              <button type="button" className="floatingBannerActionBtn updateLaterBtn" onClick={dismissAvailableUpdate}>
                Don't update
              </button>
              <button type="button" className="floatingBannerClose" onClick={dismissAvailableUpdate} aria-label="Close update prompt">
                x
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
    chatNotification,
    setDevOtpPreview,
    setChatNotification,
    chats,
    calls,
    token,
    incomingRequests,
    dismissedRequestIds,
    dismissIncomingRequest,
    saveConnectionRecord,
    refreshIncomingRequests,
    respondToIncomingRequest,
    setActiveChatId,
    theme,
    appLockConfig,
    updateAppLockConfig,
    isLocked,
    unlockApp,
    hashLockSecret,
    unlockWithBiometric,
    biometricSupported,
    updateNotice,
    applyAvailableUpdate,
    dismissAvailableUpdate,
  } = useApp();

  const [section, setSection] = useState<Section>('chats');
  const [authPortal, setAuthPortal] = useState<AuthPortal>('chooser');
  const [mode, setMode] = useState<LoginMode>('login');
  const [authTab, setAuthTab] = useState<AuthTab>('otp');
  const [showRequestPopup, setShowRequestPopup] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpEmailForm, setOtpEmailForm] = useState({ email: '', code: '' });
  const [otpPhoneForm, setOtpPhoneForm] = useState({ phoneNumber: '', code: '' });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    name: '',
    phoneNumber: '',
    email: '',
    password: '',
    avatarUrl: '',
    bio: '',
    statusText: '',
  });
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [adminForm, setAdminForm] = useState({ email: defaultAdminEmail, secret: '' });
  const [showAdminForgot, setShowAdminForgot] = useState(false);
  const [adminForgotForm, setAdminForgotForm] = useState({
    email: defaultAdminEmail,
    code: '',
    newPassword: '',
  });
  const [adminToken, setAdminToken] = useState('');
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminMustChangePassword, setAdminMustChangePassword] = useState(false);
  const [adminFirstPasswordForm, setAdminFirstPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [adminFirstPasswordBusy, setAdminFirstPasswordBusy] = useState(false);
  const [adminChecking, setAdminChecking] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPin, setShowUnlockPin] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [pinResetStep, setPinResetStep] = useState<'identify' | 'reset'>('identify');
  const [pinResetIdentifier, setPinResetIdentifier] = useState('');
  const [pinResetCode, setPinResetCode] = useState('');
  const [pinResetNewPin, setPinResetNewPin] = useState('');
  const [pinResetConfirmPin, setPinResetConfirmPin] = useState('');
  const [showPinResetNewPin, setShowPinResetNewPin] = useState(false);
  const [showPinResetConfirmPin, setShowPinResetConfirmPin] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);

  // For registration with 2FA OTP
  const [registerOtpStage, setRegisterOtpStage] = useState<'form' | 'verify'>('form');
  const [registerEmailOtp, setRegisterEmailOtp] = useState('');
  const [registerPhoneOtp, setRegisterPhoneOtp] = useState('');
  const [registerOtpPreviews, setRegisterOtpPreviews] = useState<{ email?: string; phone?: string }>({});

  // For login with 2FA OTP
  const [loginOtpStage, setLoginOtpStage] = useState<'identify' | 'verify'>('identify');
  const [loginIdentifierEmail, setLoginIdentifierEmail] = useState('');
  const [loginIdentifierPhone, setLoginIdentifierPhone] = useState('');
  const [loginEmailOtp, setLoginEmailOtp] = useState('');
  const [loginPhoneOtp, setLoginPhoneOtp] = useState('');
  const [loginOtpPreviews, setLoginOtpPreviews] = useState<{ email?: string; phone?: string }>({});

  const adminSessionKey = 'helloto_admin_token';
  const hadAuthenticatedSessionRef = useRef(false);

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
    setToken(nextToken);
    setMe(user as never);
    setDevOtpPreview('');
    setInfo('Login successful');
    playNotification('received');
    void showDesktopNotification('HelloToo', 'Login successful');
  };

  const clearUserSession = () => {
    setToken('');
    setMe(null);
    sessionStorage.removeItem('helloto_session_token');
    localStorage.removeItem('helloto_saved_account_token');
  };

  const syncAdminEmailAcrossForms = (email: string) => {
    setAdminForm((current) => ({ ...current, email }));
    setAdminForgotForm((current) => ({ ...current, email }));
  };

  const saveAdminSession = (
    nextToken: string,
    admin: AdminProfile,
    message = 'Admin login successful',
    mustChangePassword = Boolean(admin.mustChangePassword),
  ) => {
    clearUserSession();
    const nextAdmin = { ...admin, mustChangePassword };
    setAdminToken(nextToken);
    setAdminProfile(nextAdmin);
    setAdminMustChangePassword(mustChangePassword);
    setAdminFirstPasswordForm({
      currentPassword: mustChangePassword ? adminForm.secret : '',
      newPassword: '',
      confirmPassword: '',
    });
    syncAdminEmailAcrossForms(nextAdmin.email);
    setDevOtpPreview('');
    setShowAdminForgot(false);
    setInfo(message);
    playNotification('received');
    void showDesktopNotification('HelloToo', message);
  };

  const resolveAdminProfile = async (nextToken: string, candidate: unknown) => {
    if (!nextToken) {
      throw new Error('Admin login failed because the server did not return a session token.');
    }
    if (isAdminProfile(candidate)) {
      return candidate;
    }
    const res = await api<{ admin?: unknown }>('/admin/me', { token: nextToken });
    if (isAdminProfile(res.admin)) {
      return res.admin;
    }
    throw new Error('Admin login failed because the server did not return the admin profile.');
  };

  const submitPasswordLogin = async () => {
    const res = await api<{ token: string; user: unknown }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginForm),
    });
    saveSession(res.token, res.user);
  };

  const submitAdminLogin = async () => {
    const res = await api<AdminAuthResponse>('/admin/login', {
      method: 'POST',
      body: JSON.stringify(adminForm),
    });
    const admin = await resolveAdminProfile(res.token, res.admin ?? res.user);
    const mustChangePassword = Boolean(res.mustChangePassword ?? admin.mustChangePassword);
    saveAdminSession(
      res.token,
      { ...admin, mustChangePassword },
      mustChangePassword ? 'Change the temporary admin password to continue.' : 'Admin login successful',
      mustChangePassword,
    );
  };

  const requestAdminRecoveryOtp = async () => {
    const res = await api<{ devOtpPreview?: string }>('/admin/request-password-reset-otp', {
      method: 'POST',
      body: JSON.stringify({ email: adminForgotForm.email }),
    });
    setDevOtpPreview(res.devOtpPreview ?? '');
    setInfo('Admin password reset OTP sent');
    playNotification('otp');
    void showDesktopNotification('HelloToo OTP', 'Admin password reset OTP sent');
  };

  const resetAdminRecovery = async () => {
    await api('/admin/reset-password-with-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: adminForgotForm.email,
        code: adminForgotForm.code,
        newPassword: adminForgotForm.newPassword,
      }),
    });
    setAdminForgotForm((current) => ({
      ...current,
      code: '',
      newPassword: '',
    }));
    setShowAdminForgot(false);
    setInfo('Admin password changed. You can sign in now.');
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

  // NEW: Request OTPs for registration
  const requestRegisterOtps = async (target?: 'email' | 'phone' | 'both') => {
    if (!registerForm.name?.trim()) throw new Error('Name is required');
    if (registerForm.password.length < 6) throw new Error('Password must be at least 6 characters');

    const hasEmail = Boolean(registerForm.email?.trim());
    const hasPhone = Boolean(registerForm.phoneNumber?.trim());
    const sendEmail = target === 'email' ? true : target === 'phone' ? false : target === 'both' ? hasEmail : hasEmail;
    const sendPhone = target === 'phone' ? true : target === 'email' ? false : target === 'both' ? hasPhone : hasPhone;
    if (!sendEmail && !sendPhone) throw new Error('Provide an email or mobile number to receive OTP');

    const res = await api<{
      emailOtpSent?: boolean;
      phoneOtpSent?: boolean;
      devPreviews?: { email?: string; phone?: string };
      devEmailOtpPreview?: string;
      devPhoneOtpPreview?: string;
    }>('/auth/register/request-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: sendEmail ? registerForm.email : undefined,
        phoneNumber: sendPhone ? registerForm.phoneNumber : undefined,
        name: registerForm.name,
        username: registerForm.username || undefined,
      }),
    });

    const previews = res.devPreviews ?? {
      email: res.devEmailOtpPreview,
      phone: res.devPhoneOtpPreview,
    };

    if (!res.emailOtpSent && !res.phoneOtpSent && !previews.email && !previews.phone) {
      throw new Error('Failed to send OTP. Please check the provided contact.');
    }

    setRegisterOtpPreviews(previews);
    if (previews.email || previews.phone) setDevOtpPreview([previews.email, previews.phone].filter(Boolean).join(' / '));
    setRegisterOtpStage('verify');
    setInfo(sendEmail && !sendPhone ? 'OTP sent to your email' : sendPhone && !sendEmail ? 'OTP sent to your mobile number' : 'OTP sent');
    playNotification('otp');
    void showDesktopNotification('HelloToo', 'OTP sent for registration');
  };

  // NEW: Submit registration with verified OTPs
  const submitRegisterWithOtp = async () => {
    // Accept either email OTP or phone OTP (or both). Send only provided codes.
    const emailOtp = registerEmailOtp.trim();
    const phoneOtp = registerPhoneOtp.trim();
    if (!emailOtp && !phoneOtp) throw new Error('Provide the OTP sent to your email or mobile');

    const body: Record<string, any> = {
      name: registerForm.name,
      password: registerForm.password,
      username: registerForm.username || undefined,
      bio: registerForm.bio || '',
      statusText: registerForm.statusText || '',
      avatarUrl: registerForm.avatarUrl || '',
    };
    if (registerForm.email?.trim()) body.email = registerForm.email;
    if (registerForm.phoneNumber?.trim()) body.phoneNumber = registerForm.phoneNumber;
    if (emailOtp) body.emailOtp = emailOtp;
    if (phoneOtp) body.phoneOtp = phoneOtp;

    const res = await api<{ token: string; user: unknown }>('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    setRegisterOtpStage('form');
    setRegisterEmailOtp('');
    setRegisterPhoneOtp('');
    setRegisterOtpPreviews({});
    saveSession(res.token, res.user);
  };

  // NEW: Request OTPs for login
  const requestLoginOtps = async () => {
    const hasEmail = loginIdentifierEmail.trim();
    const hasPhone = loginIdentifierPhone.trim();

    if (!hasEmail && !hasPhone) {
      throw new Error('Enter either your Gmail or mobile number');
    }

    const email = hasEmail ? loginIdentifierEmail.trim() : undefined;
    const phoneNumber = hasPhone ? loginIdentifierPhone.trim() : undefined;

    const res = await api<{
      emailOtpSent?: boolean;
      phoneOtpSent?: boolean;
      devPreviews?: { email?: string; phone?: string };
      devEmailOtpPreview?: string;
      devPhoneOtpPreview?: string;
    }>('/auth/login/request-otp', {
      method: 'POST',
      body: JSON.stringify({
        email,
        phoneNumber,
      }),
    });

    const previews = res.devPreviews ?? {
      email: res.devEmailOtpPreview,
      phone: res.devPhoneOtpPreview,
    };
    setLoginOtpPreviews(previews);
    if (previews.email || previews.phone) {
      setDevOtpPreview([previews.email, previews.phone].filter(Boolean).join(' / '));
    }
    setLoginOtpStage('verify');
    setInfo(hasEmail && hasPhone ? 'OTPs sent to your Gmail and mobile number' : 'OTP sent to your provided login detail');
    playNotification('otp');
    void showDesktopNotification('HelloToo', hasEmail && hasPhone ? 'OTPs sent to your email and phone' : 'OTP sent for login');
  };

  // NEW: Submit login with verified OTPs
  const loginWithOtps = async () => {
    if (!loginEmailOtp.trim() && !loginPhoneOtp.trim()) {
      throw new Error('Enter the OTP sent to your Gmail or mobile number');
    }

    const email = loginIdentifierEmail.trim();
    const phoneNumber = loginIdentifierPhone.trim();

    const res = await api<{ token: string; user: unknown }>('/auth/login/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: email || undefined,
        phoneNumber: phoneNumber || undefined,
        emailOtp: loginEmailOtp || undefined,
        phoneOtp: loginPhoneOtp || undefined,
      }),
    });

    setLoginOtpStage('identify');
    setLoginIdentifierEmail('');
    setLoginIdentifierPhone('');
    setLoginEmailOtp('');
    setLoginPhoneOtp('');
    setLoginOtpPreviews({});
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

  const normalizedOtpIdentifier = otpIdentifier.trim();
  const otpIdentifierLooksLikeEmail = normalizedOtpIdentifier.includes('@');

  const requestUnifiedOtp = async () => {
    if (!normalizedOtpIdentifier) {
      throw new Error('Enter your Gmail or mobile number first.');
    }
    if (otpIdentifierLooksLikeEmail) {
      setOtpEmailForm({ email: normalizedOtpIdentifier, code: otpEmailForm.code });
      await api<{ devOtpPreview?: string }>('/auth/request-email-otp', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedOtpIdentifier, purpose: 'login' }),
      }).then((res) => {
        setDevOtpPreview(res.devOtpPreview ?? '');
        setInfo('Email OTP sent');
        playNotification('otp');
        void showDesktopNotification('HelloToo OTP', 'Email OTP sent');
      });
      return;
    }
    setOtpPhoneForm({ phoneNumber: normalizedOtpIdentifier, code: otpPhoneForm.code });
    await api<{ devOtpPreview?: string }>('/auth/request-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: normalizedOtpIdentifier, purpose: 'login-phone' }),
    }).then((res) => {
      setDevOtpPreview(res.devOtpPreview ?? '');
      setInfo('Phone OTP sent');
      playNotification('otp');
      void showDesktopNotification('HelloToo OTP', 'Phone OTP sent');
    });
  };

  const loginWithUnifiedOtp = async () => {
    if (!normalizedOtpIdentifier) {
      throw new Error('Enter your Gmail or mobile number first.');
    }
    if (otpIdentifierLooksLikeEmail) {
      const res = await api<{ token: string; user: unknown }>('/auth/login-with-email-otp', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedOtpIdentifier, code: otpEmailForm.code }),
      });
      saveSession(res.token, res.user);
      return;
    }
    const res = await api<{ token: string; user: unknown }>('/auth/login-with-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: normalizedOtpIdentifier, code: otpPhoneForm.code }),
    });
    saveSession(res.token, res.user);
  };

  const requestPasswordResetOtp = async () => {
    const res = await api<{ devOtpPreview?: string }>('/auth/request-password-reset-otp', {
      method: 'POST',
      body: JSON.stringify({ identifier: forgotIdentifier }),
    });
    setDevOtpPreview(res.devOtpPreview ?? '');
    setInfo('Password reset OTP sent');
    playNotification('otp');
  };

  const resetPasswordWithOtp = async () => {
    await api('/auth/reset-password-with-otp', {
      method: 'POST',
      body: JSON.stringify({
        identifier: forgotIdentifier,
        code: forgotCode,
        newPassword: forgotNewPassword,
      }),
    });
    setForgotCode('');
    setForgotNewPassword('');
    setInfo('Password changed. You can log in now.');
  };

  const requestPinResetOtp = async () => {
    const identifier = pinResetIdentifier.trim() || me?.email || me?.phoneNumber || '';
    if (!identifier) {
      setError('Enter your email or mobile number to reset the PIN.');
      return;
    }
    setUnlockBusy(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/auth/request-pin-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setPinResetIdentifier(identifier);
      setDevOtpPreview(res.devOtpPreview ?? '');
      setInfo('PIN reset OTP sent');
      playNotification('otp');
    } finally {
      setUnlockBusy(false);
    }
  };

  const verifyPinResetOtp = async () => {
    if (!pinResetIdentifier.trim()) {
      setError('Enter your email or mobile number first.');
      return;
    }
    if (!pinResetCode.trim()) {
      setError('Enter the OTP you received.');
      return;
    }
    setPinResetStep('reset');
    setInfo('OTP verified. Set your new PIN.');
  };

  const resetPinWithOtp = async () => {
    const identifier = pinResetIdentifier.trim();
    if (!identifier) {
      setError('Enter your email or mobile number first.');
      return;
    }
    if (!/^\d{4,8}$/.test(pinResetNewPin.trim())) {
      setError('New PIN must be 4 to 8 digits.');
      return;
    }
    if (pinResetNewPin.trim() !== pinResetConfirmPin.trim()) {
      setError('New PIN and confirm PIN do not match.');
      return;
    }
    setUnlockBusy(true);
    try {
      await api('/auth/reset-pin-with-otp', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          code: pinResetCode,
          newPin: pinResetNewPin,
        }),
      });
      const pinHash = await hashLockSecret(pinResetNewPin.trim());
      updateAppLockConfig({ pinHash });
      setPinResetCode('');
      setPinResetNewPin('');
      setPinResetConfirmPin('');
      setUnlockPin('');
      setShowForgotPin(false);
      setPinResetStep('identify');
      unlockApp();
      setInfo('PIN changed and app unlocked.');
    } finally {
      setUnlockBusy(false);
    }
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
    { id: 'connections', label: 'Connections', shortLabel: 'Connect' },
    { id: 'updates', label: 'Status', shortLabel: 'Status' },
    { id: 'calls', label: 'Calls', shortLabel: 'Calls' },
    { id: 'ai', label: 'DIP AI', shortLabel: 'AI' },
    { id: 'account', label: 'You', shortLabel: 'You' },
  ];

  const mobileNavItems: Array<{ id: Section; label: string; shortLabel: string }> = [
    { id: 'chats', label: 'Chats', shortLabel: 'Chats' },
    { id: 'updates', label: 'Updates', shortLabel: 'Updates' },
    { id: 'connections', label: 'Communities', shortLabel: 'Communities' },
    { id: 'calls', label: 'Calls', shortLabel: 'Calls' },
  ];

  const unreadChats = chats.reduce((count, chat) => count + chat.unreadCount, 0);
  const recentCalls = [...calls].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8);
  const missedCalls = recentCalls.filter((call) => call.status === 'missed');
  const outgoingCalls = recentCalls.filter((call) => call.direction === 'outgoing');
  const completedCalls = recentCalls.filter((call) => call.status === 'completed');
  const videoCalls = recentCalls.filter((call) => call.mode === 'video');
  const railItems: Array<{ id: Section; icon: NavIcon; label: string; badge?: number }> = [
    { id: 'chats', icon: 'chat', label: 'Chats', badge: unreadChats || undefined },
    { id: 'connections', icon: 'connections', label: 'Connections', badge: incomingRequests.length || undefined },
    { id: 'updates', icon: 'status', label: 'Status' },
    { id: 'calls', icon: 'call', label: 'Calls' },
    { id: 'ai', icon: 'ai', label: 'DIP AI' },
    { id: 'account', icon: 'settings', label: 'Settings', badge: incomingRequests.length || undefined },
  ];

  useEffect(() => {
    if (!token || !me?.id) return;
    refreshIncomingRequests().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [token, me?.id, refreshIncomingRequests, setError]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, [me?.id]);

  useEffect(() => {
    const savedAdminToken = sessionStorage.getItem(adminSessionKey) ?? '';
    if (!savedAdminToken) return;
    setAdminToken(savedAdminToken);
  }, []);

  useEffect(() => {
    if (!adminToken) {
      sessionStorage.removeItem(adminSessionKey);
      setAdminProfile(null);
      setAdminMustChangePassword(false);
      setAdminChecking(false);
      return;
    }
    sessionStorage.setItem(adminSessionKey, adminToken);
    setAdminChecking(true);
    api<{ admin: AdminProfile }>('/admin/me', { token: adminToken })
      .then(({ admin }) => {
        setAdminProfile(admin);
        setAdminMustChangePassword(Boolean(admin.mustChangePassword));
      })
      .catch(() => {
        sessionStorage.removeItem(adminSessionKey);
        setAdminToken('');
        setAdminProfile(null);
        setAdminMustChangePassword(false);
      })
      .finally(() => setAdminChecking(false));
  }, [adminToken, api]);

  useEffect(() => {
    if (!adminProfile?.email) return;
    setAdminForm((current) => ({ ...current, email: adminProfile.email }));
    setAdminForgotForm((current) => ({ ...current, email: adminProfile.email }));
  }, [adminProfile?.email]);

  useEffect(() => {
    const authenticated = Boolean(me || adminToken);
    if (authenticated) {
      hadAuthenticatedSessionRef.current = true;
      return;
    }
    if (!hadAuthenticatedSessionRef.current) return;
    hadAuthenticatedSessionRef.current = false;
    setAuthPortal('chooser');
    setMode('login');
    setAuthTab('otp');
    setShowAdminForgot(false);
    setAdminForm((current) => ({ ...current, secret: '' }));
    setAdminForgotForm((current) => ({
      ...current,
      code: '',
      newPassword: '',
    }));
  }, [adminToken, me]);

  useEffect(() => {
    if (authPortal !== 'admin') {
      setShowAdminForgot(false);
    }
    if (authPortal === 'admin') {
      setMode('login');
    }
  }, [authPortal]);

  useEffect(() => {
    const handleOpenChatEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ chatId?: string }>;
      const chatId = customEvent.detail?.chatId;
      if (!chatId) return;
      setActiveChatId(chatId);
      setSection('chats');
      setChatNotification(null);
    };

    window.addEventListener('helloto:open-chat', handleOpenChatEvent as EventListener);
    return () => {
      window.removeEventListener('helloto:open-chat', handleOpenChatEvent as EventListener);
    };
  }, [setActiveChatId, setChatNotification]);

  useEffect(() => {
    setShowRequestPopup(incomingRequests.some((request) => !dismissedRequestIds.includes(request.id)));
  }, [dismissedRequestIds, incomingRequests]);

  useEffect(() => {
    if (!chatNotification) return;
    const timeout = window.setTimeout(() => setChatNotification(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [chatNotification, setChatNotification]);

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      const request = incomingRequests.find((entry) => entry.id === requestId);
      if (action === 'reject' && request) {
        saveConnectionRecord(request, 'rejected');
      }
      await respondToIncomingRequest(requestId, action);
      if (action === 'accept') setSection('chats');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestBusy(false);
    }
  };

  const handlePopupRequestAction = async (
    requestId: string,
    action: 'accept' | 'reject' | 'block' | 'report',
  ) => {
    if (requestBusy) return;
    const request = incomingRequests.find((entry) => entry.id === requestId);
    if (!request) return;

    if (action === 'accept') {
      await respondToRequest(requestId, 'accept');
      return;
    }

    setRequestBusy(true);
    try {
      if (action === 'reject') {
        saveConnectionRecord(request, 'rejected');
        await respondToIncomingRequest(requestId, 'reject');
        return;
      }

      if (action === 'block') {
        saveConnectionRecord(request, 'blocked', 'Blocked from main connection popup');
        await respondToIncomingRequest(requestId, 'reject');
        setInfo(`${request.fromUser.name} blocked`);
        return;
      }

      await api('/reports', {
        method: 'POST',
        token,
        body: JSON.stringify({
          targetUserId: request.fromUser.id,
          reason: 'Connection request report',
          detail: 'Reported from main connection popup',
        }),
      });
      saveConnectionRecord(request, 'reported', 'Reported from main connection popup');
      await respondToIncomingRequest(requestId, 'reject');
      setInfo(`${request.fromUser.name} reported`);
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

  const popupRequests = incomingRequests.filter((request) => !dismissedRequestIds.includes(request.id));

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
      unlockApp();
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

  const copyOtpPreview = async () => {
    if (!devOtpPreview) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(devOtpPreview);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = devOtpPreview;
        tempInput.setAttribute('readonly', 'true');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        document.body.appendChild(tempInput);
        tempInput.focus();
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setOtpCopied(true);
      window.setTimeout(() => setOtpCopied(false), 1800);
      setInfo('Copied');
    } catch {
      setError('Could not copy OTP.');
    }
  };

  const openNotifiedChat = () => {
    if (!chatNotification) return;
    setActiveChatId(chatNotification.chatId);
    setSection('chats');
    setChatNotification(null);
  };

  const refreshAdminSession = (nextToken: string, admin: AdminProfile) => {
    setAdminToken(nextToken);
    if (!isAdminProfile(admin)) return;
    setAdminProfile(admin);
    setAdminMustChangePassword(Boolean(admin.mustChangePassword));
    syncAdminEmailAcrossForms(admin.email);
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem(adminSessionKey);
    setAdminToken('');
    setAdminProfile(null);
    setAdminMustChangePassword(false);
    setAdminFirstPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setAuthPortal('chooser');
    setInfo('Admin logged out');
  };

  const submitInitialAdminPasswordChange = async () => {
    const currentPassword = adminFirstPasswordForm.currentPassword;
    const newPassword = adminFirstPasswordForm.newPassword;
    const confirmPassword = adminFirstPasswordForm.confirmPassword;

    if (!currentPassword.trim()) {
      setError('Enter the temporary admin password first.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New admin password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New admin password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a new password different from the temporary password.');
      return;
    }

    setAdminFirstPasswordBusy(true);
    try {
      const res = await api<{ admin: AdminProfile; token: string }>('/admin/account/change-password', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          oldPassword: currentPassword,
          newPassword,
        }),
      });
      const nextAdmin = { ...res.admin, mustChangePassword: false };
      setAdminFirstPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAdminMustChangePassword(false);
      saveAdminSession(res.token, nextAdmin, 'Admin password changed. Welcome in.', false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      void showDesktopNotification('HelloToo', message);
    } finally {
      setAdminFirstPasswordBusy(false);
    }
  };

  const renderAdminFirstPasswordChange = () => (
    <div className="authShell authLinkedShell">
      {(info || error) ? (
        <div className="floatingBannerStack authFloatingBannerStack">
          {info ? <div className="floatingBanner infoFloat"><span className="floatingBannerText">{info}</span></div> : null}
          {error ? <div className="floatingBanner errorFloat"><span className="floatingBannerText">{error}</span></div> : null}
        </div>
      ) : null}
      <div className="authLinkedPage">
        <header className="authLinkedHeader">
          <BrandMark />
        </header>
        <main className="authLinkedMain authLinkedMainAdmin">
          <section className="authAdminCard authAdminStandalone adminFirstLoginBackdrop" aria-hidden="true">
            <div className="authAdminHeader">
              <div className="authAdminHero">
                <span className="heroEyebrow authAdminHeroEyebrow">Admin only</span>
                <h2>ADMIN LOGIN</h2>
                <p>Temporary login verified. One security step remains.</p>
              </div>
            </div>
          </section>
        </main>
      </div>
      <div className="modalScrim adminFirstLoginScrim">
        <section
          className="authFooterModalCard adminFirstLoginModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adminFirstLoginTitle"
        >
          <div className="authFooterModalTitleBlock">
            <span className="authFooterModalEyebrow">First admin login</span>
            <h2 id="adminFirstLoginTitle">Change temporary password</h2>
          </div>
          <p className="authFooterModalSummary">
            The default admin login is active for setup only. Create a private admin password before opening the admin panel.
          </p>
          <form
            className="authLinkedFormStack adminFirstPasswordForm"
            onSubmit={(event) => {
              event.preventDefault();
              void submitInitialAdminPasswordChange();
            }}
          >
            <label className="authLinkedField">
              <span>Temporary password</span>
              <input
                className="input authLinkedInput"
                type="password"
                value={adminFirstPasswordForm.currentPassword}
                onChange={(event) => setAdminFirstPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder="Subha@123"
                autoComplete="current-password"
              />
            </label>
            <label className="authLinkedField">
              <span>New admin password</span>
              <input
                className="input authLinkedInput"
                type="password"
                value={adminFirstPasswordForm.newPassword}
                onChange={(event) => setAdminFirstPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>
            <label className="authLinkedField">
              <span>Confirm new password</span>
              <input
                className="input authLinkedInput"
                type="password"
                value={adminFirstPasswordForm.confirmPassword}
                onChange={(event) => setAdminFirstPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </label>
            <p className="authLinkedPanelNote authAdminFirstLoginHint">
              Admin Gmail: {adminProfile?.email ?? defaultAdminEmail}. The temporary password cannot be reused.
            </p>
            <button
              type="submit"
              className="primaryBtn authLinkedPrimaryButton"
              disabled={adminFirstPasswordBusy}
            >
              {adminFirstPasswordBusy ? 'Saving...' : 'Change password and continue'}
            </button>
            <button type="button" className="ghostBtn authLinkedSecondaryButton" onClick={logoutAdmin} disabled={adminFirstPasswordBusy}>
              Sign out
            </button>
          </form>
        </section>
      </div>
    </div>
  );

  if (adminToken && adminChecking && !adminProfile) {
    return (
      <div className="authShell authLinkedShell">
        <div className="authLinkedPage">
          <main className="authLinkedMain">
            <section className="authLinkedCard">
              <div className="authLinkedCardInner">
                <div className="authLinkedHeading">
                  <h1>Checking admin session</h1>
                  <p>Verifying the admin console access for this browser.</p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  if (adminProfile && adminToken && adminMustChangePassword) {
    return renderAdminFirstPasswordChange();
  }

  if (adminProfile && adminToken) {
    return (
      <AdminConsole
        admin={adminProfile}
        adminToken={adminToken}
        api={api}
        onSessionRefresh={refreshAdminSession}
        onLogout={logoutAdmin}
      />
    );
  }

  if (!me) {
    return (
      <LoginPage
        authPortal={authPortal}
        setAuthPortal={setAuthPortal}
        mode={mode}
        setMode={setMode}
        authTab={authTab}
        setAuthTab={setAuthTab}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        otpIdentifier={otpIdentifier}
        setOtpIdentifier={setOtpIdentifier}
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
        requestUnifiedOtp={requestUnifiedOtp}
        loginWithUnifiedOtp={loginWithUnifiedOtp}
        forgotIdentifier={forgotIdentifier}
        setForgotIdentifier={setForgotIdentifier}
        forgotCode={forgotCode}
        setForgotCode={setForgotCode}
        forgotNewPassword={forgotNewPassword}
        setForgotNewPassword={setForgotNewPassword}
        adminForm={adminForm}
        setAdminForm={setAdminForm}
        showAdminForgot={showAdminForgot}
        setShowAdminForgot={setShowAdminForgot}
        adminForgotForm={adminForgotForm}
        setAdminForgotForm={setAdminForgotForm}
        submitAdminLogin={submitAdminLogin}
        requestAdminRecoveryOtp={requestAdminRecoveryOtp}
        resetAdminRecovery={resetAdminRecovery}
        firstAdminEmail={defaultAdminEmail}
        firstAdminPassword={defaultAdminPassword}
        requestPasswordResetOtp={requestPasswordResetOtp}
        resetPasswordWithOtp={resetPasswordWithOtp}
        onPickImage={onPickImage}
        runAction={runAction}
        isMobile={isMobile}
        BrandMark={BrandMark}
        Avatar={Avatar}
        theme={theme}
        requestRegisterOtps={requestRegisterOtps}
        registerOtpStage={registerOtpStage}
        setRegisterOtpStage={setRegisterOtpStage}
        registerEmailOtp={registerEmailOtp}
        setRegisterEmailOtp={setRegisterEmailOtp}
        registerPhoneOtp={registerPhoneOtp}
        setRegisterPhoneOtp={setRegisterPhoneOtp}
        submitRegisterWithOtp={submitRegisterWithOtp}
        requestLoginOtps={requestLoginOtps}
        loginOtpStage={loginOtpStage}
        setLoginOtpStage={setLoginOtpStage}
        loginIdentifierEmail={loginIdentifierEmail}
        setLoginIdentifierEmail={setLoginIdentifierEmail}
        loginIdentifierPhone={loginIdentifierPhone}
        setLoginIdentifierPhone={setLoginIdentifierPhone}
        loginEmailOtp={loginEmailOtp}
        setLoginEmailOtp={setLoginEmailOtp}
        loginPhoneOtp={loginPhoneOtp}
        setLoginPhoneOtp={setLoginPhoneOtp}
        loginWithOtps={loginWithOtps}
      />
    );
  }

  return (
    <div className={`phoneFrame ${isMobile ? 'fullMobile' : ''}`}>
      {devOtpPreview || chatNotification || info || error ? (
        <div className="floatingBannerStack">
          {devOtpPreview ? (
            <div className="floatingBanner infoFloat">
              <span className="floatingBannerText">OTP: <strong>{devOtpPreview}</strong></span>
              <div className="floatingBannerActions">
                <button type="button" className="floatingBannerActionBtn" onClick={() => void copyOtpPreview()}>
                  {otpCopied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="floatingBannerClose" onClick={() => setDevOtpPreview('')} aria-label="Close OTP notification">
                  x
                </button>
              </div>
            </div>
          ) : null}
          {chatNotification ? (
            <div className="floatingBanner infoFloat chatPopupBanner" role="status" aria-live="polite">
              <div className="chatPopupBody">
                <div className="chatPopupAvatarWrap">
                  <Avatar name={chatNotification.senderName} avatarUrl={chatNotification.senderAvatarUrl} size={40} />
                </div>
                <div className="floatingBannerText chatPopupText">
                  <strong>{chatNotification.senderName}</strong>
                  <span className="chatPopupPreview">{chatNotification.preview}</span>
                  <span className="chatPopupUnreadMeta">{chatNotification.unreadCount} unread message{chatNotification.unreadCount === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div className="floatingBannerActions">
                <button type="button" className="floatingBannerActionBtn" onClick={openNotifiedChat}>
                  Open
                </button>
                <button
                  type="button"
                  className="floatingBannerClose chatPopupClose"
                  onClick={() => setChatNotification(null)}
                  aria-label="Close message notification"
                >
                  x
                </button>
              </div>
            </div>
          ) : null}
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
      <UpdateBanner
        updateNotice={updateNotice}
        applyAvailableUpdate={applyAvailableUpdate}
        dismissAvailableUpdate={dismissAvailableUpdate}
        stackClassName="appUpdateBannerStack"
      />

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
                <SectionIcon icon={item.icon} />
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
            </header>
          ) : null}

          <div className="waContentStage">
            <div className={section === 'chats' ? 'sectionPaneVisible' : 'sectionPaneHidden'}>
              <ChatPane isSectionActive={section === 'chats'} />
            </div>
            {section === 'connections' && <ConnectionPane />}
            {section === 'updates' && <ContactsPane section="updates" />}
            {section === 'ai' && <AISection />}
            {section === 'account' && <ProfilePane section="account" />}
            {section === 'calls' && (
              isMobile ? (
                <section className="screenPane mobileCallsScreen">
                  <div className="mobilePageHeader">
                    <h2>Calls</h2>
                    <div className="mobilePageHeaderActions">
                      <button type="button" className="mobileHeaderIconButton" onClick={() => setSection('account')} aria-label="Open settings">
                        <span className="mobileHeaderGlyph mobileHeaderGlyph-search" />
                      </button>
                      <button type="button" className="mobileHeaderIconButton" onClick={() => setSection('account')} aria-label="Open more options">
                        <span className="mobileHeaderGlyph mobileHeaderGlyph-more" />
                      </button>
                    </div>
                  </div>

                  <div className="mobileCallQuickActions">
                    <button type="button" className="mobileCallQuickAction" onClick={() => setSection('chats')}>
                      <span className="mobileCallQuickIcon">C</span>
                      <span>Call</span>
                    </button>
                    <button type="button" className="mobileCallQuickAction" onClick={() => setSection('chats')}>
                      <span className="mobileCallQuickIcon">V</span>
                      <span>Video</span>
                    </button>
                    <button type="button" className="mobileCallQuickAction">
                      <span className="mobileCallQuickIcon">K</span>
                      <span>Keypad</span>
                    </button>
                    <button type="button" className="mobileCallQuickAction">
                      <span className="mobileCallQuickIcon">F</span>
                      <span>Favorites</span>
                    </button>
                  </div>

                  <div className="mobileSectionLabel">Recent</div>
                  <div className="mobileCallHistoryList">
                    {recentCalls.length ? recentCalls.map((call) => (
                      <button key={call.id} className="mobileCallHistoryRow" onClick={() => openCallChat(call.chatId)}>
                        <div className="rowStart">
                          <Avatar name={call.user.name} avatarUrl={call.user.avatarUrl} size={48} />
                          <div className="cardText">
                            <strong>{call.user.name}</strong>
                            <span className={`mobileCallDirection ${call.direction}`}>{call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {call.mode}</span>
                            <span>{formatCallDate(call.createdAt)}</span>
                          </div>
                        </div>
                        <span className="mobileCallVideoGlyph" aria-hidden="true" />
                      </button>
                    )) : <div className="compactEmpty requestEmptyCard">No calls yet.</div>}
                  </div>

                  <button type="button" className="mobileFab mobileFab-call" onClick={() => setSection('chats')} aria-label="Start a new call">
                    +
                  </button>
                </section>
              ) : (
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
                    <div>
                      <strong>{videoCalls.length}</strong>
                      <span>video calls</span>
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

                    <article className="commandCard callHistoryPanel">
                      <div className="callHistoryHeader">
                        <strong>Video calls</strong>
                        <span>Face-to-face call history in one section</span>
                      </div>
                      <div className="callHistoryStack">
                        {videoCalls.length ? videoCalls.map((call) => (
                          <button key={call.id} className="callSummaryCard outgoingSummaryCard" onClick={() => openCallChat(call.chatId)}>
                            <strong>{call.user.name}</strong>
                            <span>{formatCallDate(call.createdAt)}</span>
                            <p>
                              {call.status === 'completed'
                                ? `${call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} video call completed in ${formatCallDuration(call.durationSeconds)}.`
                                : `${call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} video call ${call.status}.`}
                            </p>
                          </button>
                        )) : <div className="compactEmpty requestEmptyCard">No video calls yet.</div>}
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
                    <article className="commandCard">
                      <strong>Video calls</strong>
                      <p>{videoCalls.length} recent video call{videoCalls.length === 1 ? '' : 's'} now stay visible in a separate section.</p>
                    </article>
                  </div>
                </section>
              )
            )}
          </div>

          {isMobile ? (
            <nav className="bottomNav">
              {mobileNavItems.map((item) => (
                <button
                  key={item.id}
                  className={section === item.id ? 'bottomItem activeBottom' : 'bottomItem'}
                  onClick={() => setSection(item.id)}
                >
                  <span className={`bottomItemIcon bottomItemIcon-${item.id}`}>{item.shortLabel.slice(0, 1)}</span>
                  <span>{item.shortLabel}</span>
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </div>

      {me && isLocked ? (
        <div className="appLockOverlay">
          <UpdateBanner
            updateNotice={updateNotice}
            applyAvailableUpdate={applyAvailableUpdate}
            dismissAvailableUpdate={dismissAvailableUpdate}
            stackClassName="lockUpdateBannerStack"
          />
          {showForgotPin ? (
            <div className="appLockCard">
              <div className="appLockBrandRow">
                <BrandMark />
                <div className="cardText appLockBrandText">
                  <strong>Recover PIN</strong>
                  <span>Use your email or mobile number to continue.</span>
                </div>
              </div>
              <div className="cardText appLockHeader">
                <strong>{pinResetStep === 'identify' ? 'PIN recovery page' : 'Create a new PIN'}</strong>
                <span>{pinResetStep === 'identify' ? 'Enter your email or mobile number, then verify the OTP from the top banner.' : 'Set your new PIN and confirm it to finish the change.'}</span>
              </div>
              {pinResetStep === 'identify' ? (
                <div className="appLockField appLockResetCard">
                  <input
                    className="input appLockInput"
                    placeholder="Email or mobile number"
                    value={pinResetIdentifier}
                    onChange={(event) => setPinResetIdentifier(event.target.value)}
                  />
                  <input
                    className="input appLockInput"
                    inputMode="numeric"
                    placeholder="Enter OTP"
                    value={pinResetCode}
                    onChange={(event) => setPinResetCode(event.target.value)}
                  />
                  <div className="composerInputRow">
                    <button type="button" className="ghostBtn appLockActionBtn" onClick={() => void requestPinResetOtp()} disabled={unlockBusy}>
                      Send OTP
                    </button>
                    <button type="button" className="primaryBtn appLockActionBtn" onClick={() => void verifyPinResetOtp()} disabled={unlockBusy}>
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <div className="appLockField appLockResetCard">
                  <div className="composerInputRow">
                    <input
                      className="input appLockInput"
                      type={showPinResetNewPin ? 'text' : 'password'}
                      inputMode="numeric"
                      placeholder="Set new PIN"
                      value={pinResetNewPin}
                      onChange={(event) => setPinResetNewPin(event.target.value)}
                    />
                    <button type="button" className="ghostBtn appLockToggleBtn" onClick={() => setShowPinResetNewPin((current) => !current)}>
                      {showPinResetNewPin ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="composerInputRow">
                    <input
                      className="input appLockInput"
                      type={showPinResetConfirmPin ? 'text' : 'password'}
                      inputMode="numeric"
                      placeholder="Confirm new PIN"
                      value={pinResetConfirmPin}
                      onChange={(event) => setPinResetConfirmPin(event.target.value)}
                    />
                    <button type="button" className="ghostBtn appLockToggleBtn" onClick={() => setShowPinResetConfirmPin((current) => !current)}>
                      {showPinResetConfirmPin ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className="primaryBtn appLockActionBtn" onClick={() => void resetPinWithOtp()} disabled={unlockBusy}>
                      Update PIN
                    </button>
                  </div>
                </div>
              )}
              <div className="appLockInlineActions">
                {pinResetStep === 'reset' ? (
                  <button type="button" className="ghostBtn appLockLinkBtn" onClick={() => setPinResetStep('identify')}>
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghostBtn appLockLinkBtn"
                  onClick={() => {
                    setShowForgotPin(false);
                    setPinResetStep('identify');
                    setPinResetCode('');
                    setPinResetNewPin('');
                    setPinResetConfirmPin('');
                  }}
                >
                  Back to unlock
                </button>
              </div>
            </div>
          ) : (
            <div className="appLockCard">
              <div className="appLockBrandRow">
                <BrandMark />
                <div className="cardText appLockBrandText">
                  <strong>Secured by INFINITY</strong>
                  <span>All copyright reserved</span>
                </div>
              </div>
              <div className="cardText appLockHeader">
                <strong>Unlock HelloToo</strong>
                <span>This protected screen appears before the website opens. Verify once and you go straight into your account.</span>
              </div>

              <div className="appLockMethodRow" aria-label="Available unlock methods">
                {appLockConfig.pinHash ? <span className="appLockMethodChip">PIN</span> : null}
                {appLockConfig.passwordHash ? <span className="appLockMethodChip">Password</span> : null}
                {appLockConfig.biometricEnabled && biometricSupported ? <span className="appLockMethodChip">Biometric</span> : null}
              </div>

              {appLockConfig.pinHash ? (
                <div className="appLockField">
                  <span>Security PIN</span>
                  <div className="composerInputRow">
                    <input
                      className="input appLockInput"
                      type={showUnlockPin ? 'text' : 'password'}
                      inputMode="numeric"
                      placeholder="Enter your PIN"
                      value={unlockPin}
                      onChange={(event) => setUnlockPin(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void unlockWithSecret('pin');
                      }}
                    />
                    <button type="button" className="ghostBtn appLockToggleBtn" onClick={() => setShowUnlockPin((current) => !current)}>
                      {showUnlockPin ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className="primaryBtn appLockActionBtn" onClick={() => void unlockWithSecret('pin')} disabled={unlockBusy}>
                      Continue
                    </button>
                  </div>
                  <div className="appLockInlineActions">
                    <button
                      type="button"
                      className="ghostBtn appLockLinkBtn"
                      onClick={() => {
                        setShowForgotPin(true);
                        setPinResetStep('identify');
                        setPinResetIdentifier((me?.email || me?.phoneNumber || '').trim());
                        setPinResetCode('');
                        setPinResetNewPin('');
                        setPinResetConfirmPin('');
                      }}
                    >
                      Forgot PIN?
                    </button>
                  </div>
                </div>
              ) : null}

              {appLockConfig.passwordHash ? (
                <div className="appLockField">
                  <span>Security password</span>
                  <div className="composerInputRow">
                    <input
                      className="input appLockInput"
                      type={showUnlockPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={unlockPassword}
                      onChange={(event) => setUnlockPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void unlockWithSecret('password');
                      }}
                    />
                    <button type="button" className="ghostBtn appLockToggleBtn" onClick={() => setShowUnlockPassword((current) => !current)}>
                      {showUnlockPassword ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className="primaryBtn appLockActionBtn" onClick={() => void unlockWithSecret('password')} disabled={unlockBusy}>
                      Continue
                    </button>
                  </div>
                </div>
              ) : null}

              {appLockConfig.biometricEnabled && biometricSupported ? (
                <button type="button" className="ghostBtn appLockBioBtn" onClick={() => void unlockBiometric()} disabled={unlockBusy}>
                  Use biometric unlock
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {showRequestPopup ? (
        <div className="modalScrim" onClick={() => setShowRequestPopup(false)}>
          <div className="connectModalCard requestPopupCard" onClick={(event) => event.stopPropagation()}>
            <div className="requestPopupHeader">
              <div>
                <span className="heroEyebrow">New connection</span>
                <h2>People want to connect with you</h2>
              </div>
              <button className="ghostBtn closeIconBtn" onClick={() => {
                popupRequests.forEach((request) => dismissIncomingRequest(request.id));
                setShowRequestPopup(false);
              }} aria-label="Close request popup">
                x
              </button>
            </div>
            <p className="miniText">Accept to move straight into chats. Close this popup to review them later from Settings to Connections.</p>
            <div className="requestStack">
              {popupRequests.map((request) => (
                <div key={request.id} className="requestCard requestPopupItem">
                  <div className="rowStart">
                    <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                    <div className="cardText">
                      <strong>{request.fromUser.name}</strong>
                      <span>{request.phoneNumber || request.aliasName || 'Sent you a connection request'}</span>
                      <span>{new Date(request.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div className="contactActions">
                    <button className="ghostBtn smallGhost" onClick={() => void handlePopupRequestAction(request.id, 'reject')} disabled={requestBusy}>
                      Reject
                    </button>
                    <button className="primaryBtn smallGhost" onClick={() => void handlePopupRequestAction(request.id, 'accept')} disabled={requestBusy}>
                      Accept
                    </button>
                    <button className="ghostBtn smallGhost" onClick={() => void handlePopupRequestAction(request.id, 'block')} disabled={requestBusy}>
                      Block
                    </button>
                    <button className="ghostBtn smallGhost" onClick={() => void handlePopupRequestAction(request.id, 'report')} disabled={requestBusy}>
                      Report
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
