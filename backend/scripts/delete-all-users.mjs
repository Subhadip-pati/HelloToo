import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../prisma/helloto.db");

const db = new Database(dbPath);

const count = db.prepare("SELECT COUNT(*) AS count FROM User").get().count;
const existingTables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name),
);

db.pragma("foreign_keys = OFF");
const transaction = db.transaction(() => {
  [
    "AdminNotice",
    "ModerationReport",
    "UserAuditEvent",
    "CallLog",
    "ConnectionRequest",
    "StatusItem",
    "Message",
    "ChatMember",
    "DirectChat",
    "Chat",
    "Contact",
    "EmailOtp",
    "PhoneOtp",
    "User",
  ].filter((table) => existingTables.has(table)).forEach((table) => {
    db.prepare(`DELETE FROM ${table}`).run();
  });
});

transaction();
db.pragma("foreign_keys = ON");

console.log(`Deleted ${count} user account(s) and related user data. Admin account file was not changed.`);
