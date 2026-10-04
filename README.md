# Gameploy — API

API REST de **Gameploy**, el aplicativo web para el despliegue y la gestión de Juegos Serios del
Semillero VIRAL (Universidad Francisco de Paula Santander).

Gestiona usuarios y roles, proyectos de Juegos Serios, sus versiones y archivos, la retroalimentación
de los evaluadores y la ejecución en navegador de los builds Unity WebGL, que se sirven desde
Cloudflare con enlaces firmados según la visibilidad de cada proyecto.

- Frontend: [`gameploy_fe`](https://github.com/saimeers/gameploy_fe)
- Documentación interactiva: `/api/docs` (Swagger UI)

## Stack

| Capa | Tecnología |
| :--- | :--- |
| Runtime | Node.js 22 + Express 5 |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL (Railway) |
| Autenticación | Firebase Admin SDK (verificación de ID tokens) |
| Almacenamiento | Railway Bucket, S3-compatible (`@aws-sdk/client-s3`): originales subidos |
| CDN | Cloudflare R2 + Worker (`cdn-worker/`): juegos descomprimidos e imágenes |
| Caché | Redis (`ioredis`), opcional: caché pública, límites de peticiones y visitas únicas |
| Correo | Resend |
| Geolocalización | `geoip-lite` (base GeoLite offline: la IP no sale del servidor) |
| Documentación | Swagger / OpenAPI 3.0 (`swagger-jsdoc`) |
| Seguridad | `helmet`, `cors`, `express-rate-limit` |

## Requisitos previos

- Node.js >= 20 (desarrollado sobre 22.x) y npm
- Una base de datos PostgreSQL accesible
- Un proyecto de Firebase con Authentication habilitado (Email/Password y Google)
- Un bucket S3-compatible
- Una cuenta de Resend con un dominio verificado

## Puesta en marcha

```bash
git clone https://github.com/saimeers/gameploy_be.git
cd gameploy_be
npm install

cp .env.example .env        # completar con los valores reales

npm run db:migrate          # aplica las migraciones de Prisma
npm run db:seed             # crea roles y categorías iniciales
npm run dev                 # http://localhost:3000
```

Comprobaciones rápidas: `GET /health` responde `{ status: "ok" }` y `http://localhost:3000/api/docs`
muestra la documentación.

> El primer usuario administrador se crea registrándose desde el frontend y cambiando su rol a
> `admin` manualmente (`npm run db:studio`), ya que todo registro nuevo nace con rol `pendiente`.

## Variables de entorno

| Variable | Descripción |
| :--- | :--- |
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `NODE_ENV` | `development` o `production` |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL |
| `FRONTEND_URL` | Origen permitido por CORS y base de los enlaces enviados por correo |
| `FIREBASE_PROJECT_ID` | Credenciales de la cuenta de servicio de Firebase |
| `FIREBASE_CLIENT_EMAIL` | Ídem |
| `FIREBASE_PRIVATE_KEY` | Ídem; entre comillas y con los saltos de línea escapados como `\n` |
| `RAILWAY_BUCKET_ENDPOINT` | Endpoint S3 del bucket |
| `RAILWAY_BUCKET_REGION` | Región (`auto` si el proveedor no la usa) |
| `RAILWAY_BUCKET_ACCESS_KEY` | Access key |
| `RAILWAY_BUCKET_SECRET_KEY` | Secret key |
| `RAILWAY_BUCKET_NAME` | Nombre del bucket |
| `RESEND_API_KEY` | API key de Resend |
| `RESEND_FROM_EMAIL` | Remitente de los correos (dominio verificado) |
| `ADMIN_EMAIL` | Destinatario de los avisos de registros pendientes |
| `APP_NAME` | Nombre mostrado en los correos (por defecto `Gameploy`) |
| `PLAY_CACHE_MB` | Memoria máxima para la caché de builds antiguos servidos por `/play` (por defecto `256`) |
| `API_PUBLIC_URL` | URL pública de la API con `/api/v1`; en desarrollo, base del CDN local |
| `RATE_LIMIT_MAX` | Peticiones por IP cada 15 minutos (por defecto `1000`; el login, 20) |
| `R2_ACCOUNT_ID` | Cuenta de Cloudflare donde está el bucket R2 |
| `R2_ACCESS_KEY_ID` | Token de R2 con permiso *Object Read & Write* sobre el bucket |
| `R2_SECRET_ACCESS_KEY` | Ídem |
| `R2_BUCKET` | Bucket R2 (`gameploy-files`). Sin él no se publica en R2 |
| `CDN_URL` | Dominio del Worker (`https://cdn-gameploy.saimers.dev`) |
| `CDN_SIGNING_SECRET` | Secreto de los enlaces firmados; el mismo que tiene el Worker |
| `CDN_TOKEN_TTL_MIN` | Duración de los enlaces: valen entre 1 y 2 veces este valor (por defecto `60`) |
| `PUBLIC_FILES_DIR` | Carpeta del CDN local de desarrollo (por defecto `./.public-files`) |
| `REDIS_URL` | Redis; opcional, sin él todo funciona en memoria |
| `VISIT_SALT` | Secreto del hash del visitante para contar visitas únicas |

Nunca subir el archivo `.env`: está en `.gitignore`. Al añadir una variable nueva, reflejarla también
en `.env.example` y en esta tabla.

## Scripts

| Script | Descripción |
| :--- | :--- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente (nodemon) |
| `npm start` | Servidor de producción |
| `npm run db:migrate` | Crea y aplica migraciones de Prisma |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run db:seed` | Puebla roles y categorías iniciales |
| `npm test` | Ejecuta la batería de pruebas (Jest) y las del Worker (`node --test`) |
| `npm run publish:existing` | Publica en el CDN los archivos subidos antes de que existiera (`-- --dry-run` solo los lista) |
| `npm run test:watch` | Pruebas en modo vigilancia |
| `npm run test:coverage` | Pruebas con informe de cobertura |

## Pruebas

Jest y Supertest, en `tests/`. No tocan ni la base de datos ni el bucket: Prisma,
Firebase Admin y el cliente de almacenamiento se sustituyen por dobles, así que la batería
corre sin infraestructura y sin credenciales.

```
tests/
├── app.test.js        Health check, 404 y exigencia de token en los endpoints protegidos
├── middlewares/       Control de acceso por roles
├── routes/            Ficha pública por visibilidad, /play, CDN local, subidas y encuesta
├── services/          Versiones y archivos, CDN, enlaces firmados, caché, visitas y encuesta (SUS)
├── utils/             Tokens del CDN, contador de peticiones en Redis, slugs y respuestas
├── helpers/           Redis simulado en memoria
└── setup.js           Variables de entorno mínimas para cargar los módulos

cdn-worker/test/       El Worker: firma, vencimiento, prefijos, caché y compatibilidad con la API
```

`nanoid` se publica solo como ESM y el proyecto es CommonJS, así que Jest lo resuelve
al doble de `tests/__mocks__/nanoid.js`.

Toda corrección de un fallo debería llegar con la prueba que lo reproduce.

## Migraciones

El historial de `prisma/migrations/` está versionado: toda modificación de `prisma/schema.prisma` se
confirma junto con su migración en el mismo commit.

```bash
npm run db:migrate -- --name add_project_tags   # crea y aplica la migración en local
npx prisma migrate deploy                       # aplica las pendientes en un entorno desplegado
```

`migrate deploy` es el único comando admisible contra un entorno desplegado; `migrate dev` puede
reiniciar la base de datos y nunca debe apuntar a producción. El despliegue no ejecuta migraciones de
forma automática: se lanzan manualmente.

> **Antes del primer `migrate deploy` contra producción**: el historial empezó a versionarse cuando la
> base de datos de producción ya existía. Comprobar el estado con `npx prisma migrate status` y, si
> las migraciones ya están aplicadas pero no registradas, marcarlas con
> `npx prisma migrate resolve --applied <nombre_migracion>` en lugar de volver a ejecutarlas.

## Estructura del proyecto

```
src/
├── config/        Firebase Admin, cliente S3, especificación de Swagger
├── controllers/   Manejadores de petición (delgados: sin lógica de negocio)
├── middlewares/   auth (verificación de token) y rbac (control por roles)
├── routes/        Routers de Express + anotaciones Swagger
├── services/      Lógica de negocio y acceso a datos con Prisma
├── utils/         Respuestas estandarizadas, clases de error, generación de slug
└── app.js         Configuración de la aplicación Express
prisma/
├── schema.prisma  Modelo de datos
├── migrations/    Historial de migraciones
└── seed.js        Datos iniciales
server.js          Punto de entrada
```

El flujo obligatorio para cualquier endpoint nuevo es **route → controller → service**: la ruta declara
y protege, el controlador traduce petición y respuesta, el servicio concentra la lógica y las consultas
a Prisma.

## Convenciones de la API

- Base path: `/api/v1`.
- Autenticación por ID token de Firebase:

  ```
  Authorization: Bearer <firebase_id_token>
  ```

- Respuesta correcta:

  ```json
  { "success": true, "message": "OK", "data": { }, "meta": { "total": 0, "page": 1, "limit": 12 } }
  ```

- Respuesta con error:

  ```json
  { "success": false, "message": "Project not found" }
  ```

- Los servicios lanzan las clases de `utils/errors.js` (`NotFoundError`, `ForbiddenError`,
  `ValidationError`, `ConflictError`); el manejador global de `app.js` las traduce a su código HTTP.
  Los errores inesperados devuelven un 500 genérico y se registran en consola.
- Rate limiting: 200 peticiones / 15 min globales y 20 peticiones / 15 min en `/api/v1/auth`.
- Toda ruta nueva se documenta con su bloque Swagger en el archivo de rutas (`swagger-jsdoc` lee
  `./src/routes/*.js`).

### Endpoints

| Grupo | Rutas | Acceso |
| :--- | :--- | :--- |
| `/auth` | `POST /register`, `POST /sync`, `POST /forgot-password` | Token de Firebase (salvo `forgot-password`) |
| `/users` | `GET /me`, `PATCH /me`, `GET /check?email=` | Autenticado |
| `/users` | `GET /`, `PATCH /:id/role`, `PATCH /:id/status` | admin |
| `/projects` | `POST /`, `GET /mine`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/publish` | Propietario (estudiante) o admin |
| `/projects` | `GET /mine/visits`, `GET /:id/visits`, `GET /:id/slug?slug=`, `PATCH /:id/slug` | Propietario o admin |
| `/projects/:projectId/versions` | `GET /` | Propietario o admin |
| `/projects/:projectId/versions` | `POST /`, `POST /:versionId/files`, `PATCH /:versionId/activate`, `DELETE /:versionId/files/:fileId`, `GET /:versionId/files/:fileId/download` | Propietario |
| `/projects/:projectId/controls` | `GET /`, `POST /`, `PATCH /reorder`, `PATCH /:controlId`, `DELETE /:controlId` | Lectura pública, escritura del propietario |
| `/projects/:projectId/comments` | `GET /` | Público |
| `/projects/:projectId/comments` | `POST /` | docente, admin |
| `/search` | `GET /?q&categoria&etiquetas&page&limit`, `GET /categorias`, `GET /etiquetas` | Público |
| `/admin` | `GET /stats`, `GET /stats/visits`, `GET /projects`, `PATCH /projects/:id/featured`, `DELETE /projects/:id`, `GET /files/:id/contents`, `GET /files/:id/download`, `PATCH /comments/:id/moderate`, `PATCH /users/:id/approve`, CRUD y `PATCH /:id/status` de `/categorias` y `/etiquetas` | admin |
| Público | `GET /public/games/:slug` | Según la visibilidad del proyecto |
| Público | `GET /play/:projectId/:versionId/*` | Respaldo para builds antiguos: versión activa de un proyecto publicado y no privado |
| Desarrollo | `GET /cdn/t/<exp>.<firma>/*` | Enlace firmado; solo sin R2 y fuera de producción |
| Docente | `GET /teacher/evaluations` | docente, admin |
| `/encuesta` | `GET /estado`, `POST /` | Público (con sesión opcional); el admin no responde |
| `/encuesta` | `POST /posponer` | Autenticado |
| `/admin` | `GET /encuestas/resumen?dias&perfil&momento`, `GET /encuestas/export.csv` | admin |

## Modelo de datos

`Rol` → `Usuario` → `Proyecto` → { `VersionProyecto` → `Archivo`, `ControlJuego`, `Comentario`,
`Visita`, `SlugAnterior`, `ProyectoEtiqueta` → `Etiqueta` }, y `Proyecto` → `Categoria`.
`RespuestaEncuesta` no se relaciona con nada: las respuestas a la encuesta son anónimas.

Enumeraciones (sus valores viajan tal cual en la API):

| Enum | Valores |
| :--- | :--- |
| `RoleName` | `admin`, `estudiante`, `docente`, `pendiente` |
| `ProjectStatus` | `borrador`, `publicado`, `archivado` |
| `ProjectVisibility` | `publico`, `privado`, `por_enlace` |
| `FileType` | `juego_webgl`, `portada`, `captura` |
| `InputType` | `teclado`, `mouse`, `mando`, `mobile` |

Reglas relevantes:

- El `slug` se genera al crear el proyecto y no cambia al renombrarlo. El dueño puede elegir otro
  con `PATCH /projects/:id/slug`; el anterior se guarda en `slugs_anteriores`, así que los enlaces ya
  compartidos siguen funcionando (`/public/games/:slug` resuelve slugs anteriores y devuelve el
  proyecto con su slug actual para que el frontend redirija) y ningún otro proyecto puede tomarlo.
- `PATCH /projects/:id` solo acepta los campos editables (`nombre`, `descripcion`,
  `instrucciones`, `visibilidad`, `id_categoria`, `etiquetas`); el resto tiene su propio endpoint.
- Las categorías y etiquetas se **desactivan** (`activo: false`) en vez de borrarse: dejan de
  ofrecerse en los formularios y filtros, pero los proyectos que las usan las conservan. Solo se
  pueden eliminar si ningún proyecto las usa (si no, 409). Un proyecto no puede recibir una
  categoría o etiqueta inactiva nueva.
- Cada visita guarda `codigo_pais`, `region` y `ciudad`, calculados con `geoip-lite` a partir de la
  IP del visitante, que no se guarda. La base (~110 MB de memoria) se carga con la primera visita.
  Se cuenta una visita por visitante y proyecto cada 30 minutos: la clave es un HMAC de la IP con
  `VISIT_SALT` que solo vive en Redis (o en memoria) durante ese tiempo.
- `GET /public/games/:slug`, la búsqueda (60 s), las categorías y etiquetas (5 min) y las estadísticas
  de visitas (5 min) se guardan en caché. Toda escritura que se ve en esas páginas la invalida
  (`invalidatePublicData()` y `bump()` en `services/cache.service.js`), así que pasar un proyecto a
  privado surte efecto al instante. Los enlaces firmados se añaden después de la caché.
- Borrar un proyecto borra también sus objetos del bucket, salvo los que otra fila aún referencia.
- Solo una versión por proyecto puede estar activa; crear o activar una desactiva las demás.
- Subir una `portada` o un `juego_webgl` reemplaza el archivo anterior del mismo tipo en esa versión;
  las `captura` se acumulan.
- Los usuarios y los comentarios se desactivan (`activo: false`) en lugar de borrarse.

## Autenticación y aprobación de cuentas

Firebase gestiona las credenciales; la API nunca almacena contraseñas. El registro es en dos pasos:

1. El cliente crea la cuenta en Firebase y llama a `POST /auth/register` con `nombre`, `correo` y
   `rol_solicitado` (`estudiante` o `docente`). El usuario se crea con rol `pendiente`; se envía un
   correo de bienvenida y un aviso a `ADMIN_EMAIL`.
2. Un administrador aprueba la cuenta con `PATCH /admin/users/:id/approve`, que asigna el
   `rol_solicitado`.

Mientras tanto, `requireRegisteredUser` bloquea cualquier endpoint protegido. `POST /auth/sync` se
invoca en cada inicio de sesión para crear o recuperar el registro local a partir del `firebase_uid`.

## Encuesta de usabilidad y experiencia

Para evaluar la usabilidad y la experiencia de usuario de la plataforma, cualquier persona (con o
sin cuenta) puede responder un cuestionario de dos partes, con escala de acuerdo de 1 a 5:

- **Usabilidad**: la System Usability Scale (SUS), 10 ítems. Puntaje de 0 a 100: los ítems impares
  suman `x − 1` y los pares `5 − x`; el total se multiplica por 2,5. El promedio de referencia es 68.
- **Experiencia**: 10 ítems; el 4 y el 8 son negativos y se invierten. Índice de 0 a 100.

Más cinco datos opcionales (edad, género, experiencia y frecuencia con videojuegos, juegos serios
previos) y un comentario abierto. Las preguntas y sus valores permitidos están en
`src/config/encuesta.js` (`VERSION`); los textos, en el frontend (`src/modules/survey/preguntas.js`).
Cada respuesta guarda su versión.

- **Anónima**: `RespuestaEncuesta` no guarda usuario, correo ni IP, y su fecha no tiene hora. Con
  cuenta, solo se marca `Usuario.encuesta_respondida` (sin fecha, para no poder cruzarla con la
  respuesta) y una segunda respuesta da 409. Sin cuenta, el navegador recuerda que ya respondió y
  `POST /encuesta` admite 60 respuestas por hora y por IP (un salón comparte IP), así que no hay
  garantía de una por persona. Los administradores no responden.
- **Cuándo se invita** (`GET /encuesta/estado` con sesión): al publicar el primer proyecto
  (estudiante) o hacer la primera evaluación (docente), o con 7 días desde el registro y 3 días de
  uso (`dias_activos`, que cuenta esa misma consulta). "Ahora no" (`POST /encuesta/posponer`) la
  oculta 3 días, como mucho dos veces. El frontend también la ofrece tras 3 minutos jugando y con el
  botón "Danos tu opinión".
- **Resultados** (`GET /admin/encuestas/resumen`): n, media, desviación e intervalo de confianza del
  95 % (t de Student) de los dos puntajes; bandas SUS (pobre < 51, mejorable < 68, buena < 80,3,
  excelente); puntaje favorable de cada ítem; tendencia mensual; participación y comentarios.
  `GET /admin/encuestas/export.csv` descarga todas las respuestas para analizarlas en otra
  herramienta.

## Archivos y ejecución de los juegos

Los archivos se suben a `POST /projects/:id/versions/:versionId/files` (multipart, **hasta 95 MB**;
si no, 413). La API está detrás del proxy de Cloudflare, que en el plan gratis rechaza peticiones de
más de 100 MB; el margen cubre el resto del formulario. El límite está en `src/config/uploads.js` y
el frontend comprueba el mismo valor antes de subir. Al reemplazar la portada o el juego de una
versión, el anterior se quita solo cuando el nuevo ya está guardado.
El original queda en el bucket de Railway (`projects/<projectId>/versions/<versionId>/...`) como
respaldo y para descargarlo; lo que descargan los jugadores se **publica** aparte
(`services/publish.service.js`):

- El `.zip` del juego se descomprime en `builds/<uuid>/` y su lista de archivos se guarda en
  `Archivo.manifiesto` (`GET /admin/files/:id/contents` la lee sin abrir el `.zip`). Al `index.html`
  se le inyecta un script que avisa a la página contenedora, con `postMessage`, del progreso de
  carga (`boot`, `progress`, `ready`, `error`).
- Las imágenes van a `media/<uuid>/<nombre>`.
- Cada subida tiene su propia ruta, así que los archivos se marcan inmutables (un año en caché) y el
  `index.html`, 5 minutos. Si publicar falla, se deshace la subida.
- Al borrar un archivo o un proyecto se borran el original y lo publicado, salvo que otra fila (una
  versión que lo heredó) aún lo use.

En producción lo publicado vive en **Cloudflare R2**, en un bucket privado que sirve el Worker de
`cdn-worker/` (ver su README). En desarrollo, sin `R2_BUCKET`, se publica en `PUBLIC_FILES_DIR` y lo
sirve la propia API en `/api/v1/cdn` con las mismas reglas, así que no hace falta Cloudflare.

### Quién puede ver cada juego

| Proyecto | Ficha, juego e imágenes |
| :--- | :--- |
| `publico` y publicado | Cualquiera |
| `por_enlace` y publicado | Quien tenga el enlace `/games/<slug>` (no aparece en la búsqueda) |
| `privado` | El dueño y el admin |
| Borrador y versiones no activas | El dueño y el admin ("Probar") |
| `.zip` original | El dueño (`GET .../files/:fileId/download`) y el admin (`GET /admin/files/:id/download`), con un enlace de 5 minutos |

Los archivos publicados se piden con **enlaces firmados**:
`<CDN_URL>/t/<vencimiento>.<firma>/builds/<uuid>/index.html`, con la firma = HMAC-SHA256 de
`<prefijo>|<vencimiento>` con `CDN_SIGNING_SECRET` (`utils/cdnToken.js`). El token va en la ruta, así
que las rutas relativas del juego (`Build/...`, `TemplateData/...`) lo heredan, y solo abre los
archivos de ese prefijo.

- La API firma localmente y **solo en respuestas que el usuario ya tiene derecho a ver**
  (`services/fileUrls.js`): añade `play_url` al build y `url` a cada imagen, y quita las rutas
  internas. No hay ningún endpoint que firme lo que le pidan.
- Los enlaces vencen en franjas: todos los que entran en la misma hora reciben la misma URL (la caché
  del navegador funciona) y vale entre 1 y 2 horas (`CDN_TOKEN_TTL_MIN`). Quien ya tenía un enlace
  lo conserva hasta que vence: es lo que tarda en surtir efecto pasar un proyecto a privado o
  reemplazar un build.
- El Worker comprueba la firma antes de nada y guarda en la caché de Cloudflare con la clave del
  objeto, sin el token: todos los jugadores comparten la misma copia en el borde.

`GET /play/:projectId/:versionId/*` (`services/play.service.js`) queda como respaldo para los builds
subidos antes del CDN, con las reglas de la ficha pública (solo la versión activa de un proyecto
publicado y no privado). Abre el `.zip` en memoria, con una caché LRU limitada por `PLAY_CACHE_MB`.
`npm run publish:existing` publica esos archivos antiguos; cuando ya no quede ninguno, `/play` se
puede retirar.

Los builds comprimidos (Gzip/Brotli) no se pueden servir, porque los archivos van sin
`Content-Encoding`; el formulario de subida los rechaza. `helmet` corre con CSP, frameguard, COEP y
COOP desactivados porque el juego se incrusta en un `<iframe>` de otro origen.

### Caché y límites de peticiones

Con `REDIS_URL`, Redis guarda la caché pública, los contadores del límite de peticiones (sobreviven a
los despliegues) y las visitas únicas. Sin Redis, o si se cae, todo sigue funcionando: la caché y las
visitas pasan a memoria y el límite deja pasar las peticiones en lugar de bloquear la API. El límite
global es `RATE_LIMIT_MAX` peticiones por IP cada 15 minutos (un salón comparte IP; la ficha de un
juego cuesta una sola petición) y el de login, 20.

La API está detrás del proxy de Cloudflare, así que la IP que ve Express es la de un servidor de
Cloudflare compartido por muchos visitantes. `utils/clientIp.js` toma la del visitante de
`CF-Connecting-IP`, pero solo si la conexión llega desde un rango de Cloudflare (así nadie puede
falsificarla llamando al origen directamente). La usan el límite de peticiones y las visitas.

## Despliegue

La API, la base de datos, Redis y el bucket de originales viven en Railway; `npm start` es el comando
de arranque. La instancia de producción se publica en `https://api-gameploy.saimers.dev/api/v1`.
Configurar las variables de entorno del apartado anterior y `FRONTEND_URL` con el dominio real del
frontend, ya que define el origen aceptado por CORS.

Orden para activar el CDN en un entorno:

1. Crear el bucket R2 privado y desplegar el Worker (`cdn-worker/README.md`).
2. En Railway, añadir Redis y las variables `R2_*`, `CDN_URL`, `CDN_SIGNING_SECRET` (el mismo del
   Worker), `REDIS_URL` y `VISIT_SALT`.
3. Desplegar la API y aplicar las migraciones con `npx prisma migrate deploy`.
4. Publicar lo ya subido con `npm run publish:existing` (primero con `-- --dry-run`). Es seguro
   repetirlo: solo toma lo pendiente.
5. Desplegar el frontend.

## Contribución

### Ramas

`main` es la única rama permanente y debe permanecer siempre desplegable. Todo cambio se hace en una
rama corta que nace de `main` y se elimina tras integrarse:

```
feat/<tema>      fix/<tema>      refactor/<tema>
docs/<tema>      chore/<tema>    test/<tema>
```

```bash
git switch main && git pull
git switch -c feat/project-versions
# ... commits ...
git push -u origin feat/project-versions   # y abrir Pull Request hacia main
```

### Commits

Se usan [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<alcance opcional>): <descripción en imperativo y minúscula>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Alcances habituales en este repositorio: `auth`, `users`, `projects`, `versions`, `controls`,
`comments`, `search`, `admin`, `storage`, `email`, `prisma`.

```
feat(versions): add active version toggle
fix(auth): reject disabled accounts on sync
docs(readme): document environment variables
```

Un cambio incompatible lleva `!` tras el alcance (`feat(api)!: ...`) o un pie
`BREAKING CHANGE: <descripción>`.

### Integración continua

`.github/workflows/ci.yml` instala, genera el cliente de Prisma y ejecuta las pruebas en
cada push y en cada Pull Request hacia `main`. Railway despliega desde `main`; con la opción
**Wait for CI** activada en los ajustes del servicio, espera a que el workflow termine en
verde antes de desplegar.

### Antes de abrir un Pull Request

- `npm test` en verde.
- La aplicación arranca con `npm run dev` y `/health` responde.
- Si el cambio toca `prisma/schema.prisma`, incluir la migración correspondiente.
- Si añade o modifica endpoints, actualizar sus anotaciones Swagger y este README.
- Si añade variables de entorno, actualizar `.env.example`.

## Contexto académico

Prototipo funcional (objetivo 3) del proyecto de investigación *Aplicativo web para el despliegue y
gestión de Juegos Serios en el Semillero VIRAL*, de Saimer Adrian Saavedra Rojas, Ingeniería de
Sistemas, Universidad Francisco de Paula Santander. Los documentos de requerimientos y arquitectura
están en el repositorio raíz del proyecto.
