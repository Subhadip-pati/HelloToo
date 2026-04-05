import { type ReactNode, useState } from "react";

type AuthTab = "password" | "email-otp" | "phone-otp";
type LoginMode = "login" | "register";

type RegisterFormType = {
  name: string;
  phoneNumber: string;
  email: string;
  password: string;
  avatarUrl: string;
  bio: string;
  statusText: string;
};

export type LoginPageProps = {
  mode: LoginMode;
  setMode: (mode: LoginMode) => void;
  authTab: AuthTab;
  setAuthTab: (tab: AuthTab) => void;
  loginForm: { identifier: string; password: string };
  setLoginForm: (form: { identifier: string; password: string }) => void;
  otpEmailForm: { email: string; code: string };
  setOtpEmailForm: (form: { email: string; code: string }) => void;
  otpPhoneForm: { phoneNumber: string; code: string };
  setOtpPhoneForm: (form: { phoneNumber: string; code: string }) => void;
  registerForm: RegisterFormType;
  setRegisterForm: (form: RegisterFormType) => void;
  devOtpPreview: string;
  setDevOtpPreview: (value: string) => void;
  info: string;
  error: string;
  submitPasswordLogin: () => Promise<void>;
  submitRegister: () => Promise<void>;
  requestOtp: (purpose: "verify-email" | "login") => Promise<void>;
  requestPhoneOtp: (purpose: "verify-phone" | "login-phone") => Promise<void>;
  loginWithEmailOtp: () => Promise<void>;
  loginWithPhoneOtp: () => Promise<void>;
  onPickImage: (file: File | undefined, target: "register") => Promise<void>;
  runAction: (action: () => Promise<void>) => void;
  isMobile?: boolean;
  BrandMark: () => ReactNode;
  Avatar: (props: {
    name: string;
    avatarUrl?: string | null;
    size?: number;
    group?: boolean;
  }) => ReactNode;
  theme: "dark" | "light";
  toggleTheme: () => void;
  updateNotice: { currentBuildId: string; latestBuildId: string } | null;
  applyAvailableUpdate: () => void;
  dismissAvailableUpdate: () => void;
};

const featureCards = [
  {
    title: "Simple login",
    body: "Phone OTP is ready first, with email OTP and password still available when you need them.",
    accent: "Easy access",
  },
  {
    title: "HelloToo branding",
    body: "One clean sign-in screen for your local messaging website and desktop view.",
    accent: "Clean identity",
  },
  {
    title: "Light and dark",
    body: "Switch between day and night mode from the login screen and inside the app.",
    accent: "Theme ready",
  },
];

const authMoments = [
  "Fast sign in from one screen",
  "Clean setup for desktop and mobile",
  "Simple account flow with OTP support",
];

