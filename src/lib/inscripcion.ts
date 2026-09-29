/**
 * Everything the sign-up endpoint decides that does not need Moodle or the
 * network: what a valid submission is, how a RUT becomes a username, what the
 * temporary password looks like and what the welcome email says. Kept apart
 * from the route so it can be tested directly.
 */
import { z } from 'astro/zod';
import { COMUNAS_RM, COMUNA_OTRA } from '@/config/programa';

// ── RUT ──────────────────────────────────────────────────────────────────────

/** "12.345.678-k" → "12345678-K", or null when it is not shaped like a RUT. */
export function normalizeRut(input: string): string | null {
  const clean = input.replace(/[.\s-]/g, '').toUpperCase();
  const match = /^(\d{7,8})([\dK])$/.exec(clean);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** Checks the verifier digit (módulo 11) of a normalized RUT. */
export function isValidRut(rut: string): boolean {
  const [body, dv] = rut.split('-');
  if (!body || !dv) return false;
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return dv === expected;
}

/** Moodle usernames must be lowercase; the RUT is unique per person. */
export function usernameFromRut(rut: string): string {
  return rut.toLowerCase();
}

// ── Submission ───────────────────────────────────────────────────────────────

export const MENSAJES = {
  firstname: 'Ingresa tus nombres.',
  lastname: 'Ingresa tus apellidos.',
  rut: 'El RUT no es válido. Revisa el dígito verificador.',
  rutTaken: 'Este RUT ya está registrado con otro correo. Escríbenos para ayudarte.',
  email: 'Ingresa un correo electrónico válido.',
  phone: 'Ingresa un teléfono válido.',
  comuna: 'Selecciona tu comuna.',
  address: 'Ingresa tu dirección.',
  consent: 'Debes aceptar el uso de tus datos para inscribirte.',
  generic: 'Revisa este campo.',
  unavailable: 'Las inscripciones no están disponibles en este momento. Inténtalo más tarde.',
  moodle: 'No pudimos completar tu inscripción en el Aula Virtual. Inténtalo nuevamente en unos minutos.',
} as const;

export const inscripcionSchema = z.object({
  firstname: z.string().trim().min(2, MENSAJES.firstname).max(100, MENSAJES.firstname),
  lastname: z.string().trim().min(2, MENSAJES.lastname).max(100, MENSAJES.lastname),
  rut: z.string().transform((value, ctx) => {
    const rut = normalizeRut(value);
    if (!rut || !isValidRut(rut)) {
      ctx.addIssue({ code: 'custom', message: MENSAJES.rut });
      return z.NEVER;
    }
    return rut;
  }),
  email: z.string().trim().toLowerCase().pipe(z.email(MENSAJES.email).max(100, MENSAJES.email)),
  phone: z
    .string()
    .trim()
    .refine((value) => /^\+?[\d\s()-]{8,20}$/.test(value), MENSAJES.phone)
    .transform((value) => value.replace(/[^\d+]/g, '')),
  comuna: z.enum([...COMUNAS_RM, COMUNA_OTRA], MENSAJES.comuna),
  address: z.string().trim().min(5, MENSAJES.address).max(255, MENSAJES.address),
  institution: z.string().trim().max(255).optional().default(''),
  consent: z.literal('on', MENSAJES.consent),
  honeypot: z.string().max(0),
});

export type Inscripcion = z.infer<typeof inscripcionSchema>;

/** Field name → messages, the shape the form script displays. */
export function fieldErrors(issues: z.core.$ZodIssue[]): Record<string, string[]> {
  const known = new Set<string>(Object.values(MENSAJES));
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    const message = known.has(issue.message) ? issue.message : MENSAJES.generic;
    const list = (errors[field] ??= []);
    if (!list.includes(message)) list.push(message);
  }
  return errors;
}

