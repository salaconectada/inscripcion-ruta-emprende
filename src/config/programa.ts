/**
 * Program content shown on the page and in the welcome email.
 *
 * The courses listed here are what the page shows. Which Moodle courses a
 * sign-up is actually enrolled in comes from `MOODLE_COURSE_IDS`, because the
 * ids change if Moodle moves to another server.
 */

export const PROGRAMA = {
  nombre: 'Academia HUB Lo Barnechea',
  organizador: 'Municipalidad de Lo Barnechea',
  aulaVirtual: 'Aula Virtual',
} as const;

export const CURSOS: readonly { area: string; nombre: string }[] = [
  { area: 'Innovación', nombre: 'Design Thinking para Emprendedores' },
  { area: 'Validación', nombre: 'Metodología Lean Startup' },
  { area: 'Tecnología', nombre: 'Transformación Digital para Pymes' },
  { area: 'Marketing', nombre: 'Marketing y Ventas en E-Commerce' },
  { area: 'Estrategia', nombre: 'Modelos de Negocio Innovadores' },
  { area: 'Inteligencia artificial', nombre: 'Inteligencia Artificial Aplicada al Emprendimiento' },
  { area: 'Crecimiento', nombre: 'Growth Hacking: Innovación en Mercadotecnia' },
  { area: 'Protección', nombre: 'Propiedad Intelectual y Gestión de la Innovación' },
  { area: 'Sostenibilidad', nombre: 'Innovación Sostenible y Economía Circular' },
  { area: 'Cultura', nombre: 'Gestión del Cambio y Cultura de Innovación' },
  { area: 'Financiamiento', nombre: 'Financiamiento de la Innovación y Venture Capital' },
];

/**
 * The program is for Lo Barnechea residents, so the commune is not asked: every
 * account gets it as its Moodle `city`, and the form asks for the address in it.
 */
export const COMUNA = 'Lo Barnechea';

/** ISO country code stored on every account. */
export const MOODLE_COUNTRY = 'CL';
