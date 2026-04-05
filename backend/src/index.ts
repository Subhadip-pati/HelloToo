import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistDir = path.resolve(__dirname, "../../frontend/dist");

const env = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(16).default("helloto-dev-secret-2026"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
}).parse(process.env);

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
    return false;
  } catch {
    return false;
  }
}
const onlineUserConnections = new Map<string, number>();
const DEFAULT_STATUS = "Hey there! I am using DipsChat.";
const OTP_MINUTES = 10;

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
  purpose: z.enum(["verify-email", "login"]),
});

const phoneOtpRequestSchema = z.object({
  phoneNumber: z.string().trim().min(7).max(20),
  purpose: z.enum(["verify-phone", "login-phone"]),
});

const otpVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});

const phoneOtpVerifySchema = z.object({
  phoneNumber: z.string().trim().min(7).max(20),
  code: z.string().trim().length(6),
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

type JwtPayload = { sub: string; username: string };
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
type AuthedRequest = express.Request & { user: { id: string; username: string } };
type ConnectionRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  aliasName: string | null;
  phoneNumber: string | null;
  status: string;
  createdAt: string;
  respondedAt: string | null;
};
type CallLogRow = {
  id: string;
  chatId: string;
  callerId: string;
  receiverId: string;
  mode: string;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
};

const transporter = env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

const twilioConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

function signToken(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9+]/g, "");
  return cleaned || null;
}

function makeUsername(name: string, phoneNumber?: string | null, email?: string | null) {
  const base = (phoneNumber ?? email?.split("@")[0] ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${(base || "user").slice(0, 18)}${Math.random().toString(36).slice(2, 8)}`;
}

function toPublicUser(user: DbUser) {
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

async function ensureConnectionRequestTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ConnectionRequest (
      id TEXT PRIMARY KEY,
      fromUserId TEXT NOT NULL,
      toUserId TEXT NOT NULL,
      aliasName TEXT,
      phoneNumber TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      respondedAt TEXT,
      UNIQUE(fromUserId, toUserId)
    )
  `);
}

