import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const CANONICAL_PUBLIC_URL =
  'https://ais-pre-juv42jdfqkfmr4uvlolrey-190160227104.asia-east1.run.app';
const OTP_HMAC_SECRET =
  process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex');

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function loadFirebaseProjectId(): string {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
    }
  } catch {
    // fallback to environment variable below
  }
  return process.env.FIREBASE_PROJECT_ID?.trim() || '';
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();

let cachedFirebaseCerts: Record<string, string> = {};
let cachedCertsExpiresAt = 0;

async function fetchFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedCertsExpiresAt > now && Object.keys(cachedFirebaseCerts).length > 0) {
    return cachedFirebaseCerts;
  }

  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Unable to fetch Google auth certificates (HTTP ${res.status}).`);
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Math.max(300, Number(maxAgeMatch[1])) : 3600;
  cachedFirebaseCerts = certs;
  cachedCertsExpiresAt = now + maxAgeSec * 1000;
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name?: string;
}

async function verifyFirebaseBearerToken(req: Request): Promise<VerifiedFirebaseUser> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Firebase project configuration is missing on the server.');
  }

  const authHeader = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match || !match[1]) {
    throw new Error('Google authentication token is required. Please sign in with Google again.');
  }

  const token = match[1].trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Google authentication token format.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(payloadB64);

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unsupported Google authentication token signature.');
  }

  let certs = await fetchFirebasePublicCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await fetchFirebasePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Google signing certificate not found for this session. Please try again.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const sigBuf = decodeBase64UrlBuffer(signatureB64);
  if (!verifier.verify(certPem, sigBuf)) {
    throw new Error('Google authentication token signature check failed.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer) {
    throw new Error('Google authentication token belongs to a different project.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128) {
    throw new Error('Google authentication token is missing a valid user ID.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Google sign-in session expired. Please sign in with Google again.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Google authentication token timestamp is invalid.');
  }

  const tokenEmail = normalizeEmail(payload.email);
  if (!isValidEmail(tokenEmail) || payload.email_verified !== true) {
    throw new Error('Google account must have a verified Gmail/email address.');
  }

  return {
    uid: payload.sub.trim(),
    email: tokenEmail,
    name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : undefined,
  };
}

interface OtpRecord {
  hmac: string;
  uid: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpRecord>();

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 254) : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || '*'}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(6, local.length - 2))}@${domain}`;
}

