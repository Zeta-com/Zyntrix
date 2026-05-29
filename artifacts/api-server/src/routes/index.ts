import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import qrRouter from "./qr";
import linkRouter from "./link";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(qrRouter);
router.use(linkRouter);

export default router;
