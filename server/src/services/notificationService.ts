import nodemailer, { Transporter } from 'nodemailer';

// In-memory transporter cache
let cachedTransporter: Transporter | null = null;
let twilioSdk: any = null;

function getEmailTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  if (!cachedTransporter) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  return cachedTransporter;
}

function getTwilioClient(): { client: any; fromNumber: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  if (!twilioSdk) {
    twilioSdk = require('twilio');
  }

  return {
    client: twilioSdk(accountSid, authToken),
    fromNumber,
  };
}

// Test store for recording dispatched OTPs during automated testing
const rawEmailStore: Record<string, string> = {};
const rawSmsStore: Record<string, string> = {};

export const __testNotificationStore: {
  emails: Record<string, string>;
  sms: Record<string, string>;
} = {
  emails: new Proxy(rawEmailStore, {
    get(target, prop: string) {
      if (typeof prop !== 'string') return undefined;
      const normalized = prop.toLowerCase().trim();
      return target[normalized] || target[prop];
    },
    set(target, prop: string, value: string) {
      target[prop] = value;
      target[prop.toLowerCase().trim()] = value;
      return true;
    },
  }),
  sms: new Proxy(rawSmsStore, {
    get(target, prop: string) {
      if (typeof prop !== 'string') return undefined;
      if (target[prop]) return target[prop];
      const stripped = prop.replace(/[\s\-]/g, '');
      if (target[stripped]) return target[stripped];
      const digits = prop.replace(/\D/g, '');
      for (const [k, v] of Object.entries(target)) {
        if (k.replace(/\D/g, '') === digits) return v;
      }
      return undefined;
    },
    set(target, prop: string, value: string) {
      target[prop] = value;
      target[prop.replace(/[\s\-]/g, '')] = value;
      return true;
    },
  }),
};

/**
 * Send real 6-digit OTP to user's email address via SMTP
 */
export async function sendEmailOtp(
  to: string,
  otp: string,
  purpose: 'signup' | 'forgot-password'
): Promise<void> {
  const purposeTitle =
    purpose === 'signup' ? 'Civic Account Registration' : 'Password Reset Request';

  // Automated test environment bypass (unless real credentials supplied)
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REAL_NOTIFICATIONS) {
    if (process.env.TEST_SIMULATE_DELIVERY_FAILURE === 'true') {
      throw new Error('Simulated delivery failure in test');
    }
    __testNotificationStore.emails[to.toLowerCase().trim()] = otp;
    return;
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP service is not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASS).');
  }

  const fromAddress =
    process.env.SMTP_FROM || `"Nivara Civic Engine" <${process.env.SMTP_USER}>`;

  const subject = `Your Nivara verification code: ${otp}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0284c7; font-size: 22px; margin: 0 0 6px 0; font-weight: 800; letter-spacing: -0.5px;">NIVARA</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Civic Issue Clustering & Reporting Engine</p>
      </div>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <h2 style="font-size: 15px; color: #1e293b; margin: 0 0 10px 0;">${purposeTitle}</h2>
        <p style="color: #475569; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
          Please enter the following 6-digit verification code to complete your verification:
        </p>
        
        <div style="text-align: center; margin: 16px 0;">
          <div style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0f172a; background: #ffffff; padding: 14px 24px; border: 2px dashed #0284c7; border-radius: 12px;">
            ${otp}
          </div>
        </div>

        <p style="color: #64748b; font-size: 12px; text-align: center; margin: 12px 0 0 0;">
          ⏰ This code is valid for <strong>10 minutes</strong>.
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 11px; line-height: 1.4; margin: 0; text-align: center;">
        If you did not request this verification code, please ignore this email. Never share your verification code with anyone.
      </p>
    </div>
  `;

  const text = `Your Nivara verification code is: ${otp}\n\nThis code is valid for 10 minutes.\nIf you did not request this code, please ignore this email.`;

  await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    text,
    html,
  });
}

/**
 * Send real 6-digit OTP to user's mobile number via SMS
 */
export async function sendSmsOtp(
  to: string,
  otp: string,
  purpose: 'signup' | 'forgot-password'
): Promise<void> {
  // Automated test environment bypass (unless real credentials supplied)
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REAL_NOTIFICATIONS) {
    if (process.env.TEST_SIMULATE_DELIVERY_FAILURE === 'true') {
      throw new Error('Simulated delivery failure in test');
    }
    __testNotificationStore.sms[to.trim()] = otp;
    return;
  }

  const twilioConfig = getTwilioClient();
  if (!twilioConfig) {
    throw new Error('Twilio SMS service is not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER).');
  }

  const body = `Your Nivara verification code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`;

  // Format phone number to E.164 if possible
  let formattedPhone = to.trim();
  if (!formattedPhone.startsWith('+')) {
    // Default to India (+91) if 10-digit number without country code
    const digits = formattedPhone.replace(/\D/g, '');
    if (digits.length === 10) {
      formattedPhone = `+91${digits}`;
    } else {
      formattedPhone = `+${digits}`;
    }
  }

  await twilioConfig.client.messages.create({
    body,
    to: formattedPhone,
    from: twilioConfig.fromNumber,
  });
}
