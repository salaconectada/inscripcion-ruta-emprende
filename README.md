# Inscripción Ruta Emprende

Página de inscripción para **Ruta Emprende** (Municipalidad de Lo Barnechea). La persona completa un
formulario y, en un solo paso:

1. se crea su cuenta en Moodle (o se reutiliza la existente si el correo ya está registrado);
2. queda inscrita como estudiante en los 11 cursos de la ruta;
3. recibe un correo con su usuario, una contraseña temporal y el enlace al Aula Virtual.

Construido con Astro, desplegado en Netlify. La página es estática; solo `/api/inscripcion` corre en el
servidor, como Netlify Function, y es el único lugar donde existe el token de Moodle.

## Datos que se guardan

Todo queda en campos estándar del perfil de Moodle, exportables desde _Administración del sitio → Usuarios →
Acciones en lote_:

| Formulario                    | Moodle                                  |
| ----------------------------- | --------------------------------------- |
| RUT                           | `username` (en minúsculas) e `idnumber` |
| Nombres / Apellidos           | `firstname` / `lastname`                |
| Correo                        | `email`                                 |
| Teléfono                      | `phone1`                                |
| Comuna                        | `city`                                  |
| Dirección                     | `address`                               |
| Emprendimiento u organización | `institution`                           |

La cuenta se crea con autenticación manual y la obligación de cambiar la contraseña en el primer ingreso.

## Configurar Moodle

Requiere Moodle 4.1 o superior.

1. _Administración del sitio → General → Características avanzadas_: activar **servicios web**.
2. _Servidor → Servicios web → Administrar protocolos_: activar **REST**.
3. _Servidor → Servicios web → Servicios externos_: crear un servicio con **solo** estas funciones:
   - `core_user_get_users`
   - `core_user_create_users`
   - `enrol_manual_enrol_users`
   - `core_course_get_courses_by_field`
4. Crear un token para ese servicio (_Administrar tokens_), asociado a un usuario con permisos para crear
   usuarios e inscribir en los cursos.
5. En **cada uno** de los 11 cursos, verificar que el método **Inscripción manual** esté activo. Si falta en
   uno, la inscripción completa falla.

## Variables de entorno

Ver [`.env.example`](.env.example). En Netlify: _Site configuration → Environment variables_.

| Variable            | Descripción                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `SITE_URL`          | URL pública de este sitio                                         |
| `MOODLE_URL`        | URL del Moodle, sin `/` final                                     |
| `MOODLE_TOKEN`      | Token del servicio web                                            |
| `MOODLE_COURSE_IDS` | IDs de los cursos separados por coma (`2,3,4,5,6,7,8,9,10,11,12`) |
| `RESEND_API_KEY`    | Clave de [Resend](https://resend.com)                             |
| `RESEND_FROM_EMAIL` | Remitente, en un dominio verificado en Resend                     |
| `SUPPORT_EMAIL`     | Opcional: correo de ayuda, visible en la página y como respuesta  |

Cambiar de dominio (del sitio o del Moodle) es solo cambiar `SITE_URL` o `MOODLE_URL`, y los IDs de curso si
el Moodle se migra.

## Desarrollo

```bash
pnpm install
cp .env.example .env   # y completar los valores
pnpm dev               # http://localhost:4321
pnpm test              # tests unitarios
pnpm build             # verificación de tipos + build de producción
```

## Qué pasa en cada caso

| Situación                                  | Resultado                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Correo nuevo, RUT nuevo                    | Se crea la cuenta, se inscribe y se envían las credenciales            |
| Correo ya registrado                       | Se inscribe esa cuenta; el correo trae el usuario y el enlace de reset |
| RUT registrado con otro correo             | Se rechaza, con un mensaje para contactar a soporte                    |
| Moodle no responde                         | Error; la persona puede reintentar sin duplicar nada                   |
| Se inscribe pero falla el envío del correo | Se muestra el enlace para restablecer la contraseña                    |
