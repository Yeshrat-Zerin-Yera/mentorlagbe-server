
import type { RequestHandler } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
import { getDB } from "../config/db.js";

const getApplicationCollection = () =>
    getDB().collection("applications");

const getIdParam = (
    value: string | string[] | undefined
): string | null => {
    const id = Array.isArray(value) ? value[0] : value;

    return id && ObjectId.isValid(id) ? id : null;
};

const formatApplication = (application: Document) => ({
    ...application,
    _id: application._id?.toString(),
});

const validText = (value: unknown, maxLength: number) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;

// POST /api/applications
// Student applies for an approved and active tuition.
export const createApplication: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const { tuitionId, studentPhone, preferredSchedule, studentNote } =
            req.body;

        if (
            typeof tuitionId !== "string" ||
            !ObjectId.isValid(tuitionId)
        ) {
            res.status(400).json({
                success: false,
                message: "A valid tuition ID is required",
            });
            return;
        }

        if (!validText(studentPhone, 30)) {
            res.status(400).json({
                success: false,
                message: "Please provide a valid phone number",
            });
            return;
        }

        if (!validText(preferredSchedule, 200)) {
            res.status(400).json({
                success: false,
                message: "Please provide your preferred schedule",
            });
            return;
        }

        if (
            studentNote !== undefined &&
            (typeof studentNote !== "string" || studentNote.length > 1000)
        ) {
            res.status(400).json({
                success: false,
                message: "Your note must be 1000 characters or fewer",
            });
            return;
        }

        const db = getDB();

        // Confirm the student's current account and role.
        const student = await db.collection("users").findOne({
            email: authUser.email,
        });

        if (!student || student.role !== "student") {
            res.status(403).json({
                success: false,
                message: "Only students can apply for tuition",
            });
            return;
        }

        // Students can apply only for approved and active tuition posts.
        const tuition = await db.collection("tuitions").findOne({
            _id: new ObjectId(tuitionId),
            approvalStatus: "approved",
            isActive: true,
        });

        if (!tuition) {
            res.status(404).json({
                success: false,
                message: "This tuition is unavailable for applications",
            });
            return;
        }

        // Prevent the same student from applying twice.
        const applications = getApplicationCollection();

        const existingApplication = await applications.findOne({
            tuitionId,
            studentEmail: authUser.email,
        });

        if (existingApplication) {
            res.status(409).json({
                success: false,
                message: "You have already applied for this tuition",
            });
            return;
        }

        const newApplication = {
            tuitionId,
            tuitionTitle: tuition.title,
            subject: tuition.subject,
            monthlyFee: tuition.monthlyFee,
            tutorEmail: tuition.tutorEmail,
            tutorName: tuition.tutorName || "",

            studentName: student.name || "",
            studentEmail: authUser.email,
            studentPhone: studentPhone.trim(),

            preferredSchedule: preferredSchedule.trim(),
            studentNote:
                typeof studentNote === "string" ? studentNote.trim() : "",

            status: "pending",
            appliedAt: new Date(),
        };

        const result = await applications.insertOne(newApplication);

        res.status(201).json({
            success: true,
            message: "Your tuition application was submitted successfully",
            data: {
                ...newApplication,
                _id: result.insertedId.toString(),
            },
        });
    } catch (error) {
        console.error("Create application error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit your application",
        });
    }
};

// GET /api/applications/mine
// Student views their own applications.
export const getMyApplications: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const page = Math.max(
            1,
            Number.parseInt(String(req.query.page || "1"), 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(
                1,
                Number.parseInt(String(req.query.limit || "20"), 10) || 20
            )
        );

        const filter: Filter<Document> = {
            studentEmail: authUser.email,
        };

        const applications = getApplicationCollection();

        const [data, total] = await Promise.all([
            applications
                .find(filter)
                .sort({ appliedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),

            applications.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Your applications retrieved successfully",
            data: data.map(formatApplication),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get my applications error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve your applications",
        });
    }
};

// DELETE /api/applications/mine/:id
// Student can cancel only their own pending application.
export const cancelMyApplication: RequestHandler = async (req, res) => {
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
                message: "Invalid application ID",
            });
            return;
        }

        const result = await getApplicationCollection().deleteOne({
            _id: new ObjectId(id),
            studentEmail: authUser.email,
            status: "pending",
        });

        if (result.deletedCount === 0) {
            res.status(404).json({
                success: false,
                message: "Pending application not found. It may already have been processed.",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Your application was cancelled successfully",
        });
    } catch (error) {
        console.error("Cancel application error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to cancel application",
        });
    }
};

// GET /api/applications/tutor
// Tutor views applications submitted to their tuition posts.
export const getTutorApplicants: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const filter: Filter<Document> = {
            tutorEmail: authUser.email,
        };

        const status =
            typeof req.query.status === "string"
                ? req.query.status
                : "";

        if (status) {
            if (!["pending", "accepted", "rejected"].includes(status)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid application status",
                });
                return;
            }

            filter.status = status;
        }

        const page = Math.max(
            1,
            Number.parseInt(String(req.query.page || "1"), 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(
                1,
                Number.parseInt(String(req.query.limit || "20"), 10) || 20
            )
        );

        const applications = getApplicationCollection();

        const [data, total] = await Promise.all([
            applications
                .find(filter)
                .sort({ appliedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),

            applications.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Applicants retrieved successfully",
            data: data.map(formatApplication),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get tutor applicants error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve applicants",
        });
    }
};

// PATCH /api/applications/:id/status
// Tutor accepts or rejects an application for their own tuition.
export const updateApplicationStatus: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;
        const id = getIdParam(req.params.id);
        const { status } = req.body;

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
                message: "Invalid application ID",
            });
            return;
        }

        if (!["accepted", "rejected"].includes(status)) {
            res.status(400).json({
                success: false,
                message: "Status must be accepted or rejected",
            });
            return;
        }

        const applications = getApplicationCollection();

        // Match tutor ownership and pending status in the same update.
        const result = await applications.updateOne(
            {
                _id: new ObjectId(id),
                tutorEmail: authUser.email,
                status: "pending",
            },
            {
                $set: {
                    status,
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            const existing = await applications.findOne({
                _id: new ObjectId(id),
                tutorEmail: authUser.email,
            });

            if (!existing) {
                res.status(404).json({
                    success: false,
                    message: "Application not found for your tuition posts",
                });
                return;
            }

            res.status(409).json({
                success: false,
                message: "This application has already been processed",
            });
            return;
        }

        const updatedApplication = await applications.findOne({
            _id: new ObjectId(id),
        });

        res.status(200).json({
            success: true,
            message: `Application ${status} successfully`,
            data: updatedApplication
                ? formatApplication(updatedApplication)
                : null,
        });
    } catch (error) {
        console.error("Update application status error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update application status",
        });
    }
};
