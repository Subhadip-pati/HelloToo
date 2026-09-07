import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_NAME, getInitialAdminAccountState } from "./adminConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistDir = (() => {
  const candidates = [
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(__dirname, "../../../frontend/dist"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
})();

dotenv.config();
[
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
].forEach((envPath) => {
  dotenv.config({ path: envPath, override: false });
});

const env = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("file:./prisma/helloto.db"),
  JWT_SECRET: z.string().min(16).default("helloto-dev-secret-2026"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://127.0.0.1:5173,http://10.253.170.34:5173"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  OTP_REAL_DELIVERY_ONLY: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(false),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
}).parse(process.env);

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: env.DATABASE_URL }),
});
const prismaAny = prisma as any;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET not set. Using the built-in development secret for local use only.");
}

const allowedOrigins = env.CORS_ORIGIN.split(",").map((v) => v.trim()).filter(Boolean);

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return true;
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url.hostname)) return true;
    // Allow common local machine hostnames such as DESKTOP-ABC123 or *.local.
    if (!url.hostname.includes(".") || url.hostname.endsWith(".local")) return true;
    return false;
  } catch {
    return false;
  }
}
const onlineUserConnections = new Map<string, number>();
const authRateLimitStore = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_STATUS = "Hey there! I am using DipsChat.";
const OTP_MINUTES = 10;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 40;
type EmailOtpPurpose =
  | "verify-email"
  | "login"
  | "reset-password"
  | "reset-pin"
  | "admin-login"
  | "admin-reset-password"
  | "admin-reset-pin"
  | "admin-change-credentials"
  | "admin-change-email"
  | "admin-change-phone"
  | "admin-forgot-password";
type PhoneOtpPurpose = "verify-phone" | "login-phone" | "reset-password-phone" | "reset-pin-phone" | "admin-change-phone";
type AdminAccountStore = {
  id: "primary-admin";
  name: string;
  email: string;
  phoneNumber: string | null;
  passwordHash: string;
  pinHash: string | null;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
};

const adminAccountFileSchema = z.object({
  id: z.literal("primary-admin"),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phoneNumber: z.union([z.string().trim().min(7).max(20), z.literal(""), z.null()]).optional(),
  passwordHash: z.string().min(20),
  pinHash: z.string().min(20).nullable(),
  sessionVersion: z.coerce.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
  mustChangePassword: z.boolean().optional().default(true),
});

const imageValue = z.string().trim().refine((value) => /^https?:\/\//.test(value) || /^data:image\/[a-zA-Z+.-]+;base64,/.test(value), {
  message: "Avatar must be a valid URL or uploaded image",
});

const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  phoneNumber: true,
  phoneVerified: true,
  email: true,
  emailVerified: true,
  avatarUrl: true,
  bio: true,
  statusText: true,
  lastSeenAt: true,
} as const;

const adminUserSummarySelect = {
  ...publicUserSelect,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  isBlocked: true,
  suspendedUntil: true,
  deletedAt: true,
} as const;

const authUserStateSelect = {
  ...publicUserSelect,
  isBlocked: true,
  suspendedUntil: true,
  deletedAt: true,
} as const;

const accountStateSelect = {
  id: true,
  username: true,
  email: true,
  phoneNumber: true,
  isBlocked: true,
  suspendedUntil: true,
  deletedAt: true,
} as const;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  password: z.string().min(6).max(200),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  email: z.string().trim().email().max(120).optional(),
  avatarUrl: z.union([imageValue, z.literal("")]).optional(),
  bio: z.string().trim().max(160).optional(),
  statusText: z.string().trim().max(80).optional(),
}).superRefine((value, ctx) => {
  if (!value.phoneNumber && !value.email) {
    ctx.addIssue({ code: "custom", message: "Mobile number or email is required", path: ["phoneNumber"] });
  }
});

const passwordLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
});

const otpRequestSchema = z.object({
  email: z.string().trim().email(),
  purpose: z.enum(["verify-email", "login", "reset-password", "reset-pin"]),
});

const phoneOtpRequestSchema = z.object({
  phoneNumber: z.string().trim().min(7).max(20),
  purpose: z.enum(["verify-phone", "login-phone", "reset-password-phone", "reset-pin-phone"]),
});

const otpVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});

const phoneOtpVerifySchema = z.object({
  phoneNumber: z.string().trim().min(7).max(20),
  code: z.string().trim().length(6),
});

const registerOtpRequestSchema = z.object({
  email: z.string().trim().email().max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  username: z.string().trim().min(2).max(30).optional(),
  name: z.string().trim().min(2).max(50),
}).superRefine((value, ctx) => {
  if (!value.email && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Mobile number or email is required", path: ["email"] });
  }
});

const registerOtpVerifySchema = z.object({
  email: z.string().trim().email().max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  emailOtp: z.string().trim().length(6).optional(),
  phoneOtp: z.string().trim().length(6).optional(),
  password: z.string().min(6).max(200),
  username: z.string().trim().min(2).max(30).optional(),
  name: z.string().trim().min(2).max(50),
  avatarUrl: z.union([imageValue, z.literal("")]).optional(),
  bio: z.string().trim().max(160).optional(),
  statusText: z.string().trim().max(80).optional(),
}).superRefine((value, ctx) => {
  if (!value.email && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Mobile number or email is required", path: ["email"] });
  }
  if (value.emailOtp && !value.email) {
    ctx.addIssue({ code: "custom", message: "Gmail is required for Gmail OTP", path: ["email"] });
  }
  if (value.phoneOtp && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Mobile number is required for mobile OTP", path: ["phoneNumber"] });
  }
  if (!value.emailOtp && !value.phoneOtp) {
    ctx.addIssue({ code: "custom", message: "Provide at least one OTP code", path: ["emailOtp"] });
  }
});

const loginOtpRequestSchema = z.object({
  email: z.string().trim().email().max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
}).superRefine((value, ctx) => {
  if (!value.email && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Enter either a Gmail or mobile number", path: ["email"] });
  }
});

const loginOtpVerifySchema = z.object({
  email: z.string().trim().email().max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  emailOtp: z.string().trim().length(6).optional(),
  phoneOtp: z.string().trim().length(6).optional(),
}).superRefine((value, ctx) => {
  if (!value.email && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Enter either a Gmail or mobile number", path: ["email"] });
  }
  if (value.emailOtp && !value.email) {
    ctx.addIssue({ code: "custom", message: "Gmail is required for Gmail OTP", path: ["email"] });
  }
  if (value.phoneOtp && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "Mobile number is required for mobile OTP", path: ["phoneNumber"] });
  }
  if (!value.emailOtp && !value.phoneOtp) {
    ctx.addIssue({ code: "custom", message: "Provide at least one OTP code", path: ["emailOtp"] });
  }
});

const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().length(6),
  newPassword: z.string().min(6).max(200),
});

const resetPinSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().length(6),
  newPin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
});

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  secret: z.string().trim().min(1).max(200),
});

const adminPinLoginSchema = z.object({
  email: z.string().trim().email(),
  pin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
});

const adminOtpRequestSchema = z.object({
  email: z.string().trim().email(),
  purpose: z.enum(["login", "reset-password", "reset-pin"]),
});

const adminOtpVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});

const adminResetPasswordSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
  newPassword: z.string().min(6).max(200),
});

const adminResetPinSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
  newPin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
});

const adminAccountProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phoneNumber: z.union([z.string().trim().min(7).max(20), z.literal("")]).optional(),
});

const adminCredentialOtpRequestSchema = z.object({
  oldPassword: z.string().min(1).max(200),
});

const adminCredentialsUpdateSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  code: z.string().trim().length(6),
  newEmail: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  newPassword: z.union([z.string().min(6).max(200), z.literal("")]).optional(),
  newPhoneNumber: z.union([z.string().trim().min(1).max(20), z.literal("")]).optional(),
}).superRefine((value, ctx) => {
  if (!value.newEmail && !value.newPassword && !value.newPhoneNumber) {
    ctx.addIssue({ code: "custom", message: "Enter a new Gmail, password, or mobile number", path: ["newEmail"] });
  }
});

const adminPinUpdateSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
});

const userReportSchema = z.object({
  targetUserId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(120),
  detail: z.string().trim().max(500).optional(),
});

const adminNoticeSchema = z.object({
  title: z.string().trim().min(3).max(120),
  message: z.string().trim().min(3).max(1000),
  expiresAt: z.string().datetime().optional(),
});

const adminActionSchema = z.object({
  action: z.enum(["block", "unblock", "suspend", "restore", "delete-permanently"]),
  days: z.coerce.number().int().min(1).max(365).optional(),
  note: z.string().trim().max(500).optional(),
});

const adminReportReviewSchema = z.object({
  status: z.enum(["reviewed", "actioned", "dismissed"]),
  actionNote: z.string().trim().max(500).optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(50),
  phoneNumber: z.union([z.string().trim().min(7).max(20), z.literal("")]).optional(),
  email: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  avatarUrl: z.union([imageValue, z.literal("")]).optional(),
  bio: z.string().trim().max(160).optional(),
  statusText: z.string().trim().max(80).optional(),
}).superRefine((value, ctx) => {
  if (!value.phoneNumber && !value.email) {
    ctx.addIssue({ code: "custom", message: "Keep at least one login method: mobile number or email", path: ["phoneNumber"] });
  }
});

const userPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

const contactSchema = z.object({
  name: z.string().trim().min(2).max(50),
  phoneNumber: z.union([z.string().trim().min(7).max(20), z.literal("")]).optional(),
  email: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  avatarUrl: z.union([imageValue, z.literal("")]).optional(),
}).superRefine((value, ctx) => {
  if (!value.phoneNumber && !value.email) {
    ctx.addIssue({ code: "custom", message: "Contact needs a mobile number or email", path: ["phoneNumber"] });
  }
});

const contactsImportSchema = z.object({
  contacts: z.array(contactSchema).min(1).max(500),
});

const groupSchema = z.object({
  title: z.string().trim().min(3).max(60),
  avatarUrl: z.union([imageValue, z.literal("")]).optional(),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
});

const connectionRequestSchema = z.object({
  targetUserId: z.string().min(1),
  aliasName: z.string().trim().max(50).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
});

const connectionDecisionSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

const messageTypeSchema = z.enum(["text", "image", "video", "file", "audio"]);
const messagePayloadSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().trim().max(2000).optional(),
  type: messageTypeSchema.default("text"),
  mediaUrl: z.union([imageValue, z.string().trim().startsWith("data:"), z.literal("")]).optional(),
  mediaName: z.string().trim().max(200).optional(),
  mediaMime: z.string().trim().max(120).optional(),
}).superRefine((value, ctx) => {
  if (!value.text && !value.mediaUrl) {
    ctx.addIssue({ code: "custom", message: "Message text or media is required", path: ["text"] });
  }
});

type JwtPayload = { sub: string; username: string; role?: "user" | "admin"; email?: string; adminVersion?: number };
type DbUser = {
  id: string;
  username: string;
  name: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  bio: string;
  statusText: string;
  lastSeenAt: Date | null;
};
type AuthedRequest = express.Request & { user: { id: string; username: string; role: "user" | "admin"; email?: string } };
type StatusRow = {
  id: string;
  userId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  linkUrl: string | null;
  createdAt: Date;
};

const adminAccountFile = (() => {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "backend"
    ? path.join(cwd, "admin-account.json")
    : path.join(cwd, "backend", "admin-account.json");
})();
let adminAccountState: AdminAccountStore | null = null;

