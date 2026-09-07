import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./AppContext";

type Setter<T> = (value: T) => void;
type AuthTab = "password" | "otp";
type LoginMode = "login" | "register";
type AuthPortal = "chooser" | "user" | "admin";
type LoginForm = { identifier: string; password: string };
type EmailOtpForm = { email: string; code: string };
type PhoneOtpForm = { phoneNumber: string; code: string };
type RegisterForm = {
  username: string;
  name: string;
  phoneNumber: string;
  email: string;
  password: string;
  avatarUrl: string;
  bio: string;
  statusText: string;
};
type AdminForm = { email: string; secret: string };
type AdminForgotForm = { email: string; code: string; newPassword: string };

export type LoginPageProps = {
  authPortal: AuthPortal;
  setAuthPortal: Setter<AuthPortal>;
  mode: LoginMode;
  setMode: Setter<LoginMode>;
  authTab: AuthTab;
  setAuthTab: Setter<AuthTab>;
  loginForm: LoginForm;
  setLoginForm: Setter<LoginForm>;
  otpIdentifier: string;
  setOtpIdentifier: Setter<string>;
  otpEmailForm: EmailOtpForm;
  setOtpEmailForm: Setter<EmailOtpForm>;
  otpPhoneForm: PhoneOtpForm;
  setOtpPhoneForm: Setter<PhoneOtpForm>;
  registerForm: RegisterForm;
  setRegisterForm: Setter<RegisterForm>;
  devOtpPreview: string;
  setDevOtpPreview: Setter<string>;
  info: string;
  error: string;
  submitPasswordLogin: () => Promise<void>;
  submitRegister: () => Promise<void>;
  requestUnifiedOtp: () => Promise<void>;
  loginWithUnifiedOtp: () => Promise<void>;
  forgotIdentifier: string;
  setForgotIdentifier: Setter<string>;
  forgotCode: string;
  setForgotCode: Setter<string>;
  forgotNewPassword: string;
  setForgotNewPassword: Setter<string>;
  adminForm: AdminForm;
  setAdminForm: Setter<AdminForm>;
  showAdminForgot: boolean;
  setShowAdminForgot: Setter<boolean>;
  adminForgotForm: AdminForgotForm;
  setAdminForgotForm: Setter<AdminForgotForm>;
  submitAdminLogin: () => Promise<void>;
  requestAdminRecoveryOtp: () => Promise<void>;
  resetAdminRecovery: () => Promise<void>;
  firstAdminEmail: string;
  firstAdminPassword: string;
  requestPasswordResetOtp: () => Promise<void>;
  resetPasswordWithOtp: () => Promise<void>;
  onPickImage: (file: File | undefined, target: "register") => Promise<void>;
  runAction: (action: () => Promise<void>) => void;
  isMobile?: boolean;
  BrandMark: () => ReactNode;
  Avatar: (props: { name: string; avatarUrl?: string | null; size?: number; group?: boolean }) => ReactNode;
  theme: "dark" | "light";
  updateNotice: { currentBuildId: string; latestBuildId: string } | null;
  applyAvailableUpdate: () => void;
  dismissAvailableUpdate: () => void;
  // New 2FA OTP props for registration
  requestRegisterOtps: (target?: 'email' | 'phone' | 'both') => Promise<void>;
  registerOtpStage: "form" | "verify";
  setRegisterOtpStage: Setter<"form" | "verify">;
  registerEmailOtp: string;
  setRegisterEmailOtp: Setter<string>;
  registerPhoneOtp: string;
  setRegisterPhoneOtp: Setter<string>;
  submitRegisterWithOtp: () => Promise<void>;
  // New 2FA OTP props for login
  requestLoginOtps: () => Promise<void>;
  loginOtpStage: "identify" | "verify";
  setLoginOtpStage: Setter<"identify" | "verify">;
  loginIdentifierEmail: string;
  setLoginIdentifierEmail: Setter<string>;
  loginIdentifierPhone: string;
  setLoginIdentifierPhone: Setter<string>;
  loginEmailOtp: string;
  setLoginEmailOtp: Setter<string>;
  loginPhoneOtp: string;
  setLoginPhoneOtp: Setter<string>;
  loginWithOtps: () => Promise<void>;
};

const footerLinks = ["User Agreement", "Privacy Policy", "Community Guidelines", "Cookie Policy", "Copyright Policy", "Send Feedback", "Language"] as const;

type FooterLinkLabel = typeof footerLinks[number];
type FooterDetailSection = {
  heading: string;
  body: string[];
};

