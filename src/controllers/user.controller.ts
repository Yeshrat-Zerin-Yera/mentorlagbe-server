
import type { RequestHandler } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
import { getDB } from "../config/db.js";

const getUserCollection = () => {
    return getDB().collection("users");
};

// Support both MongoDB ObjectId and string-based user IDs.
const getUserFilter = (id: string): Filter<Document> => {
    if (ObjectId.isValid(id)) {
        return {
            _id: new ObjectId(id),
        };
    }

    return {
        _id: id as unknown as ObjectId,
    };
};

// Return only public user information.
const formatUser = (user: Document) => ({
    id: user._id?.toString(),
    name: user.name,
    email: user.email,
    image: user.image || "",
    role: user.role || "student",
    phone: user.phone || "",
    bio: user.bio || "",
    plan: user.plan || "free",
    createdAt: user.createdAt,
});

// GET /api/users/me
export const getMyProfile: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const user = await getUserCollection().findOne(
            getUserFilter(authUser.id)
        );

        if (!user) {
            res.status(404).json({
                success: false,
                message: "User profile not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Profile retrieved successfully",
            data: formatUser(user),
        });
    } catch (error) {
        console.error("Get profile error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve profile",
        });
    }
};

// PATCH /api/users/me
export const updateMyProfile: RequestHandler = async (req, res) => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const { name, phone, bio, image } = req.body;

        const updates: Record<string, unknown> = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                res.status(400).json({
                    success: false,
                    message: "Name cannot be empty",
                });
                return;
            }

            updates.name = name.trim();
        }

        if (phone !== undefined) {
            if (typeof phone !== "string" || phone.length > 30) {
                res.status(400).json({
                    success: false,
                    message: "Invalid phone number",
                });
                return;
            }

            updates.phone = phone.trim();
        }

        if (bio !== undefined) {
            if (typeof bio !== "string" || bio.length > 500) {
                res.status(400).json({
                    success: false,
                    message: "Bio must be 500 characters or fewer",
                });
                return;
            }

            updates.bio = bio.trim();
        }

        if (image !== undefined) {
            if (typeof image !== "string") {
                res.status(400).json({
                    success: false,
                    message: "Invalid profile image",
                });
                return;
            }

            if (image.trim()) {
                try {
                    const imageURL = new URL(image);

                    if (!["http:", "https:"].includes(imageURL.protocol)) {
                        throw new Error("Invalid protocol");
                    }
                } catch {
                    res.status(400).json({
                        success: false,
                        message: "Please provide a valid image URL",
                    });
                    return;
                }
            }

            updates.image = image.trim();
        }

        if (Object.keys(updates).length === 0) {
            res.status(400).json({
                success: false,
                message: "No profile information provided",
            });
            return;
        }

        updates.updatedAt = new Date();

        const users = getUserCollection();

        const result = await users.updateOne(
            getUserFilter(authUser.id),
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            res.status(404).json({
                success: false,
                message: "User profile not found",
            });
            return;
        }

        const updatedUser = await users.findOne(
            getUserFilter(authUser.id)
        );

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: updatedUser ? formatUser(updatedUser) : null,
        });
    } catch (error) {
        console.error("Update profile error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update profile",
        });
    }
};

// GET /api/users
// Admin only — protect this route with verifyToken and verifyAdmin.
export const getAllUsers: RequestHandler = async (_req, res) => {
    try {
        const users = getUserCollection();

        const page = Math.max(
            1,
            Number.parseInt(String(_req.query.page || "1"), 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(String(_req.query.limit || "20"), 10) || 20
            )
        );

        const skip = (page - 1) * limit;

        const [allUsers, total] = await Promise.all([
            users
                .find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),

            users.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Users retrieved successfully",
            data: allUsers.map(formatUser),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get all users error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve users",
        });
    }
};

// PATCH /api/users/:id/role
// Admin only — protect this route with verifyToken and verifyAdmin.
export const updateUserRole: RequestHandler = async (req, res) => {
    try {
        const id = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        const { role } = req.body;

        const allowedRoles = ["student", "tutor", "admin"];

        if (!id || !ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
            return;
        }

        if (!allowedRoles.includes(role)) {
            res.status(400).json({
                success: false,
                message: "Role must be student, tutor, or admin",
            });
            return;
        }

        const users = getUserCollection();

        const result = await users.updateOne(
            getUserFilter(id),
            {
                $set: {
                    role,
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }

        const updatedUser = await users.findOne(getUserFilter(id));

        res.status(200).json({
            success: true,
            message: "User role updated successfully",
            data: updatedUser ? formatUser(updatedUser) : null,
        });
    } catch (error) {
        console.error("Update user role error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update user role",
        });
    }
};

// GET /api/users/admin/stats
// Admin dashboard overview statistics.
export const getAdminDashboardStats: RequestHandler = async (_req, res) => {
    try {
        const db = getDB();

        const users = db.collection("users");
        const tuitions = db.collection("tuitions");
        const payments = db.collection("payments");

        const [
            totalUsers,
            totalTutors,
            pendingTuitions,
            approvedTuitions,
            totalRevenue,
        ] = await Promise.all([
            users.countDocuments({}),

            users.countDocuments({ role: "tutor" }),

            tuitions.countDocuments({
                approvalStatus: "pending",
            }),

            tuitions.countDocuments({
                approvalStatus: "approved",
            }),

            payments.aggregate([
                {
                    $match: {
                        paymentStatus: "paid",
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$amount" },
                    },
                },
            ]).toArray(),
        ]);

        res.status(200).json({
            success: true,
            message: "Admin dashboard statistics retrieved successfully",
            data: {
                totalUsers,
                totalTutors,
                pendingTuitions,
                approvedTuitions,
                totalRevenue: totalRevenue[0]?.total || 0,
            },
        });
    } catch (error) {
        console.error("Admin dashboard stats error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve admin dashboard statistics",
        });
    }
};
