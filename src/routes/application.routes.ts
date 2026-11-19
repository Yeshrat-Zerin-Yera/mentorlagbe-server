
import { Router } from "express";

import {
    createApplication,
    getMyApplications,
    cancelMyApplication,
    getTutorApplicants,
    updateApplicationStatus,
} from "../controllers/application.controller.js";

import {
    verifyToken,
    verifyStudent,
    verifyTutor,
} from "../middlewares/auth.middleware.js";

const router = Router();

// Student routes
router.post(
    "/",
    verifyToken,
    verifyStudent,
    createApplication
);

router.get(
    "/mine",
    verifyToken,
    verifyStudent,
    getMyApplications
);

router.delete(
    "/mine/:id",
    verifyToken,
    verifyStudent,
    cancelMyApplication
);

// Tutor routes
router.get(
    "/tutor",
    verifyToken,
    verifyTutor,
    getTutorApplicants
);

router.patch(
    "/:id/status",
    verifyToken,
    verifyTutor,
    updateApplicationStatus
);

export default router;