const smtpHost = env.SMTP_HOST || (env.SMTP_USER && env.SMTP_PASS ? "smtp.gmail.com" : "");
const smtpPort = env.SMTP_PORT || (smtpHost === "smtp.gmail.com" ? 465 : undefined);
const smtpFrom = env.SMTP_FROM || env.SMTP_USER;

const transporter = smtpHost && smtpPort && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

const twilioConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

function requireRealOtpDelivery(channel: "email" | "sms") {
  if (!env.OTP_REAL_DELIVERY_ONLY) return;
  throw new Error(
    channel === "email"
      ? "Real email OTP delivery is required, but SMTP is not configured or delivery failed. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM."
      : "Real mobile OTP delivery is required, but SMS is not configured or delivery failed. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
  );
}

function signToken(payload: JwtPayload) {
  return jwt.sign({ ...payload, role: payload.role ?? "user" }, env.JWT_SECRET, { expiresIn: "7d" });
}

function normalizeAdminEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeAdminPhone(value: string | null | undefined) {
  return normalizePhone(value);
}

function getAdminAccountOrThrow() {
  if (!adminAccountState) {
    throw new Error("Admin account is not initialized");
  }
  return adminAccountState;
}

function getAdminPublicProfile(account = getAdminAccountOrThrow()) {
  return {
    email: account.email,
    phoneNumber: account.phoneNumber,
    name: account.name,
    hasPin: Boolean(account.pinHash),
    mustChangePassword: Boolean(account.mustChangePassword),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt,
  };
}

async function saveAdminAccount(next: AdminAccountStore) {
  await mkdir(path.dirname(adminAccountFile), { recursive: true });
  await writeFile(adminAccountFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  adminAccountState = next;
  return next;
}

async function createDefaultAdminAccount() {
  return saveAdminAccount(getInitialAdminAccountState(await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10)));
}

async function ensureAdminAccount() {
  if (adminAccountState) return adminAccountState;
  try {
    const raw = await readFile(adminAccountFile, "utf8");
    const parsed = adminAccountFileSchema.parse(JSON.parse(raw));
    adminAccountState = {
      ...parsed,
      mustChangePassword: parsed.mustChangePassword ?? true,
      phoneNumber: normalizeAdminPhone(parsed.phoneNumber ?? null),
    };
    return adminAccountState;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code ?? "") : "";
    if (code === "ENOENT") {
      console.log(`Admin account file not found. Creating the default admin account at ${adminAccountFile}.`);
    } else {
      console.warn("Admin account file was invalid. Recreating the default admin account.", error);
    }
    return createDefaultAdminAccount();
  }
}

async function updateAdminAccount(
  mutator: (current: AdminAccountStore) => Promise<AdminAccountStore> | AdminAccountStore,
  options?: { touchUpdatedAt?: boolean },
) {
  const current = getAdminAccountOrThrow();
  const nextBase = await mutator({ ...current });
  const touchUpdatedAt = options?.touchUpdatedAt ?? true;
  const next = touchUpdatedAt
    ? { ...nextBase, updatedAt: new Date().toISOString() }
    : nextBase;
  return saveAdminAccount(next);
}

async function recordAdminLogin() {
  const current = getAdminAccountOrThrow();
  const now = new Date().toISOString();
  await saveAdminAccount({
    ...current,
    lastLoginAt: now,
  });
}

function signAdminToken(account = getAdminAccountOrThrow()) {
  return signToken({
    sub: "admin",
    username: "admin",
    role: "admin",
    email: account.email,
    adminVersion: account.sessionVersion,
  });
}

function isReservedAdminEmail(value: string | null | undefined) {
  const normalized = normalizeAdminEmail(value);
  if (!normalized) return false;
  return normalized === normalizeAdminEmail(adminAccountState?.email ?? DEFAULT_ADMIN_EMAIL);
}

async function matchesAdminPassword(password: string, account = getAdminAccountOrThrow()) {
  if (await bcrypt.compare(password, account.passwordHash)) return true;
  return Boolean(
    account.mustChangePassword
      && normalizeAdminEmail(account.email) === DEFAULT_ADMIN_EMAIL
      && password === DEFAULT_ADMIN_PASSWORD,
  );
}

async function matchesAdminLoginSecret(secret: string, account = getAdminAccountOrThrow()) {
  if (await bcrypt.compare(secret, account.passwordHash)) {
    return true;
  }
  if (account.pinHash && await bcrypt.compare(secret, account.pinHash)) {
    return true;
  }
  return false;
}

await ensureAdminAccount();

async function ensurePhoneOtpTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PhoneOtp (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT,
      phoneNumber TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expiresAt DATETIME NOT NULL,
      consumedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS PhoneOtp_phoneNumber_purpose_expiresAt_idx ON PhoneOtp(phoneNumber, purpose, expiresAt)");
}

await ensurePhoneOtpTable();

function getUserAccessError(user: { isBlocked: boolean; suspendedUntil: Date | null; deletedAt: Date | null }) {
  if (user.deletedAt) return "This account has been permanently deleted by admin.";
  if (user.isBlocked) return "This account has been blocked by admin.";
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    return `This account is suspended until ${user.suspendedUntil.toISOString()}.`;
  }
  return null;
}

async function createUserAuditEvent(
  userId: string,
  kind: string,
  detail: string,
  actorType: "user" | "admin" | "system" = "system",
  actorId?: string,
) {
  await prisma.userAuditEvent.create({
    data: {
      userId,
      kind,
      detail,
      actorType,
      actorId: actorId ?? null,
    },
  }).catch(() => null);
}

async function recordUserLogin(userId: string, detail: string) {
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: now, lastSeenAt: now },
  }).catch(() => null);
  await createUserAuditEvent(userId, "login", detail, "user", userId);
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) return null;
  if (digitsOnly.length === 10) return `+91${digitsOnly}`;
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) return `+${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) return `+91${digitsOnly.slice(1)}`;
  return `+91${digitsOnly}`;
}

function makeUsername(name: string, phoneNumber?: string | null, email?: string | null) {
  const base = (phoneNumber ?? email?.split("@")[0] ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${(base || "user").slice(0, 18)}${Math.random().toString(36).slice(2, 8)}`;
}

function toPublicUser(user: DbUser) {
  return { ...user, name: user.name || user.username, isOnline: (onlineUserConnections.get(user.id) ?? 0) > 0 };
}

function toAdminUserView<T extends { id: string; username: string; name: string }>(user: T) {
  return { ...user, name: user.name || user.username, isOnline: (onlineUserConnections.get(user.id) ?? 0) > 0 };
}

function getReqUser(req: express.Request) {
  return (req as unknown as AuthedRequest).user;
}

function getSingleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function getBearerToken(req: express.Request) {
  const header = req.header("authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer") return null;
  return token ?? null;
}

function getRequestIp(req: express.Request) {
  const forwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || "unknown";
}

function authRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = `${getRequestIp(req)}:${req.path}`;
  const now = Date.now();
  const current = authRateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    authRateLimitStore.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > AUTH_RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
  }

  next();
}

function makeOtpCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

async function sendSms(phoneNumber: string, message: string) {
  if (!twilioConfigured) return false;

  const body = new URLSearchParams({
    To: phoneNumber,
    From: env.TWILIO_FROM_NUMBER!,
    Body: message,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`SMS provider error: ${details}`);
  }

  return true;
}

async function upsertCallLog(input: {
  id: string;
  chatId: string;
  callerId: string;
  receiverId: string;
  mode: "voice" | "video";
  status: "ringing" | "missed" | "declined" | "completed";
  createdAt?: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
}) {
  await prisma.callLog.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      chatId: input.chatId,
      callerId: input.callerId,
      receiverId: input.receiverId,
      mode: input.mode,
      status: input.status,
      createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
      answeredAt: input.answeredAt ? new Date(input.answeredAt) : null,
      endedAt: input.endedAt ? new Date(input.endedAt) : null,
      durationSeconds: input.durationSeconds ?? null,
    },
    update: {
      status: input.status,
      ...(input.answeredAt ? { answeredAt: new Date(input.answeredAt) } : {}),
      ...(input.endedAt ? { endedAt: new Date(input.endedAt) } : {}),
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    },
  });
}

async function findLinkedUser(phoneNumber?: string | null, email?: string | null, excludeUserId?: string) {
  const orWhere = [
    ...(phoneNumber ? [{ phoneNumber }] : []),
    ...(email ? [{ email }] : []),
  ];
  if (!orWhere.length) return null;
  return prisma.user.findFirst({
    where: { ...(excludeUserId ? { id: { not: excludeUserId } } : {}), OR: orWhere },
    select: publicUserSelect,
  });
}

async function createDirectChatIfNeeded(userId: string, otherUserId: string) {
  const [a, b] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const existing = await prisma.directChat.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  if (existing) return existing.chatId;

  const chat = await prisma.chat.create({
    data: {
      isGroup: false,
      members: { createMany: { data: [{ userId }, { userId: otherUserId }] } },
      direct: { create: { userAId: a, userBId: b } },
    },
  });

  return chat.id;
}

async function ensureLinkedContact(ownerId: string, linkedUserId: string, fallbackName?: string | null) {
  const linkedUser = await prisma.user.findUnique({ where: { id: linkedUserId }, select: publicUserSelect });
  if (!linkedUser) return null;

  const existing = await prisma.contact.findFirst({
    where: { ownerId, linkedUserId },
    include: { linkedUser: { select: publicUserSelect } },
  });

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      phoneNumber: existing.phoneNumber,
      email: existing.email,
      avatarUrl: existing.avatarUrl,
      registeredUser: existing.linkedUser ? toPublicUser(existing.linkedUser) : null,
    };
  }

  const created = await prisma.contact.create({
    data: {
      ownerId,
      linkedUserId,
      name: fallbackName || linkedUser.name || linkedUser.username,
      phoneNumber: linkedUser.phoneNumber,
      email: linkedUser.email,
      avatarUrl: linkedUser.avatarUrl,
    },
    include: { linkedUser: { select: publicUserSelect } },
  });

  return {
    id: created.id,
    name: created.name,
    phoneNumber: created.phoneNumber,
    email: created.email,
    avatarUrl: created.avatarUrl,
    registeredUser: created.linkedUser ? toPublicUser(created.linkedUser) : null,
  };
}

async function issueOtp(email: string, purpose: EmailOtpPurpose, userId?: string | null) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: { userId: userId ?? null, email, codeHash, purpose, expiresAt },
  });

  const subject =
    purpose === "verify-email"
      ? "Verify your HelloTo email"
      : purpose === "admin-login"
        ? "Your HelloToo admin login OTP"
        : purpose === "admin-reset-pin"
          ? "Your HelloToo admin PIN reset OTP"
          : purpose === "admin-reset-password"
            ? "Your HelloToo admin password reset OTP"
      : purpose === "reset-pin"
        ? "Your HelloTo PIN reset OTP"
      : purpose === "reset-password"
        ? "Your HelloTo password reset OTP"
        : "Your HelloTo login OTP";
  const html = `<div style="font-family:Segoe UI,sans-serif;padding:24px"><h2>HelloTo verification</h2><p>Your OTP code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</div><p>This code expires in ${OTP_MINUTES} minutes.</p></div>`;

  if (transporter && smtpFrom) {
    try {
      await transporter.sendMail({ from: smtpFrom, to: email, subject, html });
      return { delivered: true };
    } catch (error) {
      console.error(
        `Email OTP delivery failed for ${email}.${env.OTP_REAL_DELIVERY_ONLY ? "" : " Falling back to dev OTP preview."}`,
        error,
      );
      requireRealOtpDelivery("email");
    }
  }

  requireRealOtpDelivery("email");
  console.log(`[DEV OTP] ${purpose} for ${email}: ${code}`);
  return { delivered: false, devOtpPreview: code };
}