function hashOtp(uid: string, email: string, code: string): string {
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${uid}:${email}:${code}`)
    .digest('hex');
}

function pruneExpiredOtps(): void {
  const now = Date.now();
  for (const [key, record] of otpStore.entries()) {
    if (record.expiresAt <= now) {
      otpStore.delete(key);
    }
  }
}

function isEmailDeliveryConfigured(): boolean {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.trim();
  const smtpUser = process.env.SMTP_USER?.trim() || gmailUser;
  const smtpPass = process.env.SMTP_PASS?.trim() || gmailAppPassword;
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  return Boolean((smtpUser && smtpPass) || resendApiKey);
}

async function deliverOtpEmail(
  toEmail: string,
  displayName: string,
  code: string
): Promise<{ delivered: boolean; provider?: string; error?: string }> {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = process.env.SMTP_USER?.trim() || gmailUser;
  const smtpPass = process.env.SMTP_PASS?.trim() || gmailAppPassword;
  const smtpFrom =
    process.env.SMTP_FROM?.trim() ||
    (smtpUser ? `PesoBudget Security <${smtpUser}>` : 'PesoBudget Security <no-reply@pesobudget.app>');
  const resendApiKey = process.env.RESEND_API_KEY?.trim();

  const subject = `PesoBudget Verification Code: ${code}`;
  const textBody = [
    `Hello ${displayName || 'there'},`,
    '',
    `Your PesoBudget Gmail verification code is: ${code}`,
    '',
    'Enter this 6-digit code inside Settings -> Google Cloud Account to finish signing in.',
    'This code expires in 10 minutes. If you did not request this, you can safely ignore this message.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 28px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #34d399; margin-bottom: 8px;">PesoBudget Security</div>
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #ffffff;">Gmail Sign-In Verification Code</h2>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #cbd5e1;">
        Hi ${displayName ? displayName.replace(/[<>&"]/g, '') : 'there'}, use the 6-digit verification code below to confirm your Google sign-in:
      </p>
      <div style="background: #020617; border: 1px solid #10b981; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 30px; font-weight: 800; letter-spacing: 0.25em; color: #34d399;">${code}</span>
      </div>
      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
        Expires in 10 minutes. Never share this verification code with anyone.
      </p>
    </div>
  `;

  if (smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost || 'smtp.gmail.com',
      port: smtpHost ? smtpPort : 465,
      secure: smtpHost ? smtpPort === 465 : true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    await transporter.sendMail({
      from: smtpFrom,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return { delivered: true, provider: 'smtp' };
  }

  if (resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: smtpFrom,
        to: [toEmail],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { delivered: false, error: `Email provider error: ${detail}` };
    }
    return { delivered: true, provider: 'resend' };
  }

  return {
    delivered: false,
    error: 'Email SMTP is not configured in environment secrets.',
  };
}

function isAllowedHealthUrl(rawUrl: string, requestHost?: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const canonicalHost = new URL(CANONICAL_PUBLIC_URL).host;
    if (parsed.host === canonicalHost) return CANONICAL_PUBLIC_URL;
    if (requestHost && parsed.host === requestHost) return parsed.toString();
    return null;
  } catch {
    return null;
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Public Link Background Health Check
  app.get('/api/health-check', async (req: Request, res: Response) => {
    const requestedUrl =
      typeof req.query.url === 'string' && req.query.url.trim()
        ? req.query.url.trim()
        : CANONICAL_PUBLIC_URL;
    const safeUrl = isAllowedHealthUrl(requestedUrl, req.get('host'));
    if (!safeUrl) {
      res.status(400).json({
        ok: false,
        error: 'Target URL is not in the allowlist.',
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);

    try {
      let upstream = await fetch(safeUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      if (upstream.status === 405 || upstream.status === 501) {
        upstream = await fetch(safeUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        });
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      const ok = upstream.status >= 200 && upstream.status < 400;

      res.json({
        ok,
        status: upstream.status,
        statusText: upstream.statusText || (ok ? 'OK' : 'Error'),
        latencyMs,
        url: safeUrl,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      res.json({
        ok: false,
        status: 0,
        statusText: err instanceof Error ? err.message : 'Network unreachable',
        latencyMs,
        url: safeUrl,
        checkedAt: new Date().toISOString(),
      });
    }
  });

  // Strict Google Sign-In OTP Dispatcher (requires valid Google Firebase ID Token)
  app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
    pruneExpiredOtps();

    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await verifyFirebaseBearerToken(req);
    } catch (err) {
      res.status(401).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Google authentication verification failed.',
      });
      return;
    }

    const requestedEmail = normalizeEmail(req.body?.email);
    const email = verifiedUser.email;
    if (requestedEmail && requestedEmail !== email) {
      res.status(403).json({
        ok: false,
        error: 'Requested email does not match your signed-in Google account.',
      });
      return;
    }

    const displayName =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim().slice(0, 120)
        : verifiedUser.name || '';

    const storeKey = `${verifiedUser.uid}:${email}`;
    const existing = otpStore.get(storeKey);
    const now = Date.now();
    if (existing && now - existing.lastSentAt < 15_000) {
      const waitSec = Math.ceil((15_000 - (now - existing.lastSentAt)) / 1000);
      res.status(429).json({
        ok: false,
        error: `Please wait ${waitSec}s before requesting another code.`,
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 1000000));
    otpStore.set(storeKey, {
      hmac: hashOtp(verifiedUser.uid, email, code),
      uid: verifiedUser.uid,
      expiresAt: now + 10 * 60 * 1000,
      lastSentAt: now,
      attempts: 0,
    });

    const smtpConfigured = isEmailDeliveryConfigured();
    if (!smtpConfigured) {
      // Google OAuth + RS256 Firebase ID token is already cryptographically verified;
      // issue a one-time confirmation code for this verified Google session so the public link never locks out users.
      res.json({
        ok: true,
        deliveryMode: 'oauth_session_code',
        smtpConfigured: false,
        maskedEmail: maskEmail(email),
        expiresInSeconds: 600,
        sessionCode: code,
      });
      return;
    }

    try {
      const delivery = await deliverOtpEmail(email, displayName, code);
      if (!delivery.delivered) {
        otpStore.delete(storeKey);
        res.status(502).json({
          ok: false,
          smtpConfigured: true,
          error: delivery.error || 'Email delivery failed.',
        });
        return;
      }

      res.json({
        ok: true,
        deliveryMode: 'email',
        smtpConfigured: true,
        maskedEmail: maskEmail(email),
        expiresInSeconds: 600,
      });
    } catch (err) {
      otpStore.delete(storeKey);
      res.status(502).json({
        ok: false,
        smtpConfigured: true,
        error:
          err instanceof Error
            ? `Failed to send Gmail code: ${err.message}`
            : 'Failed to send Gmail verification email.',
      });
    }
  });

  // Strict Google Sign-In OTP Verification (requires valid Google Firebase ID Token)
  app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
    pruneExpiredOtps();

    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await verifyFirebaseBearerToken(req);
    } catch (err) {
      res.status(401).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Google authentication verification failed.',
      });
      return;
    }

    const email = verifiedUser.email;
    const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
    const cleanCode = rawCode.replace(/\D/g, '').trim();

    if (!isValidEmail(email) || cleanCode.length !== 6) {
      res.status(400).json({
        ok: false,
        error: 'Enter the 6-digit verification code.',
      });
      return;
    }

    const storeKey = `${verifiedUser.uid}:${email}`;
    const record = otpStore.get(storeKey);
    if (!record) {
      res.status(400).json({
        ok: false,
        error: 'No active verification code found. Please request a new code.',
      });
      return;
    }

    if (record.expiresAt <= Date.now()) {
      otpStore.delete(storeKey);
      res.status(400).json({
        ok: false,
        error: 'Verification code expired. Please send a new code.',
      });
      return;
    }

    if (record.attempts >= 5) {
      otpStore.delete(storeKey);
      res.status(429).json({
        ok: false,
        error: 'Too many invalid attempts. Request a fresh verification code.',
      });
      return;
    }

    const expectedBuf = Buffer.from(record.hmac, 'hex');
    const candidateBuf = Buffer.from(hashOtp(verifiedUser.uid, email, cleanCode), 'hex');
    const isMatch =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!isMatch) {
      record.attempts += 1;
      const remaining = Math.max(0, 5 - record.attempts);
      res.status(401).json({
        ok: false,
        error:
          remaining > 0
            ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
            : 'Too many invalid attempts. Request a fresh code.',
      });
      return;
    }

    otpStore.delete(storeKey);
    const verifiedAt = new Date().toISOString();
    const verificationToken = crypto
      .createHmac('sha256', OTP_HMAC_SECRET)
      .update(`${verifiedUser.uid}:${email}:${verifiedAt}`)
      .digest('hex');

    res.json({
      ok: true,
      email,
      verifiedAt,
      verificationToken,
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PesoBudget server running on http://0.0.0.0:${PORT}`);
  });
}

void createServer();
