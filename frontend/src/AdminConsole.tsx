import { useEffect, useMemo, useState } from 'react';
import { Avatar, fmtDate } from './App';
import { useApp } from './AppContext';
import './index.css';
import './admin-panel-advanced.css';

type AdminIdentity = {
  email: string;
  phoneNumber: string | null;
  name: string;
  hasPin?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

type AdminUser = {
  id: string;
  username: string;
  name: string;
  phoneNumber: string | null;
  phoneVerified?: boolean;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  statusText: string;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  isBlocked: boolean;
  suspendedUntil: string | null;
  deletedAt: string | null;
  isOnline?: boolean;
};

type AdminReport = {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  actionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reporterUser: null | {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    email?: string | null;
  };
  targetUser: AdminUser;
};

type AdminEvent = {
  id: string;
  kind: string;
  detail: string;
  actorType: string;
  actorId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  };
};

type AdminUserDetail = {
  user: AdminUser;
  auditEvents: Array<{
    id: string;
    kind: string;
    detail: string;
    actorType: string;
    actorId: string | null;
    createdAt: string;
  }>;
  notices: Array<{
    id: string;
    title: string;
    message: string;
    sentBy: string;
    createdAt: string;
    expiresAt: string | null;
  }>;
  reports: Array<{
    id: string;
    reason: string;
    detail: string | null;
    status: string;
    actionNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    reporterUser: null | {
      id: string;
      name: string;
      username: string;
      avatarUrl: string | null;
      email?: string | null;
    };
  }>;
};

type AdminDashboard = {
  stats: {
    totalUsers: number;
    blockedUsers: number;
    deletedUsers: number;
    suspendedUsers: number;
    openReports: number;
  };
  reports: AdminReport[];
  events: AdminEvent[];
};

type AdminConsoleProps = {
  admin: AdminIdentity;
  adminToken: string;
  api: <T = any>(path: string, opts?: RequestInit & { token?: string }) => Promise<T>;
  onSessionRefresh: (token: string, admin: AdminIdentity) => void;
  onLogout: () => void;
};

type AdminArea = 'dashboard' | 'system' | 'users' | 'reports' | 'analytics' | 'logs' | 'account';

const moderationLabel = (user: AdminUser) => {
  if (user.deletedAt) return 'Deleted';
  if (user.isBlocked) return 'Blocked';
  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) return 'Suspended';
  return user.isOnline ? 'Online' : 'Active';
};

