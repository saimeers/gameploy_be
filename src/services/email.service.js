const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL;
const APP_NAME = process.env.APP_NAME || 'Gameploy';

// URL de tu logo público (Asegúrate de tenerlo en el frontend o un CDN)
// Nota: Te recomiendo usar un .png en lugar de .svg para evitar errores en Outlook/Gmail
const LOGO_URL = `${process.env.FRONTEND_URL}/logo_viral.png`;


const baseEmailLayout = (content) => `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; color: #3f3f46; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
      
      /* Cabecera ajustada para tu logo */
      .header { background-color: #18181b; padding: 30px 20px; text-align: center; border-bottom: 4px solid #7c3aed; }
      .header img { 
        width: 100%; 
        max-width: 250px; /* Restringe el tamaño para que no abrume el correo */
        height: auto;     /* Mantiene tu proporción exacta de 374x171 */
        display: block; 
        margin: 0 auto; 
      }
      
      .content { padding: 40px 30px; font-size: 16px; line-height: 1.6; }
      .footer { background-color: #f8fafc; padding: 24px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }
      .btn { display: inline-block; background-color: #7c3aed; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
      h2 { color: #0f172a; margin-top: 0; font-size: 22px; }
      p { margin: 10px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="${LOGO_URL}" width="374" height="171" alt="Semillero VIRAL" />
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} ${APP_NAME} – Semillero VIRAL.</p>
        <p>Este es un correo generado automáticamente, por favor no respondas a este mensaje.</p>
      </div>
    </div>
  </body>
  </html>
`;

/**
 * Notify a student that their project received a new comment.
 */
const sendNewCommentNotification = async ({ toEmail, studentName, projectName, commenterName, projectSlug }) => {
  const content = `
    <h2>Hola ${studentName},</h2>
    <p><strong>${commenterName}</strong> acaba de dejar un nuevo comentario en tu proyecto <strong>"${projectName}"</strong>.</p>
    <p>Haz clic en el siguiente botón para leer lo que han escrito sobre tu trabajo:</p>
    <center>
      <a href="${process.env.FRONTEND_URL}/games/${projectSlug}" class="btn">
        Ver comentario
      </a>
    </center>
  `;

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `🎮 Nuevo comentario en "${projectName}"`,
    html: baseEmailLayout(content),
  });
};

/**
 * Welcome email after first registration.
 */
const sendWelcomeEmail = async ({ toEmail, nombre }) => {
  const content = `
    <h2>¡Bienvenido a la comunidad, ${nombre}! 🚀</h2>
    <p>Nos emociona confirmarte que tu cuenta en <strong>${APP_NAME}</strong> ha sido creada correctamente.</p>
    <p>A partir de este momento ya puedes comenzar a explorar, jugar y publicar tus propios Juegos Serios dentro de nuestra plataforma.</p>
    <center>
      <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">
        Ir a mi panel
      </a>
    </center>
  `;

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `¡Bienvenido a ${APP_NAME}!`,
    html: baseEmailLayout(content),
  });
};

/**
 * Password reset email.
 */
const sendPasswordResetEmail = async ({ toEmail, nombre, resetLink }) => {
  const content = `
    <h2>Hola ${nombre},</h2>
    <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>${APP_NAME}</strong>.</p>
    <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
    <center>
      <a href="${resetLink}" class="btn">
        Restablecer mi contraseña
      </a>
    </center>
    <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
      <em>Nota: Este enlace expirará en 1 hora. Si no fuiste tú quien solicitó este cambio, puedes ignorar este correo tranquilamente.</em>
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `🔐 Restablecer contraseña – ${APP_NAME}`,
    html: baseEmailLayout(content),
  });
};

module.exports = { sendNewCommentNotification, sendWelcomeEmail, sendPasswordResetEmail };