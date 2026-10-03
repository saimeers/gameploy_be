const catalog = require('../services/catalog.service');
const { success } = require('../utils/response');

/** Handlers for one catalog kind ('categoria' or 'etiqueta'). */
const handlersFor = (kind) => ({
  list: async (req, res, next) => {
    try {
      success(res, { data: await catalog.list(kind) });
    } catch (err) { next(err); }
  },

  create: async (req, res, next) => {
    try {
      success(res, { data: await catalog.create(kind, req.body), message: 'Created', statusCode: 201 });
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      success(res, { data: await catalog.update(kind, req.params.id, req.body), message: 'Updated' });
    } catch (err) { next(err); }
  },

  setStatus: async (req, res, next) => {
    try {
      const item = await catalog.setStatus(kind, req.params.id, req.body.activo);
      success(res, { data: item, message: item.activo ? 'Activated' : 'Deactivated' });
    } catch (err) { next(err); }
  },

  remove: async (req, res, next) => {
    try {
      await catalog.remove(kind, req.params.id);
      success(res, { message: 'Deleted' });
    } catch (err) { next(err); }
  },
});

module.exports = {
  categorias: handlersFor('categoria'),
  etiquetas: handlersFor('etiqueta'),
};