async function issuePhoneOtp(phoneNumber: string, purpose: PhoneOtpPurpose, userId?: string | null) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);

  await prisma.$executeRawUnsafe(
    "INSERT INTO PhoneOtp (id, userId, phoneNumber, codeHash, purpose, expiresAt, consumedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
    makeId("phoneotp"),
    userId ?? null,
    phoneNumber,
    codeHash,
    purpose,
    expiresAt.toISOString(),
    new Date().toISOString(),
  );

  const message = `Your HelloToo OTP is ${code}. It expires in ${OTP_MINUTES} minutes.`;
  try {
    if (await sendSms(phoneNumber, message)) {
      return { delivered: true };
    }
  } catch (error) {
    console.error(
      `Phone OTP delivery failed for ${phoneNumber}.${env.OTP_REAL_DELIVERY_ONLY ? "" : " Falling back to dev OTP preview."}`,
      error,
    );
    requireRealOtpDelivery("sms");
  }

  requireRealOtpDelivery("sms");
  console.log(`[DEV PHONE OTP] ${purpose} for ${phoneNumber}: ${code}`);
  return { delivered: false, devOtpPreview: code };
}

async function verifyOtp(email: string, purpose: EmailOtpPurpose, code: string) {
  const otp = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return null;
  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) return null;
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return otp;
}

async function verifyPhoneOtp(phoneNumber: string, purpose: PhoneOtpPurpose, code: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; codeHash: string }>>(
    "SELECT id, codeHash FROM PhoneOtp WHERE phoneNumber = ? AND purpose = ? AND consumedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1",
    phoneNumber,
    purpose,
    new Date().toISOString(),
  );
  const otp = rows[0] ?? null;
  if (!otp) return null;
  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) return null;
  await prisma.$executeRawUnsafe("UPDATE PhoneOtp SET consumedAt = ? WHERE id = ?", new Date().toISOString(), otp.id);
  return otp;
}

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (decoded.role === "admin") return res.status(403).json({ error: "Admin token is not allowed here" });
    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: accountStateSelect });
    if (!user) return res.status(401).json({ error: "Invalid token" });
    const accessError = getUserAccessError(user);
    if (accessError) return res.status(403).json({ error: accessError });
    (req as unknown as AuthedRequest).user = {
      id: user.id,
      username: user.username,
      role: "user",
      ...(user.email ? { email: user.email } : {}),
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const adminAccount = getAdminAccountOrThrow();
    if (
      decoded.role !== "admin"
      || decoded.sub !== "admin"
      || normalizeAdminEmail(decoded.email) !== adminAccount.email
      || decoded.adminVersion !== adminAccount.sessionVersion
    ) {
      return res.status(403).json({ error: "Admin access required" });
    }
    (req as unknown as AuthedRequest).user = {
      id: decoded.sub,
      username: decoded.username,
      role: "admin",
      email: adminAccount.email,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss: http: https:; font-src 'self' data:; media-src 'self' data: blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  next();
});
app.use(cors({
  origin(origin, cb) {
    if (!origin || isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error("CORS blocked"), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use("/auth", authRateLimit);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/register/request-otp", authRateLimit, async (req, res) => {
  const parsed = registerOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const email = parsed.data.email?.toLowerCase() ?? null;
  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  
  if (!email && !phoneNumber) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  if (email && isReservedAdminEmail(email)) return res.status(403).json({ error: "That email is reserved for the admin sign in only." });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phoneNumber }, { email }] },
    select: { phoneNumber: true, email: true },
  });
  if (phoneNumber && existing?.phoneNumber === phoneNumber) return res.status(409).json({ error: "Mobile number already registered" });
  if (email && existing?.email === email) return res.status(409).json({ error: "Email already registered" });

  const emailOtpResult = email ? await issueOtp(email, "verify-email") : { delivered: false, devOtpPreview: undefined };
  const phoneOtpResult = phoneNumber ? await issuePhoneOtp(phoneNumber, "verify-phone") : { delivered: false, devOtpPreview: undefined };

  res.json({
    emailOtpSent: emailOtpResult.delivered,
    phoneOtpSent: phoneOtpResult.delivered,
    devPreviews: {
      ...(emailOtpResult.devOtpPreview ? { email: emailOtpResult.devOtpPreview } : {}),
      ...(phoneOtpResult.devOtpPreview ? { phone: phoneOtpResult.devOtpPreview } : {}),
    },
    ...(emailOtpResult.devOtpPreview ? { devEmailOtpPreview: emailOtpResult.devOtpPreview } : {}),
    ...(phoneOtpResult.devOtpPreview ? { devPhoneOtpPreview: phoneOtpResult.devOtpPreview } : {}),
  });
});

app.post("/auth/register/verify", authRateLimit, async (req, res) => {
  const parsed = registerOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration" });

  const email = parsed.data.email?.toLowerCase() ?? null;
  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  
  if (!email && !phoneNumber) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  if (email && isReservedAdminEmail(email)) return res.status(403).json({ error: "That email is reserved for the admin sign in only." });

  let emailVerified = false;
  let phoneVerified = false;

  if (email && parsed.data.emailOtp) {
    const emailOtp = await verifyOtp(email, "verify-email", parsed.data.emailOtp);
    if (!emailOtp) return res.status(400).json({ error: "Invalid or expired email OTP" });
    emailVerified = true;
  }

  if (phoneNumber && parsed.data.phoneOtp) {
    const phoneOtp = await verifyPhoneOtp(phoneNumber, "verify-phone", parsed.data.phoneOtp);
    if (!phoneOtp) return res.status(400).json({ error: "Invalid or expired mobile OTP" });
    phoneVerified = true;
  }

  if (!emailVerified && !phoneVerified) return res.status(400).json({ error: "Verify your Gmail or mobile number with OTP first" });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phoneNumber }, { email }] },
    select: { phoneNumber: true, email: true },
  });
  if (phoneNumber && existing?.phoneNumber === phoneNumber) return res.status(409).json({ error: "Mobile number already registered" });
  if (email && existing?.email === email) return res.status(409).json({ error: "Email already registered" });

  const username = parsed.data.username || makeUsername(parsed.data.name, phoneNumber, email);
  const avatarUrl = cleanOptional(parsed.data.avatarUrl);

  const user = await prisma.user.create({
    data: {
      username,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      phoneNumber,
      phoneVerified,
      email,
      emailVerified,
      avatarUrl,
      bio: parsed.data.bio?.trim() ?? "",
      statusText: parsed.data.statusText?.trim() || DEFAULT_STATUS,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
    },
    select: publicUserSelect,
  });

  await createUserAuditEvent(user.id, "account-created", "User registered via OTP", "user", user.id);
  await createUserAuditEvent(user.id, "login", "Automatic sign-in after registration", "user", user.id);

  const token = signToken({ sub: user.id, username: user.username });
  res.json({
    token,
    user: toPublicUser(user),
  });
});

app.post("/auth/login/request-otp", authRateLimit, async (req, res) => {
  const parsed = loginOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid login request" });

  const email = parsed.data.email?.toLowerCase() ?? null;
  const phoneNumber = parsed.data.phoneNumber ? normalizePhone(parsed.data.phoneNumber) : null;

  if (email && isReservedAdminEmail(email)) return res.status(403).json({ error: "Use the admin sign in section for that account." });
  if (!email && !phoneNumber) return res.status(400).json({ error: "Enter either a Gmail or mobile number" });

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    select: { id: true, email: true, phoneNumber: true, isBlocked: true, suspendedUntil: true, deletedAt: true },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  if (email && user.email !== email) return res.status(400).json({ error: "Gmail and mobile number do not match the same account" });
  if (phoneNumber && user.phoneNumber !== phoneNumber) return res.status(400).json({ error: "Gmail and mobile number do not match the same account" });
  
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });

  const emailOtpResult = email ? await issueOtp(email, "login", user.id) : { delivered: false, devOtpPreview: undefined };
  const phoneOtpResult = phoneNumber ? await issuePhoneOtp(phoneNumber, "login-phone", user.id) : { delivered: false, devOtpPreview: undefined };

  res.json({
    emailOtpSent: emailOtpResult.delivered,
    phoneOtpSent: phoneOtpResult.delivered,
    devPreviews: {
      ...(emailOtpResult.devOtpPreview ? { email: emailOtpResult.devOtpPreview } : {}),
      ...(phoneOtpResult.devOtpPreview ? { phone: phoneOtpResult.devOtpPreview } : {}),
    },
    ...(emailOtpResult.devOtpPreview ? { devEmailOtpPreview: emailOtpResult.devOtpPreview } : {}),
    ...(phoneOtpResult.devOtpPreview ? { devPhoneOtpPreview: phoneOtpResult.devOtpPreview } : {}),
  });
});

app.post("/auth/login/verify", authRateLimit, async (req, res) => {
  const parsed = loginOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid login" });

  const email = parsed.data.email?.toLowerCase() ?? null;
  const phoneNumber = parsed.data.phoneNumber ? normalizePhone(parsed.data.phoneNumber) : null;

  if (email && isReservedAdminEmail(email)) return res.status(403).json({ error: "Use the admin sign in section for that account." });
  if (!email && !phoneNumber) return res.status(400).json({ error: "Enter either a Gmail or mobile number" });

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    select: { ...accountStateSelect, username: true },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  if (email && user.email !== email) return res.status(400).json({ error: "Gmail and mobile number do not match the same account" });
  if (phoneNumber && user.phoneNumber !== phoneNumber) return res.status(400).json({ error: "Gmail and mobile number do not match the same account" });
  
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });

  let verifiedWithEmail = false;
  let verifiedWithPhone = false;

  if (email && parsed.data.emailOtp) {
    const emailOtp = await verifyOtp(email, "login", parsed.data.emailOtp);
    if (!emailOtp) return res.status(400).json({ error: "Invalid or expired email OTP" });
    verifiedWithEmail = true;
  }

  if (phoneNumber && parsed.data.phoneOtp) {
    const phoneOtp = await verifyPhoneOtp(phoneNumber, "login-phone", parsed.data.phoneOtp);
    if (!phoneOtp) return res.status(400).json({ error: "Invalid or expired mobile OTP" });
    verifiedWithPhone = true;
  }

  if (!verifiedWithEmail && !verifiedWithPhone) return res.status(400).json({ error: "Enter the OTP sent to your Gmail or mobile number" });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(verifiedWithEmail ? { emailVerified: true } : {}),
      ...(verifiedWithPhone ? { phoneVerified: true } : {}),
    },
  });
  await recordUserLogin(user.id, verifiedWithEmail ? "Gmail OTP sign-in" : "Mobile OTP sign-in");
  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: publicUserSelect });
  res.json({ token: signToken({ sub: user.id, username: user.username }), user: fullUser ? toPublicUser(fullUser) : null });
});

