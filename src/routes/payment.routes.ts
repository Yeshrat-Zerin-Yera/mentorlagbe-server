
import { Router } from "express";
import {
    createCheckoutSession,
    getMyPayments,
    getAllPayments,
} from "../controllers/payment.controller.js";
import {
    verifyToken,
    verifyAdmin,
} from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create-checkout-session", verifyToken, createCheckoutSession);

router.get("/mine", verifyToken, getMyPayments);

router.get("/admin/all", verifyToken, verifyAdmin, getAllPayments);

export default router;
