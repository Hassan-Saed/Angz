const nodemailer = require('nodemailer');

/**
 * Outbound mail for password resets.
 *
 * SMTP settings come from the environment. When they are absent the transport
 * is not created and `sendPasswordReset` reports failure instead of silently
 * pretending to send — callers can then return an honest error rather than
 * telling a user to check an inbox that will never receive anything.
 */

const RESET_SUBJECT = {
  ar: 'إعادة تعيين كلمة المرور — أنجز',
  en: 'Reset your Angz password',
};

const RESET_BODY = {
  ar: (name, link) =>
    `مرحبًا ${name}،\n\n` +
    `استخدم الرابط التالي لإعادة تعيين كلمة المرور الخاصة بك. الرابط صالح لمدة 30 دقيقة ويمكن استخدامه مرة واحدة فقط.\n\n` +
    `${link}\n\n` +
    `إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة المرور الحالية كما هي.\n\n` +
    `أنجز`,
  en: (name, link) =>
    `Hello ${name},\n\n` +
    `Use the link below to reset your password. It is valid for 30 minutes and can be used only once.\n\n` +
    `${link}\n\n` +
    `If you did not request this, you can safely ignore this email and your current password will remain unchanged.\n\n` +
    `Angz`,
};

let cachedTransport = null;
let cachedFrom = null;

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  const from = SMTP_FROM || SMTP_USER;

  // Rebuild only when configuration changes, so the pool is reused otherwise.
  if (cachedTransport && cachedFrom === from) {
    return cachedTransport;
  }

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  cachedFrom = from;
  return cachedTransport;
}

function isConfigured() {
  return getTransport() !== null;
}

/**
 * Sends the reset link. Resolves to `{sent: true}` on success and
 * `{sent: false, reason}` when mail is not configured or delivery failed.
 */
async function sendPasswordReset({ to, name, link, locale = 'en' }) {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const lang = locale === 'ar' ? 'ar' : 'en';

  try {
    await transport.sendMail({
      from: cachedFrom,
      to,
      subject: RESET_SUBJECT[lang],
      text: RESET_BODY[lang](name || '', link),
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] password reset delivery failed:', err.message);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = { sendPasswordReset, isConfigured };