/** "3, 5,12" → [3, 5, 12]. Anything that is not a positive integer is dropped. */
export function parseCourseIds(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

// ── Temporary password ───────────────────────────────────────────────────────

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
// Only symbols that survive email clients, copy-paste and HTML unescaped.
const SYMBOLS = '!#$%*+=?@';

/**
 * Meets Moodle's default password policy (8+ characters, with a lowercase, an
 * uppercase, a digit and a symbol) with room to spare. Look-alike characters
 * (l/1, O/0) are left out because people copy this from an email.
 */
export function generatePassword(length = 12): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[randomIndex(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function randomIndex(max: number): number {
  // Rejection sampling keeps every character equally likely.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

// ── Welcome email ────────────────────────────────────────────────────────────

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface WelcomeEmail {
  programa: string;
  organizador: string;
  supportEmail?: string;
  moodleUrl: string;
  firstname: string;
  username: string;
  /** Set only when the account was created by this sign-up. */
  password?: string;
  courses: string[];
}

/*
 * Email clients ignore CSS custom properties, so the page's tokens cannot
 * reach an inbox. These mirror the brand tokens in `src/styles/global.css`.
 */
const BRAND = '#0077a3';
const ACCENT = '#f9bf3b';
const INK = '#1e3a4a';
const MUTED = '#5b6b75';
const PANEL = '#f1f5f7';

export function renderWelcomeEmail(data: WelcomeEmail): { subject: string; html: string; text: string } {
  const loginUrl = `${data.moodleUrl}/login/index.php`;
  const forgotUrl = `${data.moodleUrl}/login/forgot_password.php`;
  const isNew = Boolean(data.password);

  const subject = `Tu acceso a ${data.programa}`;
  const greeting = `Hola ${data.firstname}:`;
  const intro = data.courses.length
    ? `Tu inscripción en ${data.programa} está lista. Ya tienes acceso a estos ${data.courses.length} cursos:`
    : `Tu inscripción en ${data.programa} está lista y tus cursos ya están disponibles en el Aula Virtual.`;
  const newAccount = 'Creamos tu cuenta en el Aula Virtual. Estos son tus datos de acceso:';
  const changePassword = 'Al entrar por primera vez te pediremos cambiar esta contraseña por una propia.';
  const existing = `Ya tenías una cuenta en el Aula Virtual con este correo. Entra con tu usuario (${data.username}) y tu contraseña de siempre. Si no la recuerdas:`;
  const footer = data.supportEmail
    ? `Si no solicitaste esta inscripción, ignora este correo o escríbenos a ${data.supportEmail}.`
    : 'Si no solicitaste esta inscripción, ignora este correo.';

  const credentialsHtml = isNew
    ? `<p style="margin:0 0 8px">${escapeHtml(newAccount)}</p>
       <table role="presentation" style="background:${PANEL};border-radius:8px;padding:12px;width:100%;margin:0 0 8px">
         <tr><td style="padding:4px 12px;color:${MUTED}">Usuario</td>
             <td style="padding:4px 12px;font-family:monospace;font-size:15px"><strong>${escapeHtml(data.username)}</strong></td></tr>
         <tr><td style="padding:4px 12px;color:${MUTED}">Contraseña temporal</td>
             <td style="padding:4px 12px;font-family:monospace;font-size:15px"><strong>${escapeHtml(data.password!)}</strong></td></tr>
       </table>
       <p style="margin:0 0 24px;color:${MUTED};font-size:13px">${escapeHtml(changePassword)}</p>`
    : `<p style="margin:0 0 24px">${escapeHtml(existing)}
       <a href="${escapeHtml(forgotUrl)}" style="color:${BRAND}">restablecer contraseña</a></p>`;

  const coursesHtml = data.courses.length
    ? `<ol style="margin:0 0 24px;padding-left:22px">${data.courses
        .map((c) => `<li style="margin:4px 0">${escapeHtml(c)}</li>`)
        .join('')}</ol>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:${PANEL};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK}">
  <table role="presentation" style="max-width:560px;width:100%;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:${INK};color:#ffffff;padding:20px 28px;border-bottom:4px solid ${ACCENT}">
      <div style="font-size:20px;font-weight:bold">${escapeHtml(data.programa)}</div>
      <div style="font-size:13px;opacity:.85">${escapeHtml(data.organizador)}</div>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 16px;font-size:17px"><strong>${escapeHtml(greeting)}</strong></p>
      <p style="margin:0 0 12px">${escapeHtml(intro)}</p>
      ${coursesHtml}
      ${credentialsHtml}
      <p style="margin:0 0 24px;text-align:center">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px">Entrar al Aula Virtual</a>
      </p>
      <p style="margin:0;color:${MUTED};font-size:13px">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    greeting,
    '',
    intro,
    ...data.courses.map((c, i) => `${i + 1}. ${c}`),
    '',
    ...(isNew
      ? [newAccount, `Usuario: ${data.username}`, `Contraseña temporal: ${data.password}`, changePassword]
      : [existing, `Restablecer contraseña: ${forgotUrl}`]),
    '',
    `Entrar al Aula Virtual: ${loginUrl}`,
    '',
    footer,
  ].join('\n');

  return { subject, html, text };
}
