import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("session");
  response.cookies.delete("user_info");
  return response;
}
