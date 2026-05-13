import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const mutableCookieStore = cookieStore as unknown as {
    get(name: string): { value?: string } | undefined;
    set(input: { name: string; value: string } & CookieOptions): void;
  };
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return mutableCookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          mutableCookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          mutableCookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