// Legacy password-based authentication (kept for backward compatibility)
app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const phoneNumber = normalizePhone(cleanOptional(parsed.data.phoneNumber));
  const email = cleanOptional(parsed.data.email)?.toLowerCase() ?? null;
  const avatarUrl = cleanOptional(parsed.data.avatarUrl);
  if (isReservedAdminEmail(email)) return res.status(403).json({ error: "That email is reserved for the admin sign in only." });

  const existing = await prisma.user.findFirst({
    where: { OR: [...(phoneNumber ? [{ phoneNumber }] : []), ...(email ? [{ email }] : [])] },
    select: { phoneNumber: true, email: true },
  });
  if (phoneNumber && existing?.phoneNumber === phoneNumber) return res.status(409).json({ error: "Mobile number already registered" });
  if (email && existing?.email === email) return res.status(409).json({ error: "Email already registered" });

  const user = await prisma.user.create({
    data: {
      username: makeUsername(parsed.data.name, phoneNumber, email),
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      phoneNumber,
      phoneVerified: !phoneNumber,
      email,
      emailVerified: !email,
      avatarUrl,
      bio: parsed.data.bio?.trim() ?? "",
      statusText: parsed.data.statusText?.trim() || DEFAULT_STATUS,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
    },
    select: publicUserSelect,
  });
  await createUserAuditEvent(user.id, "account-created", "User registered a new account", "user", user.id);
  await createUserAuditEvent(user.id, "login", "Automatic sign-in after registration", "user", user.id);

  const token = signToken({ sub: user.id, username: user.username });
  let otpInfo: { delivered: boolean; devOtpPreview?: string } | null = null;
  let phoneOtpInfo: { delivered: boolean; devOtpPreview?: string } | null = null;
  if (user.email) otpInfo = await issueOtp(user.email, "verify-email", user.id);
  if (user.phoneNumber) phoneOtpInfo = await issuePhoneOtp(user.phoneNumber, "verify-phone", user.id);

  res.json({
    token,
    user: toPublicUser(user),
    verification: user.email ? {
      required: !user.emailVerified,
      sent: true,
      delivery: otpInfo?.delivered ? "email" : "dev-console",
      ...(otpInfo?.devOtpPreview ? { devOtpPreview: otpInfo.devOtpPreview } : {}),
    } : { required: false, sent: false },
    phoneVerification: user.phoneNumber ? {
      required: !user.phoneVerified,
      sent: true,
      delivery: phoneOtpInfo?.delivered ? "sms" : "dev-console",
      ...(phoneOtpInfo?.devOtpPreview ? { devOtpPreview: phoneOtpInfo.devOtpPreview } : {}),
    } : { required: false, sent: false },
  });
});

// Legacy password-based authentication (kept for backward compatibility)
app.post("/auth/login", async (req, res) => {
  const parsed = passwordLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const emailIdentifier = identifier.toLowerCase();
  if (isReservedAdminEmail(emailIdentifier)) {
    return res.status(403).json({ error: "Use the admin sign in section for that account." });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
        { email: emailIdentifier },
        { username: identifier },
      ],
    },
  });

  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid mobile/email or password" });
  }
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });
  if (user.email && identifier.includes("@") && !user.emailVerified) {
    return res.status(403).json({ error: "Email not verified", needsEmailVerification: true });
  }

  await recordUserLogin(user.id, "Password sign-in");
  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: publicUserSelect });
  res.json({ token: signToken({ sub: user.id, username: user.username }), user: fullUser ? toPublicUser(fullUser) : null });
});

app.post("/auth/request-email-otp", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid email request" });

  const email = parsed.data.email.toLowerCase();
  if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin account uses the admin sign in section only." });
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, isBlocked: true, suspendedUntil: true, deletedAt: true },
  });
  if (!user) return res.status(404).json({ error: "Email not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });
  if (parsed.data.purpose === "verify-email" && user.emailVerified) {
    return res.json({ sent: false, message: "Email already verified" });
  }

  const result = await issueOtp(email, parsed.data.purpose, user.id);
  res.json({ sent: true, delivery: result.delivered ? "email" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/request-phone-otp", async (req, res) => {
  const parsed = phoneOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile OTP request" });

  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid mobile number" });
  const user = await prisma.user.findUnique({
    where: { phoneNumber },
    select: { id: true, phoneVerified: true, isBlocked: true, suspendedUntil: true, deletedAt: true },
  });
  if (!user) return res.status(404).json({ error: "Mobile number not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });
  if (parsed.data.purpose === "verify-phone" && user.phoneVerified) {
    return res.json({ sent: false, message: "Mobile number already verified" });
  }

  const result = await issuePhoneOtp(phoneNumber, parsed.data.purpose, user.id);
  res.json({ sent: true, delivery: result.delivered ? "sms" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/request-password-reset-otp", async (req, res) => {
  const parsed = z.object({ identifier: z.string().trim().min(3).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid reset request" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;

  if (email) {
    if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin account uses the admin sign in section only." });
    const user = await prisma.user.findUnique({ where: { email }, select: accountStateSelect });
    if (!user) return res.status(404).json({ error: "Email not found" });
    const accessError = getUserAccessError(user);
    if (accessError) return res.status(403).json({ error: accessError });
    const result = await issueOtp(email, "reset-password", user.id);
    return res.json({ sent: true, channel: "email", delivery: result.delivered ? "email" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
  }

  if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone }, select: accountStateSelect });
  if (!user) return res.status(404).json({ error: "Mobile number not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });
  const result = await issuePhoneOtp(normalizedPhone, "reset-password-phone", user.id);
  return res.json({ sent: true, channel: "phone", delivery: result.delivered ? "sms" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/reset-password-with-otp", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid password reset" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  if (email) {
    if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin password cannot be reset from the user flow." });
    const otp = await verifyOtp(email, "reset-password", parsed.data.code);
    if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { passwordHash, emailVerified: true },
      select: { id: true },
    });
    await createUserAuditEvent(updatedUser.id, "password-reset", "Password reset with email OTP", "user", updatedUser.id);
    return res.json({ reset: true, channel: "email" });
  }

  if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  const otp = await verifyPhoneOtp(normalizedPhone, "reset-password-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });
  const updatedUser = await prisma.user.update({
    where: { phoneNumber: normalizedPhone },
    data: { passwordHash, phoneVerified: true },
    select: { id: true },
  });
  await createUserAuditEvent(updatedUser.id, "password-reset", "Password reset with phone OTP", "user", updatedUser.id);
  return res.json({ reset: true, channel: "phone" });
});

app.post("/auth/request-pin-reset-otp", async (req, res) => {
  const parsed = z.object({ identifier: z.string().trim().min(3).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid PIN reset request" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;

  if (email) {
    if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin account uses the admin sign in section only." });
    const user = await prisma.user.findUnique({ where: { email }, select: accountStateSelect });
    if (!user) return res.status(404).json({ error: "Email not found" });
    const accessError = getUserAccessError(user);
    if (accessError) return res.status(403).json({ error: accessError });
    const result = await issueOtp(email, "reset-pin", user.id);
    return res.json({ sent: true, channel: "email", delivery: result.delivered ? "email" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
  }

  if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone }, select: accountStateSelect });
  if (!user) return res.status(404).json({ error: "Mobile number not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });
  const result = await issuePhoneOtp(normalizedPhone, "reset-pin-phone", user.id);
  return res.json({ sent: true, channel: "phone", delivery: result.delivered ? "sms" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/reset-pin-with-otp", async (req, res) => {
  const parsed = resetPinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid PIN reset" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;

  if (email) {
    if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin PIN reset is not available from the user flow." });
    const otp = await verifyOtp(email, "reset-pin", parsed.data.code);
    if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
      select: { id: true },
    });
    await createUserAuditEvent(updatedUser.id, "pin-reset", "PIN reset flow completed with email OTP", "user", updatedUser.id);
    return res.json({ reset: true, channel: "email" });
  }

  if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid email or mobile number" });
  const otp = await verifyPhoneOtp(normalizedPhone, "reset-pin-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });
  const updatedUser = await prisma.user.update({
    where: { phoneNumber: normalizedPhone },
    data: { phoneVerified: true },
    select: { id: true },
  });
  await createUserAuditEvent(updatedUser.id, "pin-reset", "PIN reset flow completed with phone OTP", "user", updatedUser.id);
  return res.json({ reset: true, channel: "phone" });
});

app.post("/auth/verify-email-otp", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid verification code" });

  const email = parsed.data.email.toLowerCase();
  if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Admin account uses the admin sign in section only." });
  const otp = await verifyOtp(email, "verify-email", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
    select: publicUserSelect,
  });
  await createUserAuditEvent(user.id, "email-verified", "Email verified with OTP", "user", user.id);
  res.json({ verified: true, user: toPublicUser(user) });
});

app.post("/auth/login-with-email-otp", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid OTP login" });

  const email = parsed.data.email.toLowerCase();
  if (isReservedAdminEmail(email)) return res.status(403).json({ error: "Use the admin sign in section for that account." });
  const otp = await verifyOtp(email, "login", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.findUnique({ where: { email }, select: authUserStateSelect });
  if (!user) return res.status(404).json({ error: "User not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });

  await recordUserLogin(user.id, "Email OTP sign-in");
  const { isBlocked, suspendedUntil, deletedAt, ...safeUser } = user;
  res.json({ token: signToken({ sub: user.id, username: user.username }), user: toPublicUser({ ...safeUser, emailVerified: true }) });
});

app.post("/auth/verify-phone-otp", async (req, res) => {
  const parsed = phoneOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile verification code" });

  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid mobile number" });

  const otp = await verifyPhoneOtp(phoneNumber, "verify-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.update({
    where: { phoneNumber },
    data: { phoneVerified: true },
    select: publicUserSelect,
  });
  await createUserAuditEvent(user.id, "phone-verified", "Mobile number verified with OTP", "user", user.id);
  res.json({ verified: true, user: toPublicUser(user) });
});

app.post("/auth/login-with-phone-otp", async (req, res) => {
  const parsed = phoneOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile OTP login" });

  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid mobile number" });
  const otp = await verifyPhoneOtp(phoneNumber, "login-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.findUnique({ where: { phoneNumber }, select: authUserStateSelect });
  if (!user) return res.status(404).json({ error: "User not found" });
  const accessError = getUserAccessError(user);
  if (accessError) return res.status(403).json({ error: accessError });

  const updatedUser = user.phoneVerified ? user : await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerified: true },
    select: authUserStateSelect,
  });
  await recordUserLogin(updatedUser.id, "Phone OTP sign-in");
  const { isBlocked, suspendedUntil, deletedAt, ...safeUser } = updatedUser;

  res.json({ token: signToken({ sub: updatedUser.id, username: updatedUser.username }), user: toPublicUser(safeUser) });
});

app.post("/admin/login", authRateLimit, async (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid admin login" });
  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  const secretOk = email === adminAccount.email && await matchesAdminLoginSecret(parsed.data.secret, adminAccount);
  if (!secretOk) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  await recordAdminLogin();
  const currentAdmin = getAdminAccountOrThrow();
  res.json({
    token: signAdminToken(currentAdmin),
    admin: getAdminPublicProfile(currentAdmin),
    mustChangePassword: Boolean(currentAdmin.mustChangePassword),
  });
});

app.post("/admin/login-with-pin", authRateLimit, async (req, res) => {
  const parsed = adminPinLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin PIN login" });
  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (!adminAccount.pinHash) {
    return res.status(400).json({ error: "Admin PIN has not been set yet." });
  }
  const pinOk = email === adminAccount.email && await bcrypt.compare(parsed.data.pin, adminAccount.pinHash);
  if (!pinOk) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  await recordAdminLogin();
  const currentAdmin = getAdminAccountOrThrow();
  res.json({
    token: signAdminToken(currentAdmin),
    admin: getAdminPublicProfile(currentAdmin),
  });
});

app.post("/admin/request-email-otp", authRateLimit, async (req, res) => {
  const parsed = adminOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid admin OTP request" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const purpose: EmailOtpPurpose =
    parsed.data.purpose === "login"
      ? "admin-login"
      : parsed.data.purpose === "reset-pin"
        ? "admin-reset-pin"
        : "admin-reset-password";
  const result = await issueOtp(email, purpose);
  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/login-with-email-otp", authRateLimit, async (req, res) => {
  const parsed = adminOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid admin OTP login" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const otp = await verifyOtp(email, "admin-login", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  await recordAdminLogin();
  const currentAdmin = getAdminAccountOrThrow();
  res.json({
    token: signAdminToken(currentAdmin),
    admin: getAdminPublicProfile(currentAdmin),
  });
});

app.post("/admin/request-password-reset-otp", authRateLimit, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid admin password reset request" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const result = await issueOtp(email, "admin-reset-password");
  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/reset-password-with-otp", authRateLimit, async (req, res) => {
  const parsed = adminResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin password reset" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const otp = await verifyOtp(email, "admin-reset-password", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const nextPasswordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updated = await updateAdminAccount((current) => ({
    ...current,
    passwordHash: nextPasswordHash,
    mustChangePassword: false,
    sessionVersion: current.sessionVersion + 1,
  }));
  res.json({ reset: true, channel: "email", admin: getAdminPublicProfile(updated), token: signAdminToken(updated) });
});

app.post("/admin/request-pin-reset-otp", authRateLimit, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid admin PIN reset request" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const result = await issueOtp(email, "admin-reset-pin");
  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/reset-pin-with-otp", authRateLimit, async (req, res) => {
  const parsed = adminResetPinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin PIN reset" });

  const email = normalizeAdminEmail(parsed.data.email);
  const adminAccount = getAdminAccountOrThrow();
  if (email !== adminAccount.email) {
    return res.status(404).json({ error: "Admin Gmail not found" });
  }

  const otp = await verifyOtp(email, "admin-reset-pin", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const nextPinHash = await bcrypt.hash(parsed.data.newPin, 10);
  await updateAdminAccount((current) => ({
    ...current,
    pinHash: nextPinHash,
    sessionVersion: current.sessionVersion + 1,
  }));
  res.json({ reset: true, channel: "email" });
});

app.get("/me", requireUser, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: getReqUser(req).id }, select: publicUserSelect });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: toPublicUser(user) });
});

app.get("/me/notices", requireUser, async (req, res) => {
  const notices = await prisma.adminNotice.findMany({
    where: {
      userId: getReqUser(req).id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({
    notices: notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      message: notice.message,
      sentBy: notice.sentBy,
      createdAt: notice.createdAt,
      expiresAt: notice.expiresAt,
    })),
  });
});

app.post("/reports", requireUser, async (req, res) => {
  const parsed = userReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid report" });

  const reporterUserId = getReqUser(req).id;
  if (parsed.data.targetUserId === reporterUserId) return res.status(400).json({ error: "You cannot report yourself" });
  const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.targetUserId }, select: accountStateSelect });
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const report = await prisma.moderationReport.create({
    data: {
      reporterUserId,
      targetUserId: parsed.data.targetUserId,
      reason: parsed.data.reason,
      detail: cleanOptional(parsed.data.detail),
    },
  });
  await createUserAuditEvent(parsed.data.targetUserId, "reported", `Reported by another user for ${parsed.data.reason}`, "user", reporterUserId);
  res.json({ reported: true, reportId: report.id });
});

