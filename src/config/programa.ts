/**
 * Program content shown on the page and in the welcome email.
 *
 * The courses listed here are what the page shows. Which Moodle courses a
 * sign-up is actually enrolled in comes from `MOODLE_COURSE_IDS`, because the
 * ids change if Moodle moves to another server.
 */

export const PROGRAMA = {
  nombre: 'Ruta Emprende',
  organizador: 'Municipalidad de Lo Barnechea',
  aulaVirtual: 'Aula Virtual',
  descripcion:
    'Ruta Emprende reúne 11 cursos online para fortalecer distintas capacidades de tu negocio. Puedes realizar la ruta completa o elegir libremente los contenidos que sean más relevantes para ti.',
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

/** The 52 communes of the Región Metropolitana, stored as the Moodle `city`. */
export const COMUNAS_RM = [
  'Alhué',
  'Buin',
  'Calera de Tango',
  'Cerrillos',
  'Cerro Navia',
  'Colina',
  'Conchalí',
  'Curacaví',
  'El Bosque',
  'El Monte',
  'Estación Central',
  'Huechuraba',
  'Independencia',
  'Isla de Maipo',
  'La Cisterna',
  'La Florida',
  'La Granja',
  'La Pintana',
  'La Reina',
  'Lampa',
  'Las Condes',
  'Lo Barnechea',
  'Lo Espejo',
  'Lo Prado',
  'Macul',
  'Maipú',
  'María Pinto',
  'Melipilla',
  'Ñuñoa',
  'Padre Hurtado',
  'Paine',
  'Pedro Aguirre Cerda',
  'Peñaflor',
  'Peñalolén',
  'Pirque',
  'Providencia',
  'Pudahuel',
  'Puente Alto',
  'Quilicura',
  'Quinta Normal',
  'Recoleta',
  'Renca',
  'San Bernardo',
  'San Joaquín',
  'San José de Maipo',
  'San Miguel',
  'San Pedro',
  'San Ramón',
  'Santiago',
  'Talagante',
  'Tiltil',
  'Vitacura',
] as const;

/** Listed first in the select: the program is run by this commune. */
export const COMUNA_DESTACADA = 'Lo Barnechea';

/** Select value for a commune outside the region; the address carries the detail. */
export const COMUNA_OTRA = 'Fuera de la Región Metropolitana';

/** ISO country code stored on every account. */
export const MOODLE_COUNTRY = 'CL';
