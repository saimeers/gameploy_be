const controlService = require('../services/control.service')
const { success } = require('../utils/response')

const list    = async (req, res, next) => {
  try {
    const controls = await controlService.getControls(req.params.projectId)
    success(res, { data: controls })
  } catch (err) { next(err) }
}

const create  = async (req, res, next) => {
  try {
    const control = await controlService.createControl(req.params.projectId, req.user.dbUser.id, req.body)
    success(res, { data: control, statusCode: 201 })
  } catch (err) { next(err) }
}

const update  = async (req, res, next) => {
  try {
    const control = await controlService.updateControl(req.params.controlId, req.user.dbUser.id, req.body)
    success(res, { data: control })
  } catch (err) { next(err) }
}

const remove  = async (req, res, next) => {
  try {
    await controlService.deleteControl(req.params.controlId, req.user.dbUser.id)
    success(res, { message: 'Control deleted' })
  } catch (err) { next(err) }
}

const reorder = async (req, res, next) => {
  try {
    await controlService.reorderControls(req.params.projectId, req.user.dbUser.id, req.body.order)
    success(res, { message: 'Controls reordered' })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, reorder }