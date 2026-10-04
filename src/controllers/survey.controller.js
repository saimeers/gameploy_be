const surveyService = require('../services/survey.service');
const { success } = require('../utils/response');

const status = async (req, res, next) => {
  try {
    success(res, { data: await surveyService.getStatus(req.user?.dbUser ?? null) });
  } catch (err) { next(err); }
};

const submit = async (req, res, next) => {
  try {
    await surveyService.submit(req.body, req.user?.dbUser ?? null);
    success(res, { message: 'Thank you for your answer', statusCode: 201 });
  } catch (err) { next(err); }
};

const postpone = async (req, res, next) => {
  try {
    await surveyService.postpone(req.user.dbUser);
    success(res, { message: 'Invitation postponed' });
  } catch (err) { next(err); }
};

const summary = async (req, res, next) => {
  try {
    success(res, { data: await surveyService.summary(surveyService.parseFilters(req.query)) });
  } catch (err) { next(err); }
};

const exportCsv = async (req, res, next) => {
  try {
    const csv = await surveyService.exportCsv(surveyService.parseFilters(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="encuesta-gameploy-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
};

module.exports = { status, submit, postpone, summary, exportCsv };