const footerLinkDetails: Record<FooterLinkLabel, { title: string; summary: string; sections: FooterDetailSection[] }> = {
  "User Agreement": {
    title: "User Agreement",
    summary: "Using HelloToo means you agree to keep your account secure and use the app respectfully.",
    sections: [
      {
        heading: "Account use",
        body: [
          "Provide accurate account details and protect your password, OTP, and recovery methods.",
          "You are responsible for activity that happens through your signed-in account.",
        ],
      },
      {
        heading: "Acceptable behavior",
        body: [
          "Do not misuse HelloToo for fraud, abuse, harassment, or attempts to harm other users.",
          "Accounts that break the rules can be restricted, suspended, or removed.",
        ],
      },
    ],
  },
  "Privacy Policy": {
    title: "Privacy Policy",
    summary: "HelloToo stores the information needed to create accounts, support messaging, and keep the service secure.",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Profile details such as your name, email, mobile number, avatar, and status text.",
          "App activity such as messages, connection requests, login events, and security settings.",
        ],
      },
      {
        heading: "How it is used",
        body: [
          "Your information is used to authenticate accounts, deliver features, and troubleshoot problems.",
          "Security logs may be retained to detect abuse, protect users, and support admin review.",
        ],
      },
    ],
  },
  "Community Guidelines": {
    title: "Community Guidelines",
    summary: "HelloToo is meant to feel safe, friendly, and useful for everyone who joins.",
    sections: [
      {
        heading: "Respect others",
        body: [
          "Do not bully, threaten, impersonate, or pressure other people on the platform.",
          "Share only content you have the right to share and avoid spam or repeated unwanted contact.",
        ],
      },
      {
        heading: "Keep the space healthy",
        body: [
          "Report harmful behavior instead of escalating it inside chats or requests.",
          "Repeated rule-breaking can lead to warnings, blocks, suspensions, or permanent removal.",
        ],
      },
    ],
  },
  "Cookie Policy": {
    title: "Cookie Policy",
    summary: "HelloToo uses browser storage to keep sessions, preferences, and safety settings working correctly.",
    sections: [
      {
        heading: "Storage we use",
        body: [
          "Session tokens help keep you signed in between page refreshes and trusted visits.",
          "Preference storage remembers choices such as theme, update notices, and app-lock settings.",
        ],
      },
      {
        heading: "Your control",
        body: [
          "Clearing browser data can sign you out and remove saved local preferences.",
          "Some features may stop working normally if essential browser storage is disabled.",
        ],
      },
    ],
  },
  "Copyright Policy": {
    title: "Copyright Policy",
    summary: "Only share content that you own or have permission to use inside HelloToo.",
    sections: [
      {
        heading: "Your responsibility",
        body: [
          "Do not upload copyrighted photos, videos, files, or text if you do not have the right to share them.",
          "If a copyright complaint is confirmed, the reported content can be removed by admin review.",
        ],
      },
      {
        heading: "Reporting concerns",
        body: [
          "When reporting, include the original work, the copied material, and enough detail to verify the claim.",
          "False or abusive reporting can also be reviewed as a policy violation.",
        ],
      },
    ],
  },
  "Send Feedback": {
    title: "Send Feedback",
    summary: "Feedback helps improve HelloToo, especially around bugs, design, performance, and confusing flows.",
    sections: [
      {
        heading: "What to include",
        body: [
          "Describe what you were trying to do, what happened instead, and how to reproduce the issue.",
          "Add the page name, device type, browser, and screenshots when they help explain the problem.",
        ],
      },
      {
        heading: "Best feedback topics",
        body: [
          "Broken actions, missing data, loading issues, layout problems, and feature suggestions are all useful.",
          "Short, specific reports are easier to fix quickly than broad descriptions without examples.",
        ],
      },
    ],
  },
  Language: {
    title: "Language",
    summary: "HelloToo currently presents the interface in English, and language support can expand over time.",
    sections: [
      {
        heading: "Current experience",
        body: [
          "The login and chat interface currently uses English labels, actions, and system messages.",
          "If you need another language right now, your browser translation tools may help on the web app.",
        ],
      },
      {
        heading: "Future language support",
        body: [
          "Preferred language options can be added later without changing your account or chat history.",
          "A full language switch should update labels, prompts, errors, and help text consistently.",
        ],
      },
    ],
  },
};

function BrandWordmark() {
  return (
    <div className="authLinkedWordmark" aria-label="HelloToo">
      <span className="authLinkedWordmarkText">Hello</span>
      <span className="authLinkedWordmarkBadge">Too</span>
    </div>
  );
}

function DividerLabel({ label }: { label: string }) {
  return (
    <div className="authLinkedDivider" aria-hidden="true">
      <span />
      <strong>{label}</strong>
      <span />
    </div>
  );
}

