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

module.exports = { sendNewCommentNotification, sendWelcomeEmail };