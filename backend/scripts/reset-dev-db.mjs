import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../prisma/helloto.db");

const db = new Database(dbPath);

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  passwordHash TEXT NOT NULL,
  phoneNumber TEXT UNIQUE,
  phoneVerified BOOLEAN NOT NULL DEFAULT false,
  email TEXT UNIQUE,
  emailVerified BOOLEAN NOT NULL DEFAULT false,
  avatarUrl TEXT,
  bio TEXT NOT NULL DEFAULT '',
  statusText TEXT NOT NULL DEFAULT 'Hey there! I am using HelloTo.',
  lastSeenAt DATETIME,
  lastLoginAt DATETIME,
  suspendedUntil DATETIME,
  isBlocked BOOLEAN NOT NULL DEFAULT false,
  deletedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS Contact (
  id TEXT NOT NULL PRIMARY KEY,
  ownerId TEXT NOT NULL,
  linkedUserId TEXT,
  name TEXT NOT NULL,
  phoneNumber TEXT,
  email TEXT,
  avatarUrl TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (ownerId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (linkedUserId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS Contact_ownerId_name_idx ON Contact(ownerId, name);

CREATE TABLE IF NOT EXISTS EmailOtp (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT,
  email TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expiresAt DATETIME NOT NULL,
  consumedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS EmailOtp_email_purpose_expiresAt_idx ON EmailOtp(email, purpose, expiresAt);

CREATE TABLE IF NOT EXISTS PhoneOtp (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT,
  phoneNumber TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expiresAt DATETIME NOT NULL,
  consumedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS PhoneOtp_phoneNumber_purpose_expiresAt_idx ON PhoneOtp(phoneNumber, purpose, expiresAt);

CREATE TABLE IF NOT EXISTS Chat (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT,
  avatarUrl TEXT,
  isGroup BOOLEAN NOT NULL DEFAULT false,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS DirectChat (
  id TEXT NOT NULL PRIMARY KEY,
  chatId TEXT NOT NULL UNIQUE,
  userAId TEXT NOT NULL,
  userBId TEXT NOT NULL,
  FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (userAId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (userBId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS DirectChat_userAId_userBId_key ON DirectChat(userAId, userBId);
CREATE INDEX IF NOT EXISTS DirectChat_userBId_userAId_idx ON DirectChat(userBId, userAId);

CREATE TABLE IF NOT EXISTS ChatMember (
  id TEXT NOT NULL PRIMARY KEY,
  chatId TEXT NOT NULL,
  userId TEXT NOT NULL,
  joinedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastReadAt DATETIME,
  FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS ChatMember_chatId_userId_key ON ChatMember(chatId, userId);

CREATE TABLE IF NOT EXISTS Message (
  id TEXT NOT NULL PRIMARY KEY,
  chatId TEXT NOT NULL,
  senderId TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  mediaUrl TEXT,
  mediaName TEXT,
  mediaMime TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (senderId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS Message_chatId_createdAt_idx ON Message(chatId, createdAt);

CREATE TABLE IF NOT EXISTS StatusItem (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT NOT NULL,
  chatId TEXT,
  text TEXT NOT NULL DEFAULT '',
  mediaUrl TEXT,
  mediaType TEXT,
  linkUrl TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS StatusItem_userId_createdAt_idx ON StatusItem(userId, createdAt);

CREATE TABLE IF NOT EXISTS ConnectionRequest (
  id TEXT NOT NULL PRIMARY KEY,
  fromUserId TEXT NOT NULL,
  toUserId TEXT NOT NULL,
  aliasName TEXT,
  phoneNumber TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondedAt DATETIME,
  FOREIGN KEY (fromUserId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (toUserId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS ConnectionRequest_fromUserId_toUserId_key ON ConnectionRequest(fromUserId, toUserId);
CREATE INDEX IF NOT EXISTS ConnectionRequest_toUserId_status_createdAt_idx ON ConnectionRequest(toUserId, status, createdAt);

CREATE TABLE IF NOT EXISTS CallLog (
  id TEXT NOT NULL PRIMARY KEY,
  chatId TEXT NOT NULL,
  callerId TEXT NOT NULL,
  receiverId TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ringing',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answeredAt DATETIME,
  endedAt DATETIME,
  durationSeconds INTEGER,
  FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (callerId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (receiverId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS CallLog_callerId_createdAt_idx ON CallLog(callerId, createdAt);
CREATE INDEX IF NOT EXISTS CallLog_receiverId_createdAt_idx ON CallLog(receiverId, createdAt);

CREATE TABLE IF NOT EXISTS UserAuditEvent (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  actorType TEXT NOT NULL DEFAULT 'system',
  actorId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS UserAuditEvent_userId_createdAt_idx ON UserAuditEvent(userId, createdAt);
CREATE INDEX IF NOT EXISTS UserAuditEvent_kind_createdAt_idx ON UserAuditEvent(kind, createdAt);

CREATE TABLE IF NOT EXISTS ModerationReport (
  id TEXT NOT NULL PRIMARY KEY,
  reporterUserId TEXT,
  targetUserId TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  actionNote TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewedAt DATETIME,
  reviewedBy TEXT,
  FOREIGN KEY (reporterUserId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (targetUserId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS ModerationReport_targetUserId_status_createdAt_idx ON ModerationReport(targetUserId, status, createdAt);
CREATE INDEX IF NOT EXISTS ModerationReport_reporterUserId_createdAt_idx ON ModerationReport(reporterUserId, createdAt);

CREATE TABLE IF NOT EXISTS AdminNotice (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  sentBy TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS AdminNotice_userId_createdAt_idx ON AdminNotice(userId, createdAt);
`);

db.close();
console.log(`Fresh HelloToo database created at ${dbPath}`);
