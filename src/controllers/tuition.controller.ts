
import type { RequestHandler } from "express";
import {
    ObjectId,
    type Document,
    type Filter,
} from "mongodb";
import { getDB } from "../config/db.js";

const getTuitionCollection = () => getDB().collection("tuitions");

const getIdParam = (value: string | string[] | undefined): string | null => {
    const id = Array.isArray(value) ? value[0] : value;

    return id && ObjectId.isValid(id) ? id : null;
};

const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatTuition = (tuition: Document) => ({
    ...tuition,
    _id: tuition._id?.toString(),
});

const validText = (value: unknown, maxLength: number) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;

const validateTuition = (body: Record<string, unknown>) => {
    const requiredTextFields = [
        "title",
        "subject",
        "classLevel",
        "location",
        "description",
    ] as const;

    for (const field of requiredTextFields) {
        if (!validText(body[field], field === "description" ? 3000 : 150)) {
            return `${field} is required and must be valid`;
        }
    }

    if (!["Online", "Offline"].includes(body.mode as string)) {
        return "Mode must be Online or Offline";
    }

    if (
        typeof body.monthlyFee !== "number" ||
        !Number.isFinite(body.monthlyFee) ||
        body.monthlyFee <= 0
    ) {
        return "Monthly fee must be a positive number";
    }

    if (
        typeof body.daysPerWeek !== "number" ||
        !Number.isInteger(body.daysPerWeek) ||
        body.daysPerWeek < 1 ||
        body.daysPerWeek > 7
    ) {
        return "Days per week must be between 1 and 7";
    }

    if (
        body.bannerImage !== undefined &&
        typeof body.bannerImage !== "string"
    ) {
        return "Banner image must be a URL";
    }

    if (typeof body.bannerImage === "string" && body.bannerImage.trim()) {
        try {
            const imageURL = new URL(body.bannerImage);

            if (!["http:", "https:"].includes(imageURL.protocol)) {
                return "Banner image must use HTTP or HTTPS";
            }
        } catch {
            return "Please provide a valid banner image URL";
        }
    }

    return null;
};

const editableFields = [
    "title",
    "subject",
    "classLevel",
    "mode",
    "location",
    "monthlyFee",
    "daysPerWeek",
    "bannerImage",
    "description",
] as const;

const getEditableUpdates = (body: Record<string, unknown>) => {
    const updates: Record<string, unknown> = {};

    for (const field of editableFields) {
        if (body[field] !== undefined) {
            updates[field] = body[field];
        }
    }

    return updates;
};

// GET /api/tuitions
// Public: approved and active tuition posts only.
// Supports search, filters, and pagination.
export const getPublicTuitions: RequestHandler = async (req, res) => {
    try {
        const filter: Filter<Document> = {
            approvalStatus: "approved",
            isActive: true,
        };

        const search =
            typeof req.query.search === "string"
                ? req.query.search.trim()
                : "";

        const subject =
            typeof req.query.subject === "string"
                ? req.query.subject.trim()
                : "";

        const classLevel =
            typeof req.query.classLevel === "string"
                ? req.query.classLevel.trim()
                : "";

        const mode =
            typeof req.query.mode === "string"
                ? req.query.mode.trim()
                : "";

        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), "i");

            filter.$or = [
                { title: searchRegex },
                { subject: searchRegex },
            ];
        }

        if (subject) filter.subject = subject;
        if (classLevel) filter.classLevel = classLevel;

        if (mode && ["Online", "Offline"].includes(mode)) {
            filter.mode = mode;
        }

        const page = Math.max(
            1,
            Number.parseInt(String(req.query.page || "1"), 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(
                1,
                Number.parseInt(String(req.query.limit || "9"), 10) || 9
            )
        );

        const skip = (page - 1) * limit;
        const tuitions = getTuitionCollection();

        const [data, total] = await Promise.all([
            tuitions
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),

            tuitions.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Tuition posts retrieved successfully",
            data: data.map(formatTuition),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get public tuitions error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve tuition posts",
        });
    }
};

