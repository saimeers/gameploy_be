/**
 * Usability and experience questionnaire about the platform (version 1).
 *
 * - Usabilidad: the System Usability Scale (SUS), 10 items. Odd items are
 *   positive and even items negative; the score goes from 0 to 100 and 68 is
 *   the usual average (Sauro, 2011).
 * - Experiencia: 10 items adapted from the semillero's earlier game
 *   questionnaire. Items 4 and 8 are negative and count reversed.
 *
 * Both use a 1–5 agreement scale. The wording lives in the frontend
 * (gameploy_fe: src/modules/survey/preguntas.js); change the version in both
 * places if it changes, so answers to different wordings are not mixed.
 */
const VERSION = 1;
const ITEMS = 10;
const SCALE = { min: 1, max: 5 };

/** 1-based experience items that are negative (agreeing is bad). */
const UX_REVERSED = [4, 8];

/** Allowed answers to the optional questions about the respondent. */
const DEMOGRAPHICS = {
  edad: ['menos_18', '18_24', '25_34', '35_44', '45_mas', 'no_dice'],
  genero: ['femenino', 'masculino', 'no_binario', 'otro', 'no_dice'],
  experiencia_videojuegos: ['ninguna', 'basica', 'intermedia', 'avanzada', 'no_dice'],
  frecuencia_juego: ['nunca', 'mensual', 'semanal', 'diaria', 'no_dice'],
  juegos_serios_previos: ['si', 'no', 'no_seguro', 'no_dice'],
};

const MOMENTS = ['primer_proyecto', 'uso_prolongado', 'tras_jugar', 'voluntaria'];

/** When to invite a user with an account. */
const INVITE = {
  minDaysRegistered: 7, // uso_prolongado: days since the account was created
  minActiveDays: 3, //     and days on which the platform was opened
  postponeDays: 3, //      "Ahora no" hides the invitation this long
  maxPostpones: 2, //      after that it is not shown again (the button stays)
};

/** SUS bands for a mean score (Bangor, Kortum & Miller, 2009; Sauro, 2011). */
const SUS_BANDS = [
  { id: 'pobre', label: 'Pobre', from: 0, to: 51 },
  { id: 'mejorable', label: 'Mejorable', from: 51, to: 68 },
  { id: 'buena', label: 'Buena', from: 68, to: 80.3 },
  { id: 'excelente', label: 'Excelente', from: 80.3, to: 100 },
];
const SUS_AVERAGE = 68;

const COMMENT_MAX = 1000;

module.exports = {
  VERSION, ITEMS, SCALE, UX_REVERSED, DEMOGRAPHICS, MOMENTS, INVITE, SUS_BANDS, SUS_AVERAGE, COMMENT_MAX,
};
