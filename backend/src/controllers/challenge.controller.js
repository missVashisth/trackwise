const service = require("../services/challenges/challenge.service");
const { getTodayDateKey } = require("../utils/date");

const today = (req) => getTodayDateKey(req.user.timeZone);

/** ChallengeErrors carry a user-safe message, status and code; anything else is a 500 (logged by the envelope). */
function handle(fn) {
  return async (req, res) => {
    try {
      const { status = 200, body } = await fn(req);
      return res.status(status).json(body);
    } catch (err) {
      if (err.name === "ChallengeError") {
        return res.status(err.status).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
      }
      return res.status(500).json({ message: err.message });
    }
  };
}

module.exports = {
  listTemplates: handle(async (req) => ({ body: { challenges: await service.listTemplates(req.user.id, { category: req.query.category }) } })),
  getTemplate: handle(async (req) => ({ body: { challenge: await service.getTemplate(req.user.id, req.params.templateId) } })),
  createTemplate: handle(async (req) => ({ status: 201, body: { challenge: await service.createTemplate(req.user.id, req.body) } })),
  updateTemplate: handle(async (req) => ({ body: { challenge: await service.updateTemplate(req.user.id, req.params.templateId, req.body) } })),
  archiveTemplate: handle(async (req) => ({ body: { challenge: await service.archiveTemplate(req.user.id, req.params.templateId) } })),
  join: handle(async (req) => ({ status: 201, body: { enrollment: await service.join(req.user.id, req.params.templateId, req.body, today(req)) } })),
  listMine: handle(async (req) => ({ body: { today: today(req), enrollments: await service.listMine(req.user.id, today(req)) } })),
  getEnrollment: handle(async (req) => ({ body: { enrollment: await service.getEnrollment(req.user.id, req.params.enrollmentId, today(req)) } })),
  updateSettings: handle(async (req) => ({ body: { enrollment: await service.updateSettings(req.user.id, req.params.enrollmentId, req.body, today(req)) } })),
  leave: handle(async (req) => ({ body: { enrollment: await service.leave(req.user.id, req.params.enrollmentId, today(req)) } })),
  restart: handle(async (req) => ({ status: 201, body: { enrollment: await service.restart(req.user.id, req.params.enrollmentId, req.body, today(req)) } })),
  getDay: handle(async (req) => ({ body: { day: await service.getDay(req.user.id, req.params.enrollmentId, req.params.dateKey, today(req)) } })),
  logActivity: handle(async (req) => ({
    body: await service.logActivity(req.user.id, req.params.enrollmentId, req.params.dateKey, req.params.activityKey, req.body, today(req)),
  })),
  clearActivity: handle(async (req) => ({
    body: { day: await service.clearActivity(req.user.id, req.params.enrollmentId, req.params.dateKey, req.params.activityKey, today(req)) },
  })),
};
