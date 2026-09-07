import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, getInitialAdminAccountState } from "./adminConfig.js";

describe("admin bootstrap config", () => {
  it("uses the required temporary admin credentials", () => {
    expect(DEFAULT_ADMIN_EMAIL).toBe("subhadip123@gmail.com");
    expect(DEFAULT_ADMIN_PASSWORD).toBe("Subha@123");
  });

  it("requires the first admin login to change the password", () => {
    const state = getInitialAdminAccountState("hash");
    expect(state.mustChangePassword).toBe(true);
  });
});
