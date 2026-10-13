const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const lifeAreaController = require("../controllers/lifeArea.controller");

const lifeAreaRouter = Router();

lifeAreaRouter.use(authMiddleware.authUser);

/**
 * @router GET /api/life-areas
 * @description Get all life areas of the logged-in user
 * @access Private
 */
lifeAreaRouter.get("/", lifeAreaController.getLifeAreas);

module.exports = lifeAreaRouter;