// GET /api/tuitions/:id
// Public: only approved and active posts.
export const getPublicTuitionById: RequestHandler = async (req, res) => {
    try {
        const id = getIdParam(req.params.id);

        if (!id) {
            res.status(400).json({
                success: false,
                message: "Invalid tuition ID",
            });
            return;
        }

        const tuition = await getTuitionCollection().findOne({
            _id: new ObjectId(id),
            approvalStatus: "approved",
            isActive: true,
        });

        if (!tuition) {
            res.status(404).json({
                success: false,
                message: "Tuition post not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Tuition post retrieved successfully",
            data: formatTuition(tuition),
        });
    } catch (error) {
        console.error("Get tuition by ID error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve tuition post",
        });
    }
};

// POST /api/tuitions
// Tutor only.
export const createTuition: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const validationError = validateTuition(req.body);

        if (validationError) {
            res.status(400).json({
                success: false,
                message: validationError,
            });
            return;
        }

        const users = getDB().collection("users");
        const tutor = await users.findOne({
            email: authUser.email,
        });

        if (!tutor || tutor.role !== "tutor") {
            res.status(403).json({
                success: false,
                message: "Only tutors can create tuition posts",
            });
            return;
        }

        const tuitions = getTuitionCollection();

        // Free tutors can create at most two tuition posts.
        if (tutor.plan !== "pro") {
            const existingCount = await tuitions.countDocuments({
                tutorEmail: authUser.email,
            });

            if (existingCount >= 2) {
                res.status(403).json({
                    success: false,
                    message: "Free plan allows only two tuition posts. Upgrade to Pro for unlimited posts.",
                });
                return;
            }
        }

        const now = new Date();

        const newTuition = {
            title: req.body.title.trim(),
            subject: req.body.subject.trim(),
            classLevel: req.body.classLevel.trim(),
            mode: req.body.mode,
            location: req.body.location.trim(),
            monthlyFee: req.body.monthlyFee,
            daysPerWeek: req.body.daysPerWeek,
            bannerImage: req.body.bannerImage?.trim() || "",
            description: req.body.description.trim(),

            tutorId: authUser.id,
            tutorName: tutor.name || "",
            tutorEmail: authUser.email,

            approvalStatus: "pending",
            isActive: true,

            createdAt: now,
            updatedAt: now,
        };

        const result = await tuitions.insertOne(newTuition);

        res.status(201).json({
            success: true,
            message: "Tuition post submitted for admin approval",
            data: {
                ...newTuition,
                _id: result.insertedId.toString(),
            },
        });
    } catch (error) {
        console.error("Create tuition error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create tuition post",
        });
    }
};

// GET /api/tuitions/mine
// Tutor only: all of the tutor's own posts.
export const getMyTuitions: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const tuitions = await getTuitionCollection()
            .find({ tutorEmail: authUser.email })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            message: "Your tuition posts retrieved successfully",
            data: tuitions.map(formatTuition),
        });
    } catch (error) {
        console.error("Get my tuitions error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve your tuition posts",
        });
    }
};

// PATCH /api/tuitions/:id
// Tutor only: update their own post.
export const updateTuition: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;
        const id = getIdParam(req.params.id);

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!id) {
            res.status(400).json({
                success: false,
                message: "Invalid tuition ID",
            });
            return;
        }

        const updates = getEditableUpdates(req.body);

        if (Object.keys(updates).length === 0) {
            res.status(400).json({
                success: false,
                message: "No editable tuition information provided",
            });
            return;
        }

        // Validate the complete resulting tuition, not just the changed fields.
        const tuitions = getTuitionCollection();
        const existing = await tuitions.findOne({
            _id: new ObjectId(id),
            tutorEmail: authUser.email,
        });

        if (!existing) {
            res.status(404).json({
                success: false,
                message: "Your tuition post was not found",
            });
            return;
        }

        const validationError = validateTuition({
            ...existing,
            ...updates,
        });

        if (validationError) {
            res.status(400).json({
                success: false,
                message: validationError,
            });
            return;
        }

        updates.updatedAt = new Date();

        // Editing a post sends it back for moderation.
        updates.approvalStatus = "pending";

        const result = await tuitions.updateOne(
            {
                _id: new ObjectId(id),
                tutorEmail: authUser.email,
            },
            { $set: updates }
        );

        const updated = await tuitions.findOne({
            _id: new ObjectId(id),
        });

        res.status(200).json({
            success: true,
            message: "Tuition updated and submitted for approval",
            data: updated ? formatTuition(updated) : null,
        });
    } catch (error) {
        console.error("Update tuition error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update tuition post",
        });
    }
};

