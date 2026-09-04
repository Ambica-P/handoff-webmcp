/**
 * Dispatches every /api/auth/github/* request to its handler in
 * lib/auth-handlers/. One route.js file (which Vercel counts as one
 * Function) instead of four separate files — Vercel's Hobby plan caps
 * a deployment at 12 Serverless Functions, and this project has enough
 * real endpoints (GitHub reads/writes) that one file per auth route
 * was pushing it over.
 *
 * Unlike a plain (frameworkless) Vercel Function, Next.js App Router
 * reliably populates the dynamic [...action] segment on `context.params`
 * — that's the whole reason this now lives under Next.js rather than
 * hand-rolled path parsing.
 */

import { NextResponse } from "next/server";
import { login } from "../../../../../lib/auth-handlers/login";
import { callback } from "../../../../../lib/auth-handlers/callback";
import { status } from "../../../../../lib/auth-handlers/status";
import { logout } from "../../../../../lib/auth-handlers/logout";

const GET_ROUTES = { login, callback, status };
const POST_ROUTES = { logout };

function notFound(action) {
  return NextResponse.json({ error: `Unknown route: /api/auth/github/${(action || []).join("/")}` }, { status: 404 });
}

export async function GET(request, context) {
  const { action } = await context.params;
  const route = GET_ROUTES[action?.[0]];
  return route ? route(request) : notFound(action);
}

export async function POST(request, context) {
  const { action } = await context.params;
  const route = POST_ROUTES[action?.[0]];
  return route ? route(request) : notFound(action);
}
