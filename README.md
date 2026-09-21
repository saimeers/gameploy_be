# Gameploy — API

API REST de **Gameploy**, el aplicativo web para el despliegue y la gestión de Juegos Serios del
Semillero VIRAL (Universidad Francisco de Paula Santander).

Gestiona usuarios y roles, proyectos de Juegos Serios, sus versiones y archivos, la retroalimentación
de los evaluadores y la ejecución en navegador de los builds Unity WebGL.

- Frontend: [`gameploy_fe`](https://github.com/saimeers/gameploy_fe)
- Documentación interactiva: `/api/docs` (Swagger UI)

## Stack

| Capa | Tecnología |
| :--- | :--- |
| Runtime | Node.js 22 + Express 5 |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL (Railway) |
| Autenticación | Firebase Admin SDK (verificación de ID tokens) |
| Almacenamiento | Railway Bucket, S3-compatible (`@aws-sdk/client-s3`) |
| Correo | Resend |
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
| `/projects/:projectId/versions` | `GET /`, `POST /`, `POST /:versionId/files`, `PATCH /:versionId/activate`, `DELETE /:versionId/files/:fileId` | Propietario |
| `/projects/:projectId/controls` | `GET /`, `POST /`, `PATCH /reorder`, `PATCH /:controlId`, `DELETE /:controlId` | Lectura pública, escritura del propietario |
| `/projects/:projectId/comments` | `GET /` | Público |
| `/projects/:projectId/comments` | `POST /` | docente, admin |
| `/search` | `GET /?q&categoria&etiquetas&page&limit`, `GET /categorias`, `GET /etiquetas` | Público |
| `/admin` | `GET /stats`, `GET /projects`, `PATCH /projects/:id/featured`, `DELETE /projects/:id`, `PATCH /comments/:id/moderate`, `PATCH /users/:id/approve`, CRUD de `/categorias` y `/etiquetas` | admin |
| Público | `GET /public/games/:slug`, `GET /public/files/url?key=`, `GET /play/:projectId/:versionId/*` | Público |
| Docente | `GET /teacher/evaluations` | docente, admin |

## Modelo de datos

`Rol` → `Usuario` → `Proyecto` → { `VersionProyecto` → `Archivo`, `ControlJuego`, `Comentario`,
`Visita`, `ProyectoEtiqueta` → `Etiqueta` }, y `Proyecto` → `Categoria`.

Enumeraciones (sus valores viajan tal cual en la API):

| Enum | Valores |
| :--- | :--- |
| `RoleName` | `admin`, `estudiante`, `docente`, `pendiente` |
| `ProjectStatus` | `borrador`, `publicado`, `archivado` |
| `ProjectVisibility` | `publico`, `privado`, `por_enlace` |
| `FileType` | `juego_webgl`, `portada`, `captura` |
| `InputType` | `teclado`, `mouse`, `mando`, `mobile` |

Reglas relevantes:

- El `slug` se genera al crear el proyecto y no cambia al renombrarlo, de modo que los enlaces
  compartidos siguen siendo válidos.
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

## Archivos y ejecución de los juegos

Los builds se suben a `POST /projects/:id/versions/:versionId/files` con `fileType=juego_webgl`
(multipart, hasta 500 MB) y se guardan en el bucket bajo
`projects/<projectId>/versions/<versionId>/<archivo>`. El acceso a los archivos privados se hace con
URLs prefirmadas (`GET /public/files/url?key=`).

Para la ejecución en navegador, `GET /play/:projectId/:versionId/*` descarga el `.zip` de la versión,
lo abre en memoria, detecta la carpeta raíz y devuelve el archivo solicitado con su tipo MIME y
cabeceras CORS abiertas, de forma que el frontend pueda incrustarlo en un `<iframe>`. Por ese motivo
`helmet` corre con CSP, frameguard, COEP y COOP desactivados.

> El zip se descomprime en cada petición y no hay caché: es el punto más costoso del sistema y el
> primer candidato a optimizar.

## Despliegue

La API, la base de datos y el bucket viven en Railway; `npm start` es el comando de arranque. La
instancia de producción se publica en `https://api-gameploy.saimers.dev/api/v1`. Configurar las
mismas variables de entorno del apartado anterior y `FRONTEND_URL` con el dominio real del frontend,
ya que define el origen aceptado por CORS.

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

### Antes de abrir un Pull Request

- La aplicación arranca con `npm run dev` y `/health` responde.
- Si el cambio toca `prisma/schema.prisma`, incluir la migración correspondiente.
- Si añade o modifica endpoints, actualizar sus anotaciones Swagger y este README.
- Si añade variables de entorno, actualizar `.env.example`.

## Contexto académico

Prototipo funcional (objetivo 3) del proyecto de investigación *Aplicativo web para el despliegue y
gestión de Juegos Serios en el Semillero VIRAL*, de Saimer Adrian Saavedra Rojas, Ingeniería de
Sistemas, Universidad Francisco de Paula Santander. Los documentos de requerimientos y arquitectura
están en el repositorio raíz del proyecto.
