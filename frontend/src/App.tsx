import React from "react";
import { AppProvider } from "./AppContext";
import { MainApp } from "./MainApp";
import "./index.css";
import "./login-page.css";

// Re-export all types from centralized types module
export type {
  User,
  Contact,
  Chat,
  Message,
  MessageType,
  MessageReceipt,
  ReceiptStatus,
  CallLog,
  TypingEvent,
  AuthTab,
  PhoneOtpForm,
  Section,
  MobileContactsView,
  IncomingRequest,
  ConnectionRecord,
  ConnectionRecordInput,
  ComposerMedia,
  DetailUser,
  AppLockConfig,
  UpdateNotice,
  ChatNotification,
  NotificationEntry,
} from "./types";

// Re-export UI components
export { Avatar, BrandMark } from "./UIComponents";

// Re-export utilities
export {
  tone,
  playNotification,
  showDesktopNotification,
  fmtTime,
  fmtDate,
  initials,
  lastSeen,
  readFileAsDataUrl,
  messageTypeFromMime,
  parseCsv,
  api,
} from "./utils";

/**
 * App - Root component that sets up context and renders main application
 * Provides AppContext for state management to all child components
 */
export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
