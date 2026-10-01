import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  generatePassword,
  inscripcionSchema,
  isValidRut,
  normalizeRut,
  parseCourseIds,
  renderWelcomeEmail,
  usernameFromRut,
} from '@/lib/inscripcion';
import { MoodleError, callMoodle, createUser, enrolUser, findUserBy, getCourses } from '@/lib/moodle';

describe('RUT', () => {
  it('normalizes dots, spaces and a lowercase k', () => {
    expect(normalizeRut('12.345.678-k')).toBe('12345678-K');
    expect(normalizeRut(' 7654321 4 ')).toBe('7654321-4');
    expect(normalizeRut('abc')).toBeNull();
    expect(normalizeRut('123-4')).toBeNull();
  });

  it('checks the verifier digit', () => {
    expect(isValidRut('11111111-1')).toBe(true);
    expect(isValidRut('12345678-5')).toBe(true);
    expect(isValidRut('12345678-4')).toBe(false);
    expect(isValidRut('10000013-K')).toBe(true);
    expect(isValidRut('10000013-0')).toBe(false);
  });

  it('becomes a lowercase username', () => {
    expect(usernameFromRut('10000013-K')).toBe('10000013-k');
  });
});

describe('sign-up schema', () => {
  const valid = {
    firstname: 'Ana María',
    lastname: 'Pérez Soto',
    rut: '12.345.678-5',
    email: '  Ana.Perez@Example.CL ',
    phone: '+56 9 1234 5678',
    comuna: 'Ñuñoa',
    address: 'Av. Irarrázaval 1234, depto 5',
    institution: '',
    consent: 'on',
    honeypot: '',
  };

  it('accepts a complete submission and normalizes it', () => {
    const result = inscripcionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rut).toBe('12345678-5');
    expect(result.data.email).toBe('ana.perez@example.cl');
    expect(result.data.phone).toBe('+56912345678');
  });

  it.each([
    ['rut', '12.345.678-4'],
    ['email', 'no-es-correo'],
    ['phone', '123'],
    ['comuna', 'Gotham'],
    ['address', 'x'],
    ['consent', ''],
  ])('rejects an invalid %s with a translated message', (field, value) => {
    const result = inscripcionSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error.issues);
    expect(Object.keys(errors)).toEqual([field]);
    expect(errors[field][0]).not.toBe('Revisa este campo.');
  });

  it('rejects a filled honeypot', () => {
    expect(inscripcionSchema.safeParse({ ...valid, honeypot: 'bot' }).success).toBe(false);
  });
});

describe('course ids', () => {
  it('keeps positive integers only', () => {
    expect(parseCourseIds('3, 5,12,,x,-1,2.5')).toEqual([3, 5, 12]);
    expect(parseCourseIds(undefined)).toEqual([]);
  });
});

describe('temporary password', () => {
  it('always satisfies the default Moodle policy', () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
      expect(p).not.toMatch(/[<>&"'lO01]/);
    }
  });
});

describe('welcome email', () => {
  const base = {
    programa: 'Ruta Emprende',
    organizador: 'Municipalidad de Lo Barnechea',
    supportEmail: 'soporte@example.cl',
    moodleUrl: 'https://aula.example.cl',
    firstname: '<b>Ana</b>',
    username: '12345678-5',
    courses: ['Curso 1', 'Curso <2>'],
  };

  it('points an existing account at the password reset instead', () => {
    const { html } = renderWelcomeEmail(base);
    expect(html).toContain('/login/forgot_password.php');
    expect(html).not.toMatch(/Contraseña temporal/);
  });
});

describe('Moodle client', () => {
  type Call = { url: string; body: URLSearchParams };

  /** A fetch that records each call and answers with the next queued body. */
  function fakeMoodle(...answers: unknown[]) {
    const calls: Call[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as URLSearchParams });
      return new Response(JSON.stringify(answers.shift() ?? null));
    }) as unknown as typeof globalThis.fetch;
    return { calls, config: { url: 'https://aula.example.cl', token: 'tok', fetch } };
  }

  it('sends the token and function and returns the parsed body', async () => {
    const { calls, config } = fakeMoodle({ sitename: 'Aula' });
    await expect(callMoodle(config, 'core_webservice_get_site_info')).resolves.toEqual({ sitename: 'Aula' });
    expect(calls[0].url).toBe('https://aula.example.cl/webservice/rest/server.php');
    expect(calls[0].body.get('wstoken')).toBe('tok');
    expect(calls[0].body.get('wsfunction')).toBe('core_webservice_get_site_info');
    expect(calls[0].body.get('moodlewsrestformat')).toBe('json');
  });

  it('turns an exception body into a MoodleError, although the status is 200', async () => {
    const { config } = fakeMoodle({ exception: 'x', errorcode: 'invalidtoken', message: 'Invalid token' });
    const error = (await callMoodle(config, 'core_user_get_users').catch((e) => e)) as MoodleError;
    expect(error).toBeInstanceOf(MoodleError);
    expect(error.errorcode).toBe('invalidtoken');
  });

  it('finds a user by email', async () => {
    const { calls, config } = fakeMoodle({ users: [{ id: 7, username: 'u' }] }, { users: [] });
    expect((await findUserBy(config, 'email', 'a@b.cl'))?.id).toBe(7);
    expect(await findUserBy(config, 'idnumber', '1-9')).toBeNull();
    expect(calls[0].body.get('criteria[0][key]')).toBe('email');
    expect(calls[0].body.get('criteria[0][value]')).toBe('a@b.cl');
  });

  it('creates a manual account that must change its password, skipping empty fields', async () => {
    const { calls, config } = fakeMoodle([{ id: 42, username: 'x' }]);
    const id = await createUser(config, {
      username: 'x',
      password: 'P',
      firstname: 'A',
      lastname: 'B',
      email: 'a@b.cl',
      institution: '',
      city: 'Macul',
    });
    expect(id).toBe(42);
    const body = calls[0].body;
    expect(body.get('users[0][auth]')).toBe('manual');
    expect(body.get('users[0][preferences][0][type]')).toBe('auth_forcepasswordchange');
    expect(body.get('users[0][city]')).toBe('Macul');
    expect(body.has('users[0][institution]')).toBe(false);
  });

  it('enrols in every course as a student in one call', async () => {
    const { calls, config } = fakeMoodle(null);
    await enrolUser(config, 42, [3, 5]);
    expect(calls).toHaveLength(1);
    const body = calls[0].body;
    expect(body.get('enrolments[1][courseid]')).toBe('5');
    expect(body.get('enrolments[1][userid]')).toBe('42');
    expect(body.get('enrolments[1][roleid]')).toBe('5');
  });

  it('returns course names in the configured order', async () => {
    const { config } = fakeMoodle({
      courses: [
        { id: 5, fullname: 'Cinco ' },
        { id: 3, fullname: 'Tres' },
      ],
    });
    expect((await getCourses(config, [3, 9, 5])).map((c) => c.fullname)).toEqual(['Tres', 'Cinco']);
  });
});
