import { rateLimit } from "../src/middleware/rateLimit.js";

// Auth brute-force: throttle per (ip + username) using request body username.
// NOTE: keep generic error contract already used across the app (429 json below).
export const loginBruteForceLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  limitBy: "ip+user",
  keyFromBody: (req: any) => req?.body?.username,
});

export const authModerateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  limitBy: "ip",
});

export const authModeratePerUserLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  limitBy: "ip+user",
  keyFromBody: (req: any) => req?.body?.username ?? req?.body?.email,
});

export const authQueryPerUserLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  limitBy: "ip+user",
  keyFromQuery: (req: any) => req?.query?.user,
});

// AI abuse protection: bound generation & streaming by IP
export const aiAbuseLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  limitBy: "ip",
});

// Parsing expensive endpoints: smaller bounds by IP
export const parseFileLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  limitBy: "ip",
});

export const parseExternalLinkLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  limitBy: "ip",
});

export const lookupDoiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  limitBy: "ip",
});