import { describe, it, expect, vi, beforeEach } from "vitest";

const insertSpy = vi.fn().mockResolvedValue({ error: null });
const fromSpy = vi.fn(() => ({ insert: insertSpy }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: fromSpy }),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: "admin-1",
    auth_user_id: "auth-1",
    email: "admin@example.com",
    role: "admin",
    organization_id: "org-ccmc-uuid",
    invited_at: "2026-01-01T00:00:00Z",
    invited_by: null,
    first_login_at: null,
    last_login_at: null,
    removed_at: null,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteUser } from "@/app/(app)/admin/actions";

describe("inviteUser", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    fromSpy.mockClear();
  });

  it("scopes the invited user to the inviting admin's organization", async () => {
    await inviteUser({ email: "New@Example.com" });

    expect(fromSpy).toHaveBeenCalledWith("users");
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith({
      email: "new@example.com",
      role: "user",
      invited_by: "admin-1",
      organization_id: "org-ccmc-uuid",
    });
  });

  it("propagates supabase insert errors", async () => {
    insertSpy.mockResolvedValueOnce({ error: { message: "duplicate email" } });
    await expect(inviteUser({ email: "dup@example.com" })).rejects.toThrow(
      "duplicate email",
    );
  });
});
