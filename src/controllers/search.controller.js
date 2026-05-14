const searchService = require('../services/search.service');
const { success } = require('../utils/response');

const search = async (req, res, next) => {
  try {
    const { q, categoria, etiquetas, page, limit } = req.query;
    const result = await searchService.searchProjects({
      q,
      categoria,
      etiquetas: etiquetas ? etiquetas.split(',') : [],
      page: Number(page) || 1,
      limit: Number(limit) || 12,
    });
    success(res, {
      data: result.projects,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  } catch (err) { next(err); }
};

const getCategorias = async (req, res, next) => {
  try {
    const categorias = await searchService.getCategorias();
    success(res, { data: categorias });
  } catch (err) { next(err); }
};

const getEtiquetas = async (req, res, next) => {
  try {
    const etiquetas = await searchService.getEtiquetas();
    success(res, { data: etiquetas });
  } catch (err) { next(err); }
};

module.exports = { search, getCategorias, getEtiquetas };