// PATCH /api/tuitions/:id/active
// Tutor only: open or close their own post.
export const updateTuitionActiveStatus: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;
        const id = getIdParam(req.params.id);
        const { isActive } = req.body;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!id) {
            res.status(400).json({
                success: false,
                message: "Invalid tuition ID",
            });
            return;
        }

        if (typeof isActive !== "boolean") {
            res.status(400).json({
                success: false,
                message: "isActive must be true or false",
            });
            return;
        }

        const tuitions = getTuitionCollection();

        const result = await tuitions.updateOne(
            {
                _id: new ObjectId(id),
                tutorEmail: authUser.email,
            },
            {
                $set: {
                    isActive,
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            res.status(404).json({
                success: false,
                message: "Your tuition post was not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: isActive
                ? "Tuition post opened successfully"
                : "Tuition post closed successfully",
        });
    } catch (error) {
        console.error("Update tuition active status error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update tuition status",
        });
    }
};

// DELETE /api/tuitions/:id
// Tutor only: delete their own post.
export const deleteTuition: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;
        const id = getIdParam(req.params.id);

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!id) {
            res.status(400).json({
                success: false,
                message: "Invalid tuition ID",
            });
            return;
        }

        const result = await getTuitionCollection().deleteOne({
            _id: new ObjectId(id),
            tutorEmail: authUser.email,
        });

        if (result.deletedCount === 0) {
            res.status(404).json({
                success: false,
                message: "Your tuition post was not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Tuition post deleted successfully",
        });
    } catch (error) {
        console.error("Delete tuition error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete tuition post",
        });
    }
};

// GET /api/tuitions/admin/all
// Admin only: view all posts, optionally filter by approvalStatus.
export const getAllTuitionsForAdmin: RequestHandler = async (req, res) => {
    try {
        const filter: Filter<Document> = {};

        const status =
            typeof req.query.status === "string"
                ? req.query.status
                : "";

        if (status) {
            if (!["pending", "approved", "rejected"].includes(status)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid approval status",
                });
                return;
            }

            filter.approvalStatus = status;
        }

        const page = Math.max(
            1,
            Number.parseInt(String(req.query.page || "1"), 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(String(req.query.limit || "20"), 10) || 20
            )
        );

        const skip = (page - 1) * limit;
        const tuitions = getTuitionCollection();

        const [data, total] = await Promise.all([
            tuitions
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),

            tuitions.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "All tuition posts retrieved successfully",
            data: data.map(formatTuition),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin get tuitions error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve tuition posts",
        });
    }
};

// PATCH /api/tuitions/admin/:id/moderation
// Admin only: approve or reject a tuition post.
export const moderateTuition: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;
        const id = getIdParam(req.params.id);
        const { approvalStatus } = req.body;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!id) {
            res.status(400).json({
                success: false,
                message: "Invalid tuition ID",
            });
            return;
        }

        if (!["approved", "rejected"].includes(approvalStatus)) {
            res.status(400).json({
                success: false,
                message: "Approval status must be approved or rejected",
            });
            return;
        }

        const tuitions = getTuitionCollection();

        const result = await tuitions.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    approvalStatus,
                    moderatedBy: authUser.email,
                    moderatedAt: new Date(),
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            res.status(404).json({
                success: false,
                message: "Tuition post not found",
            });
            return;
        }

        const updated = await tuitions.findOne({
            _id: new ObjectId(id),
        });

        res.status(200).json({
            success: true,
            message: `Tuition post ${approvalStatus} successfully`,
            data: updated ? formatTuition(updated) : null,
        });
    } catch (error) {
        console.error("Moderate tuition error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to moderate tuition post",
        });
    }
};