app.get("/admin/me", requireAdmin, (_req, res) => {
  res.json({ admin: getAdminPublicProfile() });
});

app.get("/admin/account", requireAdmin, (_req, res) => {
  res.json({ admin: getAdminPublicProfile() });
});

app.post("/admin/account/profile", requireAdmin, async (req, res) => {
  const parsed = adminAccountProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin profile" });

  const nextPhoneNumber = normalizeAdminPhone(parsed.data.phoneNumber);

  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    name: parsed.data.name.trim(),
    phoneNumber: nextPhoneNumber,
  }));
  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
  });
});

app.post("/admin/account/request-credential-otp", requireAdmin, authRateLimit, async (req, res) => {
  const parsed = adminCredentialOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin verification request" });

  const adminAccount = getAdminAccountOrThrow();
  if (!await matchesAdminPassword(parsed.data.oldPassword, adminAccount)) {
    return res.status(401).json({ error: "Old password is incorrect" });
  }

  const result = await issueOtp(adminAccount.email, "admin-change-credentials");
  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/account/credentials", requireAdmin, async (req, res) => {
  const parsed = adminCredentialsUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin credential update" });

  const currentAdmin = getAdminAccountOrThrow();
  if (!await matchesAdminPassword(parsed.data.oldPassword, currentAdmin)) {
    return res.status(401).json({ error: "Old password is incorrect" });
  }

  const otp = await verifyOtp(currentAdmin.email, "admin-change-credentials", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const nextEmail = parsed.data.newEmail ? normalizeAdminEmail(parsed.data.newEmail) : currentAdmin.email;
  const nextPassword = parsed.data.newPassword?.trim() ? parsed.data.newPassword : null;
  const nextPhoneNumber = parsed.data.newPhoneNumber?.trim() || null;
  const emailChanged = nextEmail !== currentAdmin.email;
  const passwordChanged = Boolean(nextPassword);
  const phoneChanged = nextPhoneNumber !== currentAdmin.phoneNumber;

  if (!emailChanged && !passwordChanged && !phoneChanged) {
    return res.status(400).json({ error: "No Gmail, password, or mobile number change was requested" });
  }

  if (emailChanged) {
    const existingUser = await prisma.user.findUnique({
      where: { email: nextEmail },
      select: { id: true },
    });
    if (existingUser) {
      return res.status(409).json({ error: "That Gmail is already used by a user account." });
    }
  }

  const nextPasswordHash = nextPassword ? await bcrypt.hash(nextPassword, 10) : null;
  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    email: nextEmail,
    phoneNumber: nextPhoneNumber,
    passwordHash: nextPasswordHash ?? current.passwordHash,
    mustChangePassword: passwordChanged ? false : current.mustChangePassword,
    sessionVersion: current.sessionVersion + 1,
  }));

  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.post("/admin/account/pin", requireAdmin, async (req, res) => {
  const parsed = adminPinUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin PIN update" });

  const currentAdmin = getAdminAccountOrThrow();
  if (!await matchesAdminPassword(parsed.data.currentPassword, currentAdmin)) {
    return res.status(401).json({ error: "Old password is incorrect" });
  }

  const nextPinHash = await bcrypt.hash(parsed.data.newPin, 10);
  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    pinHash: nextPinHash,
    sessionVersion: current.sessionVersion + 1,
  }));
  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.post("/admin/account/remove-pin", requireAdmin, async (req, res) => {
  const parsed = adminCredentialOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid PIN removal request" });

  const currentAdmin = getAdminAccountOrThrow();
  if (!await matchesAdminPassword(parsed.data.oldPassword, currentAdmin)) {
    return res.status(401).json({ error: "Password is incorrect" });
  }

  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    pinHash: null,
    sessionVersion: current.sessionVersion + 1,
  }));
  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

// New separate security endpoints
app.post("/admin/account/request-email-change-otp", requireAdmin, authRateLimit, async (req, res) => {
  const parsed = z.object({ newEmail: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid email" });

  const currentAdmin = getAdminAccountOrThrow();
  if (parsed.data.newEmail.toLowerCase() === currentAdmin.email.toLowerCase()) {
    return res.status(400).json({ error: "New email must be different from current email" });
  }

  const result = await issueOtp(parsed.data.newEmail.toLowerCase(), "admin-change-email");

  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/account/change-email", requireAdmin, async (req, res) => {
  const parsed = z.object({ newEmail: z.string().email(), code: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });

  const currentAdmin = getAdminAccountOrThrow();
  if (parsed.data.newEmail.toLowerCase() === currentAdmin.email.toLowerCase()) {
    return res.status(400).json({ error: "New email must be different from current email" });
  }

  if (!await verifyOtp(parsed.data.newEmail, "admin-change-email", parsed.data.code)) {
    return res.status(401).json({ error: "Invalid or expired verification code" });
  }

  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    email: parsed.data.newEmail,
    sessionVersion: current.sessionVersion + 1,
  }));

  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.post("/admin/account/request-phone-change-otp", requireAdmin, authRateLimit, async (req, res) => {
  const parsed = z.object({ newPhoneNumber: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid phone number" });

  const currentAdmin = getAdminAccountOrThrow();
  const phoneNumber = normalizeAdminPhone(parsed.data.newPhoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid mobile number" });
  if (phoneNumber === currentAdmin.phoneNumber) {
    return res.status(400).json({ error: "New phone number must be different from current phone number" });
  }

  const result = await issuePhoneOtp(phoneNumber, "admin-change-phone");

  res.json({
    sent: true,
    delivery: result.delivered ? "sms" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/account/change-phone", requireAdmin, async (req, res) => {
  const parsed = z.object({ newPhoneNumber: z.string().min(1), code: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });

  const currentAdmin = getAdminAccountOrThrow();
  const phoneNumber = normalizeAdminPhone(parsed.data.newPhoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid mobile number" });
  if (phoneNumber === currentAdmin.phoneNumber) {
    return res.status(400).json({ error: "New phone number must be different from current phone number" });
  }

  if (!await verifyPhoneOtp(phoneNumber, "admin-change-phone", parsed.data.code)) {
    return res.status(401).json({ error: "Invalid or expired verification code" });
  }

  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    phoneNumber,
    sessionVersion: current.sessionVersion + 1,
  }));

  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.post("/admin/account/change-password", requireAdmin, async (req, res) => {
  const parsed = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid password change request" });

  const currentAdmin = getAdminAccountOrThrow();
  if (!await matchesAdminPassword(parsed.data.oldPassword, currentAdmin)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    passwordHash: newPasswordHash,
    mustChangePassword: false,
    sessionVersion: current.sessionVersion + 1,
  }));

  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.post("/admin/account/request-forgot-password-otp", authRateLimit, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid email" });

  const admin = getAdminAccountOrThrow();
  if (admin.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return res.status(404).json({ error: "Admin account not found" });
  }

  const result = await issueOtp(parsed.data.email.toLowerCase(), "admin-forgot-password");

  res.json({
    sent: true,
    delivery: result.delivered ? "email" : "dev-console",
    ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
  });
});

app.post("/admin/account/reset-password", async (req, res) => {
  const parsed = z.object({
    email: z.string().email(),
    code: z.string(),
    newPassword: z.string().min(8),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid password reset request" });

  const admin = getAdminAccountOrThrow();
  if (admin.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return res.status(404).json({ error: "Admin account not found" });
  }

  if (!await verifyOtp(parsed.data.email, "admin-forgot-password", parsed.data.code)) {
    return res.status(401).json({ error: "Invalid or expired reset code" });
  }

  const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updatedAdmin = await updateAdminAccount((current) => ({
    ...current,
    passwordHash: newPasswordHash,
    mustChangePassword: false,
    sessionVersion: current.sessionVersion + 1,
  }));

  res.json({
    saved: true,
    admin: getAdminPublicProfile(updatedAdmin),
    token: signAdminToken(updatedAdmin),
  });
});

app.get("/admin/dashboard", requireAdmin, async (_req, res) => {
  const [totalUsers, blockedUsers, deletedUsers, suspendedUsers, openReports, recentReports, recentEvents] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true, deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({ where: { suspendedUntil: { gt: new Date() }, deletedAt: null } }),
    prisma.moderationReport.count({ where: { status: "open" } }),
    prisma.moderationReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        reporterUser: { select: publicUserSelect },
        targetUser: { select: adminUserSummarySelect },
      },
    }),
    prisma.userAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        user: { select: publicUserSelect },
      },
    }),
  ]);

  res.json({
    stats: {
      totalUsers,
      blockedUsers,
      deletedUsers,
      suspendedUsers,
      openReports,
    },
    reports: recentReports.map((report) => ({
      id: report.id,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      actionNote: report.actionNote,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      reviewedBy: report.reviewedBy,
      reporterUser: report.reporterUser ? toPublicUser(report.reporterUser) : null,
      targetUser: toAdminUserView(report.targetUser),
    })),
    events: recentEvents.map((event) => ({
      id: event.id,
      kind: event.kind,
      detail: event.detail,
      actorType: event.actorType,
      actorId: event.actorId,
      createdAt: event.createdAt,
      user: toPublicUser(event.user),
    })),
  });
});

