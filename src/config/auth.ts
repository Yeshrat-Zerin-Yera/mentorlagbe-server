
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { client, getDB } from "./db.js";

export const auth = betterAuth({
    appName: "MentorLagbe",

    baseURL: process.env.BETTER_AUTH_URL,

    secret: process.env.BETTER_AUTH_SECRET,

    trustedOrigins: [
        process.env.CLIENT_URL || "http://localhost:3000",
    ],

    database: mongodbAdapter(getDB(), {
        client,
    }),

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
    },

    user: {
        additionalFields: {
            role: {
                type: ["student", "tutor"],
                required: true,
                defaultValue: "student",
                input: true,
            },
            phone: {
                type: "string",
                required: false,
                input: true,
            },
            bio: {
                type: "string",
                required: false,
                input: true,
            },
            plan: {
                type: ["free", "pro"],
                required: true,
                defaultValue: "free",
                input: false,
            },
        },
    },

    plugins: [
        jwt({
            jwt: {
                definePayload: ({ user }) => ({
                    id: user.id,
                    email: user.email,
                    role: user.role,
                }),
            },
        }),
    ],
});