async function ensureCallLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CallLog (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      callerId TEXT NOT NULL,
      receiverId TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ringing',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      answeredAt TEXT,
      endedAt TEXT,
      durationSeconds INTEGER
    )
  `);
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
  await prisma.$executeRawUnsafe(
    `INSERT INTO CallLog (id, chatId, callerId, receiverId, mode, status, createdAt, answeredAt, endedAt, durationSeconds)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)
     ON CONFLICT(id)
     DO UPDATE SET
       status = excluded.status,
       answeredAt = COALESCE(excluded.answeredAt, CallLog.answeredAt),
       endedAt = COALESCE(excluded.endedAt, CallLog.endedAt),
       durationSeconds = COALESCE(excluded.durationSeconds, CallLog.durationSeconds)`,
    input.id,
    input.chatId,
    input.callerId,
    input.receiverId,
    input.mode,
    input.status,
    input.createdAt ?? null,
    input.answeredAt ?? null,
    input.endedAt ?? null,
    input.durationSeconds ?? null,
  );
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

async function issueOtp(email: string, purpose: "verify-email" | "login", userId?: string | null) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: { userId: userId ?? null, email, codeHash, purpose, expiresAt },
  });

  const subject = purpose === "verify-email" ? "Verify your HelloTo email" : "Your HelloTo login OTP";
  const html = `<div style="font-family:Segoe UI,sans-serif;padding:24px"><h2>HelloTo verification</h2><p>Your OTP code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</div><p>This code expires in ${OTP_MINUTES} minutes.</p></div>`;

  if (transporter && env.SMTP_FROM) {
    await transporter.sendMail({ from: env.SMTP_FROM, to: email, subject, html });
    return { delivered: true };
  }

  console.log(`[DEV OTP] ${purpose} for ${email}: ${code}`);
  return { delivered: false, devOtpPreview: code };
}

async function issuePhoneOtp(phoneNumber: string, purpose: "verify-phone" | "login-phone", userId?: string | null) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: { userId: userId ?? null, email: phoneNumber, codeHash, purpose, expiresAt },
  });

  const message = `Your HelloToo OTP is ${code}. It expires in ${OTP_MINUTES} minutes.`;
  if (await sendSms(phoneNumber, message)) {
    return { delivered: true };
  }

  console.log(`[DEV PHONE OTP] ${purpose} for ${phoneNumber}: ${code}`);
  return { delivered: false, devOtpPreview: code };
}

async function verifyOtp(email: string, purpose: "verify-email" | "login", code: string) {
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

async function verifyPhoneOtp(phoneNumber: string, purpose: "verify-phone" | "login-phone", code: string) {
  const otp = await prisma.emailOtp.findFirst({
    where: { email: phoneNumber, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return null;
  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) return null;
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return otp;
}

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as unknown as AuthedRequest).user = { id: decoded.sub, username: decoded.username };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

const app = express();
app.use(cors({
  origin(origin, cb) {
    if (!origin || isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error("CORS blocked"), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const phoneNumber = normalizePhone(cleanOptional(parsed.data.phoneNumber));
  const email = cleanOptional(parsed.data.email)?.toLowerCase() ?? null;
  const avatarUrl = cleanOptional(parsed.data.avatarUrl);

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
      lastSeenAt: new Date(),
    },
    select: publicUserSelect,
  });

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

app.post("/auth/login", async (req, res) => {
  const parsed = passwordLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login" });

  const identifier = parsed.data.identifier.trim();
  const normalizedPhone = normalizePhone(identifier);
  const emailIdentifier = identifier.toLowerCase();

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
  if (user.email && identifier.includes("@") && !user.emailVerified) {
    return res.status(403).json({ error: "Email not verified", needsEmailVerification: true });
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: publicUserSelect });
  res.json({ token: signToken({ sub: user.id, username: user.username }), user: fullUser ? toPublicUser(fullUser) : null });
});

app.post("/auth/request-email-otp", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid email request" });

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
  if (!user) return res.status(404).json({ error: "Email not found" });
  if (parsed.data.purpose === "verify-email" && user.emailVerified) {
    return res.json({ sent: false, message: "Email already verified" });
  }

  const result = await issueOtp(email, parsed.data.purpose, user.id);
  res.json({ sent: true, delivery: result.delivered ? "email" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/request-phone-otp", async (req, res) => {
  const parsed = phoneOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile OTP request" });

  const phoneNumber = parsed.data.phoneNumber.trim();
  const user = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true, phoneVerified: true } });
  if (!user) return res.status(404).json({ error: "Mobile number not found" });
  if (parsed.data.purpose === "verify-phone" && user.phoneVerified) {
    return res.json({ sent: false, message: "Mobile number already verified" });
  }

  const result = await issuePhoneOtp(phoneNumber, parsed.data.purpose, user.id);
  res.json({ sent: true, delivery: result.delivered ? "sms" : "dev-console", ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}) });
});

app.post("/auth/verify-email-otp", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid verification code" });

  const email = parsed.data.email.toLowerCase();
  const otp = await verifyOtp(email, "verify-email", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
    select: publicUserSelect,
  });
  res.json({ verified: true, user: toPublicUser(user) });
});

app.post("/auth/login-with-email-otp", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid OTP login" });

  const email = parsed.data.email.toLowerCase();
  const otp = await verifyOtp(email, "login", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.findUnique({ where: { email }, select: publicUserSelect });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({ token: signToken({ sub: user.id, username: user.username }), user: toPublicUser({ ...user, emailVerified: true }) });
});

app.post("/auth/verify-phone-otp", async (req, res) => {
  const parsed = phoneOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile verification code" });

  const otp = await verifyPhoneOtp(parsed.data.phoneNumber.trim(), "verify-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.update({
    where: { phoneNumber: parsed.data.phoneNumber.trim() },
    data: { phoneVerified: true },
    select: publicUserSelect,
  });
  res.json({ verified: true, user: toPublicUser(user) });
});

app.post("/auth/login-with-phone-otp", async (req, res) => {
  const parsed = phoneOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid mobile OTP login" });

  const phoneNumber = parsed.data.phoneNumber.trim();
  const otp = await verifyPhoneOtp(phoneNumber, "login-phone", parsed.data.code);
  if (!otp) return res.status(400).json({ error: "Invalid or expired OTP" });

  const user = await prisma.user.findUnique({ where: { phoneNumber }, select: publicUserSelect });
  if (!user) return res.status(404).json({ error: "User not found" });

  const updatedUser = user.phoneVerified ? user : await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerified: true },
    select: publicUserSelect,
  });

  res.json({ token: signToken({ sub: updatedUser.id, username: updatedUser.username }), user: toPublicUser(updatedUser) });
});

app.get("/me", requireUser, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: getReqUser(req).id }, select: publicUserSelect });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: toPublicUser(user) });
});

app.put("/me/profile", requireUser, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile data" });

  const userId = getReqUser(req).id;
  const phoneNumber = cleanOptional(parsed.data.phoneNumber);
  const email = cleanOptional(parsed.data.email)?.toLowerCase() ?? null;
  const avatarUrl = cleanOptional(parsed.data.avatarUrl);

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

  res.json({ user: toPublicUser(user) });
});

app.get("/contacts", requireUser, async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { ownerId: getReqUser(req).id },
    orderBy: { name: "asc" },
    include: { linkedUser: { select: publicUserSelect } },
  });
  res.json({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      avatarUrl: contact.avatarUrl,
      registeredUser: contact.linkedUser ? toPublicUser(contact.linkedUser) : null,
    })),
  });
});

app.get("/users/discover", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const query = String(req.query.q ?? "").trim();

  const existingContacts = await prisma.contact.findMany({
    where: { ownerId: userId, linkedUserId: { not: null } },
    select: { linkedUserId: true },
  });

  const excludedIds = [userId, ...existingContacts.map((contact) => contact.linkedUserId).filter(Boolean) as string[]];
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

  res.json({ users: users.map((user) => toPublicUser(user)) });
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

  const existingRequestRows = await prisma.$queryRawUnsafe<ConnectionRequestRow[]>(
    `SELECT * FROM ConnectionRequest
     WHERE ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))
     ORDER BY createdAt DESC LIMIT 1`,
    userId,
    user.id,
    user.id,
    userId,
  );
  const existingRequest = existingRequestRows[0] ?? null;

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
  const rows = await prisma.$queryRawUnsafe<ConnectionRequestRow[]>(
    `SELECT * FROM ConnectionRequest
     WHERE toUserId = ? AND status = 'pending'
     ORDER BY createdAt DESC`,
    userId,
  );

  const requests = [];
  for (const row of rows) {
    const fromUser = await prisma.user.findUnique({ where: { id: row.fromUserId }, select: publicUserSelect });
    if (!fromUser) continue;
    requests.push({
      id: row.id,
      fromUser: toPublicUser(fromUser),
      aliasName: row.aliasName,
      phoneNumber: row.phoneNumber,
      createdAt: row.createdAt,
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

  await prisma.$executeRawUnsafe(
    `INSERT INTO ConnectionRequest (id, fromUserId, toUserId, aliasName, phoneNumber, status, createdAt)
     VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
     ON CONFLICT(fromUserId, toUserId)
     DO UPDATE SET aliasName = excluded.aliasName, phoneNumber = excluded.phoneNumber, status = 'pending', respondedAt = NULL, createdAt = CURRENT_TIMESTAMP`,
    crypto.randomUUID(),
    userId,
    targetUser.id,
    cleanOptional(parsed.data.aliasName),
    normalizePhone(parsed.data.phoneNumber),
  );

  res.json({ sent: true, user: toPublicUser(targetUser) });
});

app.post("/connections/requests/:id/respond", requireUser, async (req, res) => {
  const requestId = getSingleParam(req.params.id);
  const parsed = connectionDecisionSchema.safeParse(req.body);
  if (!requestId || !parsed.success) return res.status(400).json({ error: "Invalid request" });

  const userId = getReqUser(req).id;
  const rows = await prisma.$queryRawUnsafe<ConnectionRequestRow[]>(
    `SELECT * FROM ConnectionRequest WHERE id = ? AND toUserId = ? AND status = 'pending' LIMIT 1`,
    requestId,
    userId,
  );
  const request = rows[0];
  if (!request) return res.status(404).json({ error: "Request not found" });

  await prisma.$executeRawUnsafe(
    `UPDATE ConnectionRequest SET status = ?, respondedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    parsed.data.action,
    requestId,
  );

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
      name: linkedUser?.name || input.name,
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
  const deliveredCount = others.length;
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
    chats: chats.map((chat) => createChatView(chat, userId)),
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
    messages: messages.map((message) => buildMessageView(message, chatMembers)),
  });
});