app.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: adminUserSummarySelect,
  });

  res.json({
    users: users.map((user) => toAdminUserView(user)),
  });
});

app.get("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = getSingleParam(req.params.userId);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...adminUserSummarySelect,
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      adminNotices: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      reportsAgainst: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          reporterUser: { select: publicUserSelect },
        },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const { auditEvents, adminNotices, reportsAgainst, ...summary } = user;
  res.json({
    user: toAdminUserView(summary),
    auditEvents,
    notices: adminNotices,
    reports: reportsAgainst.map((report) => ({
      id: report.id,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      actionNote: report.actionNote,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      reviewedBy: report.reviewedBy,
      reporterUser: report.reporterUser ? toPublicUser(report.reporterUser) : null,
    })),
  });
});

app.post("/admin/users/:userId/notice", requireAdmin, async (req, res) => {
  const userId = getSingleParam(req.params.userId);
  const parsed = adminNoticeSchema.safeParse(req.body);
  if (!userId || !parsed.success) return res.status(400).json({ error: parsed.success ? "Invalid user id" : parsed.error.issues[0]?.message ?? "Invalid notice" });
  const adminEmail = getReqUser(req).email ?? getAdminAccountOrThrow().email;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, name: true } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const notice = await prisma.adminNotice.create({
    data: {
      userId,
      title: parsed.data.title,
      message: parsed.data.message,
      sentBy: adminEmail,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
  });
  await createUserAuditEvent(userId, "admin-notice", `Admin notice sent: ${parsed.data.title}`, "admin", adminEmail);
  res.json({ sent: true, notice });
});

app.post("/admin/users/:userId/action", requireAdmin, async (req, res) => {
  const userId = getSingleParam(req.params.userId);
  const parsed = adminActionSchema.safeParse(req.body);
  if (!userId || !parsed.success) return res.status(400).json({ error: parsed.success ? "Invalid user id" : parsed.error.issues[0]?.message ?? "Invalid admin action" });
  const adminEmail = getReqUser(req).email ?? getAdminAccountOrThrow().email;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSummarySelect });
  if (!user) return res.status(404).json({ error: "User not found" });

  const note = cleanOptional(parsed.data.note) ?? "";
  let detail = "";
  const nextData: Record<string, unknown> = {};

  if (parsed.data.action === "block") {
    nextData.isBlocked = true;
    nextData.suspendedUntil = null;
    detail = note || "Blocked by admin";
  } else if (parsed.data.action === "unblock") {
    nextData.isBlocked = false;
    detail = note || "Unblocked by admin";
  } else if (parsed.data.action === "suspend") {
    const days = parsed.data.days ?? 1;
    const suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    nextData.isBlocked = false;
    nextData.suspendedUntil = suspendedUntil;
    detail = note || `Suspended by admin for ${days} day(s)`;
  } else if (parsed.data.action === "restore") {
    nextData.isBlocked = false;
    nextData.suspendedUntil = null;
    nextData.deletedAt = null;
    detail = note || "Restored by admin";
  } else {
    nextData.isBlocked = true;
    nextData.suspendedUntil = null;
    nextData.deletedAt = new Date();
    detail = note || "Marked as permanently deleted by admin";
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: nextData,
    select: adminUserSummarySelect,
  });
  await createUserAuditEvent(userId, `admin-${parsed.data.action}`, detail, "admin", adminEmail);
  res.json({ updated: true, user: toAdminUserView(updatedUser) });
});

app.post("/admin/reports/:reportId/review", requireAdmin, async (req, res) => {
  const reportId = getSingleParam(req.params.reportId);
  const parsed = adminReportReviewSchema.safeParse(req.body);
  if (!reportId || !parsed.success) return res.status(400).json({ error: parsed.success ? "Invalid report id" : parsed.error.issues[0]?.message ?? "Invalid review data" });
  const adminEmail = getReqUser(req).email ?? getAdminAccountOrThrow().email;

  const report = await prisma.moderationReport.update({
    where: { id: reportId },
    data: {
      status: parsed.data.status,
      actionNote: cleanOptional(parsed.data.actionNote),
      reviewedAt: new Date(),
      reviewedBy: adminEmail,
    },
    include: {
      reporterUser: { select: publicUserSelect },
      targetUser: { select: adminUserSummarySelect },
    },
  });
  await createUserAuditEvent(report.targetUserId, "report-reviewed", `Report marked ${parsed.data.status}`, "admin", adminEmail);
  res.json({
    updated: true,
    report: {
      id: report.id,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      actionNote: report.actionNote,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      reviewedBy: report.reviewedBy,
      reporterUser: report.reporterUser ? toPublicUser(report.reporterUser) : null,
      targetUser: toAdminUserView(report.targetUser),
    },
  });
});

app.put("/me/profile", requireUser, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile data" });

  const userId = getReqUser(req).id;
  const phoneNumber = cleanOptional(parsed.data.phoneNumber);
  const email = cleanOptional(parsed.data.email)?.toLowerCase() ?? null;
  const avatarUrl = cleanOptional(parsed.data.avatarUrl);
  if (isReservedAdminEmail(email)) return res.status(403).json({ error: "That email is reserved for the admin sign in only." });

  const conflict = await prisma.user.findFirst({
    where: {
      id: { not: userId },
      OR: [...(phoneNumber ? [{ phoneNumber }] : []), ...(email ? [{ email }] : [])],
    },
    select: { phoneNumber: true, email: true },
  });
  if (phoneNumber && conflict?.phoneNumber === phoneNumber) return res.status(409).json({ error: "Mobile number already registered" });
  if (email && conflict?.email === email) return res.status(409).json({ error: "Email already registered" });

  const current = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, phoneNumber: true, phoneVerified: true } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      phoneNumber,
      phoneVerified: current?.phoneNumber === phoneNumber ? (current.phoneVerified ?? false) : !phoneNumber,
      email,
      emailVerified: current?.email === email ? current.emailVerified : !email,
      avatarUrl,
      bio: parsed.data.bio?.trim() ?? "",
      statusText: parsed.data.statusText?.trim() || DEFAULT_STATUS,
    },
    select: publicUserSelect,
  });

  await prisma.contact.updateMany({
    where: { linkedUserId: userId },
    data: { name: user.name, phoneNumber: user.phoneNumber, email: user.email, avatarUrl: user.avatarUrl },
  });
  await createUserAuditEvent(userId, "profile-update", "Profile updated", "user", userId);

  res.json({ user: toPublicUser(user) });
});

app.post("/me/change-password", requireUser, async (req, res) => {
  const parsed = userPasswordChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid password change" });

  const authUser = getReqUser(req);
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const passwordOk = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!passwordOk) return res.status(401).json({ error: "Current password is wrong" });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  await createUserAuditEvent(user.id, "password-changed", "User changed login password from settings", "user", user.id);
  res.json({ changed: true });
});

app.get("/contacts", requireUser, async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { ownerId: getReqUser(req).id },
    orderBy: { name: "asc" },
    include: { linkedUser: { select: publicUserSelect } },
  });
  res.json({
    contacts: contacts.map((contact: (typeof contacts)[number]) => ({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      avatarUrl: contact.avatarUrl,
      registeredUser: contact.linkedUser ? toPublicUser(contact.linkedUser) : null,
    })),
  });
});

app.get("/statuses", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const contacts = await prisma.contact.findMany({
    where: { ownerId: userId, linkedUserId: { not: null } },
    select: { linkedUserId: true },
  });
  const visibleUserIds = Array.from(new Set([userId, ...contacts.map((contact: (typeof contacts)[number]) => contact.linkedUserId).filter(Boolean) as string[]]));
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await prisma.statusItem.findMany({
    where: {
      userId: { in: visibleUserIds },
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(rows.map((row: StatusRow) => row.userId))) } },
    select: publicUserSelect,
  });
  const usersById = new Map<string, DbUser>(users.map((user: DbUser) => [user.id, user]));
  const statuses = rows
    .map((row: StatusRow) => {
      const user = usersById.get(row.userId);
      if (!user) return null;
      return createStatusView(row, user, userId);
    })
    .filter((status: ReturnType<typeof createStatusView> | null): status is ReturnType<typeof createStatusView> => Boolean(status));

  res.json({
    statuses,
  });
});

app.post("/statuses", requireUser, async (req, res) => {
  const parsed = z.object({
    text: z.string().trim().max(700).optional(),
    mediaUrl: z.union([imageValue, z.string().trim().startsWith("data:"), z.literal("")]).optional(),
    mediaType: z.enum(["image", "video"]).nullable().optional(),
    linkUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid status" });

  const userId = getReqUser(req).id;
  const text = parsed.data.text?.trim() ?? "";
  const mediaUrl = cleanOptional(parsed.data.mediaUrl);
  const mediaType = parsed.data.mediaType ?? null;
  const linkUrl = cleanOptional(parsed.data.linkUrl);
  if (!text && !mediaUrl && !linkUrl) return res.status(400).json({ error: "Add text, photo, video, or link first." });

  await prisma.statusItem.deleteMany({ where: { userId } });

  const status = await prisma.statusItem.create({
    data: {
      userId,
      text,
      mediaUrl,
      mediaType,
      linkUrl,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    status: createStatusView(status, user, userId),
  });
});

app.delete("/statuses/:statusId", requireUser, async (req, res) => {
  const statusId = getSingleParam(req.params.statusId);
  if (!statusId) return res.status(400).json({ error: "Invalid status id" });

  const deleted = await prisma.statusItem.deleteMany({
    where: { id: statusId, userId: getReqUser(req).id },
  });
  if (!deleted.count) return res.status(404).json({ error: "Status not found" });

  res.json({ ok: true, statusId });
});

app.get("/users/discover", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const query = String(req.query.q ?? "").trim();

  const existingContacts = await prisma.contact.findMany({
    where: { ownerId: userId, linkedUserId: { not: null } },
    select: { linkedUserId: true },
  });

  const excludedIds = [userId, ...existingContacts.map((contact: (typeof existingContacts)[number]) => contact.linkedUserId).filter(Boolean) as string[]];
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: excludedIds },
      ...(query ? {
        OR: [
          { name: { contains: query } },
          { username: { contains: query } },
          { phoneNumber: { contains: query } },
          { email: { contains: query } },
        ],
      } : {}),
    },
    select: publicUserSelect,
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  res.json({ users: users.map((user: (typeof users)[number]) => toPublicUser(user)) });
});

