export const DEFAULT_ADMIN_EMAIL = "subhadip123@gmail.com";
export const DEFAULT_ADMIN_PASSWORD = "Subha@123";
export const DEFAULT_ADMIN_NAME = "HelloToo Admin";

export type InitialAdminAccountState = {
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

export function getInitialAdminAccountState(passwordHash: string): InitialAdminAccountState {
  const now = new Date().toISOString();
  return {
    id: "primary-admin",
    name: DEFAULT_ADMIN_NAME,
    email: DEFAULT_ADMIN_EMAIL,
    phoneNumber: null,
    passwordHash,
    pinHash: null,
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    mustChangePassword: true,
  };
}