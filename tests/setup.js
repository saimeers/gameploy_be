// Valores mínimos para que los módulos que leen el entorno al cargarse
// (Firebase Admin, el cliente S3, Resend) no revienten durante las pruebas.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
process.env.FRONTEND_URL = 'http://localhost:5173'
process.env.FIREBASE_PROJECT_ID = 'test-project'
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com'
process.env.FIREBASE_PRIVATE_KEY = 'test-key'
process.env.RAILWAY_BUCKET_ENDPOINT = 'http://localhost:9000'
process.env.RAILWAY_BUCKET_NAME = 'test-bucket'
process.env.RAILWAY_BUCKET_ACCESS_KEY = 'test'
process.env.RAILWAY_BUCKET_SECRET_KEY = 'test'
process.env.RESEND_API_KEY = 'test'
process.env.RESEND_FROM_EMAIL = 'test@gameploy.test'
process.env.ADMIN_EMAIL = 'admin@gameploy.test'

// Las pruebas ejercitan el CDN local, el que sirve la propia API cuando no hay
// R2 configurado. En una máquina con el CDN de producción en su .env, el
// publicador elegiría R2 y esas pruebas fallarían con 404 aunque en integración
// continua pasen. Se vacían aquí para que el entorno del desarrollador no
// decida el resultado.
//
// Vacías, no borradas: `src/app.js` llama a `dotenv.config()` al cargarse, y
// dotenv rellena lo que no está definido. Un `delete` aquí se deshace solo en
// cuanto una prueba importa la aplicación; una cadena vacía sobrevive y es
// falsy, que es lo que el publicador comprueba.
process.env.R2_BUCKET = ''
process.env.R2_ACCOUNT_ID = ''
process.env.R2_ACCESS_KEY_ID = ''
process.env.R2_SECRET_ACCESS_KEY = ''
process.env.CDN_URL = ''
process.env.PUBLIC_FILES_DIR = process.env.PUBLIC_FILES_DIR || '/tmp/gameploy-public-test'