app.get("/connections/lookup", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const rawIdentifier = String(req.query.identifier ?? req.query.phoneNumber ?? req.query.email ?? "").trim();
  if (!rawIdentifier) return res.status(400).json({ error: "Phone number or email is required" });

  const normalizedPhone = rawIdentifier.includes("@") ? null : normalizePhone(rawIdentifier);
  const normalizedEmail = rawIdentifier.includes("@") ? rawIdentifier.toLowerCase() : null;

  const lookupWhere = [
    ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
    ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
  ];
  if (!lookupWhere.length) return res.status(400).json({ error: "Enter a valid phone number or email" });

  const user = await prisma.user.findFirst({
    where: { id: { not: userId }, OR: lookupWhere },
    select: publicUserSelect,
  });

  if (!user) return res.json({ user: null });

  const existingContact = await prisma.contact.findFirst({
    where: { ownerId: userId, linkedUserId: user.id },
    select: { id: true },
  });

  const existingRequest = await prisma.connectionRequest.findFirst({
    where: {
      OR: [
        { fromUserId: userId, toUserId: user.id },
        { fromUserId: user.id, toUserId: userId },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    user: toPublicUser(user),
    existingContact: Boolean(existingContact),
    existingRequest: existingRequest
      ? {
          id: existingRequest.id,
          status: existingRequest.status,
          direction: existingRequest.fromUserId === userId ? "outgoing" : "incoming",
        }
      : null,
  });
});

app.get("/connections/requests", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const rows = await prisma.connectionRequest.findMany({
    where: { toUserId: userId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  const requests = [];
  for (const row of rows) {
    const fromUser = await prisma.user.findUnique({ where: { id: row.fromUserId }, select: publicUserSelect });
    if (!fromUser) continue;
    requests.push({
      id: row.id,
      fromUser: toPublicUser(fromUser),
      aliasName: row.aliasName,
      phoneNumber: row.phoneNumber,
      createdAt: row.createdAt.toISOString(),
    });
  }

  res.json({ requests });
});

app.post("/connections/request", requireUser, async (req, res) => {
  const parsed = connectionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });

  const userId = getReqUser(req).id;
  if (parsed.data.targetUserId === userId) return res.status(400).json({ error: "Cannot connect with yourself" });

  const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.targetUserId }, select: publicUserSelect });
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const existingContact = await prisma.contact.findFirst({
    where: { ownerId: userId, linkedUserId: targetUser.id },
    select: { id: true },
  });
  if (existingContact) return res.status(409).json({ error: "You are already connected" });

  await prisma.connectionRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: targetUser.id } },
    create: {
      fromUserId: userId,
      toUserId: targetUser.id,
      aliasName: cleanOptional(parsed.data.aliasName),
      phoneNumber: normalizePhone(parsed.data.phoneNumber),
      status: "pending",
    },
    update: {
      aliasName: cleanOptional(parsed.data.aliasName),
      phoneNumber: normalizePhone(parsed.data.phoneNumber),
      status: "pending",
      respondedAt: null,
      createdAt: new Date(),
    },
  });

  res.json({ sent: true, user: toPublicUser(targetUser) });
});

app.post("/connections/requests/:id/respond", requireUser, async (req, res) => {
  const requestId = getSingleParam(req.params.id);
  const parsed = connectionDecisionSchema.safeParse(req.body);
  if (!requestId || !parsed.success) return res.status(400).json({ error: "Invalid request" });

  const userId = getReqUser(req).id;
  const request = await prisma.connectionRequest.findFirst({
    where: { id: requestId, toUserId: userId, status: "pending" },
  });
  if (!request) return res.status(404).json({ error: "Request not found" });

  await prisma.connectionRequest.update({
    where: { id: requestId },
    data: { status: parsed.data.action, respondedAt: new Date() },
  });

  if (parsed.data.action === "reject") {
    return res.json({ updated: true, status: "reject" });
  }

  const fromUser = await prisma.user.findUnique({ where: { id: request.fromUserId }, select: publicUserSelect });
  if (!fromUser) return res.status(404).json({ error: "Request sender not found" });

  const myContact = await ensureLinkedContact(userId, request.fromUserId, fromUser.name);
  await ensureLinkedContact(request.fromUserId, userId, request.aliasName || null);
  const chatId = await createDirectChatIfNeeded(userId, request.fromUserId);

  res.json({
    updated: true,
    status: "accept",
    contact: myContact,
    chatId,
    fromUser: toPublicUser(fromUser),
  });
});

async function createContact(ownerId: string, input: z.infer<typeof contactSchema>) {
  const phoneNumber = cleanOptional(input.phoneNumber);
  const email = cleanOptional(input.email)?.toLowerCase() ?? null;
  const avatarUrl = cleanOptional(input.avatarUrl);
  const linkedUser = await findLinkedUser(phoneNumber, email, ownerId);

  const contact = await prisma.contact.create({
    data: {
      ownerId,
      linkedUserId: linkedUser?.id ?? null,
      name: linkedUser?.name || linkedUser?.username || input.name,
      phoneNumber: linkedUser?.phoneNumber || phoneNumber,
      email: linkedUser?.email || email,
      avatarUrl: linkedUser?.avatarUrl || avatarUrl,
    },
    include: { linkedUser: { select: publicUserSelect } },
  });

  return {
    id: contact.id,
    name: contact.name,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    avatarUrl: contact.avatarUrl,
    registeredUser: contact.linkedUser ? toPublicUser(contact.linkedUser) : null,
  };
}

function createChatView(
  chat: {
    id: string;
    title?: string | null;
    avatarUrl?: string | null;
    isGroup?: boolean;
    updatedAt: Date;
    members: Array<{ user: DbUser; lastReadAt?: Date | null }>;
    messages: Array<{ id: string; text: string; createdAt: Date; senderId: string }>;
  },
  currentUserId: string,
) {
  const peer = chat.members.map((member) => member.user).find((user) => user.id !== currentUserId) ?? null;
  const members = chat.members.map((member) => toPublicUser(member.user));
  const isGroup = Boolean(chat.isGroup);
  const myMembership = chat.members.find((member) => member.user.id === currentUserId);
  const unreadCount = chat.messages.reduce((count, message) => {
    if (message.senderId === currentUserId) return count;
    if (!myMembership?.lastReadAt) return count + 1;
    return message.createdAt > myMembership.lastReadAt ? count + 1 : count;
  }, 0);
  return {
    id: chat.id,
    title: isGroup
      ? chat.title || members.filter((member) => member.id !== currentUserId).map((member) => member.name).slice(0, 3).join(", ")
      : peer?.name ?? peer?.username ?? "Chat",
    updatedAt: chat.updatedAt,
    lastMessage: chat.messages[0] ?? null,
    peer: isGroup ? null : (peer ? toPublicUser(peer) : null),
    isGroup,
    avatarUrl: isGroup ? chat.avatarUrl ?? null : peer?.avatarUrl ?? null,
    members: isGroup ? members : [],
    unreadCount,
  };
}

function getMessageReceiptInfo(
  createdAt: Date,
  senderId: string,
  members: Array<{ userId: string; lastReadAt: Date | null }>,
) {
  const others = members.filter((member) => member.userId !== senderId);
  const readCount = others.filter((member) => member.lastReadAt && member.lastReadAt >= createdAt).length;
  const deliveredCount = others.filter((member) =>
    (member.lastReadAt && member.lastReadAt >= createdAt)
    || (onlineUserConnections.get(member.userId) ?? 0) > 0,
  ).length;
  return {
    sent: true,
    deliveredTo: deliveredCount,
    readBy: readCount,
    status: readCount > 0 ? "read" : deliveredCount > 0 ? "delivered" : "sent",
  } as const;
}

function buildMessageView(
  message: {
    id: string;
    chatId: string;
    text: string;
    type?: string;
    mediaUrl?: string | null;
    mediaName?: string | null;
    mediaMime?: string | null;
    createdAt: Date;
    sender: DbUser;
  },
  members: Array<{ userId: string; lastReadAt: Date | null }>,
) {
  return {
    id: message.id,
    chatId: message.chatId,
    text: message.text,
    type: message.type ?? "text",
    mediaUrl: message.mediaUrl ?? null,
    mediaName: message.mediaName ?? null,
    mediaMime: message.mediaMime ?? null,
    createdAt: message.createdAt,
    sender: toPublicUser(message.sender),
    receipt: getMessageReceiptInfo(message.createdAt, message.sender.id, members),
  };
}

function createStatusView(row: StatusRow, user: DbUser, currentUserId: string) {
  return {
    id: row.id,
    userId: row.userId,
    name: user.name || user.username,
    avatarUrl: user.avatarUrl,
    text: row.text,
    createdAt: row.createdAt,
    mine: row.userId === currentUserId,
    mediaUrl: row.mediaUrl,
    mediaType: row.mediaType === "image" || row.mediaType === "video" ? row.mediaType : null,
    linkUrl: row.linkUrl,
  };
}

async function buildChatDeletionUpdate(chatId: string) {
  const [chat, latestMessage] = await Promise.all([
    prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, createdAt: true, updatedAt: true },
    }),
    prisma.message.findFirst({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      select: { text: true, createdAt: true, senderId: true, mediaName: true },
    }),
  ]);

  if (!chat) return null;

  return {
    chatId,
    updatedAt: latestMessage?.createdAt ?? chat.createdAt,
    lastMessage: latestMessage
      ? {
          text: latestMessage.text || latestMessage.mediaName || "Media",
          createdAt: latestMessage.createdAt,
          senderId: latestMessage.senderId,
        }
      : null,
  };
}

async function markChatRead(chatId: string, userId: string) {
  const now = new Date();
  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { lastReadAt: now },
  }).catch(() => null);
  io.to(`chat:${chatId}`).emit("chat:read", { chatId, userId, readAt: now.toISOString() });
}

app.post("/contacts", requireUser, async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid contact" });
  const contact = await createContact(getReqUser(req).id, parsed.data);
  res.json({ contact });
});

app.post("/contacts/import", requireUser, async (req, res) => {
  const parsed = contactsImportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import data" });
  const ownerId = getReqUser(req).id;
  const contacts = [];
  for (const entry of parsed.data.contacts) contacts.push(await createContact(ownerId, entry));
  res.json({ contacts });
});

app.post("/chats/dm", requireUser, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const userId = getReqUser(req).id;
  if (parsed.data.userId === userId) return res.status(400).json({ error: "Cannot chat with yourself" });
  const otherUser = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!otherUser) return res.status(404).json({ error: "Registered user not found" });

  const [a, b] = userId < parsed.data.userId ? [userId, parsed.data.userId] : [parsed.data.userId, userId];
  const existing = await prisma.directChat.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  if (existing) return res.json({ chatId: existing.chatId });

  const chat = await prisma.chat.create({
    data: {
      isGroup: false,
      members: { createMany: { data: [{ userId }, { userId: parsed.data.userId }] } },
      direct: { create: { userAId: a, userBId: b } },
    },
  });
  res.json({ chatId: chat.id });
});

app.post("/chats/group", requireUser, async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid group" });

  const ownerId = getReqUser(req).id;
  const uniqueMemberIds = Array.from(new Set([ownerId, ...parsed.data.memberIds.filter((id) => id !== ownerId)]));
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: uniqueMemberIds } },
    select: { id: true },
  });
  if (existingUsers.length !== uniqueMemberIds.length) return res.status(400).json({ error: "One or more group members were not found" });

  const chat = await prisma.chat.create({
    data: {
      title: parsed.data.title,
      avatarUrl: cleanOptional(parsed.data.avatarUrl),
      isGroup: true,
      members: { createMany: { data: uniqueMemberIds.map((id) => ({ userId: id })) } },
    },
  });
  res.json({ chatId: chat.id });
});

app.get("/chats", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const chats = await prisma.chat.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { select: { user: { select: publicUserSelect }, lastReadAt: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 200, select: { id: true, text: true, createdAt: true, senderId: true } },
    },
  });
  res.json({
    chats: chats.map((chat: (typeof chats)[number]) => createChatView(chat, userId)),
  });
});

