import hellotoLogo from "./assets/helloto-logo.svg";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type Section = "chats" | "contacts" | "updates" | "calls" | "account";
type AuthTab = "password" | "email-otp" | "phone-otp";
type PhoneOtpForm = { phoneNumber: string; code: string };

type User = {
  id: string;
  username: string;
  name: string;
  phoneNumber: string | null;
  phoneVerified?: boolean;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  bio: string;
  statusText: string;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};
type Contact = { id: string; name: string; phoneNumber: string | null; email: string | null; avatarUrl: string | null; registeredUser: User | null };
type Chat = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage: null | { text: string; createdAt: string; senderId: string };
  peer: User | null;
  isGroup: boolean;
  avatarUrl: string | null;
  members: User[];
  unreadCount: number;
};
type ReceiptStatus = "sent" | "delivered" | "read";
type MessageReceipt = { sent: boolean; deliveredTo: number; readBy: number; status: ReceiptStatus };
type MessageType = "text" | "image" | "video" | "file" | "audio";
type MobileContactsView = "people" | "add" | "discover" | "groups";
type Message = { id: string; chatId: string; text: string; type: MessageType; mediaUrl?: string | null; mediaName?: string | null; mediaMime?: string | null; createdAt: string; sender: User; receipt?: MessageReceipt };
type CallLog = {
  id: string;
  chatId: string;
  user: User;
  mode: "voice" | "video";
  direction: "incoming" | "outgoing";
  status: "ringing" | "missed" | "declined" | "completed";
  createdAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
};
type TypingEvent = { chatId: string; userId: string; isTyping: boolean };

function tone(freq: number, duration = 0.13) {
  try {
    const windowWithPrefix = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || windowWithPrefix.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.value = 0.11;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close().catch(() => null);
  } catch {
    // ignore audio errors
  }
}

function playNotification(type: "otp" | "sent" | "received") {
  if (type === "otp") {
    tone(720, 0.14);
    setTimeout(() => tone(820, 0.1), 160);
    return;
  }
  if (type === "sent") {
    tone(940, 0.08);
    return;
  }
  if (type === "received") {
    tone(520, 0.12);
    setTimeout(() => tone(620, 0.08), 120);
  }
}

async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  return Notification.requestPermission();
}

async function showDesktopNotification(title: string, body: string) {
  try {
    const permission = await ensureNotificationPermission();
    if (permission !== "granted") return;
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // ignore notification errors
  }
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const lastSeen = (user: User | null) => !user ? "" : user.isOnline ? "online" : user.lastSeenAt ? `last seen ${fmtDate(user.lastSeenAt)}` : "offline";

function BrandMark() {
  return (
    <div className="waMark" aria-label="HelloToo logo">
      <img className="waMarkImage" src={hellotoLogo} alt="HelloToo logo" />
    </div>
  );
}

function Avatar({ name, avatarUrl, size = 46, group = false }: { name: string; avatarUrl?: string | null; size?: number; group?: boolean }) {
  const sizeClass = `avatarSize${Math.max(24, Math.min(96, size))}`;
  const baseClass = group ? "avatar groupAvatar" : "avatar";
  if (avatarUrl) {
    return <img className={`${baseClass} ${sizeClass}`} src={avatarUrl} alt={name} />;
  }
  return <div className={`${baseClass} avatarFallback ${sizeClass}`}>{group ? "GR" : initials(name)}</div>;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function messageTypeFromMime(mime: string): MessageType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((v) => v.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((v) => v.trim());
    const get = (name: string) => cells[header.indexOf(name)] || "";
    return { name: get("name"), phoneNumber: get("phonenumber") || get("phone"), email: get("email"), avatarUrl: get("avatarurl") || "" };
  }).filter((row) => row.name || row.phoneNumber || row.email);
}

import React from "react";
import { AppProvider } from "./AppContext";
import { MainApp } from "./MainApp";
import "./index.css";
import "./login-page.css";

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

// Export all types/utils from original for panes
export type {
  Section,
  AuthTab,
  PhoneOtpForm,
  User,
  Contact,
  Chat,
  ReceiptStatus,
  MessageReceipt,
  MessageType,
  MobileContactsView,
  Message,
  CallLog,
  TypingEvent
};
export {
  BrandMark,
  Avatar,
  tone,
  playNotification,
  showDesktopNotification,
  fmtTime,
  fmtDate,
  initials,
  lastSeen,
  readFileAsDataUrl,
  messageTypeFromMime,
  parseCsv
};