export default function LoginPage(props: LoginPageProps) {
  const {
    mode,
    setMode,
    authTab,
    setAuthTab,
    loginForm,
    setLoginForm,
    otpEmailForm,
    setOtpEmailForm,
    otpPhoneForm,
    setOtpPhoneForm,
    registerForm,
    setRegisterForm,
    devOtpPreview,
    setDevOtpPreview,
    info,
    error,
    submitPasswordLogin,
    submitRegister,
    requestOtp,
    requestPhoneOtp,
    loginWithEmailOtp,
    loginWithPhoneOtp,
    onPickImage,
    runAction,
    isMobile = false,
    BrandMark,
    Avatar,
    theme,
    toggleTheme,
    updateNotice,
    applyAvailableUpdate,
    dismissAvailableUpdate,
  } = props;

  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);

  const copyOtp = async () => {
    if (!devOtpPreview) return;
    try {
      await navigator.clipboard.writeText(devOtpPreview);
      setOtpCopied(true);
      window.setTimeout(() => setOtpCopied(false), 1500);
    } catch {
      setOtpCopied(false);
    }
  };

  return (
    <div className={`authShell ${isMobile ? "authMobile" : "authDesktop"}`}>
      {(devOtpPreview || info || error) && (
        <div className="floatingBannerStack authFloatingBannerStack">
          {devOtpPreview ? (
            <div className="floatingBanner infoFloat">
              <span className="floatingBannerText">OTP: <strong>{devOtpPreview}</strong>{otpCopied ? " copied" : ""}</span>
              <div className="floatingBannerActions">
                <button type="button" className="floatingBannerActionBtn" onClick={() => void copyOtp()}>
                  Copy
                </button>
                <button type="button" className="floatingBannerClose" onClick={() => setDevOtpPreview("")} aria-label="Close OTP notification">
                  x
                </button>
              </div>
            </div>
          ) : null}
          {info ? <div className="floatingBanner infoFloat"><span className="floatingBannerText">{info}</span></div> : null}
          {error ? <div className="floatingBanner errorFloat"><span className="floatingBannerText">{error}</span></div> : null}
        </div>
      )}
      {updateNotice ? (
        <div className="updatePromptCard">
          <div className="cardText">
            <strong>New update available</strong>
            <span>A newer HelloToo version is ready for all users. Update now to load the changes, or cut it to keep running the current version.</span>
          </div>
          <div className="floatingBannerActions">
            <button type="button" className="floatingBannerActionBtn" onClick={applyAvailableUpdate}>
              Update now
            </button>
            <button type="button" className="floatingBannerClose" onClick={dismissAvailableUpdate} aria-label="Close update notice">
              x
            </button>
          </div>
        </div>
      ) : null}
      <div className="authOverlay" />
      <div className="authPanel phoneCard authLayout">
        <div className="authAmbient authAmbientOne" />
        <div className="authAmbient authAmbientTwo" />
        <section className="authHeroPanel authHeroBoard">
          <div className="brandSection">
            <BrandMark />
            <div>
              <div className="authCaption">Private messaging for your local network</div>
              <h1 className="heroTitle">Simple access to HelloToo</h1>
              <p className="heroDescription">
                Login or create your account from one clean screen built for both desktop and mobile.
              </p>
            </div>
            <button type="button" className="ghostBtn authThemeToggle" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <div className="authHeroSpotlight">
            <div className="authHeroSpotlightText">
              <span className="authSectionLabel">New Session Flow</span>
              <strong>Cleaner login, faster entry</strong>
              <p>
                Start with phone OTP by default, or switch to email OTP or password when you prefer another method.
              </p>
            </div>
            <div className="authPulseStack" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="authBadgeRow">
            <span className="authBadge">Mobile ready</span>
            <span className="authBadge">OTP support</span>
            <span className="authBadge">Profile setup</span>
          </div>

          <div className="authStats">
            <div className="authStat">
              <strong>3</strong>
              <span>sign-in methods</span>
            </div>
            <div className="authStat">
              <strong>1</strong>
              <span>unified workspace</span>
            </div>
            <div className="authStat">
              <strong>24/7</strong>
              <span>local access</span>
            </div>
          </div>

          <div className="authShowcase">
            {featureCards.map((card) => (
              <div key={card.title} className="showcaseCard">
                <em>{card.accent}</em>
                <strong>{card.title}</strong>
                <span>{card.body}</span>
              </div>
            ))}
          </div>

          <div className="authTrustList">
            {authMoments.map((item) => (
              <div key={item} className="authTrustItem">
                <span className="authTrustDot" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="authGlass authWorkspace">
          <div className="authWorkspaceTop">
            <div>
              <span className="authSectionLabel">Access</span>
              <h2>{mode === "login" ? "Login to HelloToo" : "Create your HelloToo profile"}</h2>
            </div>
            <div className="tabRow tabRowPrimary">
              <button
                className={mode === "login" ? "ghostBtn activeTab" : "ghostBtn"}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                className={mode === "register" ? "ghostBtn activeTab" : "ghostBtn"}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>
          </div>

          <div className="authWorkspaceRail">
            <div className="authWorkspaceBadge">
              <span className="authWorkspaceBadgeLabel">Experience</span>
              <strong>{mode === "login" ? "Quick sign in" : "Simple account setup"}</strong>
            </div>
            <div className="authWorkspaceMiniStats">
              <div>
                <strong>{mode === "login" ? "01" : "02"}</strong>
                <span>{mode === "login" ? "secure return path" : "guided setup flow"}</span>
              </div>
              <div>
                <strong>{authTab === "password" ? "PW" : authTab === "email-otp" ? "EM" : "PH"}</strong>
                <span>{mode === "login" ? "active access method" : "profile completion mode"}</span>
              </div>
            </div>
          </div>

          {mode === "login" && (
            <div className="authSection">
              <div className="tabRow tabRowSecondary authMethodTabs">
                <button
                  className={authTab === "password" ? "ghostBtn activeTab" : "ghostBtn"}
                  onClick={() => setAuthTab("password")}
                >
                  Password
                </button>
                <button
                  className={authTab === "email-otp" ? "ghostBtn activeTab" : "ghostBtn"}
                  onClick={() => setAuthTab("email-otp")}
                >
                  Email OTP
                </button>
                <button
                  className={authTab === "phone-otp" ? "ghostBtn activeTab" : "ghostBtn"}
                  onClick={() => setAuthTab("phone-otp")}
                >
                  Phone OTP
                </button>
              </div>

              {authTab === "password" && (
                <div className="authFormCard">
                  <div className="authFormHeader">
                    <strong>Password login</strong>
                    <span>Use your phone number or email together with your password.</span>
                  </div>
                  <div className="formGrid">
                    <label className={`field ${focusedField === "identifier" ? "focused" : ""}`}>
                      <span>Phone or email</span>
                      <input
                        className="input"
                        value={loginForm.identifier}
                        onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                        onFocus={() => setFocusedField("identifier")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="+91 98765 43210 or name@example.com"
                      />
                    </label>
                    <label className={`field ${focusedField === "password" ? "focused" : ""}`}>
                      <span>Password</span>
                      <div className="passwordInputWrapper">
                        <input
                          className="input"
                          type={showPassword ? "text" : "password"}
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          onFocus={() => setFocusedField("password")}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Enter your password"
                        />
                        <button
                          type="button"
                          className="passwordToggle"
                          onClick={() => setShowPassword((prev) => !prev)}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </label>
                    <button className="primaryBtn fullWidth" onClick={() => runAction(submitPasswordLogin)}>
                      Login
                    </button>
                  </div>
                </div>
              )}

              {authTab === "email-otp" && (
                <div className="authFormCard">
                  <div className="authFormHeader">
                    <strong>Email OTP login</strong>
                    <span>Send a code to your email and login without a password.</span>
                  </div>
                  <div className="formGrid">
                    <label className={`field ${focusedField === "email" ? "focused" : ""}`}>
                      <span>Email address</span>
                      <input
                        className="input"
                        value={otpEmailForm.email}
                        onChange={(e) => setOtpEmailForm({ ...otpEmailForm, email: e.target.value })}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="name@example.com"
                      />
                    </label>
                    <button className="ghostBtn requestOtpBtn" onClick={() => runAction(() => requestOtp("login"))}>
                      Send code
                    </button>
                    <label className={`field ${focusedField === "emailCode" ? "focused" : ""}`}>
                      <span>OTP code</span>
                      <input
                        className="input otpInput"
                        value={otpEmailForm.code}
                        onChange={(e) => setOtpEmailForm({ ...otpEmailForm, code: e.target.value.slice(0, 6) })}
                        onFocus={() => setFocusedField("emailCode")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="000000"
                        maxLength={6}
                      />
                    </label>
                    <button className="primaryBtn fullWidth" onClick={() => runAction(loginWithEmailOtp)}>
                      Login with email OTP
                    </button>
                  </div>
                </div>
              )}

              {authTab === "phone-otp" && (
                <div className="authFormCard">
                  <div className="authFormHeader">
                    <strong>Phone OTP login</strong>
                    <span>Send a code to your phone number and continue quickly.</span>
                  </div>
                  <div className="formGrid">
                    <label className={`field ${focusedField === "phone" ? "focused" : ""}`}>
                      <span>Phone number</span>
                      <input
                        className="input"
                        value={otpPhoneForm.phoneNumber}
                        onChange={(e) => setOtpPhoneForm({ ...otpPhoneForm, phoneNumber: e.target.value })}
                        onFocus={() => setFocusedField("phone")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="+91 98765 43210"
                      />
                    </label>
                    <button className="ghostBtn requestOtpBtn" onClick={() => runAction(() => requestPhoneOtp("login-phone"))}>
                      Send code
                    </button>
                    <label className={`field ${focusedField === "phoneCode" ? "focused" : ""}`}>
                      <span>OTP code</span>
                      <input
                        className="input otpInput"
                        value={otpPhoneForm.code}
                        onChange={(e) => setOtpPhoneForm({ ...otpPhoneForm, code: e.target.value.slice(0, 6) })}
                        onFocus={() => setFocusedField("phoneCode")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="000000"
                        maxLength={6}
                      />
                    </label>
                    <button className="primaryBtn fullWidth" onClick={() => runAction(loginWithPhoneOtp)}>
                      Login with phone OTP
                    </button>
                  </div>
                </div>
              )}

              <div className="authHint">
                Choose the easiest method for you. Phone OTP is selected first to keep login simple.
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="authSection">
              <div className="authFormCard">
                <div className="authFormHeader">
                    <strong>Create your account</strong>
                    <span>Add your basic details now so HelloToo is ready as soon as you enter.</span>
                </div>
                <div className="formGrid twoCol">
                  <label className={`field ${focusedField === "name" ? "focused" : ""}`}>
                    <span>Name</span>
                    <input
                      className="input"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Your full name"
                    />
                  </label>

                  <label className={`field ${focusedField === "registerPassword" ? "focused" : ""}`}>
                    <span>Password</span>
                    <div className="passwordInputWrapper">
                      <input
                        className="input"
                        type={showRegisterPassword ? "text" : "password"}
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        onFocus={() => setFocusedField("registerPassword")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Create a secure password"
                      />
                      <button
                        type="button"
                        className="passwordToggle"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                      >
                        {showRegisterPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  <label className={`field ${focusedField === "registerPhone" ? "focused" : ""}`}>
                    <span>Phone number</span>
                    <input
                      className="input"
                      value={registerForm.phoneNumber}
                      onChange={(e) => setRegisterForm({ ...registerForm, phoneNumber: e.target.value })}
                      onFocus={() => setFocusedField("registerPhone")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="+91 98765 43210"
                    />
                  </label>

                  <label className={`field ${focusedField === "registerEmail" ? "focused" : ""}`}>
                    <span>Email</span>
                    <input
                      className="input"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      onFocus={() => setFocusedField("registerEmail")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="name@example.com"
                    />
                  </label>

                  <label className={`field ${focusedField === "status" ? "focused" : ""}`}>
                    <span>Status</span>
                    <input
                      className="input"
                      value={registerForm.statusText}
                      onChange={(e) => setRegisterForm({ ...registerForm, statusText: e.target.value })}
                      onFocus={() => setFocusedField("status")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Available and ready to chat"
                    />
                  </label>

                  <label className={`field ${focusedField === "bio" ? "focused" : ""}`}>
                    <span>Bio</span>
                    <input
                      className="input"
                      value={registerForm.bio}
                      onChange={(e) => setRegisterForm({ ...registerForm, bio: e.target.value })}
                      onFocus={() => setFocusedField("bio")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Tell people a little about you"
                    />
                  </label>

                  <label className="field fileUploadField">
                    <span>Profile photo</span>
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => runAction(() => onPickImage(e.target.files?.[0], "register"))}
                    />
                  </label>

                  <div className="field">
                    <span>Preview</span>
                    <div className="previewBox">
                      {registerForm.avatarUrl ? (
                        <Avatar name={registerForm.name || "You"} avatarUrl={registerForm.avatarUrl} size={78} />
                      ) : (
                        <div className="noPhotoPlaceholder">
                          <strong>Photo preview</strong>
                          <span>Add an image to see your profile card here.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="authProfilePreview spanTwo">
                    <div className="authProfilePreviewAvatar">
                      <Avatar name={registerForm.name || "You"} avatarUrl={registerForm.avatarUrl} size={46} />
                    </div>
                    <div className="authProfilePreviewBody">
                      <strong>{registerForm.name || "Your profile card"}</strong>
                      <span>{registerForm.statusText || "Available and ready to chat"}</span>
                      <p>{registerForm.bio || "Add a short bio to make your profile feel complete before you join conversations."}</p>
                    </div>
                  </div>

                  <button className="primaryBtn fullWidth spanTwo registerSubmitBtn" onClick={() => runAction(submitRegister)}>
                    Create account
                  </button>

                  <div className="authHint spanTwo">
                    Your profile is the foundation for contacts, chats, and presence across the app.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="authFooterSection">
            <div className="authFooterNote">Best results come when this device and your server are on the same local network.</div>
            <div className="authFooterNote authFooterCopyright">&copy; 2026 HelloToo. Privacy first. Locally hosted.</div>
          </div>
        </section>

      </div>
    </div>
  );
}