export default function LoginPage(props: LoginPageProps) {
  const {
    authPortal, setAuthPortal, mode, setMode, authTab, setAuthTab, loginForm, setLoginForm, otpIdentifier, setOtpIdentifier,
    otpEmailForm, setOtpEmailForm, otpPhoneForm, setOtpPhoneForm, registerForm, setRegisterForm, devOtpPreview, setDevOtpPreview,
    info, error, submitPasswordLogin, submitRegister, requestUnifiedOtp, loginWithUnifiedOtp, forgotIdentifier, setForgotIdentifier,
    forgotCode, setForgotCode, forgotNewPassword, setForgotNewPassword, adminForm, setAdminForm, showAdminForgot, setShowAdminForgot,
    adminForgotForm, setAdminForgotForm, submitAdminLogin, requestAdminRecoveryOtp, resetAdminRecovery, firstAdminEmail, firstAdminPassword, requestPasswordResetOtp,
    resetPasswordWithOtp, onPickImage, runAction, updateNotice, applyAvailableUpdate, dismissAvailableUpdate,
    requestRegisterOtps, registerOtpStage, setRegisterOtpStage, registerEmailOtp, setRegisterEmailOtp, registerPhoneOtp, setRegisterPhoneOtp, submitRegisterWithOtp,
    requestLoginOtps, loginOtpStage, setLoginOtpStage, loginIdentifierEmail, setLoginIdentifierEmail, loginIdentifierPhone, setLoginIdentifierPhone, loginEmailOtp, setLoginEmailOtp, loginPhoneOtp, setLoginPhoneOtp, loginWithOtps,
  } = props;

  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showAdminRecoveryPassword, setShowAdminRecoveryPassword] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(true);
  const [otpCopied, setOtpCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [otpStage, setOtpStage] = useState<"identify" | "verify">("identify");
  const [activeFooterDetail, setActiveFooterDetail] = useState<FooterLinkLabel | null>(null);
  const activeFooterContent = activeFooterDetail ? footerLinkDetails[activeFooterDetail] : null;
  const [registerLastOtpTarget, setRegisterLastOtpTarget] = useState<'email' | 'phone' | 'both' | null>(null);
  const { biometricSupported, unlockWithBiometric } = useApp();
  const [adminBiometricReady, setAdminBiometricReady] = useState(false);
  const [adminBiometricBusy, setAdminBiometricBusy] = useState(false);
  const [adminBiometricMessage, setAdminBiometricMessage] = useState('');
  const loginOtpIdentifier = loginIdentifierEmail || loginIdentifierPhone;
  const loginOtpTarget = loginIdentifierEmail.trim() || loginIdentifierPhone.trim();

  const updateLoginOtpIdentifier = (value: string) => {
    setLoginEmailOtp("");
    setLoginPhoneOtp("");
    if (value.includes("@")) {
      setLoginIdentifierEmail(value);
      setLoginIdentifierPhone("");
      return;
    }
    setLoginIdentifierPhone(value);
    setLoginIdentifierEmail("");
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAdminBiometricReady(Boolean(window.localStorage.getItem('helloto_admin_biometric_credential_id')) && biometricSupported);
  }, [biometricSupported]);

  const tryAdminBiometricSignIn = async () => {
    if (!adminBiometricReady) {
      setAdminBiometricMessage('Register admin biometric unlock from Admin System Settings first.');
      return;
    }
    setAdminBiometricBusy(true);
    setAdminBiometricMessage('');
    try {
      const authorized = await unlockWithBiometric();
      if (authorized) {
        setAdminBiometricMessage('Biometric scan succeeded. Proceed with admin sign in or use the lock screen for future access.');
      } else {
        setAdminBiometricMessage('Biometric scan failed or was canceled. Try again or use password/PIN.');
      }
    } catch (err: unknown) {
      setAdminBiometricMessage(err instanceof Error ? err.message : 'Biometric unlock failed.');
    } finally {
      setAdminBiometricBusy(false);
    }
  };

  const submitAdminWithBiometricGate = async () => {
    if (!adminBiometricReady) {
      await submitAdminLogin();
      return;
    }

    setAdminBiometricBusy(true);
    setAdminBiometricMessage('Scanning admin face or device biometric...');
    try {
      const authorized = await unlockWithBiometric();
      if (!authorized) {
        setAdminBiometricMessage('Face or biometric scan did not match. Admin login is blocked.');
        return;
      }
      setAdminBiometricMessage('Scan verified. Opening admin panel...');
      await submitAdminLogin();
    } catch (err: unknown) {
      setAdminBiometricMessage(err instanceof Error ? err.message : 'Biometric verification failed.');
    } finally {
      setAdminBiometricBusy(false);
    }
  };

  useEffect(() => {
    if (!updateNotice) {
      setIsUpdating(false);
      return;
    }
    if (isUpdating) return;
    const timeout = window.setTimeout(() => dismissAvailableUpdate(), 5000);
    return () => window.clearTimeout(timeout);
  }, [dismissAvailableUpdate, isUpdating, updateNotice]);

  useEffect(() => {
    if (mode !== "login" || authTab !== "otp") setOtpStage("identify");
  }, [authTab, mode]);

  const copyOtpPreview = async () => {
    if (!devOtpPreview) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(devOtpPreview);
      } else {
        const tempInput = document.createElement("textarea");
        tempInput.value = devOtpPreview;
        tempInput.setAttribute("readonly", "true");
        tempInput.style.position = "fixed";
        tempInput.style.opacity = "0";
        document.body.appendChild(tempInput);
        tempInput.focus();
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      }
      setOtpCopied(true);
      window.setTimeout(() => setOtpCopied(false), 1800);
    } catch {
      // ignore copy errors
    }
  };

  const syncAdminEmail = (email: string) => {
    setAdminForm({ ...adminForm, email });
    setAdminForgotForm({ ...adminForgotForm, email });
  };

  const backToChooser = () => {
    setShowForgotPassword(false);
    setShowAdminForgot(false);
    setAuthPortal("chooser");
  };

  const openAdminRecovery = () => {
    setShowAdminForgot(true);
  };

  const renderPasswordLogin = () => (
    <>
      <label className="authLinkedField">
        <span>Mobile number or Gmail</span>
        <input className="input authLinkedInput" value={loginForm.identifier} onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })} placeholder="Enter mobile number or Gmail" />
      </label>
      <label className="authLinkedField">
        <span>Password</span>
        <div className="authLinkedPasswordWrap">
          <input className="input authLinkedInput authLinkedInputWithAction" type={showPassword ? "text" : "password"} value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Password" />
          <button type="button" className="authLinkedTextButton authLinkedInputAction" onClick={() => setShowPassword((prev) => !prev)}>{showPassword ? "hide" : "show"}</button>
        </div>
      </label>
      <button type="button" className="authLinkedForgot" onClick={() => setShowForgotPassword(true)}>Forgot password?</button>
      <button className="primaryBtn authLinkedPrimaryButton" onClick={() => runAction(submitPasswordLogin)}>Sign in</button>
      <DividerLabel label="or" />
      <button type="button" className="ghostBtn authLinkedAltButton" onClick={() => setAuthTab("otp")}>Sign in with OTP</button>
    </>
  );

  const renderOtpLogin = () => (
    otpStage === "identify" ? (
      <>
        <h3 className="authLinkedSectionTitle">Email/Mobile No verification</h3>
        <p className="authLinkedPanelNote">Write your Gmail or mobile number here. After pressing send OTP, the next page will open for verification.</p>
        <label className="authLinkedField">
          <span>Gmail or mobile number</span>
          <input className="input authLinkedInput" value={otpIdentifier} onChange={(e) => setOtpIdentifier(e.target.value)} placeholder="Write Email/Mobile No" />
        </label>
        <button
          className="ghostBtn authLinkedSecondaryButton authLinkedOtpSingleAction"
          onClick={() => runAction(async () => {
            await requestUnifiedOtp();
            setOtpStage("verify");
          })}
          disabled={!otpIdentifier.trim()}
        >
          Send OTP
        </button>
      </>
    ) : (
      <>
        <h3 className="authLinkedSectionTitle">OTP verification</h3>
        <p className="authLinkedPanelNote">Enter the OTP sent to <strong>{otpIdentifier}</strong>. After verification, you will enter the website directly.</p>
        <label className="authLinkedField">
          <span>OTP</span>
          <input
            className="input authLinkedInput"
            value={otpEmailForm.code || otpPhoneForm.code}
            onChange={(e) => {
              const code = e.target.value.slice(0, 6);
              setOtpEmailForm({ ...otpEmailForm, code });
              setOtpPhoneForm({ ...otpPhoneForm, code });
            }}
            placeholder="Enter 6-digit OTP"
            maxLength={6}
          />
        </label>
        <button className="primaryBtn authLinkedPrimaryButton" onClick={() => runAction(loginWithUnifiedOtp)}>Verify OTP and sign in</button>
        <button type="button" className="authLinkedTextButton authLinkedBackButton" onClick={() => setOtpStage("identify")}>Back to Email/Mobile No verification</button>
      </>
    )
  );

  const renderForgotPassword = () => (
    <>
      <h3 className="authLinkedSectionTitle">Reset password</h3>
      <p className="authLinkedPanelNote">Verify your email or phone and set a new password.</p>
      <label className="authLinkedField">
        <span>Gmail or mobile number</span>
        <input className="input authLinkedInput" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} placeholder="Enter Gmail or mobile number" />
      </label>
      <button className="ghostBtn authLinkedSecondaryButton" onClick={() => runAction(requestPasswordResetOtp)}>Send OTP</button>
      <label className="authLinkedField">
        <span>OTP</span>
        <input className="input authLinkedInput" value={forgotCode} onChange={(e) => setForgotCode(e.target.value.slice(0, 6))} placeholder="Enter OTP" maxLength={6} />
      </label>
      <label className="authLinkedField">
        <span>New password</span>
        <div className="authLinkedPasswordWrap">
          <input className="input authLinkedInput authLinkedInputWithAction" type={showPassword ? "text" : "password"} value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="Enter new password" />
          <button type="button" className="authLinkedTextButton authLinkedInputAction" onClick={() => setShowPassword((prev) => !prev)}>{showPassword ? "hide" : "show"}</button>
        </div>
      </label>
      <button className="primaryBtn authLinkedPrimaryButton" onClick={() => runAction(resetPasswordWithOtp)}>Verify OTP and change password</button>
      <button type="button" className="authLinkedTextButton authLinkedBackButton" onClick={() => setShowForgotPassword(false)}>Back to sign in</button>
    </>
  );

  const renderRegister = () => (
    <>
      <h3 className="authLinkedSectionTitle">Create your account</h3>
      <p className="authLinkedPanelNote">Set up your profile details to join HelloToo.</p>
      <div className="authLinkedRegisterGrid">
        <label className="authLinkedField">
          <span>Full name</span>
          <input className="input authLinkedInput" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} placeholder="Full name" />
        </label>
        <label className="authLinkedField">
          <span>Mobile number</span>
          <input className="input authLinkedInput" value={registerForm.phoneNumber} onChange={(e) => setRegisterForm({ ...registerForm, phoneNumber: e.target.value })} placeholder="Mobile number" />
        </label>
      </div>
      <div className="authLinkedRegisterGrid">
        <label className="authLinkedField">
          <span>Email</span>
          <input className="input authLinkedInput" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="Email address" />
        </label>
        <label className="authLinkedField">
          <span>Password</span>
          <div className="authLinkedPasswordWrap">
            <input className="input authLinkedInput authLinkedInputWithAction" type={showRegisterPassword ? "text" : "password"} value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="Password" />
            <button type="button" className="authLinkedTextButton authLinkedInputAction" onClick={() => setShowRegisterPassword((prev) => !prev)}>{showRegisterPassword ? "hide" : "show"}</button>
          </div>
        </label>
      </div>
      <div className="authLinkedRegisterGrid">
        <label className="authLinkedField">
          <span>Status</span>
          <input className="input authLinkedInput" value={registerForm.statusText} onChange={(e) => setRegisterForm({ ...registerForm, statusText: e.target.value })} placeholder="Status" />
        </label>
        <label className="authLinkedField">
          <span>Bio</span>
          <input className="input authLinkedInput" value={registerForm.bio} onChange={(e) => setRegisterForm({ ...registerForm, bio: e.target.value })} placeholder="Bio" />
        </label>
      </div>
      <label className="authLinkedField">
        <span>Profile image</span>
        <input className="input authLinkedInput authLinkedFileInput" type="file" accept="image/*" onChange={(e) => runAction(() => onPickImage(e.target.files?.[0], "register"))} />
      </label>
      <button className="primaryBtn authLinkedPrimaryButton" onClick={() => runAction(submitRegister)}>Join now</button>
    </>
  );

  const updateRegisterIdentity = (next: Partial<Pick<RegisterForm, "email" | "phoneNumber">>) => {
    setRegisterForm({ ...registerForm, ...next });
    setRegisterOtpStage("form");
    setRegisterEmailOtp("");
    setRegisterPhoneOtp("");
    setDevOtpPreview("");
  };

  // NEW: Render 2FA registration flow
  const renderRegister2FA = () => (
    <>
      <h3 className="authLinkedSectionTitle">Create your account with OTP verification</h3>
      <p className="authLinkedPanelNote">Add your Gmail and mobile number, send OTP, then verify both codes before registration completes.</p>
      <div className="authLinkedRegisterGrid">
        <label className="authLinkedField">
          <span>Full name</span>
          <input className="input authLinkedInput" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} placeholder="Full name" />
        </label>
        <label className="authLinkedField">
          <span>Password</span>
          <div className="authLinkedPasswordWrap">
            <input className="input authLinkedInput authLinkedInputWithAction" type={showRegisterPassword ? "text" : "password"} value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="Create password" />
            <button type="button" className="authLinkedTextButton authLinkedInputAction" onClick={() => setShowRegisterPassword((prev) => !prev)}>{showRegisterPassword ? "hide" : "show"}</button>
          </div>
        </label>
      </div>
        <div className="authLinkedRegisterGrid authLinkedOtpIdentityGrid">
          <label className="authLinkedField authLinkedFieldWithAction">
            <span>Gmail</span>
            <div className="authLinkedInputWithActionRow">
              <input className="input authLinkedInput" value={registerForm.email} onChange={(e) => updateRegisterIdentity({ email: e.target.value })} placeholder="yourname@gmail.com" />
              <button type="button" className="ghostBtn authLinkedSmallAction" onClick={() => { setRegisterLastOtpTarget('email'); runAction(() => requestRegisterOtps('email')); }} disabled={!registerForm.email.trim() || !registerForm.name.trim() || registerForm.password.length < 6}>
                Send OTP
              </button>
            </div>
          </label>
          <label className="authLinkedField authLinkedFieldWithAction">
            <span>Mobile number</span>
            <div className="authLinkedInputWithActionRow">
              <input className="input authLinkedInput" value={registerForm.phoneNumber} onChange={(e) => updateRegisterIdentity({ phoneNumber: e.target.value })} placeholder="+91 mobile number" />
              <button type="button" className="ghostBtn authLinkedSmallAction" onClick={() => { setRegisterLastOtpTarget('phone'); runAction(() => requestRegisterOtps('phone')); }} disabled={!registerForm.phoneNumber.trim() || !registerForm.name.trim() || registerForm.password.length < 6}>
                Send OTP
              </button>
            </div>
          </label>
        </div>

        {registerOtpStage === "verify" ? (
          <div className="authLinkedInlineOtpPanel">
            <h3 className="authLinkedSectionTitle">Enter verification OTP</h3>
            <p className="authLinkedPanelNote">Enter the OTP(s) sent to your Gmail and/or mobile number below. Entering either one will complete registration.</p>
            <div className="authLinkedRegisterGrid">
              {registerForm.email ? (
                <label className="authLinkedField">
                  <span>Gmail OTP</span>
                  <input className="input authLinkedInput" value={registerEmailOtp} onChange={(e) => setRegisterEmailOtp(e.target.value.slice(0, 6))} placeholder={`Enter OTP sent to ${registerForm.email}`} maxLength={6} inputMode="numeric" />
                </label>
              ) : null}
              {registerForm.phoneNumber ? (
                <label className="authLinkedField">
                  <span>Mobile OTP</span>
                  <input className="input authLinkedInput" value={registerPhoneOtp} onChange={(e) => setRegisterPhoneOtp(e.target.value.slice(0, 6))} placeholder={`Enter OTP sent to ${registerForm.phoneNumber}`} maxLength={6} inputMode="numeric" />
                </label>
              ) : null}
            </div>
            <button
              className="primaryBtn authLinkedPrimaryButton"
              onClick={() => runAction(submitRegisterWithOtp)}
              disabled={!(registerEmailOtp.length === 6 || registerPhoneOtp.length === 6)}
            >
              Verify OTP and complete registration
            </button>
          </div>
        ) : null}

      <div className="authLinkedRegisterGrid">
        <label className="authLinkedField">
          <span>Username (optional)</span>
          <input className="input authLinkedInput" value={registerForm.username || ""} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} placeholder="Username" />
        </label>
        <label className="authLinkedField">
          <span>Status</span>
          <input className="input authLinkedInput" value={registerForm.statusText} onChange={(e) => setRegisterForm({ ...registerForm, statusText: e.target.value })} placeholder="Status" />
        </label>
      </div>
      <label className="authLinkedField">
        <span>Bio</span>
        <input className="input authLinkedInput" value={registerForm.bio} onChange={(e) => setRegisterForm({ ...registerForm, bio: e.target.value })} placeholder="Bio" />
      </label>
      <label className="authLinkedField">
        <span>Profile image</span>
        <input className="input authLinkedInput authLinkedFileInput" type="file" accept="image/*" onChange={(e) => runAction(() => onPickImage(e.target.files?.[0], "register"))} />
      </label>
    </>
  );

  const renderLoginOtp2FA = () => (
    loginOtpStage === "identify" ? (
      <>
        <h3 className="authLinkedSectionTitle">Login with OTP</h3>
        <p className="authLinkedPanelNote">Enter your Gmail or mobile number and we will send one OTP to that login detail.</p>
        <label className="authLinkedField">
          <span>Gmail or mobile number</span>
          <input className="input authLinkedInput" value={loginOtpIdentifier} onChange={(e) => updateLoginOtpIdentifier(e.target.value)} placeholder="Enter Gmail or mobile number" />
        </label>
        <button className="ghostBtn authLinkedSecondaryButton" onClick={() => runAction(requestLoginOtps)} disabled={!loginOtpTarget}>Send OTP</button>
      </>
    ) : (
      <>
        <h3 className="authLinkedSectionTitle">Enter OTP</h3>
        <p className="authLinkedPanelNote">Enter the OTP sent to <strong>{loginOtpTarget}</strong>.</p>
        <label className="authLinkedField">
          <span>OTP</span>
          <input
            className="input authLinkedInput"
            value={loginIdentifierEmail.trim() ? loginEmailOtp : loginPhoneOtp}
            onChange={(e) => {
              const code = e.target.value.replace(/\D/g, "").slice(0, 6);
              if (loginIdentifierEmail.trim()) {
                setLoginEmailOtp(code);
                setLoginPhoneOtp("");
                return;
              }
              setLoginPhoneOtp(code);
              setLoginEmailOtp("");
            }}
            placeholder="Enter 6-digit OTP"
            maxLength={6}
            inputMode="numeric"
          />
        </label>
        <button className="primaryBtn authLinkedPrimaryButton" onClick={() => runAction(loginWithOtps)}>Verify OTP and login</button>
        <button type="button" className="authLinkedTextButton authLinkedBackButton" onClick={() => {
          setLoginOtpStage("identify");
          setLoginIdentifierEmail("");
          setLoginIdentifierPhone("");
          setLoginEmailOtp("");
          setLoginPhoneOtp("");
          setDevOtpPreview("");
        }}>Back to email/phone entry</button>
      </>
    )
  );

  const renderRoleChooser = () => (
    <main className="authLinkedMain authLinkedMainChooser">
      <section className="authLinkedCard authChooserCard">
        <div className="authLinkedCardInner">
          <div className="authLinkedHeading">
            <h1>Choose your sign in</h1>
            <p>Open HelloToo as a normal user or enter the admin control room with Gmail plus the admin password or PIN.</p>
          </div>
          <div className="authRoleChoiceGrid">
            <button type="button" className="authRoleChoiceCard" onClick={() => { setShowForgotPassword(false); setAuthPortal("user"); setMode("login"); }}>
              <span className="heroEyebrow">User area</span>
              <strong>Login as User</strong>
              <p>Use your mobile number or Gmail with password or OTP. New users can also create an account here.</p>
            </button>
            <button type="button" className="authRoleChoiceCard authRoleChoiceCardAdmin" onClick={() => { setShowAdminForgot(false); setAuthPortal("admin"); }}>
              <span className="heroEyebrow">Admin area</span>
              <strong>Login as Admin</strong>
              <p>Use the admin Gmail with the admin password or PIN. Only password recovery is shown here.</p>
            </button>
          </div>
        </div>
      </section>
    </main>
  );

  const renderUserPortal = () => (
    <main className={`authLinkedMain ${mode === "register" ? "authLinkedMainRegister" : ""}`}>
      <div className="authLinkedPrimaryColumn">
        <section className={`authLinkedCard ${mode === "register" ? "authLinkedCardWide" : ""}`}>
          <div className="authLinkedCardInner">
            <button type="button" className="authLinkedTextButton authPortalBack" onClick={backToChooser}>Back to role choice</button>
            <div className="authLinkedHeading">
              <h1>{mode === "login" ? "Login as User" : "Create user account"}</h1>
              <p>{mode === "login" ? "Use your mobile number or Gmail with password or OTP." : "Create a HelloToo user account with your profile, Gmail, and mobile number."}</p>
            </div>
            {mode === "login" && !showForgotPassword ? (
              <>
                <div className="authLinkedMethodTabs">
                  <button type="button" className={authTab === "password" ? "authLinkedTab authLinkedTabActive" : "authLinkedTab"} onClick={() => setAuthTab("password")}>Password</button>
                  <button type="button" className={authTab === "otp" ? "authLinkedTab authLinkedTabActive" : "authLinkedTab"} onClick={() => setAuthTab("otp")}>Email or Mobile OTP</button>
                </div>
                <div className="authLinkedFormStack">{authTab === "password" ? renderPasswordLogin() : renderLoginOtp2FA()}</div>
              </>
            ) : mode === "login" ? (
              <div className="authLinkedFormStack">{renderForgotPassword()}</div>
            ) : (
              <div className="authLinkedFormStack">{renderRegister2FA()}</div>
            )}
          </div>
        </section>
        {!showForgotPassword ? (
          <div className="authLinkedBottomPrompt">
            {mode === "login" ? (
              <p>New in HelloToo? <button type="button" className="authLinkedTextButton authLinkedInlineSwitch" onClick={() => setMode("register")}>Join now</button></p>
            ) : (
              <p>Already have an account? <button type="button" className="authLinkedTextButton authLinkedInlineSwitch" onClick={() => setMode("login")}>Sign in</button></p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
  const renderAdminLoginForm = () => (
    <>
      <label className="authLinkedField authAdminField">
        <span>Admin Gmail</span>
        <input className="input authLinkedInput authAdminInput" value={adminForm.email} onChange={(event) => syncAdminEmail(event.target.value)} placeholder="Enter admin Gmail" autoComplete="username" />
      </label>
      <label className="authLinkedField authAdminField">
        <span>Password or PIN</span>
        <input
          className="input authLinkedInput authAdminInput"
          type="password"
          value={adminForm.secret}
          onChange={(event) => setAdminForm({ ...adminForm, secret: event.target.value })}
          placeholder="Enter admin password or PIN"
          autoComplete="current-password"
        />
      </label>
      <div className="authAdminMetaRow">
        <label className="authAdminRemember">
          <input type="checkbox" checked={rememberAdmin} onChange={(event) => setRememberAdmin(event.target.checked)} />
          <span>Remember me</span>
        </label>
      </div>
      {adminBiometricReady ? (
        <div className="authAdminBiometricGate">
          <strong>Face verification required</strong>
          <span>Every admin login must pass the saved biometric scan before the admin panel opens.</span>
          <button
            type="button"
            className="ghostBtn authAdminSecondaryButton"
            onClick={() => void tryAdminBiometricSignIn()}
            disabled={adminBiometricBusy}
          >
            {adminBiometricBusy ? 'Scanning...' : 'Test face scan'}
          </button>
        </div>
      ) : (
        <div className="authAdminBiometricGate authAdminBiometricGateSoft">
          <strong>Biometric not registered</strong>
          <span>After first admin login, open System Settings and register the admin face/device biometric.</span>
        </div>
      )}
      {adminBiometricMessage ? <p className="authAdminBiometricMessage">{adminBiometricMessage}</p> : null}
      <button
        type="button"
        className="primaryBtn authAdminButton authAdminHeroButton"
        onClick={() => runAction(submitAdminWithBiometricGate)}
        disabled={adminBiometricBusy}
      >
        {adminBiometricReady ? (adminBiometricBusy ? 'SCANNING...' : 'SCAN & LOGIN') : 'LOGIN'}
      </button>
    </>
  );

  const renderAdminRecoveryForm = () => (
    <>
      <h3 className="authLinkedSectionTitle authAdminSectionTitle">Forgot admin password</h3>
      <p className="authLinkedPanelNote authAdminPanelNote">We will send a Gmail OTP to the current admin email so you can reset the admin password.</p>
      <label className="authLinkedField authAdminField">
        <span>Admin Gmail</span>
        <input className="input authLinkedInput authAdminInput" value={adminForgotForm.email} onChange={(event) => syncAdminEmail(event.target.value)} placeholder="Enter current admin Gmail" />
      </label>
      <button type="button" className="ghostBtn authLinkedSecondaryButton authAdminSecondaryButton" onClick={() => runAction(requestAdminRecoveryOtp)}>Send Gmail OTP</button>
      <label className="authLinkedField authAdminField">
        <span>OTP</span>
        <input className="input authLinkedInput authAdminInput" value={adminForgotForm.code} onChange={(event) => setAdminForgotForm({ ...adminForgotForm, code: event.target.value.slice(0, 6) })} placeholder="Enter 6-digit OTP" maxLength={6} />
      </label>
      <label className="authLinkedField authAdminField">
        <span>New password</span>
        <div className="authLinkedPasswordWrap">
          <input className="input authLinkedInput authLinkedInputWithAction authAdminInput" type={showAdminRecoveryPassword ? "text" : "password"} value={adminForgotForm.newPassword} onChange={(event) => setAdminForgotForm({ ...adminForgotForm, newPassword: event.target.value })} placeholder="Enter new admin password" />
          <button type="button" className="authLinkedTextButton authLinkedInputAction" onClick={() => setShowAdminRecoveryPassword((prev) => !prev)}>{showAdminRecoveryPassword ? "hide" : "show"}</button>
        </div>
      </label>
      <button type="button" className="primaryBtn authAdminButton authAdminHeroButton" onClick={() => runAction(resetAdminRecovery)}>Reset Password</button>
      <button type="button" className="authLinkedTextButton authLinkedBackButton" onClick={() => setShowAdminForgot(false)}>Back to admin sign in</button>
    </>
  );

  const renderAdminPortal = () => (
    <main className="authLinkedMain authLinkedMainAdmin">
      <section className="authAdminCard authAdminStandalone">
        <div className="authAdminHeader">
          <div className="authAdminHero">
            <button type="button" className="authLinkedTextButton authPortalBack authPortalBackLight" onClick={backToChooser}>Back to role choice</button>
            <span className="heroEyebrow authAdminHeroEyebrow">Admin only</span>
            <h2>ADMIN LOGIN</h2>
            <p>Hello there, sign in and start managing your HelloToo control room.</p>
          </div>
        </div>
        <div className="authAdminBody">
          <div className="authLinkedFormStack">{showAdminForgot ? renderAdminRecoveryForm() : renderAdminLoginForm()}</div>
        </div>
      </section>
    </main>
  );

  return (
    <div className="authShell authLinkedShell">
      {(devOtpPreview || info || error) && (
        <div className="floatingBannerStack authFloatingBannerStack">
          {devOtpPreview ? (
            <div className="floatingBanner infoFloat">
              <span className="floatingBannerText">OTP: <strong>{devOtpPreview}</strong></span>
              <div className="floatingBannerActions">
                <button type="button" className="floatingBannerActionBtn" onClick={() => void copyOtpPreview()}>{otpCopied ? "Copied" : "Copy"}</button>
                <button type="button" className="floatingBannerClose" onClick={() => setDevOtpPreview("")} aria-label="Close OTP notification">x</button>
              </div>
            </div>
          ) : null}
          {info ? <div className="floatingBanner infoFloat"><span className="floatingBannerText">{info}</span></div> : null}
          {error ? <div className="floatingBanner errorFloat"><span className="floatingBannerText">{error}</span></div> : null}
        </div>
      )}
      {updateNotice ? (
        <div className="floatingBannerStack updateBannerStack authUpdateBannerStack">
          <div className="floatingBanner infoFloat updateFloatBanner">
            <span className="floatingBannerText"><strong>{isUpdating ? "Updating..." : "Website update ready."}</strong> {isUpdating ? "Applying the latest changes now." : "New changes were found for HelloToo."}</span>
            <div className="floatingBannerActions">
              {isUpdating ? null : (
                <>
                  <button type="button" className="floatingBannerActionBtn" onClick={() => { setIsUpdating(true); window.setTimeout(() => applyAvailableUpdate(), 100); }}>Update</button>
                  <button type="button" className="floatingBannerActionBtn updateLaterBtn" onClick={dismissAvailableUpdate}>Don't update</button>
                  <button type="button" className="floatingBannerClose" onClick={dismissAvailableUpdate} aria-label="Close update notice">x</button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="authLinkedPage">
        <header className="authLinkedHeader"><BrandWordmark /></header>
        {authPortal === "chooser" ? renderRoleChooser() : authPortal === "admin" ? renderAdminPortal() : renderUserPortal()}
        <footer className="authLinkedFooter">
          <span className="authLinkedFooterBrand">HelloToo © 2026</span>
          {footerLinks.map((item) => (
            <button
              key={item}
              type="button"
              className="authLinkedFooterLink"
              onClick={() => setActiveFooterDetail(item)}
            >
              {item}
            </button>
          ))}
        </footer>
      </div>
      {activeFooterContent ? (
        <div className="modalScrim" onClick={() => setActiveFooterDetail(null)}>
          <section
            className="authFooterModalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="authFooterModalTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="authFooterModalHeader">
              <div className="authFooterModalTitleBlock">
                <span className="authFooterModalEyebrow">HelloToo details</span>
                <h2 id="authFooterModalTitle">{activeFooterContent.title}</h2>
              </div>
              <button
                type="button"
                className="floatingBannerClose authFooterModalClose"
                onClick={() => setActiveFooterDetail(null)}
                aria-label={`Close ${activeFooterContent.title}`}
              >
                x
              </button>
            </div>
            <p className="authFooterModalSummary">{activeFooterContent.summary}</p>
            <div className="authFooterModalSections">
              {activeFooterContent.sections.map((section) => (
                <section key={section.heading} className="authFooterModalSection">
                  <h3>{section.heading}</h3>
                  {section.body.map((line) => <p key={line}>{line}</p>)}
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
