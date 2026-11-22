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

interface OtpRecord {
  hmac: string;
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

function hashOtp(email: string, code: string): string {
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${email}:${code}`)
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
    error:
      'SMTP email delivery is not configured. Set GMAIL_USER & GMAIL_APP_PASSWORD (or SMTP_HOST/SMTP_USER/SMTP_PASS) in environment secrets.',
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

  // Strict Google Sign-In Gmail OTP Dispatcher
  app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
    pruneExpiredOtps();
    const email = normalizeEmail(req.body?.email);
    const displayName =
      typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ ok: false, error: 'Valid Gmail address is required.' });
      return;
    }

    const existing = otpStore.get(email);
    const now = Date.now();
    if (existing && now - existing.lastSentAt < 20_000) {
      const waitSec = Math.ceil((20_000 - (now - existing.lastSentAt)) / 1000);
      res.status(429).json({
        ok: false,
        error: `Please wait ${waitSec}s before requesting another code.`,
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 1000000));
    otpStore.set(email, {
      hmac: hashOtp(email, code),
      expiresAt: now + 10 * 60 * 1000,
      lastSentAt: now,
      attempts: 0,
    });

    try {
      const delivery = await deliverOtpEmail(email, displayName, code);
      if (!delivery.delivered) {
        otpStore.delete(email);
        res.status(503).json({
          ok: false,
          smtpConfigured: false,
          error: delivery.error || 'Email delivery failed.',
        });
        return;
      }

      res.json({
        ok: true,
        smtpConfigured: true,
        maskedEmail: maskEmail(email),
        expiresInSeconds: 600,
      });
    } catch (err) {
      otpStore.delete(email);
      res.status(500).json({
        ok: false,
        smtpConfigured: true,
        error:
          err instanceof Error
            ? `Failed to send Gmail code: ${err.message}`
            : 'Failed to send Gmail verification email.',
      });
    }
  });

  // Strict Google Sign-In Gmail OTP Verification
  app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
    pruneExpiredOtps();
    const email = normalizeEmail(req.body?.email);
    const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
    const cleanCode = rawCode.replace(/\D/g, '').trim();

    if (!isValidEmail(email) || cleanCode.length !== 6) {
      res.status(400).json({
        ok: false,
        error: 'Enter the 6-digit verification code sent to your Gmail.',
      });
      return;
    }

    const record = otpStore.get(email);
    if (!record) {
      res.status(400).json({
        ok: false,
        error: 'No active verification code found. Please request a new code.',
      });
      return;
    }

    if (record.expiresAt <= Date.now()) {
      otpStore.delete(email);
      res.status(400).json({
        ok: false,
        error: 'Verification code expired. Please send a new code.',
      });
      return;
    }

    if (record.attempts >= 5) {
      otpStore.delete(email);
      res.status(429).json({
        ok: false,
        error: 'Too many invalid attempts. Request a fresh verification code.',
      });
      return;
    }

    const expectedBuf = Buffer.from(record.hmac, 'hex');
    const candidateBuf = Buffer.from(hashOtp(email, cleanCode), 'hex');
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

    otpStore.delete(email);
    const verifiedAt = new Date().toISOString();
    const verificationToken = crypto
      .createHmac('sha256', OTP_HMAC_SECRET)
      .update(`${email}:${verifiedAt}`)
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
