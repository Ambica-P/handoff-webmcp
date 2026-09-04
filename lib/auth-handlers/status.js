/**
 * GET /api/auth/github/status
 *
 * Tells the frontend whether a GitHub account is connected, and who —
 * nothing more. The frontend polls this once on load to decide whether
 * to show "Connect GitHub" or the repository picker.
 */

import { NextResponse } from "next/server";
import { getSession } from "../session";

export async function status(request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, login: session.login, avatarUrl: session.avatarUrl });
}
