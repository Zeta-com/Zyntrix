import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import qrRouter from "./qr";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(qrRouter);

export default router;
