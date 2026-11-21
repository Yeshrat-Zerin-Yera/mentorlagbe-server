
import type { Request, Response } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
import Stripe from "stripe";
import { getDB } from "../config/db.js";

const getStripe = () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is missing");
    }

    return new Stripe(secretKey);
};

const getUserFilter = (id: string): Filter<Document> => {
    if (ObjectId.isValid(id)) {
        return { _id: new ObjectId(id) };
    }

    return { _id: id as unknown as ObjectId };
};

const getPagination = (req: Request) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
};

// POST /api/payments/create-checkout-session
export const createCheckoutSession = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!["student", "tutor"].includes(authUser.role)) {
            res.status(403).json({
                success: false,
                message: "Only students and tutors can purchase Pro plans",
            });
            return;
        }

        const users = getDB().collection("users");

        const user = await users.findOne({
            ...getUserFilter(authUser.id),
            email: authUser.email,
        });

        if (!user) {
            res.status(404).json({
                success: false,
                message: "User account not found",
            });
            return;
        }

        if (user.role !== authUser.role) {
            res.status(403).json({
                success: false,
                message: "Your account role has changed. Please sign in again.",
            });
            return;
        }

        if (user.plan === "pro") {
            res.status(409).json({
                success: false,
                message: "You already have a Pro plan",
            });
            return;
        }

        const amount = authUser.role === "tutor" ? 1500 : 1000;
        const planLabel = authUser.role === "tutor" ? "Tutor Pro" : "Student Pro";
        const clientURL = process.env.CLIENT_URL;

        if (!clientURL) {
            res.status(500).json({
                success: false,
                message: "CLIENT_URL is not configured",
            });
            return;
        }

        const stripe = getStripe();

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: authUser.email,
            client_reference_id: authUser.id,

            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        unit_amount: amount,
                        recurring: {
                            interval: "month",
                        },
                        product_data: {
                            name: planLabel,
                            description: `${planLabel} monthly membership on MentorLagbe`,
                        },
                    },
                    quantity: 1,
                },
            ],

            metadata: {
                userId: authUser.id,
                userEmail: authUser.email,
                userRole: authUser.role,
                planName: "pro",
                planLabel,
            },

            subscription_data: {
                metadata: {
                    userId: authUser.id,
                    userEmail: authUser.email,
                    userRole: authUser.role,
                    planName: "pro",
                    planLabel,
                },
            },

            success_url: `${clientURL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientURL}/payment/cancel`,
        });

        res.status(200).json({
            success: true,
            message: "Checkout session created",
            url: session.url,
            sessionId: session.id,
        });
    } catch (error) {
        console.error("Create checkout session error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create checkout session",
        });
    }
};

// POST /api/payments/webhook
// This endpoint must receive the raw request body.
export const handleStripeWebhook = async (
    req: Request,
    res: Response
): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret || !Buffer.isBuffer(req.body)) {
        res.status(400).send("Invalid webhook request");
        return;
    }

    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(
            req.body,
            signature,
            webhookSecret
        );
    } catch (error) {
        console.error("Stripe webhook signature verification failed:", error);

        res.status(400).send("Webhook signature verification failed");
        return;
    }

    try {
        if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;

            // Never activate a plan unless Stripe confirms payment.
            if (session.payment_status !== "paid") {
                res.status(200).json({
                    received: true,
                    message: "Checkout received; payment is not confirmed yet",
                });
                return;
            }

            const metadata = session.metadata;

            const userId = metadata?.userId;
            const userEmail = metadata?.userEmail;
            const userRole = metadata?.userRole;
            const planName = metadata?.planName;

            if (
                !userId ||
                !userEmail ||
                !["student", "tutor"].includes(userRole || "") ||
                planName !== "pro"
            ) {
                console.error("Stripe session is missing valid user metadata:", session.id);

                res.status(400).send("Invalid checkout metadata");
                return;
            }

            const expectedAmount = userRole === "tutor" ? 1500 : 1000;

            if (
                session.currency !== "usd" ||
                session.amount_total !== expectedAmount
            ) {
                console.error("Stripe checkout amount did not match the expected plan:", session.id);

                res.status(400).send("Unexpected checkout amount");
                return;
            }

            const db = getDB();
            const payments = db.collection("payments");
            const users = db.collection("users");

            // Stripe can retry webhook delivery. Do not record a session twice.

            const user = await users.findOne({
                ...getUserFilter(userId),
                email: userEmail,
                role: userRole,
            });

            if (!user) {
                console.error("User for successful Stripe session was not found:", session.id);
                res.status(500).send("User account not found");
                return;
            }

            const transactionId =
                typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : typeof session.subscription === "string"
                        ? session.subscription
                        : session.id;

            const existingPayment = await payments.findOne({
                stripeSessionId: session.id,
            });

            if (!existingPayment) {
                const paymentRecord = {
                    userEmail,
                    userName: user.name || session.customer_details?.name || "",
                    userRole,
                    planName: "pro",
                    amount: expectedAmount / 100,
                    currency: "usd",
                    transactionId,
                    stripeSessionId: session.id,
                    paymentStatus: "paid",
                    paidAt: new Date(session.created * 1000),
                };

                await payments.insertOne(paymentRecord);
            }

            // Always ensure the user's plan is activated.
            const updateResult = await users.updateOne(
                {
                    ...getUserFilter(userId),
                    email: userEmail,
                    role: userRole,
                },
                {
                    $set: {
                        plan: "pro",
                        updatedAt: new Date(),
                    },
                }
            );

            if (updateResult.matchedCount === 0) {
                throw new Error(`Could not update plan for ${userEmail}`);
            }

            console.log(`Pro plan activated for ${userEmail}`);

            await users.updateOne(
                {
                    ...getUserFilter(userId),
                    email: userEmail,
                    role: userRole,
                },
                {
                    $set: {
                        plan: "pro",
                        updatedAt: new Date(),
                    },
                }
            );

            console.log(`Pro plan activated for ${userEmail}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error("Stripe webhook processing error:", error);

        // A 500 response tells Stripe that delivery should be retried.
        res.status(500).send("Webhook processing failed");
    }
};

// GET /api/payments/mine
export const getMyPayments = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const authUser = req.authUser;

        if (!authUser) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        const payments = getDB().collection("payments");
        const { page, limit, skip } = getPagination(req);

        const filter = { userEmail: authUser.email };

        const [data, total] = await Promise.all([
            payments
                .find(filter)
                .sort({ paidAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            payments.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get my payments error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve your payment history",
        });
    }
};

// GET /api/payments/admin/all
export const getAllPayments = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const payments = getDB().collection("payments");
        const { page, limit, skip } = getPagination(req);

        const [data, total, revenueResult] = await Promise.all([
            payments
                .find({})
                .sort({ paidAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            payments.countDocuments({ paymentStatus: "paid" }),
            payments
                .aggregate([
                    { $match: { paymentStatus: "paid" } },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: "$amount" },
                        },
                    },
                ])
                .toArray(),
        ]);

        res.status(200).json({
            success: true,
            data,
            revenue: revenueResult[0]?.totalRevenue || 0,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get all payments error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve payment records",
        });
    }
};
