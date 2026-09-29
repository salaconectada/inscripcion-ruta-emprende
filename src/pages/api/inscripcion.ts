export const prerender = false;

/**
 * Sign-up endpoint: creates (or finds) the visitor's Moodle account, enrols it
 * in every course in `MOODLE_COURSE_IDS` and emails the access details.
 *
 * The account is looked up by email first, so signing up twice enrols the same
 * account again rather than creating a second one — Moodle treats a repeated
 * enrolment as a no-op. A RUT already attached to another email is refused
 * instead of guessed at, because the credentials would go to an address the
 * account does not own.
 *
 * Only a new account gets a password in the email. An existing one gets its
 * username and the reset link; this endpoint never changes a password it did
 * not create. The response is the same either way, so the form does not
 * reveal whether an email already has an account.
 */
import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import {
  MOODLE_URL,
  MOODLE_TOKEN,
  MOODLE_COURSE_IDS,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  SUPPORT_EMAIL,
} from 'astro:env/server';
import { PROGRAMA, MOODLE_COUNTRY } from '@/config/programa';
import { MoodleError, createUser, enrolUser, findUserBy, getCourses, moodleBaseUrl } from '@/lib/moodle';
import {
  MENSAJES,
  fieldErrors,
  generatePassword,
  inscripcionSchema,
  parseCourseIds,
  renderWelcomeEmail,
  usernameFromRut,
} from '@/lib/inscripcion';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fail = (status: number, errors: Record<string, string[]>) => json({ success: false, errors }, status);

/** Moodle's wording for the two uniqueness checks `core_user_create_users` runs. */
const isDuplicate = (error: unknown) =>
  error instanceof MoodleError && /(username|email address) already exists/i.test(error.message);

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const field = (name: string) => formData.get(name)?.toString() ?? '';

  // A filled honeypot is a bot. Tell it everything went fine.
  if (field('honeypot')) return json({ success: true, emailSent: true });

  const result = inscripcionSchema.safeParse({
    firstname: field('firstname'),
    lastname: field('lastname'),
    rut: field('rut'),
    email: field('email'),
    phone: field('phone'),
    comuna: field('comuna'),
    address: field('address'),
    institution: field('institution'),
    consent: field('consent'),
    honeypot: field('honeypot'),
  });
  if (!result.success) return fail(400, fieldErrors(result.error.issues));

  const courseIds = parseCourseIds(MOODLE_COURSE_IDS);
  if (!MOODLE_URL || !MOODLE_TOKEN || courseIds.length === 0 || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.error('Inscripción: set MOODLE_URL, MOODLE_TOKEN, MOODLE_COURSE_IDS, RESEND_API_KEY and RESEND_FROM_EMAIL');
    return fail(503, { form: [MENSAJES.unavailable] });
  }

  const data = result.data;
  const moodle = { url: moodleBaseUrl(MOODLE_URL), token: MOODLE_TOKEN };

  let username: string;
  let password: string | undefined;
  let courses: string[] = [];

  try {
    let user = await findUserBy(moodle, 'email', data.email);

    if (!user) {
      if (await findUserBy(moodle, 'idnumber', data.rut)) {
        return fail(409, { rut: [MENSAJES.rutTaken] });
      }
      const newUsername = usernameFromRut(data.rut);
      password = generatePassword();
      const id = await createUser(moodle, {
        username: newUsername,
        password,
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email,
        idnumber: data.rut,
        city: data.comuna,
        address: data.address,
        phone1: data.phone,
        institution: data.institution,
        country: MOODLE_COUNTRY,
      });
      user = { id, username: newUsername, email: data.email, firstname: data.firstname, lastname: data.lastname };
    }

    username = user.username;
    await enrolUser(moodle, user.id, courseIds);

    // Names only decorate the email; a failure here must not undo a sign-up.
    courses = await getCourses(moodle, courseIds)
      .then((list) => list.map((c) => c.fullname))
      .catch((error) => {
        console.error('Inscripción: could not read course names', error);
        return [];
      });
  } catch (error) {
    if (isDuplicate(error)) return fail(409, { rut: [MENSAJES.rutTaken] });
    const detail =
      error instanceof MoodleError ? `${error.wsfunction}: ${error.errorcode ?? ''} ${error.message}` : error;
    console.error('Inscripción: Moodle request failed —', detail);
    return fail(502, { form: [MENSAJES.moodle] });
  }

  const email = renderWelcomeEmail({
    programa: PROGRAMA.nombre,
    organizador: PROGRAMA.organizador,
    supportEmail: SUPPORT_EMAIL,
    moodleUrl: moodle.url,
    firstname: data.firstname,
    username,
    password,
    courses,
  });

  const { error: sendError } = await new Resend(RESEND_API_KEY).emails
    .send({
      from: `${PROGRAMA.nombre} <${RESEND_FROM_EMAIL}>`,
      to: data.email,
      ...(SUPPORT_EMAIL ? { replyTo: SUPPORT_EMAIL } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
    })
    .catch((error: Error) => ({ error }));

  if (sendError) {
    // The account and enrolments exist. The visitor can still get in through
    // Moodle's password reset, which the form links to in this case.
    console.error('Inscripción: enrolled but the email failed —', sendError.message);
    return json({ success: true, emailSent: false, resetUrl: `${moodle.url}/login/forgot_password.php` });
  }

  return json({ success: true, emailSent: true });
};