app.get("/calls", requireUser, async (req, res) => {
  const userId = getReqUser(req).id;
  const rows = await prisma.$queryRawUnsafe<CallLogRow[]>(
    `SELECT * FROM CallLog
     WHERE callerId = ? OR receiverId = ?
     ORDER BY createdAt DESC
     LIMIT 200`,
    userId,
    userId,
  );

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
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });

function emitPresenceUpdate(userId: string, isOnline: boolean, lastSeenAt: string | null) {
  io.emit("presence:update", { userId, isOnline, lastSeenAt });
}

io.use((socket, next) => {
  const token = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.headers.authorization?.toString().split(" ")[1];
  if (!token) return next(new Error("Missing token"));
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    socket.data.user = { id: decoded.sub, username: decoded.username };
    next();
  } catch {
    next(new Error("Invalid token"));
  }
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
  if (req.path.startsWith("/auth") || req.path.startsWith("/me") || req.path.startsWith("/contacts") || req.path.startsWith("/users") || req.path.startsWith("/chats") || req.path.startsWith("/messages") || req.path.startsWith("/calls") || req.path.startsWith("/health")) {
    return next();
  }
  res.sendFile(path.join(frontendDistDir, "index.html"));
});

Promise.all([ensureConnectionRequestTable(), ensureCallLogTable()])
  .then(() => {
    server.listen(env.PORT, env.HOST, () => {
      console.log(`Backend listening on http://${env.HOST}:${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize backend tables", error);
    process.exit(1);
  });
