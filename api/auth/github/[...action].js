/**
 * Dispatches every /api/auth/github/* request to its handler in
 * lib/auth-handlers/. This is one file instead of four so the whole
 * auth flow costs a single Serverless Function slot — Vercel's Hobby
 * plan caps a deployment at 12, and this project has enough real
 * endpoints (board tools' GitHub reads/writes) that four separate auth
 * files was pushing it over. The public URLs are unchanged: this file's
 * [...action] dynamic segment matches /login, /callback, /status, and
 * /logout exactly as if each were its own file.
 */

const login = require("../../../lib/auth-handlers/login");
const callback = require("../../../lib/auth-handlers/callback");
const status = require("../../../lib/auth-handlers/status");
const logout = require("../../../lib/auth-handlers/logout");

const ROUTES = { login, callback, status, logout };

module.exports = async function handler(req, res) {
  const segments = [].concat(req.query.action || []);
  const route = ROUTES[segments[0]];

  if (!route) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Unknown route: /api/auth/github/${segments.join("/")}` }));
    return;
  }

  return route(req, res);
};
