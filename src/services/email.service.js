const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL;
const APP_NAME = process.env.APP_NAME || 'Gameploy';

/**
 * Notify a student that their project received a new comment.
 */
const sendNewCommentNotification = async ({ toEmail, studentName, projectName, commenterName, projectSlug }) => {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${APP_NAME} – Nuevo comentario en "${projectName}"`,
    html: `
      <h2>Hola ${studentName},</h2>
      <p><strong>${commenterName}</strong> dejó un comentario en tu proyecto <strong>"${projectName}"</strong>.</p>
      <p>
        <a href="${process.env.FRONTEND_URL}/games/${projectSlug}">
          Ver comentario
        </a>
      </p>
      <hr/>
      <small>${APP_NAME} – Semillero VIRAL</small>
    `,
  });
};

/**
 * Welcome email after first registration.
 */
const sendWelcomeEmail = async ({ toEmail, nombre }) => {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Bienvenido a ${APP_NAME}`,
    html: `
      <h2>¡Bienvenido, ${nombre}!</h2>
      <p>Tu cuenta en <strong>${APP_NAME}</strong> ha sido creada correctamente.</p>
      <p>Ya puedes comenzar a publicar tus Juegos Serios.</p>
      <hr/>
      <small>${APP_NAME} – Semillero VIRAL</small>
    `,
  });
};

const sendPasswordResetEmail = async ({ toEmail, nombre, resetLink }) => {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${APP_NAME} – Restablecer contraseña`,
    html: `
      <h2>Hola ${nombre},</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>
        <a href="${resetLink}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
          Restablecer contraseña
        </a>
      </p>
      <p>Este enlace expira en 1 hora. Si no solicitaste esto, ignora este correo.</p>
      <hr/>
      <small>${APP_NAME} – Semillero VIRAL</small>
    `,
  })
}

module.exports = { sendNewCommentNotification, sendWelcomeEmail, sendPasswordResetEmail }