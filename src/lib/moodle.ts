/**
 * A small client for Moodle's REST web services.
 *
 * Every call goes to `/webservice/rest/server.php` with the token, the
 * function name and `moodlewsrestformat=json`. Moodle answers 200 even when a
 * call fails and puts the failure in the body as `{ exception, errorcode,
 * message }`, so the status code alone says nothing — `callMoodle` reads the
 * body and throws `MoodleError` instead.
 *
 * The token must stay on the server. It belongs to a Moodle user that can
 * create accounts and enrol them, so this module is only ever imported by API
 * routes, never by anything that ships to the browser.
 *
 * The web service needs exactly these functions:
 *   core_user_get_users, core_user_create_users,
 *   enrol_manual_enrol_users, core_course_get_courses_by_field
 */

export interface MoodleConfig {
  url: string;
  token: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export class MoodleError extends Error {
  constructor(
    message: string,
    readonly wsfunction: string,
    readonly errorcode?: string,
  ) {
    super(message);
    this.name = 'MoodleError';
  }
}

type Params = Record<string, string | number>;

/** Moodle's student role in a default installation. */
export const STUDENT_ROLE_ID = 5;

const TIMEOUT_MS = 15_000;

export function moodleBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function callMoodle<T>(config: MoodleConfig, wsfunction: string, params: Params = {}): Promise<T> {
  const body = new URLSearchParams({
    wstoken: config.token,
    wsfunction,
    moodlewsrestformat: 'json',
  });
  for (const [key, value] of Object.entries(params)) body.append(key, String(value));

  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${moodleBaseUrl(config.url)}/webservice/rest/server.php`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new MoodleError(`HTTP ${response.status}`, wsfunction);
  }

  const text = await response.text();
  let data: unknown;
  try {
    // Functions that return nothing (enrol_manual_enrol_users) answer "null".
    data = JSON.parse(text);
  } catch {
    throw new MoodleError('Response is not JSON', wsfunction);
  }

  if (data && typeof data === 'object' && 'exception' in data) {
    const { message, errorcode } = data as { message?: string; errorcode?: string };
    throw new MoodleError(message ?? 'Unknown Moodle error', wsfunction, errorcode);
  }

  return data as T;
}

export interface MoodleUser {
  id: number;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
}

/** The first user whose `email` or `idnumber` matches exactly, or null. */
export async function findUserBy(
  config: MoodleConfig,
  key: 'email' | 'idnumber',
  value: string,
): Promise<MoodleUser | null> {
  const result = await callMoodle<{ users?: MoodleUser[] }>(config, 'core_user_get_users', {
    'criteria[0][key]': key,
    'criteria[0][value]': value,
  });
  return result.users?.[0] ?? null;
}

export interface NewMoodleUser {
  username: string;
  password: string;
  firstname: string;
  lastname: string;
  email: string;
  /** Standard profile fields, kept for tracing who signed up and from where. */
  idnumber?: string;
  city?: string;
  address?: string;
  phone1?: string;
  institution?: string;
  country?: string;
}

/**
 * Creates a manual-auth account and returns its id. The account is flagged to
 * change its password on first login, so the generated one sent by email is
 * only ever a one-time key.
 */
export async function createUser(config: MoodleConfig, user: NewMoodleUser): Promise<number> {
  const params: Params = {
    'users[0][auth]': 'manual',
    'users[0][preferences][0][type]': 'auth_forcepasswordchange',
    'users[0][preferences][0][value]': 1,
  };
  for (const [key, value] of Object.entries(user)) {
    if (value !== undefined && value !== '') params[`users[0][${key}]`] = value;
  }

  const result = await callMoodle<{ id: number }[]>(config, 'core_user_create_users', params);
  const id = result?.[0]?.id;
  if (!id) throw new MoodleError('No user id in response', 'core_user_create_users');
  return id;
}

/**
 * Enrols one user in every course in a single call. Enrolling someone who is
 * already enrolled is not an error, so a repeated sign-up is harmless.
 *
 * Every course needs the "Manual enrolments" method enabled; one course
 * without it fails the whole call.
 */
export async function enrolUser(
  config: MoodleConfig,
  userId: number,
  courseIds: number[],
  roleId = STUDENT_ROLE_ID,
): Promise<void> {
  const params: Params = {};
  courseIds.forEach((courseId, i) => {
    params[`enrolments[${i}][roleid]`] = roleId;
    params[`enrolments[${i}][userid]`] = userId;
    params[`enrolments[${i}][courseid]`] = courseId;
  });
  await callMoodle<null>(config, 'enrol_manual_enrol_users', params);
}

export interface MoodleCourse {
  id: number;
  fullname: string;
}

/** Course names, in the order the ids were given. */
export async function getCourses(config: MoodleConfig, courseIds: number[]): Promise<MoodleCourse[]> {
  const result = await callMoodle<{ courses?: MoodleCourse[] }>(config, 'core_course_get_courses_by_field', {
    field: 'ids',
    value: courseIds.join(','),
  });
  const byId = new Map((result.courses ?? []).map((c) => [c.id, c]));
  return courseIds.flatMap((id) => {
    const course = byId.get(id);
    return course ? [{ id: course.id, fullname: course.fullname }] : [];
  });
}
