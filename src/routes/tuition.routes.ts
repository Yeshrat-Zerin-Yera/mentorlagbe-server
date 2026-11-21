
import { Router } from "express";

import {
    getPublicTuitions,
    getPublicTuitionStats,
    getPublicTuitionById,
    createTuition,
    getMyTuitions,
    updateTuition,
    updateTuitionActiveStatus,
    deleteTuition,
    getAllTuitionsForAdmin,
    moderateTuition,
} from "../controllers/tuition.controller.js";

import {
    verifyToken,
    verifyTutor,
    verifyAdmin,
} from "../middlewares/auth.middleware.js";

import multer from "multer";
import { uploadImage } from "../controllers/upload.controller.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith("image/")) {
            callback(null, true);
        } else {
            callback(new Error("Only image files are allowed"));
        }
    },
});

// Public routes
router.get("/stats", getPublicTuitionStats);
router.get("/", getPublicTuitions);

// Admin routes — keep these before the /:id route.
router.get(
    "/admin/all",
    verifyToken,
    verifyAdmin,
    getAllTuitionsForAdmin
);

router.patch(
    "/admin/:id/moderation",
    verifyToken,
    verifyAdmin,
    moderateTuition
);

router.post(
    "/upload-image",
    verifyToken,
    verifyTutor,
    upload.single("image"),
    uploadImage
);

// Tutor routes
router.post(
    "/",
    verifyToken,
    verifyTutor,
    createTuition
);

router.get(
    "/mine",
    verifyToken,
    verifyTutor,
    getMyTuitions
);

router.patch(
    "/:id/active",
    verifyToken,
    verifyTutor,
    updateTuitionActiveStatus
);

router.patch(
    "/:id",
    verifyToken,
    verifyTutor,
    updateTuition
);

router.delete(
    "/:id",
    verifyToken,
    verifyTutor,
    deleteTuition
);

// Public detail route — keep last.
router.get("/:id", getPublicTuitionById);

export default router;
