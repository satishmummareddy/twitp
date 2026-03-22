import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "twitp_admin_session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD environment variable is not set");
  }
  return password === adminPassword;
}

export async function setAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return !!session?.value;
}
