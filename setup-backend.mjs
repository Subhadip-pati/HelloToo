/**
 * Setup script to create backend directory structure and utility files
 * Run with: node setup-backend.mjs
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, "backend", "src");

const directories = [
  "types",
  "middleware",
  "schemas",
  "utils",
];

const files = {
  "types/index.ts": `/**
 * TypeScript type definitions and interfaces for the backend
 */

export interface AuthUser {
  id: string;
  email?: string;
  phoneNumber?: string;
  role: "user" | "admin";
}

export interface TokenPayload {
  userId: string;
  email?: string;
  role: "user" | "admin";
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp?: string;
  path?: string;
  details?: any;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface RateLimitStore {
  count: number;
  resetAt: number;
}

export type EmailOtpPurpose =
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

export type PhoneOtpPurpose =
  | "verify-phone"
  | "login-phone"
  | "reset-password-phone"
  | "reset-pin-phone"
  | "admin-change-phone";

export interface AdminAccount {
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
}

export interface MessagePayload {
  chatId: string;
  text?: string;
  type: "text" | "image" | "audio" | "video" | "file";
  mediaUrl?: string;
  mediaName?: string;
  mediaMime?: string;
}

export interface CallLogPayload {
  id: string;
  chatId: string;
  callerId: string;
  receiverId: string;
  mode: "voice" | "video";
  status: "ringing" | "completed" | "declined" | "missed";
  answeredAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}
`,

  "middleware/errorHandler.ts": `/**
 * Error handling middleware for consistent error responses
 */

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "ApiError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = "Authentication failed") {
    super(401, message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = "Access denied") {
    super(403, message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = "Resource") {
    super(404, \`\${resource} not found\`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = "Resource conflict") {
    super(409, message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = "Too many requests") {
    super(429, message);
    this.name = "RateLimitError";
  }
}

/**
 * Main error handling middleware
 * Must be registered as the last middleware in the app
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  logger.error(\`Error: \${err.message}\`, {
    name: err.name,
    statusCode: err.statusCode,
    stack: err.stack,
    details: err.details,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
      code: e.code,
    }));
    return res.status(400).json({
      error: "Validation Error",
      message: "Request validation failed",
      statusCode: 400,
      details,
    });
  }

  // Handle API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
    });
  }

  // Handle standard errors
  if (err instanceof Error) {
    const statusCode = err instanceof SyntaxError && "status" in err ? (err as any).status : 500;
    const message = statusCode === 400 ? "Invalid request format" : "Internal server error";

    return res.status(statusCode).json({
      error: err.name || "Error",
      message,
      statusCode,
    });
  }

  // Handle unknown errors
  res.status(500).json({
    error: "UnknownError",
    message: "An unexpected error occurred",
    statusCode: 500,
  });
}

/**
 * 404 Not Found handler
 * Must be registered before errorHandler
 */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: "Not Found",
    message: \`API route not found: \${_req.method} \${_req.path}\`,
    statusCode: 404,
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
`,

  "utils/logger.ts": `/**
 * Simple logger utility for backend logging
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDev = process.env.NODE_ENV !== "production";

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = this.formatTimestamp();
    const contextStr = context ? \` \${JSON.stringify(context)}\` : "";
    return \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\${contextStr}\`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDev) {
      console.log(this.formatLog("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatLog("info", message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog("warn", message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatLog("error", message, context));
  }
}

export const logger = new Logger();
`,

  "utils/jwt.ts": `/**
 * JWT token generation and verification utilities
 */

import jwt from "jsonwebtoken";
import type { TokenPayload } from "../types/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "helloto-dev-secret-2026";
const TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY = "30d";

/**
 * Generate a JWT token for authentication
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify token and throw if invalid
 */
export function verifyTokenStrict(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}
`,

  "schemas/validation.ts": `/**
 * Zod validation schemas for request validation
 */

import { z } from "zod";

// Common patterns
const emailSchema = z.string().trim().email("Invalid email format");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const phoneSchema = z.string().trim().min(7, "Invalid phone number").max(20);
const uuidSchema = z.string().uuid("Invalid UUID format");
const otpSchema = z.string().regex(/^\d{6}$/, "OTP must be 6 digits");

// User Authentication
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  phoneNumber: phoneSchema.optional(),
  profilePicture: z.string().url().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const requestEmailOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum([
    "verify-email",
    "login",
    "reset-password",
    "reset-pin",
    "admin-login",
    "admin-reset-password",
    "admin-reset-pin",
    "admin-change-credentials",
    "admin-change-email",
    "admin-change-phone",
    "admin-forgot-password",
  ]),
});

export const requestPhoneOtpSchema = z.object({
  phoneNumber: phoneSchema,
  purpose: z.enum([
    "verify-phone",
    "login-phone",
    "reset-password-phone",
    "reset-pin-phone",
    "admin-change-phone",
  ]),
});

export const verifyOtpSchema = z.object({
  email: emailSchema.optional(),
  phoneNumber: phoneSchema.optional(),
  otp: otpSchema,
  purpose: z.string(),
});

export const resetPasswordSchema = z.object({
  otp: otpSchema,
  newPassword: passwordSchema,
  purpose: z.string(),
  email: emailSchema.optional(),
  phoneNumber: phoneSchema.optional(),
});

// Chat and Messages
export const createChatSchema = z.object({
  memberIds: z.array(uuidSchema).min(1, "At least one member is required"),
  name: z.string().trim().max(100).optional(),
  type: z.enum(["direct", "group"]).optional(),
});

export const updateChatSchema = z.object({
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().max(500).optional(),
  profilePicture: z.string().url().optional(),
});

export const messageSchema = z.object({
  chatId: uuidSchema,
  text: z.string().trim().optional(),
  type: z.enum(["text", "image", "audio", "video", "file"]),
  mediaUrl: z.string().url().optional(),
  mediaName: z.string().optional(),
  mediaMime: z.string().optional(),
});

// User Profile
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(500).optional(),
  profilePicture: z.string().url().optional(),
  status: z.string().trim().max(100).optional(),
  phoneNumber: phoneSchema.optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  skip: z.coerce.number().int().nonnegative().optional(),
});

// Admin
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const adminLoginWithPinSchema = z.object({
  email: emailSchema,
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

// Type exports for convenience
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
`,
};

// Create directories
for (const dir of directories) {
  const fullPath = join(srcPath, dir);
  mkdirSync(fullPath, { recursive: true });
  console.log(\`✓ Created directory: \${fullPath}\`);
}

// Create files
for (const [filePath, content] of Object.entries(files)) {
  const fullPath = join(srcPath, filePath);
  writeFileSync(fullPath, content, "utf-8");
  console.log(\`✓ Created file: \${fullPath}\`);
}

console.log("\\n✓ Backend structure setup complete!");