app.get("/chats/:chatId/messages", requireUser, async (req, res) => {
  const chatId = getSingleParam(req.params.chatId);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });
  const userId = getReqUser(req).id;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!member) return res.status(403).json({ error: "Not a member" });

  const chatMembers = await prisma.chatMember.findMany({
    where: { chatId },
    select: { userId: true, lastReadAt: true },
  });

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: publicUserSelect } },
  });
  await markChatRead(chatId, userId);
  res.json({
    messages: messages.map((message: (typeof messages)[number]) => buildMessageView(message, chatMembers)),
  });
});

app.get("/calls", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const rows = await prisma.callLog.findMany({
    where: {
      OR: [{ callerId: userId }, { receiverId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const calls = [];
  for (const row of rows) {
    const otherUserId = row.callerId === userId ? row.receiverId : row.callerId;
    const otherUser = await prisma.user.findUnique({ where: { id: otherUserId }, select: publicUserSelect });
    if (!otherUser) continue;
    calls.push({
      id: row.id,
      chatId: row.chatId,
      user: toPublicUser(otherUser),
      mode: row.mode,
      direction: row.callerId === userId ? "outgoing" : "incoming",
      status: row.status,
      createdAt: row.createdAt,
      answeredAt: row.answeredAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds ?? 0,
    });
  }

  res.json({ calls });
});

app.post("/messages", requireUser, async (req, res) => {
  const parsed = messagePayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const userId = getReqUser(req).id;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: parsed.data.chatId, userId } } });
  if (!member) return res.status(403).json({ error: "Not a member" });

  const message = await prisma.message.create({
    data: {
      chatId: parsed.data.chatId,
      senderId: userId,
      text: parsed.data.text?.trim() ?? "",
      type: parsed.data.type,
      mediaUrl: cleanOptional(parsed.data.mediaUrl),
      mediaName: cleanOptional(parsed.data.mediaName),
      mediaMime: cleanOptional(parsed.data.mediaMime),
    },
    include: { sender: { select: publicUserSelect } },
  });
  await prisma.chat.update({ where: { id: parsed.data.chatId }, data: { updatedAt: new Date() } });
  const chatMembers = await prisma.chatMember.findMany({
    where: { chatId: parsed.data.chatId },
    select: { userId: true, lastReadAt: true },
  });

  const outbound = buildMessageView(message, chatMembers);
  io.to(`chat:${parsed.data.chatId}`).emit("message:new", outbound);
  res.json({ message: outbound });
});

app.delete("/messages/:messageId", requireUser, async (req, res) => {
  const messageId = getSingleParam(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });

  const userId = getReqUser(req).id;
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, chatId: true, senderId: true },
  });

  if (!message) return res.status(404).json({ error: "Message not found" });

  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId: message.chatId, userId } },
    select: { chatId: true },
  });
  if (!member) return res.status(403).json({ error: "Not a member" });
  if (message.senderId !== userId) return res.status(403).json({ error: "You can only delete your own messages" });

  await prisma.message.delete({ where: { id: messageId } });
  const update = await buildChatDeletionUpdate(message.chatId);
  io.to(`chat:${message.chatId}`).emit("message:deleted", {
    messageId,
    chatId: message.chatId,
    ...(update ?? {}),
  });
  res.json({
    ok: true,
    messageId,
    chatId: message.chatId,
    ...(update ?? {}),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (!origin || isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error("CORS blocked"), false);
    },
    credentials: true,
  },
});

function emitPresenceUpdate(userId: string, isOnline: boolean, lastSeenAt: string | null) {
  io.emit("presence:update", { userId, isOnline, lastSeenAt });
}

io.use((socket, next) => {
  const token = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.headers.authorization?.toString().split(" ")[1];
  if (!token) return next(new Error("Missing token"));
  void (async () => {
    try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      if (decoded.role === "admin") {
        next(new Error("Admin token is not allowed on chat sockets"));
        return;
      }
      const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: accountStateSelect });
      if (!user) {
        next(new Error("Invalid token"));
        return;
      }
      const accessError = getUserAccessError(user);
      if (accessError) {
        next(new Error(accessError));
        return;
      }
      socket.data.user = { id: user.id, username: user.username };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  })();
});

io.on("connection", (socket) => {
  const user = socket.data.user as { id: string };
  const nextConnections = (onlineUserConnections.get(user.id) ?? 0) + 1;
  onlineUserConnections.set(user.id, nextConnections);
  socket.join(`user:${user.id}`);
  if (nextConnections === 1) emitPresenceUpdate(user.id, true, null);

  socket.on("chat:join", async (chatId: string) => {
    const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: user.id } } });
    if (member) {
      socket.join(`chat:${chatId}`);
      await markChatRead(chatId, user.id);
    }
  });

  socket.on("typing:start", async ({ chatId }: { chatId: string }) => {
    const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: user.id } } });
    if (!member) return;
    socket.to(`chat:${chatId}`).emit("typing:update", { chatId, userId: user.id, isTyping: true });
  });

  socket.on("typing:stop", async ({ chatId }: { chatId: string }) => {
    const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: user.id } } });
    if (!member) return;
    socket.to(`chat:${chatId}`).emit("typing:update", { chatId, userId: user.id, isTyping: false });
  });

  socket.on("message:send", async (payload: unknown) => {
    const parsed = messagePayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: parsed.data.chatId, userId: user.id } } });
    if (!member) return;

    const message = await prisma.message.create({
      data: {
        chatId: parsed.data.chatId,
        senderId: user.id,
        text: parsed.data.text?.trim() ?? "",
        type: parsed.data.type,
        mediaUrl: cleanOptional(parsed.data.mediaUrl),
        mediaName: cleanOptional(parsed.data.mediaName),
        mediaMime: cleanOptional(parsed.data.mediaMime),
      },
      include: { sender: { select: publicUserSelect } },
    });
    await prisma.chat.update({ where: { id: parsed.data.chatId }, data: { updatedAt: new Date() } });
    const chatMembers = await prisma.chatMember.findMany({
      where: { chatId: parsed.data.chatId },
      select: { userId: true, lastReadAt: true },
    });
    io.to(`chat:${parsed.data.chatId}`).emit("message:new", buildMessageView(message, chatMembers));
    socket.to(`chat:${parsed.data.chatId}`).emit("typing:update", { chatId: parsed.data.chatId, userId: user.id, isTyping: false });
  });

  socket.on("call:initiate", async (payload: { callId: string; chatId: string; targetUserId: string; mode: "voice" | "video"; callerName: string; callerAvatarUrl?: string | null }) => {
    const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: payload.chatId, userId: user.id } } });
    if (!member) return;
    const targetMembership = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: payload.chatId, userId: payload.targetUserId } } });
    if (!targetMembership) return;
    await upsertCallLog({
      id: payload.callId,
      chatId: payload.chatId,
      callerId: user.id,
      receiverId: payload.targetUserId,
      mode: payload.mode,
      status: "ringing",
    });
    io.to(`user:${payload.targetUserId}`).emit("call:incoming", {
      callId: payload.callId,
      chatId: payload.chatId,
      fromUserId: user.id,
      fromName: payload.callerName,
      fromAvatarUrl: payload.callerAvatarUrl ?? null,
      mode: payload.mode,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("call:accept", async (payload: { callId: string; chatId: string; targetUserId: string; mode: "voice" | "video"; answererName: string }) => {
    await upsertCallLog({
      id: payload.callId,
      chatId: payload.chatId,
      callerId: payload.targetUserId,
      receiverId: user.id,
      mode: payload.mode,
      status: "completed",
      answeredAt: new Date().toISOString(),
    });
    io.to(`user:${payload.targetUserId}`).emit("call:accepted", {
      callId: payload.callId,
      chatId: payload.chatId,
      byUserId: user.id,
      byName: payload.answererName,
      mode: payload.mode,
    });
  });

  socket.on("call:decline", async (payload: { callId: string; chatId: string; targetUserId: string; mode: "voice" | "video"; declinerName: string }) => {
    await upsertCallLog({
      id: payload.callId,
      chatId: payload.chatId,
      callerId: payload.targetUserId,
      receiverId: user.id,
      mode: payload.mode,
      status: "declined",
      endedAt: new Date().toISOString(),
      durationSeconds: 0,
    });
    io.to(`user:${payload.targetUserId}`).emit("call:declined", {
      callId: payload.callId,
      chatId: payload.chatId,
      byUserId: user.id,
      byName: payload.declinerName,
      mode: payload.mode,
    });
  });

  socket.on("call:missed", async (payload: { callId: string; chatId: string; targetUserId: string; mode: "voice" | "video"; callerName: string }) => {
    await upsertCallLog({
      id: payload.callId,
      chatId: payload.chatId,
      callerId: user.id,
      receiverId: payload.targetUserId,
      mode: payload.mode,
      status: "missed",
      endedAt: new Date().toISOString(),
      durationSeconds: 0,
    });
    io.to(`user:${payload.targetUserId}`).emit("call:missed", {
      callId: payload.callId,
      chatId: payload.chatId,
      fromUserId: user.id,
      fromName: payload.callerName,
      mode: payload.mode,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("call:end", async (payload: { callId: string; chatId: string; targetUserId: string; mode: "voice" | "video"; endedByName: string; durationSeconds?: number }) => {
    await upsertCallLog({
      id: payload.callId,
      chatId: payload.chatId,
      callerId: user.id,
      receiverId: payload.targetUserId,
      mode: payload.mode,
      status: "completed",
      endedAt: new Date().toISOString(),
      durationSeconds: payload.durationSeconds ?? 0,
    });
    io.to(`user:${payload.targetUserId}`).emit("call:ended", {
      callId: payload.callId,
      chatId: payload.chatId,
      byUserId: user.id,
      byName: payload.endedByName,
      mode: payload.mode,
      durationSeconds: payload.durationSeconds ?? 0,
    });
  });

  socket.on("disconnect", async () => {
    const remainingConnections = Math.max((onlineUserConnections.get(user.id) ?? 1) - 1, 0);
    if (remainingConnections === 0) {
      onlineUserConnections.delete(user.id);
      const lastSeenAt = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt } }).catch(() => null);
      emitPresenceUpdate(user.id, false, lastSeenAt.toISOString());
      return;
    }
    onlineUserConnections.set(user.id, remainingConnections);
  });
});

app.use(express.static(frontendDistDir));
app.use((req, res, next) => {
  if (
    req.path.startsWith("/auth")
    || req.path.startsWith("/admin")
    || req.path.startsWith("/me")
    || req.path.startsWith("/contacts")
    || req.path.startsWith("/users")
    || req.path.startsWith("/chats")
    || req.path.startsWith("/messages")
    || req.path.startsWith("/calls")
    || req.path.startsWith("/health")
  ) {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(frontendDistDir, "index.html"));
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const message = err instanceof Error ? err.message : "Unexpected server error";
  console.error(err);
  if (
    req.path.startsWith("/auth")
    || req.path.startsWith("/admin")
    || req.path.startsWith("/me")
    || req.path.startsWith("/contacts")
    || req.path.startsWith("/users")
    || req.path.startsWith("/chats")
    || req.path.startsWith("/messages")
    || req.path.startsWith("/calls")
    || req.path.startsWith("/health")
  ) {
    return res.status(500).json({ error: message });
  }
  return res.status(500).send(message);
});

server.listen(env.PORT, env.HOST, () => {
  console.log(`Backend listening on http://${env.HOST}:${env.PORT}`);
});
