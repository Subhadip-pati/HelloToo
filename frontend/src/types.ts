/**
 * Core domain types for the HelloToo messaging application
 */

/** User representation in the system */
export type User = {
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

/** Contact in the user's contact list */
export type Contact = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  avatarUrl: string | null;
  registeredUser: User | null;
};

/** Last message preview for a chat */
export type LastMessagePreview = {
  text: string;
  createdAt: string;
  senderId: string;
};

/** Chat/Conversation representation */
export type Chat = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage: LastMessagePreview | null;
  peer: User | null;
  isGroup: boolean;
  avatarUrl: string | null;
  members: User[];
  unreadCount: number;
};

/** Message delivery and read status */
export type ReceiptStatus = 'sent' | 'delivered' | 'read';

/** Message receipt tracking */
export type MessageReceipt = {
  sent: boolean;
  deliveredTo: number;
  readBy: number;
  status: ReceiptStatus;
};

/** Supported message content types */
export type MessageType = 'text' | 'image' | 'video' | 'file' | 'audio';

/** Message in a conversation */
export type Message = {
  id: string;
  chatId: string;
  text: string;
  type: MessageType;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMime?: string | null;
  createdAt: string;
  sender: User;
  receipt?: MessageReceipt;
};

/** Call log entry */
export type CallLog = {
  id: string;
  chatId: string;
  user: User;
  mode: 'voice' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'ringing' | 'missed' | 'declined' | 'completed';
  createdAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
};

/** Real-time typing event */
export type TypingEvent = {
  chatId: string;
  userId: string;
  isTyping: boolean;
};

/** Mobile contacts view mode */
export type MobileContactsView = 'people' | 'add' | 'discover' | 'groups';

/** Authentication tab selection */
export type AuthTab = 'password' | 'email-otp' | 'phone-otp';

/** Phone OTP form state */
export type PhoneOtpForm = {
  phoneNumber: string;
  code: string;
};

/** Application section */
export type Section = 'chats' | 'contacts' | 'updates' | 'calls' | 'account';

/** Incoming connection request */
export type IncomingRequest = {
  id: string;
  fromUser: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  };
  aliasName: string | null;
  phoneNumber: string | null;
  createdAt: string;
};

/** Recorded connection action (rejection, block, report) */
export type ConnectionRecord = {
  requestId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  aliasName: string | null;
  phoneNumber: string | null;
  createdAt: string;
  disposition: 'rejected' | 'blocked' | 'reported';
  note: string;
};

/** Input for creating a connection record */
export type ConnectionRecordInput = {
  requestId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  aliasName?: string | null;
  phoneNumber?: string | null;
  createdAt?: string;
};

/** Attached media in message composer */
export type ComposerMedia = {
  type: string;
  mediaUrl: string;
  mediaName: string;
  mediaMime: string;
} | null;

/** Active voice/video call */
export type ActiveCall = {
  id: string;
  chatId: string;
  targetUserId: string;
  mode: 'voice' | 'video';
  title: string;
  startedAt: number;
  status: 'ringing' | 'connected';
} | null;

/** Incoming call notification */
export type IncomingCall = {
  id: string;
  chatId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: 'voice' | 'video';
  createdAt: string;
} | null;

/** User lookup result from directory */
export type LookupUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  statusText: string;
  phoneNumber?: string | null;
  email?: string | null;
};

/** Complete lookup result for a user search */
export type LookupResult = {
  user: LookupUser | null;
  existingContact: boolean;
  existingRequest: null | { id: string; status: string; direction: 'incoming' | 'outgoing' };
};

/** User detail for modals/views */
export type DetailUser = {
  id?: string;
  name: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  statusText?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

/** Presence event from other users */
export type PresenceEvent = {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
};

/** Chat read acknowledgment */
export type ChatReadEvent = {
  chatId: string;
  userId: string;
  readAt: string;
};

/** Message deleted event */
export type MessageDeletedEvent = {
  messageId: string;
  chatId: string;
  updatedAt?: string;
  lastMessage?: LastMessagePreview | null;
};

/** Chat lock/security configuration */
export type ChatLockConfig = {
  pinHash: string;
  passwordHash: string;
};

/** Application-level lock configuration */
export type AppLockConfig = {
  pinHash: string;
  passwordHash: string;
  patternHash: string;
  biometricEnabled: boolean;
  biometricCredentialId: string;
  autoLockOnHide: boolean;
};

/** Update availability notice */
export type UpdateNotice = {
  currentBuildId: string;
  latestBuildId: string;
};

/** Chat notification for desktop/mobile alerts */
export type ChatNotification = {
  chatId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  preview: string;
  unreadCount: number;
};

/** Notification history entry */
export type NotificationEntry = {
  id: string;
  kind: 'message' | 'connection' | 'info' | 'error' | 'otp' | 'update';
  title: string;
  detail: string;
  createdAt: string;
  updateBuildId?: string;
  updateStatus?: 'pending' | 'accepted' | 'rejected';
};

/** Timeline item (message or call) */
export type TimelineItem =
  | { kind: 'message'; createdAt: string; id: string; message: Message }
  | { kind: 'call'; createdAt: string; id: string; call: CallLog };

/** Grouped messages for timeline rendering */
export type TimelineBlock =
  | { kind: 'date'; id: string; label: string }
  | {
      kind: 'message-group';
      id: string;
      mine: boolean;
      senderName?: string;
      messages: Message[];
    }
  | { kind: 'call'; id: string; call: CallLog };

/** Report reason options */
export type ReportReason =
  | 'Spam messages'
  | 'Fraud or scam'
  | 'Abusive behaviour'
  | 'Unwanted messages'
  | 'Fake profile';

/** Admin profile with security settings */
export type AdminProfile = {
  email: string;
  phoneNumber: string | null;
  name: string;
  hasPin?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

/** Admin authentication response */
export type AdminAuthResponse = {
  token: string;
  admin?: AdminProfile | null;
  user?: AdminProfile | null;
};

/** Navigation icon type */
export type NavIcon = 'chat' | 'connections' | 'status' | 'call' | 'ai' | 'settings';

/** Portal selection for auth (user or admin) */
export type AuthPortal = 'chooser' | 'user' | 'admin';

/** Authentication mode */
export type AuthMode = 'login' | 'register';

/** Main application section */
export type AppSection = 'chats' | 'connections' | 'updates' | 'calls' | 'ai' | 'account';

/** Typing indicator event */
export type IncomingTypingEvent = {
  chatId: string;
  userId: string;
  isTyping: boolean;
};