export function AdminConsole({ admin, adminToken, api, onSessionRefresh, onLogout }: AdminConsoleProps) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [adminAccount, setAdminAccount] = useState<AdminIdentity | null>(admin);
  const [activeArea, setActiveArea] = useState<AdminArea>('dashboard');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [suspendDays, setSuspendDays] = useState('3');
  const [actionNote, setActionNote] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [adminName, setAdminName] = useState(admin.name);
  const [adminProfession, setAdminProfession] = useState('Computer Science Engineer');
  const [adminPhoneNumber, setAdminPhoneNumber] = useState(admin.phoneNumber ?? '');
  const [nextAdminEmail, setNextAdminEmail] = useState(admin.email);
  const [nextAdminPhoneNumber, setNextAdminPhoneNumber] = useState(admin.phoneNumber ?? '');
  const [credentialOldPassword, setCredentialOldPassword] = useState('');
  const [credentialCode, setCredentialCode] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  // App Password state
  const [appPasswords, setAppPasswords] = useState<Array<{
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>>([]);
  const [newAppPasswordName, setNewAppPasswordName] = useState('');
  const [showAppPasswordForm, setShowAppPasswordForm] = useState(false);
  const [generatedAppPassword, setGeneratedAppPassword] = useState<{ id: string; password: string } | null>(null);
  const [appPasswordLoading, setAppPasswordLoading] = useState(false);

  const { appLockConfig, updateAppLockConfig, clearAppLockConfig, lockApp, biometricSupported, hashLockSecret, registerBiometricLock, unlockWithBiometric } = useApp();
  const [appLockPassword, setAppLockPassword] = useState('');
  const [appLockPin, setAppLockPin] = useState('');
  const [showAppLockPassword, setShowAppLockPassword] = useState(false);
  const [appLockSaving, setAppLockSaving] = useState(false);
  const [biometricRegistering, setBiometricRegistering] = useState(false);

  const appLockMethods = useMemo(() => {
    const methods: string[] = [];
    if (appLockConfig.pinHash) methods.push('PIN');
    if (appLockConfig.passwordHash) methods.push('Password');
    if (appLockConfig.biometricEnabled) methods.push('Biometric');
    return methods;
  }, [appLockConfig]);
  const appLockEnabled = appLockMethods.length > 0;

  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [phoneChangeCode, setPhoneChangeCode] = useState('');
  const [passwordChangeOld, setPasswordChangeOld] = useState('');
  const [passwordChangeNew, setPasswordChangeNew] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');

  const [banner, setBanner] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const showBanner = (type: 'info' | 'error', text: string, duration = 3000) => {
    setBanner({ type, text });
    window.setTimeout(() => {
      setBanner((current) => current?.text === text ? null : current);
    }, duration);
  };

  useEffect(() => {
    setAdminAccount(admin);
    setAdminName(admin.name);
    setAdminPhoneNumber(admin.phoneNumber ?? '');
    setNextAdminEmail(admin.email);
    setNextAdminPhoneNumber(admin.phoneNumber ?? '');
  }, [admin]);

  const loadUserDetail = async (userId: string) => {
    if (!userId) {
      setSelectedUser(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await api<AdminUserDetail>(`/admin/users/${userId}`, { token: adminToken });
      setSelectedUser(res);
      setSelectedUserId(userId);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAdminData = async (preferredUserId?: string) => {
    setLoading(true);
    try {
      const [dashboardRes, usersRes, adminRes] = await Promise.all([
        api<AdminDashboard>('/admin/dashboard', { token: adminToken }),
        api<{ users: AdminUser[] }>('/admin/users', { token: adminToken }),
        api<{ admin: AdminIdentity }>('/admin/account', { token: adminToken }),
      ]);
      setDashboard(dashboardRes);
      setUsers(usersRes.users);
      setAdminAccount(adminRes.admin);
      setAdminName(adminRes.admin.name);
      setAdminPhoneNumber(adminRes.admin.phoneNumber ?? '');
      setNextAdminEmail(adminRes.admin.email);
      setNextAdminPhoneNumber(adminRes.admin.phoneNumber ?? '');
      const nextUserId = preferredUserId ?? selectedUserId ?? usersRes.users[0]?.id ?? '';
      if (nextUserId) {
        await loadUserDetail(nextUserId);
      } else {
        setSelectedUser(null);
      }
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAdminData();
  }, [adminToken]);

  // Load app passwords
  const loadAppPasswords = async () => {
    setAppPasswordLoading(true);
    try {
      const res = await api<{ appPasswords: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }> }>(
        '/admin/account/app-passwords',
        { token: adminToken }
      );
      setAppPasswords(res.appPasswords);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAppPasswordLoading(false);
    }
  };

  // Create new app password
  const createAppPassword = async () => {
    if (!newAppPasswordName.trim()) {
      showBanner('error', 'Enter a name for this app password first.');
      return;
    }
    setAppPasswordLoading(true);
    try {
      const res = await api<{ id: string; password: string }>(
        '/admin/account/app-passwords/create',
        {
          method: 'POST',
          token: adminToken,
          body: JSON.stringify({ name: newAppPasswordName.trim() }),
        }
      );
      setGeneratedAppPassword(res);
      setNewAppPasswordName('');
      await loadAppPasswords();
      showBanner('info', 'App password created successfully. Store it safely!', 6000);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAppPasswordLoading(false);
    }
  };

  // Delete app password
  const deleteAppPassword = async (appPasswordId: string) => {
    if (!confirm('Are you sure you want to delete this app password? This cannot be undone.')) {
      return;
    }
    setAppPasswordLoading(true);
    try {
      await api(`/admin/account/app-passwords/${appPasswordId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      await loadAppPasswords();
      showBanner('info', 'App password deleted successfully.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAppPasswordLoading(false);
    }
  };

  // Load app passwords on mount
  useEffect(() => {
    void loadAppPasswords();
  }, [adminToken]);

  const saveAdminProfile = async () => {
    if (!adminName.trim()) {
      showBanner('error', 'Write the admin name first.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity }>('/admin/account/profile', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          name: adminName.trim(),
          phoneNumber: adminPhoneNumber.trim(),
        }),
      });
      setAdminAccount(res.admin);
      setAdminName(res.admin.name);
      setAdminPhoneNumber(res.admin.phoneNumber ?? '');
      showBanner('info', 'Admin profile and mobile number updated.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const requestCredentialOtp = async () => {
    if (!credentialOldPassword.trim()) {
      showBanner('error', 'Write the current admin password first.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/admin/account/request-credential-otp', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ oldPassword: credentialOldPassword }),
      });
      showBanner(
        'info',
        res.devOtpPreview
          ? `Verification OTP: ${res.devOtpPreview}`
          : 'Verification OTP sent to the current admin Gmail.',
        res.devOtpPreview ? 12000 : 4000,
      );
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const saveAdminCredentials = async () => {
    const emailChanged = nextAdminEmail.trim().toLowerCase() !== (adminAccount?.email ?? admin.email).toLowerCase();
    const passwordChanged = Boolean(nextPassword.trim());
    const phoneChanged = nextAdminPhoneNumber.trim() !== (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '');
    if (!emailChanged && !passwordChanged && !phoneChanged) {
      showBanner('error', 'Change the Gmail, password, or mobile number first.');
      return;
    }
    if (!credentialOldPassword.trim()) {
      showBanner('error', 'Write the old admin password first.');
      return;
    }
    if (!credentialCode.trim()) {
      showBanner('error', 'Enter the Gmail OTP first.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/credentials', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          oldPassword: credentialOldPassword,
          code: credentialCode,
          newEmail: nextAdminEmail.trim(),
          newPassword: nextPassword,
          newPhoneNumber: nextAdminPhoneNumber.trim(),
        }),
      });
      setCredentialCode('');
      setCredentialOldPassword('');
      setNextPassword('');
      setNextAdminPhoneNumber(res.admin.phoneNumber ?? '');
      setAdminAccount(res.admin);
      setNextAdminEmail(res.admin.email);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Admin Gmail, password, and mobile number updated.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const saveAdminPin = async () => {
    if (!pinPassword.trim()) {
      showBanner('error', 'Write the current admin password first.');
      return;
    }
    if (!nextPin.trim()) {
      showBanner('error', 'Write the new admin PIN first.');
      return;
    }
    const hadPin = Boolean(adminAccount?.hasPin);
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/pin', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ currentPassword: pinPassword, newPin: nextPin }),
      });
      setPinPassword('');
      setNextPin('');
      setAdminAccount(res.admin);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', hadPin ? 'Admin PIN updated.' : 'Admin PIN saved.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const removeAdminPin = async () => {
    if (!confirm('Are you sure you want to remove the admin PIN? You will only be able to login with your password.')) {
      return;
    }
    if (!pinPassword.trim()) {
      showBanner('error', 'Enter your current password to remove PIN.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/remove-pin', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ currentPassword: pinPassword }),
      });
      setPinPassword('');
      setAdminAccount(res.admin);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Admin PIN removed successfully.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const saveAppLockPassword = async () => {
    if (!appLockPassword.trim()) {
      showBanner('error', 'Enter a password for app lock.');
      return;
    }
    if (appLockPassword.length < 8) {
      showBanner('error', 'App lock password must be at least 8 characters.');
      return;
    }
    setAppLockSaving(true);
    try {
      const passwordHash = await hashLockSecret(appLockPassword.trim());
      updateAppLockConfig({ passwordHash });
      setAppLockPassword('');
      showBanner('info', 'App lock password saved successfully.');
      lockApp();
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAppLockSaving(false);
    }
  };

  const saveAppLockPin = async () => {
    const candidate = appLockPin.trim();
    if (!candidate) {
      showBanner('error', 'Enter a PIN first.');
      return;
    }
    if (!/^[0-9]{4,8}$/.test(candidate)) {
      showBanner('error', 'PIN must be 4 to 8 digits.');
      return;
    }
    setAppLockSaving(true);
    try {
      const pinHash = await hashLockSecret(candidate);
      updateAppLockConfig({ pinHash });
      setAppLockPin('');
      showBanner('info', 'App lock PIN saved successfully.');
      lockApp();
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAppLockSaving(false);
    }
  };

  const disableAppLockPin = () => {
    if (!appLockConfig.pinHash) return;
    if (!confirm('Remove PIN lock? You can still use password or biometric unlock if configured.')) return;
    updateAppLockConfig({ pinHash: '' });
    showBanner('info', 'PIN lock removed.');
  };

  const disableAppLockPassword = () => {
    if (!appLockConfig.passwordHash) return;
    if (!confirm('Remove app lock password? You can still use PIN or biometric unlock if configured.')) return;
    updateAppLockConfig({ passwordHash: '' });
    showBanner('info', 'App lock password removed.');
  };

  const enableBiometricLock = async () => {
    if (!biometricSupported) {
      showBanner('error', 'Biometric unlock is not supported on this device or browser.');
      return;
    }
    setBiometricRegistering(true);
    try {
      const registered = await registerBiometricLock();
      if (registered) {
        showBanner('info', 'Biometric unlock registered successfully.');
        lockApp();
      } else {
        showBanner('error', 'Could not register biometric unlock. Try again.');
      }
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setBiometricRegistering(false);
    }
  };

  const disableBiometricLock = () => {
    if (!appLockConfig.biometricEnabled) return;
    if (!confirm('Disable biometric unlock?')) return;
    updateAppLockConfig({ biometricEnabled: false, biometricCredentialId: '' });
    localStorage.removeItem('helloto_admin_biometric_credential_id');
    showBanner('info', 'Biometric unlock disabled.');
  };

  const verifyBiometricScan = async () => {
    if (!biometricSupported) {
      showBanner('error', 'Face scan is not supported on this browser or device.');
      return;
    }
    if (!appLockConfig.biometricEnabled && !localStorage.getItem('helloto_admin_biometric_credential_id')) {
      showBanner('error', 'Add the admin face scan first.');
      return;
    }
    setBiometricRegistering(true);
    try {
      const verified = await unlockWithBiometric();
      showBanner(verified ? 'info' : 'error', verified ? 'Face scan verified successfully.' : 'Face scan did not match or was cancelled.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : 'Face scan verification failed.');
    } finally {
      setBiometricRegistering(false);
    }
  };

  const toggleAutoLockOnHide = () => {
    updateAppLockConfig({ autoLockOnHide: !appLockConfig.autoLockOnHide });
    showBanner('info', appLockConfig.autoLockOnHide ? 'Auto-lock on hide disabled.' : 'Auto-lock on hide enabled.');
  };

  const clearAllAppLock = () => {
    if (!appLockEnabled) {
      showBanner('info', 'No app lock settings are configured.');
      return;
    }
    if (!confirm('Clear all app lock settings and disable the admin lock screen?')) return;
    clearAppLockConfig();
    showBanner('info', 'All app lock settings cleared.');
  };

  // New separate security functions
  const requestEmailChangeOtp = async () => {
    if (!nextAdminEmail.trim() || nextAdminEmail === (adminAccount?.email ?? admin.email)) {
      showBanner('error', 'Enter a different Gmail address first.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/admin/account/request-email-change-otp', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ newEmail: nextAdminEmail.trim() }),
      });
      showBanner(
        'info',
        res.devOtpPreview
          ? `Verification OTP: ${res.devOtpPreview}`
          : 'Verification OTP sent to the new Gmail address.',
        res.devOtpPreview ? 12000 : 4000,
      );
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const changeAdminEmail = async () => {
    if (!nextAdminEmail.trim() || nextAdminEmail === (adminAccount?.email ?? admin.email)) {
      showBanner('error', 'Enter a different Gmail address.');
      return;
    }
    if (!emailChangeCode.trim()) {
      showBanner('error', 'Enter the verification OTP.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/change-email', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newEmail: nextAdminEmail.trim(),
          code: emailChangeCode,
        }),
      });
      setEmailChangeCode('');
      setAdminAccount(res.admin);
      setNextAdminEmail(res.admin.email);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Admin Gmail updated successfully.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const requestPhoneChangeOtp = async () => {
    if (!nextAdminPhoneNumber.trim() || nextAdminPhoneNumber === (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '')) {
      showBanner('error', 'Enter a different mobile number first.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/admin/account/request-phone-change-otp', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ newPhoneNumber: nextAdminPhoneNumber.trim() }),
      });
      showBanner(
        'info',
        res.devOtpPreview
          ? `Verification OTP: ${res.devOtpPreview}`
          : 'Verification OTP sent to the new mobile number.',
        res.devOtpPreview ? 12000 : 4000,
      );
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const changeAdminPhone = async () => {
    if (!nextAdminPhoneNumber.trim() || nextAdminPhoneNumber === (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '')) {
      showBanner('error', 'Enter a different mobile number.');
      return;
    }
    if (!phoneChangeCode.trim()) {
      showBanner('error', 'Enter the verification OTP.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/change-phone', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newPhoneNumber: nextAdminPhoneNumber.trim(),
          code: phoneChangeCode,
        }),
      });
      setPhoneChangeCode('');
      setAdminAccount(res.admin);
      setNextAdminPhoneNumber(res.admin.phoneNumber ?? '');
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Admin mobile number updated successfully.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const changeAdminPassword = async () => {
    if (!passwordChangeOld.trim()) {
      showBanner('error', 'Enter your current password.');
      return;
    }
    if (!passwordChangeNew.trim()) {
      showBanner('error', 'Enter a new password.');
      return;
    }
    if (passwordChangeNew.length < 8) {
      showBanner('error', 'New password must be at least 8 characters.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/change-password', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          oldPassword: passwordChangeOld,
          newPassword: passwordChangeNew,
        }),
      });
      setPasswordChangeOld('');
      setPasswordChangeNew('');
      setAdminAccount(res.admin);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Admin password updated successfully.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const requestForgotPasswordOtp = async () => {
    if (!forgotEmail.trim()) {
      showBanner('error', 'Enter your admin Gmail address.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ devOtpPreview?: string }>('/admin/account/request-forgot-password-otp', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      showBanner(
        'info',
        res.devOtpPreview
          ? `Reset OTP: ${res.devOtpPreview}`
          : 'Password reset OTP sent to your Gmail.',
        res.devOtpPreview ? 12000 : 4000,
      );
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const resetAdminPassword = async () => {
    if (!forgotEmail.trim()) {
      showBanner('error', 'Enter your Gmail address.');
      return;
    }
    if (!forgotCode.trim()) {
      showBanner('error', 'Enter the reset OTP.');
      return;
    }
    if (!forgotNewPassword.trim()) {
      showBanner('error', 'Enter a new password.');
      return;
    }
    if (forgotNewPassword.length < 8) {
      showBanner('error', 'New password must be at least 8 characters.');
      return;
    }
    setAccountSaving(true);
    try {
      const res = await api<{ admin: AdminIdentity; token: string }>('/admin/account/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode,
          newPassword: forgotNewPassword,
        }),
      });
      setForgotEmail('');
      setForgotCode('');
      setForgotNewPassword('');
      setShowForgotPassword(false);
      setAdminAccount(res.admin);
      onSessionRefresh(res.token, res.admin);
      showBanner('info', 'Password reset successfully. You are now logged in.');
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const getPasswordStrength = (password: string): string => {
    if (password.length < 8) return 'weak';
    if (password.length < 12) return 'medium';
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)) return 'strong';
    return 'medium';
  };

  const getPasswordStrengthText = (password: string): string => {
    const strength = getPasswordStrength(password);
    switch (strength) {
      case 'weak': return 'Weak - Use at least 8 characters';
      case 'medium': return 'Medium - Add uppercase, numbers, and symbols';
      case 'strong': return 'Strong password';
      default: return '';
    }
  };

  const isSecurityFormValid = (): boolean => {
    const emailChanged = nextAdminEmail.trim().toLowerCase() !== (adminAccount?.email ?? admin.email).toLowerCase();
    const passwordChanged = Boolean(nextPassword.trim());
    const phoneChanged = nextAdminPhoneNumber.trim() !== (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '');

    if (!emailChanged && !passwordChanged && !phoneChanged) return false;
    if (!credentialOldPassword.trim()) return false;
    if (!credentialCode.trim()) return false;
    if (passwordChanged && nextPassword.length < 8) return false;

    return true;
  };

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      `${user.name} ${user.username} ${user.email ?? ''} ${user.phoneNumber ?? ''}`.toLowerCase().includes(needle),
    );
  }, [search, users]);

  const reportStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { open: 0, reviewed: 0, actioned: 0, dismissed: 0 };
    dashboard?.reports?.forEach((report) => {
      const status = report.status ?? 'open';
      counts[status] = (counts[status] ?? 0) + 1;
    });
    return counts;
  }, [dashboard]);

  const eventTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dashboard?.events?.forEach((event) => {
      counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [dashboard]);

  const currentAdminEmail = (adminAccount?.email ?? admin.email).trim();
  const adminAreas: Array<{ id: AdminArea; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'Users' },
    { id: 'reports', label: 'Reports' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'logs', label: 'Logs' },
    { id: 'system', label: 'System' },
    { id: 'account', label: 'Account' },
  ];

  const submitNotice = async () => {
    if (!selectedUser?.user.id) return;
    if (!noticeTitle.trim() || !noticeMessage.trim()) {
      showBanner('error', 'Write a notice title and message first.');
      return;
    }
    try {
      await api(`/admin/users/${selectedUser.user.id}/notice`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          title: noticeTitle.trim(),
          message: noticeMessage.trim(),
        }),
      });
      setNoticeTitle('');
      setNoticeMessage('');
      showBanner('info', 'Notice sent to user.');
      await refreshAdminData(selectedUser.user.id);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    }
  };

  const runAdminAction = async (action: 'block' | 'unblock' | 'suspend' | 'restore' | 'delete-permanently') => {
    if (!selectedUser?.user.id) return;
    try {
      await api(`/admin/users/${selectedUser.user.id}/action`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          action,
          days: action === 'suspend' ? Number(suspendDays || '1') : undefined,
          note: actionNote.trim() || undefined,
        }),
      });
      setActionNote('');
      showBanner('info', `User ${action.replace('-', ' ')} completed.`);
      await refreshAdminData(selectedUser.user.id);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    }
  };

  const reviewReport = async (reportId: string, status: 'reviewed' | 'actioned' | 'dismissed') => {
    try {
      await api(`/admin/reports/${reportId}/review`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          status,
          actionNote: reportNote.trim() || undefined,
        }),
      });
      setReportNote('');
      showBanner('info', `Report marked as ${status}.`);
      await refreshAdminData(selectedUser?.user.id);
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : String(err));
    }
  };

  const renderAccountCard = () => (
    <article className="adminPanelCard adminAccountCard">
      <div className="adminProfileHeader animate-fade-in-up">
        <div className="adminProfileAvatar">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="4" fill="currentColor"/>
            <path d="M12 14c-6 0-8 3-8 3v3h16v-3s-2-3-8-3z" fill="currentColor"/>
          </svg>
        </div>
        <div className="adminProfileInfo">
          <h2 className="adminProfileName">{adminName || 'Admin User'}</h2>
          <p className="adminProfileEmail">{currentAdminEmail}</p>
          <div className="adminProfileMeta">
            <span className="adminProfileBadge">👑 Admin</span>
            <span className="adminProfileStatus">{adminAccount?.hasPin ? '🔒 Secured' : '⚠️ Not Secured'}</span>
          </div>
        </div>
      </div>

      <div className="adminAccountSummaryGrid">
        <article className="adminMiniCard">
          <strong>Current Gmail</strong>
          <span>{currentAdminEmail}</span>
        </article>
        <article className="adminMiniCard">
          <strong>Mobile no</strong>
          <span>{adminAccount?.phoneNumber || 'Not added yet'}</span>
        </article>
        <article className="adminMiniCard">
          <strong>PIN status</strong>
          <span>{adminAccount?.hasPin ? 'PIN is set' : 'PIN not set yet'}</span>
        </article>
        <article className="adminMiniCard">
          <strong>Last login</strong>
          <span>{adminAccount?.lastLoginAt ? fmtDate(adminAccount.lastLoginAt) : 'Not recorded yet'}</span>
        </article>
        <article className="adminMiniCard">
          <strong>Updated</strong>
          <span>{adminAccount?.updatedAt ? fmtDate(adminAccount.updatedAt) : 'Not recorded yet'}</span>
        </article>
      </div>

      <div className="adminAccountForms">
        <section className="adminActionSection adminAccountSection adminPersonalDetails">
          <div className="sectionAvatarHeader">
            <div className="sectionAvatar">👤</div>
            <div className="sectionAvatarText">
              <h4>Personal Details</h4>
              <p>Update your profile information</p>
            </div>
          </div>
          <div className="adminPersonalGreeting">
            <h3>Hello, {adminName}! 👋</h3>
            <p className="adminPersonalTitle">{adminProfession}</p>
          </div>
          
          <div className="adminPersonalInfo">
            <div className="infoItem infoItemMerged">
              <span className="infoLabel">Contact Information</span>
              <div className="adminContactMerged">
                <span className="infoValue">{currentAdminEmail}</span>
                <span className="adminContactDivider">•</span>
                <span className="infoValue">{adminPhoneNumber || 'Add mobile number'}</span>
              </div>
            </div>
            <div className="infoItem">
              <span className="infoLabel">Status</span>
              <span className="infoValue">{adminAccount?.hasPin ? '🔒 Secured' : '⚠️ Not Secured'}</span>
            </div>
          </div>

          <div className="adminDetailsEdits">
            <h4>Edit Personal Details</h4>
            <div className="adminInputGroup">
              <div className="adminInputField">
                <label className="inputLabel">Your Name</label>
                <input className="input" value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Your full name" />
              </div>
              <div className="adminInputField">
                <label className="inputLabel">Mobile Number</label>
                <input className="input" value={adminPhoneNumber} onChange={(event) => setAdminPhoneNumber(event.target.value)} placeholder="Your mobile number" />
              </div>
            </div>
            <div className="adminInputField">
              <label className="inputLabel">Profession/Title</label>
              <input className="input" value={adminProfession} onChange={(event) => setAdminProfession(event.target.value)} placeholder="Your profession/title" />
            </div>
            <button type="button" className="primaryBtn smallGhost" onClick={() => void saveAdminProfile()} disabled={accountSaving}>
              Save personal details
            </button>
          </div>
        </section>

        <section className="adminActionSection adminAccountSection">
          <div className="sectionAvatarHeader">
            <div className="sectionAvatar">🔒</div>
            <div className="sectionAvatarText">
              <h4>Security Settings</h4>
              <p>Manage your admin credentials and security preferences</p>
            </div>
          </div>

          {/* Change Gmail */}
          <div className="securitySection">
            <h4>📧 Change Gmail Address</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">New Gmail Address</label>
                <input
                  className="input securityInput"
                  type="email"
                  value={nextAdminEmail}
                  onChange={(event) => setNextAdminEmail(event.target.value)}
                  placeholder="newadmin@example.com"
                />
              </div>
              <div className="securityCard">
                <label className="inputLabel">Verification Code</label>
                <div className="otpInputGroup">
                  <input
                    className="input securityInput"
                    value={emailChangeCode}
                    onChange={(event) => setEmailChangeCode(event.target.value.slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="ghostBtn securityActionBtn"
                    onClick={() => void requestEmailChangeOtp()}
                    disabled={accountSaving || !nextAdminEmail.trim() || nextAdminEmail === (adminAccount?.email ?? admin.email)}
                  >
                    Send OTP
                  </button>
                </div>
              </div>
            </div>
            <div className="securityActions">
              <button
                type="button"
                className="primaryBtn securityActionBtn"
                onClick={() => void changeAdminEmail()}
                disabled={accountSaving || !nextAdminEmail.trim() || !emailChangeCode.trim() || nextAdminEmail === (adminAccount?.email ?? admin.email)}
              >
                {accountSaving ? 'Updating...' : 'Change Gmail'}
              </button>
            </div>
          </div>

          {/* Change Mobile */}
          <div className="securitySection">
            <h4>📱 Change Mobile Number</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">New Mobile Number</label>
                <input
                  className="input securityInput"
                  type="tel"
                  value={nextAdminPhoneNumber}
                  onChange={(event) => setNextAdminPhoneNumber(event.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="securityCard">
                <label className="inputLabel">Verification Code</label>
                <div className="otpInputGroup">
                  <input
                    className="input securityInput"
                    value={phoneChangeCode}
                    onChange={(event) => setPhoneChangeCode(event.target.value.slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="ghostBtn securityActionBtn"
                    onClick={() => void requestPhoneChangeOtp()}
                    disabled={accountSaving || !nextAdminPhoneNumber.trim() || nextAdminPhoneNumber === (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '')}
                  >
                    Send OTP
                  </button>
                </div>
              </div>
            </div>
            <div className="securityActions">
              <button
                type="button"
                className="primaryBtn securityActionBtn"
                onClick={() => void changeAdminPhone()}
                disabled={accountSaving || !nextAdminPhoneNumber.trim() || !phoneChangeCode.trim() || nextAdminPhoneNumber === (adminAccount?.phoneNumber ?? admin.phoneNumber ?? '')}
              >
                {accountSaving ? 'Updating...' : 'Change Mobile'}
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div className="securitySection">
            <h4>🔑 Change Password</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">Current Password</label>
                <input
                  className="input securityInput"
                  type="password"
                  value={passwordChangeOld}
                  onChange={(event) => setPasswordChangeOld(event.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="securityCard">
                <label className="inputLabel">New Password</label>
                <input
                  className="input securityInput"
                  type="password"
                  value={passwordChangeNew}
                  onChange={(event) => setPasswordChangeNew(event.target.value)}
                  placeholder="Enter new password (min 8 chars)"
                />
                {passwordChangeNew && (
                  <div className="passwordStrength">
                    <div className={`strengthBar ${getPasswordStrength(passwordChangeNew)}`}></div>
                    <span className="strengthText">{getPasswordStrengthText(passwordChangeNew)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="securityActions">
              <button
                type="button"
                className="primaryBtn securityActionBtn"
                onClick={() => void changeAdminPassword()}
                disabled={accountSaving || !passwordChangeOld.trim() || !passwordChangeNew.trim() || passwordChangeNew.length < 8}
              >
                {accountSaving ? 'Updating...' : 'Change Password'}
              </button>
              <button
                type="button"
                className="ghostBtn securityActionBtn danger"
                onClick={() => setShowForgotPassword(true)}
              >
                Forgot Password?
              </button>
            </div>
          </div>
        </section>

        <section className="adminActionSection adminAccountSection">
          <div className="sectionAvatarHeader">
            <div className="sectionAvatar">🔐</div>
            <div className="sectionAvatarText">
              <h4>Admin PIN</h4>
              <p>Alternative login method using a numeric PIN instead of password</p>
            </div>
          </div>

          <div className="securityGrid">
            <div className="securityCard">
              <label className="inputLabel">Current Password</label>
              <input
                className="input securityInput"
                type="password"
                value={pinPassword}
                onChange={(event) => setPinPassword(event.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="securityCard">
              <label className="inputLabel">{adminAccount?.hasPin ? 'New PIN' : 'Set PIN'}</label>
              <input
                className="input securityInput"
                type="password"
                inputMode="numeric"
                value={nextPin}
                onChange={(event) => setNextPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="4-8 digit PIN"
                maxLength={8}
              />
              {nextPin && nextPin.length < 4 && (
                <p className="miniText error">PIN must be at least 4 digits</p>
              )}
            </div>
          </div>

          <div className="securityActions">
            <button
              type="button"
              className="primaryBtn securityActionBtn"
              onClick={() => void saveAdminPin()}
              disabled={accountSaving || !pinPassword.trim() || nextPin.length < 4}
            >
              {accountSaving ? 'Updating...' : (adminAccount?.hasPin ? 'Update PIN' : 'Set PIN')}
            </button>
            {adminAccount?.hasPin && (
              <button
                type="button"
                className="ghostBtn securityActionBtn danger"
                onClick={() => void removeAdminPin()}
                disabled={accountSaving}
              >
                Remove PIN
              </button>
            )}
          </div>
        </section>

        <section className="adminActionSection adminAccountSection">
          <div className="sectionAvatarHeader">
            <div className="sectionAvatar">🔐</div>
            <div className="sectionAvatarText">
              <h4>App Lock & Biometric</h4>
              <p>Control admin session lock methods, PIN/password unlock and facial or fingerprint unlock.</p>
            </div>
          </div>

          <div className="securitySection">
            <h4>Admin app lock overview</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <strong>Status</strong>
                <p>{appLockEnabled ? 'App lock is enabled.' : 'App lock is not configured yet.'}</p>
                <div className="appLockStatusBadges">
                  {appLockMethods.length ? appLockMethods.map((method) => (
                    <span key={method} className="appLockStatusBadge">{method}</span>
                  )) : <span className="appLockStatusBadge inactive">None</span>}
                </div>
              </div>

              <div className="securityCard">
                <strong>Auto-lock</strong>
                <p>Automatically lock this admin session when the browser loses focus or when the page is hidden.</p>
                <button
                  type="button"
                  className="ghostBtn securityActionBtn"
                  onClick={() => toggleAutoLockOnHide()}
                >
                  {appLockConfig.autoLockOnHide ? 'Disable auto-lock' : 'Enable auto-lock'}
                </button>
              </div>
            </div>
          </div>

          <div className="securitySection">
            <h4>Set PIN</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">Admin PIN</label>
                <input
                  className="input securityInput"
                  type="password"
                  inputMode="numeric"
                  value={appLockPin}
                  onChange={(event) => setAppLockPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="4-8 digit PIN"
                />
                <div className="miniText">PIN unlock works instantly for the admin lock screen.</div>
              </div>
              <div className="securityCard">
                <div className="securityActions">
                  <button
                    type="button"
                    className="primaryBtn securityActionBtn"
                    onClick={() => void saveAppLockPin()}
                    disabled={appLockSaving || appLockPin.length < 4}
                  >
                    {appLockSaving ? 'Saving...' : appLockConfig.pinHash ? 'Update PIN' : 'Set PIN'}
                  </button>
                  {appLockConfig.pinHash ? (
                    <button
                      type="button"
                      className="ghostBtn securityActionBtn danger"
                      onClick={() => disableAppLockPin()}
                    >
                      Remove PIN
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="securitySection">
            <h4>Set unlock password</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">Password</label>
                <div className="composerInputRow">
                  <input
                    className="input securityInput"
                    type={showAppLockPassword ? 'text' : 'password'}
                    value={appLockPassword}
                    onChange={(event) => setAppLockPassword(event.target.value)}
                    placeholder="Secure app lock password"
                  />
                  <button
                    type="button"
                    className="ghostBtn appLockToggleBtn"
                    onClick={() => setShowAppLockPassword((current) => !current)}
                  >
                    {showAppLockPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="miniText">Passwords are hashed locally and never stored on the backend.</div>
              </div>
              <div className="securityCard">
                <div className="securityActions">
                  <button
                    type="button"
                    className="primaryBtn securityActionBtn"
                    onClick={() => void saveAppLockPassword()}
                    disabled={appLockSaving || appLockPassword.length < 8}
                  >
                    {appLockSaving ? 'Saving...' : appLockConfig.passwordHash ? 'Update password' : 'Set password'}
                  </button>
                  {appLockConfig.passwordHash ? (
                    <button
                      type="button"
                      className="ghostBtn securityActionBtn danger"
                      onClick={() => disableAppLockPassword()}
                    >
                      Remove password
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="securitySection">
            <h4>Biometric unlock</h4>
            <div className="securityGrid">
              <div className="securityCard">
                <strong>{biometricSupported ? 'Ready for biometric registration' : 'Biometric unavailable'}</strong>
                <p>
                  {biometricSupported
                    ? 'Register face or fingerprint unlock for the admin session when supported by your device/browser.'
                    : 'Your current browser does not support biometric unlock.'}
                </p>
                <div className="appLockStatusBadges">
                  <span className={`appLockStatusBadge ${appLockConfig.biometricEnabled ? 'active' : 'inactive'}`}>
                    {appLockConfig.biometricEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              <div className="securityCard">
                <div className="securityActions">
                  {biometricSupported ? (
                    <button
                      type="button"
                      className="primaryBtn securityActionBtn"
                      onClick={() => void enableBiometricLock()}
                      disabled={biometricRegistering || appLockConfig.biometricEnabled}
                    >
                      {biometricRegistering ? 'Registering...' : appLockConfig.biometricEnabled ? 'Biometric enabled' : 'Register biometric'}
                    </button>
                  ) : null}
                  {appLockConfig.biometricEnabled ? (
                    <button
                      type="button"
                      className="ghostBtn securityActionBtn danger"
                      onClick={() => disableBiometricLock()}
                    >
                      Disable biometric
                    </button>
                  ) : null}
                  {appLockConfig.biometricEnabled ? (
                    <button
                      type="button"
                      className="ghostBtn securityActionBtn"
                      onClick={() => void verifyBiometricScan()}
                      disabled={biometricRegistering}
                    >
                      Verify face scan
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="securityActions">
            <button type="button" className="primaryBtn securityActionBtn" onClick={() => lockApp()}>
              Lock admin screen now
            </button>
            <button type="button" className="ghostBtn securityActionBtn danger" onClick={() => clearAllAppLock()}>
              Clear all app lock settings
            </button>
          </div>
        </section>

        <section className="adminActionSection appPasswordSection">
          <div className="appPasswordHeader">
            <div className="appPasswordIcon">🔑</div>
            <div className="appPasswordInfo">
              <h3>App Passwords</h3>
              <p>Create separate passwords for third-party applications and integrations</p>
            </div>
          </div>

          {appPasswords.length > 0 && (
            <>
              <h4 className="appPasswordActiveHeader">Active App Passwords</h4>
              <div className="appPasswordList">
                {appPasswords.map((appPass, index) => (
                  <div key={appPass.id} className="appPasswordItem" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="appPasswordItemHeader">
                      <div className="appPasswordItemName">
                        <div className="appPasswordItemNameWrapper">
                          <span className="appPasswordItemIconContainer">
                            🔐
                          </span>
                          <div className="appPasswordItemNameText">
                            <div>{appPass.name}</div>
                            <div className="appPasswordItemNameTextSub">
                              {appPass.lastUsedAt ? `Last used: ${fmtDate(appPass.lastUsedAt)}` : 'Never used'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <span className="appPasswordItemBadge">Active</span>
                    </div>
                    <div className="appPasswordItemInfo">
                      Created: {fmtDate(appPass.createdAt)}
                    </div>
                    <div className="appPasswordItemActions">
                      <button
                        type="button"
                        className="deleteBtn"
                        onClick={() => void deleteAppPassword(appPass.id)}
                        disabled={appPasswordLoading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {appPasswords.length === 0 && !showAppPasswordForm && (
            <div className="appPasswordEmptyState">
              <p>No app passwords created yet.</p>
              <p>Create one to use with third-party applications.</p>
            </div>
          )}

          {showAppPasswordForm && (
            <div className="appPasswordForm">
              <div className="appPasswordFormGrid">
                <div className="appPasswordFormField">
                  <label>App or Service Name</label>
                  <input
                    className="input"
                    value={newAppPasswordName}
                    onChange={(event) => setNewAppPasswordName(event.target.value)}
                    placeholder="e.g., Mobile App, Desktop Client, API Integration"
                  />
                </div>
              </div>
              <div className="appPasswordFormActions">
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={() => void createAppPassword()}
                  disabled={appPasswordLoading || !newAppPasswordName.trim()}
                >
                  {appPasswordLoading ? 'Creating...' : 'Create App Password'}
                </button>
                <button
                  type="button"
                  className="ghostBtn"
                  onClick={() => {
                    setShowAppPasswordForm(false);
                    setNewAppPasswordName('');
                  }}
                  disabled={appPasswordLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {generatedAppPassword && (
            <div className="appPasswordGeneratedBox">
              <p className="appPasswordGeneratedTitle">
                ✅ App Password Created Successfully
              </p>
              <p className="appPasswordGeneratedSubtitle">
                Store this password safely. You won't be able to see it again!
              </p>
              <div className="appPasswordGeneratedCode">
                {generatedAppPassword.password}
              </div>
              <button
                type="button"
                className="ghostBtn"
                onClick={() => {
                  setGeneratedAppPassword(null);
                  setShowAppPasswordForm(false);
                }}
              >
                Done
              </button>
            </div>
          )}

          {!showAppPasswordForm && !generatedAppPassword && (
            <button
              type="button"
              className="primaryBtn btnMarginTop"
              onClick={() => setShowAppPasswordForm(true)}
            >
              + Create New App Password
            </button>
          )}
        </section>

        <section className="adminActionSection adminAccountSection">
          <div className="sectionAvatarHeader">
            <div className="sectionAvatar">🛡️</div>
            <div className="sectionAvatarText">
              <h4>Security Status</h4>
              <p>Current security configuration and recommendations</p>
            </div>
          </div>

          <div className="securityStatusGrid">
            <div className="statusItem">
              <div className="statusIcon">📧</div>
              <div className="statusContent">
                <strong>Email Verification</strong>
                <p>Primary authentication method</p>
                <span className="statusBadge active">Active</span>
              </div>
            </div>

            <div className="statusItem">
              <div className="statusIcon">🔢</div>
              <div className="statusContent">
                <strong>PIN Authentication</strong>
                <p>Alternative login method</p>
                <span className={`statusBadge ${adminAccount?.hasPin ? 'active' : 'inactive'}`}>
                  {adminAccount?.hasPin ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="statusItem">
              <div className="statusIcon">📱</div>
              <div className="statusContent">
                <strong>Mobile Backup</strong>
                <p>Secondary contact method</p>
                <span className={`statusBadge ${adminAccount?.phoneNumber ? 'active' : 'inactive'}`}>
                  {adminAccount?.phoneNumber ? 'Set' : 'Not Set'}
                </span>
              </div>
            </div>

            <div className="statusItem">
              <div className="statusIcon">⏰</div>
              <div className="statusContent">
                <strong>Last Updated</strong>
                <p>Security settings last changed</p>
                <span className="statusBadge info">
                  {adminAccount?.updatedAt ? new Date(adminAccount.updatedAt).toLocaleDateString() : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </article>
  );

  const renderSelectedUserActivityGraph = () => {
    if (!selectedUser) return null;

    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - index));
      return {
        key: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        count: 0,
      };
    });

    const counts = new Map<string, number>();
    const addEntry = (dateString: string) => {
      counts.set(dateString, (counts.get(dateString) ?? 0) + 1);
    };

    selectedUser.auditEvents.forEach((event) => addEntry(event.createdAt.slice(0, 10)));
    selectedUser.reports.forEach((report) => addEntry(report.createdAt.slice(0, 10)));
    selectedUser.notices.forEach((notice) => addEntry(notice.createdAt.slice(0, 10)));

    const buckets = days.map((day) => ({ ...day, count: counts.get(day.key) ?? 0 }));
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

    return (
      <section className="adminPanelCard adminGraphCard">
        <div className="sectionTop">
          <h3>Recent activity</h3>
          <span className="miniText">Activity over the last 7 days</span>
        </div>
        <div className="userActivityGraph">
          <div className="userActivityGraphBars">
            {buckets.map((bucket) => {
              const heightLevel = Math.min(Math.round((bucket.count / maxCount) * 10), 10);
              return (
                <div key={bucket.key} className="userActivityBar">
                  <div className={`userActivityBarFill level-${heightLevel}`}>
                    <span>{bucket.count}</span>
                  </div>
                  <div className="userActivityBarLabel">{bucket.label}</div>
                </div>
              );
            })}
          </div>
          {!selectedUser.auditEvents.length && !selectedUser.reports.length && !selectedUser.notices.length ? (
            <div className="miniText">No activity recorded for this user in the last week.</div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderAreaContent = () => {
    switch (activeArea) {
      case 'dashboard':
        return renderDashboard();
      case 'system':
        return renderSystemArea();
      case 'users':
        return renderUsersArea();
      case 'reports':
        return renderReportsArea();
      case 'analytics':
        return renderAnalyticsArea();
      case 'logs':
        return renderLogsArea();
      case 'account':
        return renderAccountArea();
      default:
        return renderDashboard();
    }
  };

  const renderDashboard = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">Dashboard Overview</span>
          <h2>Welcome to HelloToo Admin Control Center</h2>
          <p>Monitor your platform, manage users, and configure system settings from this centralized dashboard.</p>
        </div>
        <div className="adminAreaHeroStats">
          <article className="adminMiniCard">
            <strong>{dashboard?.stats.totalUsers ?? 0}</strong>
            <span>Total Users</span>
          </article>
          <article className="adminMiniCard">
            <strong>{dashboard?.stats.openReports ?? 0}</strong>
            <span>Pending Reports</span>
          </article>
        </div>
      </section>

      <section className="adminDashboardGrid animate-fade-in-up">
        <article className="adminDashboardCard" onClick={() => setActiveArea('users')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.75 1.75 0 0 0 18.06 7H15.9c-.38 0-.72.22-.89.55L14.5 9H14v9c0 1.1.9 2 2 2h6v-2H16v-1h4c.55 0 1-.45 1-1v-3h-6v-2h6c.55 0 1-.45 1-1v-2c0-.55-.45-1-1-1h-4.17l-.59-.59c-.25-.25-.64-.41-1.06-.41H12V4h2.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5H12V1H8v1H4.5c-.28 0-.5.22-.5.5s.22.5.5.5H8v2H4.5c-.28 0-.5.22-.5.5s.22.5.5.5H8v2.5c0 .42.16.81.41 1.06l.59.59H10c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1H6v2h6c.55 0 1 .45 1 1v3c0 .55-.45 1-1 1H8v1h8z" fill="currentColor"/>
            </svg>
          </div>
          <h3>User Management</h3>
          <p>Search, moderate, and manage user accounts</p>
        </article>

        <article className="adminDashboardCard" onClick={() => setActiveArea('reports')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" fill="currentColor"/>
            </svg>
          </div>
          <h3>Reports & Moderation</h3>
          <p>Review user reports and take action</p>
        </article>

        <article className="adminDashboardCard" onClick={() => setActiveArea('analytics')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" fill="currentColor"/>
            </svg>
          </div>
          <h3>Analytics & Insights</h3>
          <p>View platform statistics and trends</p>
        </article>

        <article className="adminDashboardCard" onClick={() => setActiveArea('logs')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 17V7c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1zm6 0V7c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1zm6 0V7c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1z" fill="currentColor"/>
            </svg>
          </div>
          <h3>Activity Logs</h3>
          <p>Monitor system events and user activities</p>
        </article>

        <article className="adminDashboardCard" onClick={() => setActiveArea('system')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
            </svg>
          </div>
          <h3>System Settings</h3>
          <p>Configure admin credentials and security</p>
        </article>

        <article className="adminDashboardCard" onClick={() => setActiveArea('account')}>
          <div className="adminCardIcon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H19C20.11 23 21 22.11 21 21V9ZM19 9H14V4H19V9Z" fill="currentColor"/>
            </svg>
          </div>
          <h3>Account Settings</h3>
          <p>Update your admin profile and preferences</p>
        </article>
      </section>

      <section className="adminDashboardActions animate-slide-in-left">
        <button type="button" className="primaryBtn" onClick={() => setActiveArea('users')}>
          Manage users
        </button>
        <button type="button" className="ghostBtn" onClick={() => setActiveArea('reports')}>
          Review reports
        </button>
        <button type="button" className="ghostBtn" onClick={() => setActiveArea('analytics')}>
          View analytics
        </button>
      </section>

      <section className="adminSummaryGrid animate-fade-in-up">
        {[
          { status: 'open', title: 'Open reports' },
          { status: 'reviewed', title: 'Reviewed' },
          { status: 'actioned', title: 'Actioned' },
          { status: 'dismissed', title: 'Dismissed' },
        ].map((item) => (
          <article key={item.status} className="adminStatCard">
            <strong>{reportStatusCounts[item.status] ?? 0}</strong>
            <span>{item.title}</span>
          </article>
        ))}
      </section>

      <section className="adminQuickStats animate-slide-in-left">
        <h3>Quick Overview</h3>
        <div className="adminStatsGrid">
          <article className="adminStatCard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H19C20.11 23 21 22.11 21 21V9ZM19 9H14V4H19V9ZM12 11C13.66 11 15 12.34 15 14C15 15.66 13.66 17 12 17C10.34 17 9 15.66 9 14C9 12.34 10.34 11 12 11ZM7 19V18C7 15.79 9.79 14 13 14C13.73 14 14.41 14.13 15 14.35V19H7Z" fill="currentColor"/>
              </svg>
              <strong>{dashboard?.stats.totalUsers ?? 0}</strong>
            </div>
            <span>Total users</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min((dashboard?.stats.totalUsers ?? 0) / 100 * 100, 100)}%` }}></div>
            </div>
          </article>
          <article className="adminStatCard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3.09 8.26L3 21H21V8.25L12 2ZM12 4.53L18.09 9H5.91L12 4.53ZM5 19V11H19V19H5Z" fill="currentColor"/>
              </svg>
              <strong>{dashboard?.stats.openReports ?? 0}</strong>
            </div>
            <span>Open reports</span>
          </article>
          <article className="adminStatCard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
              </svg>
              <strong>{dashboard?.stats.blockedUsers ?? 0}</strong>
            </div>
            <span>Blocked users</span>
          </article>
          <article className="adminStatCard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
              </svg>
              <strong>{dashboard?.stats.suspendedUsers ?? 0}</strong>
            </div>
            <span>Suspended users</span>
          </article>
          <article className="adminStatCard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM8 9H16V19H8V9ZM15.5 4L14.5 3H9.5L8.5 4H5V6H19V4H15.5Z" fill="currentColor"/>
              </svg>
              <strong>{dashboard?.stats.deletedUsers ?? 0}</strong>
            </div>
            <span>Deleted users</span>
          </article>
        </div>
      </section>
    </>
  );

  const renderSystemLockSections = () => (
    <section className="adminSystemSecuritySplit animate-fade-in-up">
      <article className="adminPanelCard adminSystemSecurityCard">
        <div className="sectionTop">
          <div>
            <span className="heroEyebrow">App lock system</span>
            <h3>Admin app lock</h3>
          </div>
          <span className={`appLockStatusBadge ${appLockEnabled ? 'active' : 'inactive'}`}>
            {appLockEnabled ? 'Enabled' : 'Not set'}
          </span>
        </div>
        <p className="miniText">Protect the already-open admin session with a local PIN or password lock.</p>
        <div className="appLockStatusBadges">
          {appLockMethods.length ? appLockMethods.map((method) => (
            <span key={method} className="appLockStatusBadge">{method}</span>
          )) : <span className="appLockStatusBadge inactive">No lock method</span>}
        </div>
        <div className="systemLockFormGrid">
          <label className="adminInputField">
            <span className="inputLabel">Lock PIN</span>
            <input
              className="input securityInput"
              type="password"
              inputMode="numeric"
              value={appLockPin}
              onChange={(event) => setAppLockPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
              placeholder="4-8 digit PIN"
            />
          </label>
          <div className="securityActions">
            <button type="button" className="primaryBtn securityActionBtn" onClick={() => void saveAppLockPin()} disabled={appLockSaving || appLockPin.length < 4}>
              {appLockSaving ? 'Saving...' : appLockConfig.pinHash ? 'Update PIN' : 'Set PIN'}
            </button>
            {appLockConfig.pinHash ? <button type="button" className="ghostBtn securityActionBtn danger" onClick={() => disableAppLockPin()}>Remove PIN</button> : null}
          </div>
        </div>
        <div className="systemLockFormGrid">
          <label className="adminInputField">
            <span className="inputLabel">Lock password</span>
            <div className="composerInputRow">
              <input
                className="input securityInput"
                type={showAppLockPassword ? 'text' : 'password'}
                value={appLockPassword}
                onChange={(event) => setAppLockPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
              <button type="button" className="ghostBtn appLockToggleBtn" onClick={() => setShowAppLockPassword((current) => !current)}>
                {showAppLockPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <div className="securityActions">
            <button type="button" className="primaryBtn securityActionBtn" onClick={() => void saveAppLockPassword()} disabled={appLockSaving || appLockPassword.length < 8}>
              {appLockSaving ? 'Saving...' : appLockConfig.passwordHash ? 'Update password' : 'Set password'}
            </button>
            {appLockConfig.passwordHash ? <button type="button" className="ghostBtn securityActionBtn danger" onClick={() => disableAppLockPassword()}>Remove password</button> : null}
          </div>
        </div>
        <div className="securityActions systemLockFooterActions">
          <button type="button" className="ghostBtn securityActionBtn" onClick={() => toggleAutoLockOnHide()}>
            {appLockConfig.autoLockOnHide ? 'Disable auto-lock' : 'Enable auto-lock'}
          </button>
          <button type="button" className="primaryBtn securityActionBtn" onClick={() => lockApp()}>
            Lock now
          </button>
          <button type="button" className="ghostBtn securityActionBtn danger" onClick={() => clearAllAppLock()}>
            Clear app lock
          </button>
        </div>
      </article>

      <article className="adminPanelCard adminSystemSecurityCard adminBiometricSystemCard">
        <div className="sectionTop">
          <div>
            <span className="heroEyebrow">Biometric admin</span>
            <h3>Face scan verification</h3>
            <p className="adminInfinitySecurity">Security by INFINITY</p>
          </div>
          <span className={`appLockStatusBadge ${appLockConfig.biometricEnabled ? 'active' : 'inactive'}`}>
            {appLockConfig.biometricEnabled ? 'Registered' : 'Not registered'}
          </span>
        </div>
        <div className="adminFaceScanPreview">
          <div className="adminFaceScanAvatar">
            <span>{(adminName || admin.email || 'A').slice(0, 1).toUpperCase()}</span>
          </div>
          <div>
            <strong>{biometricSupported ? 'Add the system admin face/device scan' : 'Biometric unavailable'}</strong>
            <p>
              {biometricSupported
                ? 'Register once here. After that, every admin login requires a successful face/device biometric scan before password/PIN login can continue.'
                : 'This browser/device does not expose WebAuthn biometric verification.'}
            </p>
          </div>
        </div>
        <div className="securityActions">
          {biometricSupported ? (
            <button
              type="button"
              className="primaryBtn securityActionBtn"
              onClick={() => void enableBiometricLock()}
              disabled={biometricRegistering || appLockConfig.biometricEnabled}
            >
              {biometricRegistering ? 'Scanning...' : appLockConfig.biometricEnabled ? 'Face scan saved' : 'Add admin face scan'}
            </button>
          ) : null}
          {appLockConfig.biometricEnabled ? (
            <button type="button" className="ghostBtn securityActionBtn danger" onClick={() => disableBiometricLock()}>
              Remove face scan
            </button>
          ) : null}
          {appLockConfig.biometricEnabled ? (
            <button
              type="button"
              className="ghostBtn securityActionBtn"
              onClick={() => void verifyBiometricScan()}
              disabled={biometricRegistering}
            >
              Verify face scan
            </button>
          ) : null}
        </div>
      </article>
    </section>
  );

  const renderSystemArea = () => (
    <>
      <section className="adminAreaHero adminSystemHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">System settings & monitoring</span>
          <h2>Platform Control Center</h2>
          <p>Monitor system health, manage security settings, and oversee platform operations from one central dashboard.</p>
        </div>
        <div className="adminAreaHeroStats">
          <article className="adminMiniCard">
            <strong>System Status</strong>
            <span>🟢 All Systems Operational</span>
          </article>
          <article className="adminMiniCard">
            <strong>Security Level</strong>
            <span>🔒 {adminAccount?.hasPin ? 'High Security' : 'Standard'}</span>
          </article>
        </div>
      </section>

      <section className="systemStatusGrid animate-fade-in-up">
        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">👥</div>
          <div className="systemStatusCardTitle">Active Users</div>
          <div className="systemStatusCardValue">{dashboard?.stats.totalUsers ?? 0}</div>
          <div className="systemStatusCardDetail">
            <span className="systemStatusIndicator active"></span>
            All systems online
          </div>
        </article>

        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">🚨</div>
          <div className="systemStatusCardTitle">Open Reports</div>
          <div className="systemStatusCardValue">{dashboard?.stats.openReports ?? 0}</div>
          <div className="systemStatusCardDetail">
            <span className={`systemStatusIndicator ${(dashboard?.stats.openReports ?? 0) > 0 ? 'warning' : 'active'}`}></span>
            {(dashboard?.stats.openReports ?? 0) > 0 ? 'Action required' : 'All clear'}
          </div>
        </article>

        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">🚫</div>
          <div className="systemStatusCardTitle">Blocked Users</div>
          <div className="systemStatusCardValue">{dashboard?.stats.blockedUsers ?? 0}</div>
          <div className="systemStatusCardDetail">
            <span className="systemStatusIndicator inactive"></span>
            Active restrictions
          </div>
        </article>

        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">⏸️</div>
          <div className="systemStatusCardTitle">Suspended Users</div>
          <div className="systemStatusCardValue">{dashboard?.stats.suspendedUsers ?? 0}</div>
          <div className="systemStatusCardDetail">
            <span className={`systemStatusIndicator ${(dashboard?.stats.suspendedUsers ?? 0) > 0 ? 'warning' : 'active'}`}></span>
            {(dashboard?.stats.suspendedUsers ?? 0) > 0 ? 'Temporary suspensions' : 'None'}
          </div>
        </article>

        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">🗑️</div>
          <div className="systemStatusCardTitle">Deleted Users</div>
          <div className="systemStatusCardValue">{dashboard?.stats.deletedUsers ?? 0}</div>
          <div className="systemStatusCardDetail">
            <span className="systemStatusIndicator inactive"></span>
            Permanent deletions
          </div>
        </article>

        <article className="systemStatusCard">
          <div className="systemStatusCardIcon">🔐</div>
          <div className="systemStatusCardTitle">Admin Security</div>
          <div className="systemStatusCardValue">{adminAccount?.hasPin ? '✓' : '!'}</div>
          <div className="systemStatusCardDetail">
            <span className={`systemStatusIndicator ${adminAccount?.hasPin ? 'active' : 'warning'}`}></span>
            {adminAccount?.hasPin ? 'PIN Enabled' : 'Enable PIN'}
          </div>
        </article>
      </section>

      <section className="systemSecurityOverview animate-fade-in-up">
        <h3 className="systemSecurityTitle">
          🛡️ Security Overview
        </h3>
        <div className="systemSecurityGrid">
          <div className="systemSecurityItem">
            <div className="systemSecurityItemIcon">📧</div>
            <div className="systemSecurityItemContent">
              <h4>Gmail Account</h4>
              <p>{currentAdminEmail}</p>
            </div>
          </div>

          <div className="systemSecurityItem">
            <div className="systemSecurityItemIcon">📱</div>
            <div className="systemSecurityItemContent">
              <h4>Mobile Number</h4>
              <p>{adminAccount?.phoneNumber || 'Not set'}</p>
            </div>
          </div>

          <div className="systemSecurityItem">
            <div className="systemSecurityItemIcon">🔑</div>
            <div className="systemSecurityItemContent">
              <h4>PIN Protection</h4>
              <p>{adminAccount?.hasPin ? 'Enabled ✓' : 'Disabled !'}</p>
            </div>
          </div>

          <div className="systemSecurityItem">
            <div className="systemSecurityItemIcon">⏰</div>
            <div className="systemSecurityItemContent">
              <h4>Last Updated</h4>
              <p>{adminAccount?.updatedAt ? fmtDate(adminAccount.updatedAt) : 'Unknown'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="systemMetricsDashboard animate-fade-in-up">
        <h3 style={{ margin: '0 0 24px 0', color: 'var(--text)', animation: 'slideInFromLeft 0.6s ease-out' }}>
          📊 Platform Metrics
        </h3>
        <div className="systemMetricsGrid">
          <div className="systemMetricCard">
            <div className="systemMetricValue">{dashboard?.stats.totalUsers ?? 0}</div>
            <div className="systemMetricLabel">Total Users</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: '75%' }}></div>
            </div>
          </div>

          <div className="systemMetricCard">
            <div className="systemMetricValue" style={{ color: '#ffc107' }}>{dashboard?.stats.blockedUsers ?? 0}</div>
            <div className="systemMetricLabel">Blocked</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: '35%', background: 'linear-gradient(90deg, #ffc107, rgba(255, 193, 7, 0.6))' }}></div>
            </div>
          </div>

          <div className="systemMetricCard">
            <div className="systemMetricValue" style={{ color: '#69cdff' }}>{dashboard?.stats.suspendedUsers ?? 0}</div>
            <div className="systemMetricLabel">Suspended</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: '28%', background: 'linear-gradient(90deg, #69cdff, rgba(105, 205, 255, 0.6))' }}></div>
            </div>
          </div>

          <div className="systemMetricCard">
            <div className="systemMetricValue" style={{ color: '#ff4650' }}>{dashboard?.stats.deletedUsers ?? 0}</div>
            <div className="systemMetricLabel">Deleted</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: '15%', background: 'linear-gradient(90deg, #ff4650, rgba(255, 70, 80, 0.6))' }}></div>
            </div>
          </div>

          <div className="systemMetricCard">
            <div className="systemMetricValue" style={{ color: '#ffc107' }}>{dashboard?.stats.openReports ?? 0}</div>
            <div className="systemMetricLabel">Open Reports</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: `${Math.min((dashboard?.stats.openReports ?? 0) * 10, 100)}%`, background: 'linear-gradient(90deg, #ffc107, rgba(255, 193, 7, 0.6))' }}></div>
            </div>
          </div>

          <div className="systemMetricCard">
            <div className="systemMetricValue" style={{ color: 'var(--brand)' }}>98%</div>
            <div className="systemMetricLabel">System Health</div>
            <div className="systemMetricBar">
              <div className="systemMetricBarFill" style={{ width: '98%' }}></div>
            </div>
          </div>
        </div>
      </section>

      {renderSystemLockSections()}

      <section className="systemActionsGrid animate-fade-in-up">
        <article className="systemActionCard" onClick={() => setActiveArea('users')}>
          <span className="systemActionIcon">👥</span>
          <span className="systemActionLabel">Manage Users</span>
        </article>

        <article className="systemActionCard" onClick={() => setActiveArea('reports')}>
          <span className="systemActionIcon">🚨</span>
          <span className="systemActionLabel">Review Reports</span>
        </article>

        <article className="systemActionCard" onClick={() => setActiveArea('analytics')}>
          <span className="systemActionIcon">📈</span>
          <span className="systemActionLabel">View Analytics</span>
        </article>

        <article className="systemActionCard" onClick={() => setActiveArea('logs')}>
          <span className="systemActionIcon">📝</span>
          <span className="systemActionLabel">View Logs</span>
        </article>

        <article className="systemActionCard" onClick={() => setActiveArea('account')}>
          <span className="systemActionIcon">🔒</span>
          <span className="systemActionLabel">Security Settings</span>
        </article>

        <article className="systemActionCard" onClick={() => setActiveArea('dashboard')}>
          <span className="systemActionIcon">📊</span>
          <span className="systemActionLabel">Back to Dashboard</span>
        </article>
      </section>

      <section className="adminSystemGrid animate-slide-in-left">
        <article className="adminListCard adminScrollCard">
          <div className="sectionTop">
            <h3>Latest Reports</h3>
            <button type="button" className="ghostBtn smallGhost" onClick={() => setActiveArea('users')}>
              View all
            </button>
          </div>
          <div className="adminScrollBody">
            <div className="adminStackList">
              {dashboard?.reports.slice(0, 5).map((report) => (
                <article key={report.id} className="adminTimelineCard">
                  <strong>{report.targetUser.name || report.targetUser.username}</strong>
                  <span>{report.reason}{report.detail ? ` - ${report.detail}` : ''}</span>
                  <span>{fmtDate(report.createdAt)} - {report.status}</span>
                </article>
              ))}
              {!dashboard?.reports.length ? <div className="compactEmpty requestEmptyCard">No reports yet.</div> : null}
            </div>
          </div>
        </article>

        <article className="adminListCard adminScrollCard">
          <div className="sectionTop">
            <h3>Recent Activity</h3>
            <button type="button" className="ghostBtn smallGhost" onClick={() => setActiveArea('logs')}>
              View logs
            </button>
          </div>
          <div className="adminScrollBody">
            <div className="adminStackList">
              {dashboard?.events.slice(0, 5).map((event) => (
                <article key={event.id} className="adminTimelineCard">
                  <strong>{event.user.name || event.user.username}</strong>
                  <span>{event.kind} - {event.detail}</span>
                  <span>{fmtDate(event.createdAt)} - {event.actorType}</span>
                </article>
              ))}
              {!dashboard?.events.length ? <div className="compactEmpty requestEmptyCard">No recent events.</div> : null}
            </div>
          </div>
        </article>
      </section>
    </>
  );

  const renderUsersArea = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">User management</span>
          <h2>Moderate users in a separate workspace</h2>
          <p>Search users, review their history, send notices, and take moderation actions without mixing those tools with the system settings.</p>
        </div>
        <div className="adminAreaHeroStats">
          <article className="adminMiniCard">
            <strong>{filteredUsers.length}</strong>
            <span>Searchable Users</span>
          </article>
          <article className="adminMiniCard">
            <strong>{dashboard?.stats.openReports ?? 0}</strong>
            <span>Pending Reports</span>
          </article>
        </div>
      </section>

      <div className="adminWorkspace">
        <aside className="adminWorkspaceSidebar">
          <div className="adminPanelCard adminScrollCard">
            <div className="sectionTop">
              <h2>Users</h2>
            </div>
            <input
              className="input adminSearchInput"
              placeholder="Search user by name, email or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="adminUserList adminScrollBody">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={selectedUserId === user.id ? 'adminUserRow adminUserRowActive' : 'adminUserRow'}
                  onClick={() => void loadUserDetail(user.id)}
                >
                  <div className="rowStart">
                    <Avatar name={user.name || user.username} avatarUrl={user.avatarUrl} size={42} />
                    <div className="cardText">
                      <strong>{user.name || user.username}</strong>
                      <span>{user.email || user.phoneNumber || `@${user.username}`}</span>
                      <span>{moderationLabel(user)}{user.lastLoginAt ? ` - last login ${fmtDate(user.lastLoginAt)}` : ''}</span>
                    </div>
                  </div>
                </button>
              ))}
              {!filteredUsers.length ? <div className="compactEmpty requestEmptyCard">No users match that search.</div> : null}
            </div>
          </div>
        </aside>

        <main className="adminWorkspaceMain">
          <div className="adminPanelCard adminScrollCard">
            <div className="sectionTop">
              <h2>User Detail</h2>
              {detailLoading ? <span className="miniText">Loading...</span> : null}
            </div>
            <div className="adminScrollBody">
              {selectedUser ? (
                <>
                  <div className="adminUserHero">
                    <Avatar name={selectedUser.user.name || selectedUser.user.username} avatarUrl={selectedUser.user.avatarUrl} size={64} />
                    <div className="cardText">
                      <strong>{selectedUser.user.name || selectedUser.user.username}</strong>
                      <span>{selectedUser.user.email || selectedUser.user.phoneNumber || `@${selectedUser.user.username}`}</span>
                      <span>{selectedUser.user.statusText || 'No status text set.'}</span>
                    </div>
                  </div>

                  {renderSelectedUserActivityGraph()}

                  <div className="adminSummaryGrid">
                    <article className="adminMiniCard">
                      <strong>Joined</strong>
                      <span>{fmtDate(selectedUser.user.createdAt)}</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>Last login</strong>
                      <span>{selectedUser.user.lastLoginAt ? fmtDate(selectedUser.user.lastLoginAt) : 'Never recorded'}</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>Updated</strong>
                      <span>{fmtDate(selectedUser.user.updatedAt)}</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>Status</strong>
                      <span>{moderationLabel(selectedUser.user)}</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>{selectedUser.auditEvents.length}</strong>
                      <span>Audit events</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>{selectedUser.reports.length}</strong>
                      <span>Reports</span>
                    </article>
                    <article className="adminMiniCard">
                      <strong>{selectedUser.notices.length}</strong>
                      <span>Notices</span>
                    </article>
                  </div>

                  <div className="adminActionSection">
                    <h3>Moderation Actions</h3>
                    <textarea
                      className="input adminTextarea"
                      placeholder="Optional admin note for this action"
                      value={actionNote}
                      onChange={(event) => setActionNote(event.target.value)}
                    />
                    <div className="adminActionRow">
                      <button type="button" className="ghostBtn smallGhost" onClick={() => void runAdminAction('block')}>
                        Block
                      </button>
                      <button type="button" className="ghostBtn smallGhost" onClick={() => void runAdminAction('unblock')}>
                        Unblock
                      </button>
                      <div className="adminSuspendGroup">
                        <input
                          className="input adminDaysInput"
                          inputMode="numeric"
                          value={suspendDays}
                          onChange={(event) => setSuspendDays(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                          placeholder="Days"
                        />
                        <button type="button" className="ghostBtn smallGhost" onClick={() => void runAdminAction('suspend')}>
                          Suspend
                        </button>
                      </div>
                      <button type="button" className="ghostBtn smallGhost" onClick={() => void runAdminAction('restore')}>
                        Restore
                      </button>
                      <button type="button" className="ghostBtn smallGhost dangerGhost" onClick={() => void runAdminAction('delete-permanently')}>
                        Permanent delete
                      </button>
                    </div>
                  </div>

                  <div className="adminActionSection">
                    <h3>Send Notice</h3>
                    <input
                      className="input"
                      placeholder="Notice title"
                      value={noticeTitle}
                      onChange={(event) => setNoticeTitle(event.target.value)}
                    />
                    <textarea
                      className="input adminTextarea"
                      placeholder="Message for this user"
                      value={noticeMessage}
                      onChange={(event) => setNoticeMessage(event.target.value)}
                    />
                    <button type="button" className="primaryBtn smallGhost" onClick={() => void submitNotice()}>
                      Send notice
                    </button>
                  </div>

                  <div className="adminDetailGrid">
                    <section className="adminListCard">
                      <div className="sectionTop">
                        <h3>Login & Update History</h3>
                      </div>
                      <div className="adminStackList">
                        {selectedUser.auditEvents.map((event) => (
                          <article key={event.id} className="adminTimelineCard">
                            <strong>{event.kind}</strong>
                            <span>{event.detail}</span>
                            <span>{fmtDate(event.createdAt)} - {event.actorType}</span>
                          </article>
                        ))}
                        {!selectedUser.auditEvents.length ? <div className="compactEmpty requestEmptyCard">No audit history yet.</div> : null}
                      </div>
                    </section>

                    <section className="adminListCard">
                      <div className="sectionTop">
                        <h3>Reports Against User</h3>
                      </div>
                      <textarea
                        className="input adminTextarea"
                        placeholder="Optional note while reviewing reports"
                        value={reportNote}
                        onChange={(event) => setReportNote(event.target.value)}
                      />
                      <div className="adminStackList">
                        {selectedUser.reports.map((report) => (
                          <article key={report.id} className="adminTimelineCard">
                            <strong>{report.reason}</strong>
                            <span>{report.detail || 'No extra detail from reporter.'}</span>
                            <span>{fmtDate(report.createdAt)} - {report.status}</span>
                            <span>{report.reporterUser ? `Reported by ${report.reporterUser.name}` : 'Reporter unavailable'}</span>
                            <div className="contactActions">
                              <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'reviewed')}>
                                Review
                              </button>
                              <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'actioned')}>
                                Actioned
                              </button>
                              <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'dismissed')}>
                                Dismiss
                              </button>
                            </div>
                          </article>
                        ))}
                        {!selectedUser.reports.length ? <div className="compactEmpty requestEmptyCard">No reports for this user.</div> : null}
                      </div>
                    </section>

                    <section className="adminListCard">
                      <div className="sectionTop">
                        <h3>Notice History</h3>
                      </div>
                      <div className="adminStackList">
                        {selectedUser.notices.map((notice) => (
                          <article key={notice.id} className="adminTimelineCard">
                            <strong>{notice.title}</strong>
                            <span>{notice.message}</span>
                            <span>{fmtDate(notice.createdAt)} - sent by {notice.sentBy}</span>
                          </article>
                        ))}
                        {!selectedUser.notices.length ? <div className="compactEmpty requestEmptyCard">No notices sent yet.</div> : null}
                      </div>
                    </section>
                  </div>
                </>
              ) : (
                <div className="compactEmpty requestEmptyCard">Pick a user to open their admin detail view.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );

  const renderReportsArea = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">Reports & Moderation</span>
          <h2>Review and resolve user reports</h2>
          <p>Handle user-submitted reports, take moderation actions, and maintain platform safety.</p>
        </div>
      </section>

      <section className="adminSystemGrid animate-slide-in-left">
        <article className="adminListCard adminScrollCard">
          <div className="sectionTop">
            <h3>Latest Reports</h3>
          </div>
          <div className="adminScrollBody">
            <div className="adminStackList">
              {dashboard?.reports.map((report) => (
                <article key={report.id} className="adminTimelineCard">
                  <strong>{report.targetUser.name || report.targetUser.username}</strong>
                  <span>{report.reason}{report.detail ? ` - ${report.detail}` : ''}</span>
                  <span>{fmtDate(report.createdAt)} · {report.status}</span>
                  <span>{report.reporterUser ? `Reported by ${report.reporterUser.name}` : 'Reporter unavailable'}</span>
                  <div className="contactActions">
                    <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'reviewed')}>
                      Review
                    </button>
                    <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'actioned')}>
                      Actioned
                    </button>
                    <button type="button" className="ghostBtn smallGhost" onClick={() => void reviewReport(report.id, 'dismissed')}>
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
              {!dashboard?.reports.length ? <div className="compactEmpty requestEmptyCard">No reports yet.</div> : null}
            </div>
          </div>
        </article>

        <article className="adminPanelCard">
          <div className="sectionTop">
            <h3>Review Notes</h3>
          </div>
          <p>Use the note below to attach context for report actions.</p>
          <textarea
            className="input adminTextarea"
            placeholder="Add a review note for selected actions"
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value)}
          />
          <div className="adminActionSection">
            <button type="button" className="primaryBtn" disabled>
              Bulk review coming soon
            </button>
          </div>
        </article>
      </section>
    </>
  );

  const renderAnalyticsArea = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">Analytics & Insights</span>
          <h2>Platform statistics and trends</h2>
          <p>Monitor user activity, engagement metrics, and platform performance.</p>
        </div>
      </section>

      <section className="adminStatsGrid animate-fade-in-up">
        <article className="adminStatCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H19C20.11 23 21 22.11 21 21V9ZM19 9H14V4H19V9ZM12 11C13.66 11 15 12.34 15 14C15 15.66 13.66 17 12 17C10.34 17 9 15.66 9 14C9 12.34 10.34 11 12 11ZM7 19V18C7 15.79 9.79 14 13 14C13.73 14 14.41 14.13 15 14.35V19H7Z" fill="currentColor"/>
            </svg>
            <strong>{dashboard?.stats.totalUsers ?? 0}</strong>
          </div>
          <span>Total users</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min((dashboard?.stats.totalUsers ?? 0) / 100 * 100, 100)}%` }}></div>
          </div>
        </article>
        <article className="adminStatCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L3.09 8.26L3 21H21V8.25L12 2ZM12 4.53L18.09 9H5.91L12 4.53ZM5 19V11H19V19H5Z" fill="currentColor"/>
            </svg>
            <strong>{dashboard?.stats.openReports ?? 0}</strong>
          </div>
          <span>Open reports</span>
        </article>
        <article className="adminStatCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
            </svg>
            <strong>{dashboard?.stats.blockedUsers ?? 0}</strong>
          </div>
          <span>Blocked users</span>
        </article>
        <article className="adminStatCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
            </svg>
            <strong>{dashboard?.stats.suspendedUsers ?? 0}</strong>
          </div>
          <span>Suspended users</span>
        </article>
        <article className="adminStatCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM8 9H16V19H8V9ZM15.5 4L14.5 3H9.5L8.5 4H5V6H19V4H15.5Z" fill="currentColor"/>
            </svg>
            <strong>{dashboard?.stats.deletedUsers ?? 0}</strong>
          </div>
          <span>Deleted users</span>
        </article>
      </section>

      <article className="adminPanelCard animate-fade-in-up">
        <div className="sectionTop">
          <h3>Top event types</h3>
        </div>
        <div className="adminEventTypeList">
          {eventTypeCounts.length ? eventTypeCounts.map(([kind, count]) => (
            <div key={kind} className="adminEventTypeItem">
              <span>{kind}</span>
              <strong>{count}</strong>
            </div>
          )) : (
            <div className="compactEmpty requestEmptyCard">No event activity available.</div>
          )}
        </div>
      </article>

      <section className="adminGraphCard animate-slide-in-left">
        <h3>User Activity Graph</h3>
        <div className="userActivityGraph">
          <div className="userActivityGraphBars">
            {/* Placeholder for activity graph - would need global activity data */}
            <div className="userActivityBar">
              <div className="userActivityBarFill level-5">
                <span>42</span>
              </div>
              <div className="userActivityBarLabel">Mon</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-8">
                <span>67</span>
              </div>
              <div className="userActivityBarLabel">Tue</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-6">
                <span>52</span>
              </div>
              <div className="userActivityBarLabel">Wed</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-9">
                <span>78</span>
              </div>
              <div className="userActivityBarLabel">Thu</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-7">
                <span>61</span>
              </div>
              <div className="userActivityBarLabel">Fri</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-4">
                <span>35</span>
              </div>
              <div className="userActivityBarLabel">Sat</div>
            </div>
            <div className="userActivityBar">
              <div className="userActivityBarFill level-3">
                <span>28</span>
              </div>
              <div className="userActivityBarLabel">Sun</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const renderLogsArea = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">Activity Logs</span>
          <h2>System events and user activities</h2>
          <p>Monitor recent platform activities, system events, and user interactions.</p>
        </div>
      </section>

      <section className="adminSystemGrid animate-slide-in-left">
        <article className="adminListCard adminScrollCard">
          <div className="sectionTop">
            <h3>Recent Platform History</h3>
          </div>
          <div className="adminScrollBody">
            <div className="adminStackList">
              {dashboard?.events.map((event) => (
                <article key={event.id} className="adminTimelineCard">
                  <strong>{event.user.name || event.user.username}</strong>
                  <span>{event.kind} - {event.detail}</span>
                  <span>{fmtDate(event.createdAt)} - {event.actorType}</span>
                </article>
              ))}
              {!dashboard?.events.length ? <div className="compactEmpty requestEmptyCard">No recent events.</div> : null}
            </div>
          </div>
        </article>

        <article className="adminPanelCard">
          <div className="sectionTop">
            <h3>Top event types</h3>
          </div>
          <div className="adminEventTypeList">
            {eventTypeCounts.length ? eventTypeCounts.map(([kind, count]) => (
              <div key={kind} className="adminEventTypeItem">
                <span>{kind}</span>
                <strong>{count}</strong>
              </div>
            )) : (
              <div className="compactEmpty requestEmptyCard">No event activity available.</div>
            )}
          </div>
          <div className="sectionTop sectionTopMarginTop">
            <h3>Log Filters</h3>
          </div>
          <p>Filter logs by type, user, or time period.</p>
          <div className="adminActionSection">
            <div className="adminActionRow">
              <button type="button" className="primaryBtn">Filter Logs</button>
              <button type="button" className="ghostBtn">Export Logs</button>
            </div>
          </div>
        </article>
      </section>
    </>
  );

  const renderAccountArea = () => (
    <>
      <section className="adminAreaHero animate-fade-in-up">
        <div className="adminAreaHeroText">
          <span className="heroEyebrow">Account Settings</span>
          <h2>Manage your admin profile</h2>
          <p>Update your personal information, security settings, and account preferences.</p>
        </div>
      </section>

      {renderAccountCard()}
    </>
  );

  // Forgot Password Modal
  if (showForgotPassword) {
    return (
      <div className="modalScrim" onClick={() => setShowForgotPassword(false)}>
        <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
          <div className="profileDetailHeader">
            <h2>🔑 Reset Admin Password</h2>
            <p>Enter your admin Gmail address to receive a password reset OTP.</p>
          </div>

          <div className="profileDetailBody">
            <div className="securityGrid">
              <div className="securityCard">
                <label className="inputLabel">Admin Gmail Address</label>
                <input
                  className="input securityInput"
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="securityCard">
                <label className="inputLabel">Reset OTP</label>
                <div className="otpInputGroup">
                  <input
                    className="input securityInput"
                    value={forgotCode}
                    onChange={(event) => setForgotCode(event.target.value.slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="ghostBtn securityActionBtn"
                    onClick={() => void requestForgotPasswordOtp()}
                    disabled={accountSaving || !forgotEmail.trim()}
                  >
                    Send OTP
                  </button>
                </div>
              </div>
            </div>

            <div className="securityGrid">
              <div className="securityCard securityLeadCard">
                <label className="inputLabel">New Password</label>
                <input
                  className="input securityInput"
                  type="password"
                  value={forgotNewPassword}
                  onChange={(event) => setForgotNewPassword(event.target.value)}
                  placeholder="Enter new password (min 8 chars)"
                />
                {forgotNewPassword && (
                  <div className="passwordStrength">
                    <div className={`strengthBar ${getPasswordStrength(forgotNewPassword)}`}></div>
                    <span className="strengthText">{getPasswordStrengthText(forgotNewPassword)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="profileDetailActions">
            <button
              type="button"
              className="ghostBtn"
              onClick={() => setShowForgotPassword(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => void resetAdminPassword()}
              disabled={accountSaving || !forgotEmail.trim() || !forgotCode.trim() || !forgotNewPassword.trim() || forgotNewPassword.length < 8}
            >
              {accountSaving ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="adminPanel adminConsoleContainer">
      {/* Sidebar */}
      <aside className="adminSidebar">
        <div className="adminSidebarHeader">
          <div className="adminLogo" title="HelloToo Admin">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" fill="url(#gradient)" rx="8"/>
              <path d="M16 8C18.21 8 20 9.79 20 12C20 14.21 18.21 16 16 16C13.79 16 12 14.21 12 12C12 9.79 13.79 8 16 8ZM16 18C20.42 18 24 19.79 24 22V24H8V22C8 19.79 11.58 18 16 18Z" fill="white"/>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="currentColor"/>
                  <stop offset="100%" stopColor="rgba(73, 224, 160, 0.6)"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2>Admin Panel</h2>
        </div>
        <nav className="adminNav">
          <button
            className={`adminNavItem ${activeArea === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveArea('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`adminNavItem ${activeArea === 'users' ? 'active' : ''}`}
            onClick={() => setActiveArea('users')}
          >
            👥 Users
          </button>
          <button
            className={`adminNavItem ${activeArea === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveArea('reports')}
          >
            🚨 Reports
          </button>
          <button
            className={`adminNavItem ${activeArea === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveArea('analytics')}
          >
            📈 Analytics
          </button>
          <button
            className={`adminNavItem ${activeArea === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveArea('logs')}
          >
            📝 Logs
          </button>
          <button
            className={`adminNavItem ${activeArea === 'system' ? 'active' : ''}`}
            onClick={() => setActiveArea('system')}
          >
            ⚙️ System
          </button>
          <button
            className={`adminNavItem ${activeArea === 'account' ? 'active' : ''}`}
            onClick={() => setActiveArea('account')}
          >
            👤 Account
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="adminMain">
        {/* Header */}
        <header className="adminHeader">
          <div className="adminHeaderContent">
            <div className="adminTopTitle">
              <div className="adminTopLogo" title="HelloToo Admin Panel">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" fill="currentColor" rx="8"/>
                  <path d="M16 8C18.21 8 20 9.79 20 12C20 14.21 18.21 16 16 16C13.79 16 12 14.21 12 12C12 9.79 13.79 8 16 8ZM16 18C20.42 18 24 19.79 24 22V24H8V22C8 19.79 11.58 18 16 18Z" fill="white"/>
                </svg>
              </div>
              <div>
                <strong>Admin Panel</strong>
                <h1 className="adminPageTitle">
                  {activeArea === 'dashboard' && 'Dashboard'}
                  {activeArea === 'users' && 'User Management'}
                  {activeArea === 'reports' && 'Reports'}
                  {activeArea === 'analytics' && 'Analytics'}
                  {activeArea === 'logs' && 'System Logs'}
                  {activeArea === 'system' && 'System Settings'}
                  {activeArea === 'account' && 'Account Settings'}
                </h1>
              </div>
            </div>
            <div className="adminUserInfo">
              <span>Welcome, {admin.name}</span>
              <button className="adminLogoutBtn" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="adminContent">
          {renderAreaContent()}
        </main>
      </div>
    </div>
  );
}
