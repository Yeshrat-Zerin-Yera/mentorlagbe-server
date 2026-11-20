
import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

export type UserRole = "student" | "tutor" | "admin";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

const authBaseURL = process.env.BETTER_AUTH_URL;

if (!authBaseURL) {
  throw new Error("BETTER_AUTH_URL is missing");
}

// BetterAuth JWT plugin's public key endpoint.
const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", authBaseURL)
);

// 1. Verify JWT and attach authenticated user.
export const verifyToken: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
      return;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
      audience: authBaseURL,
    });

    const id =
      typeof payload.id === "string"
        ? payload.id
        : payload.sub;

    const email = payload.email;
    const role = payload.role;

    if (
      !id ||
      typeof email !== "string" ||
      !["student", "tutor", "admin"].includes(role as string)
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid user information in token",
      });
      return;
    }

    req.authUser = {
      id,
      email,
      role: role as UserRole,
    };

    next();
  } catch (error) {
    console.error("JWT verification error:", error);

    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

// Reusable role-checking middleware.
const verifyRole = (allowedRole: UserRole): RequestHandler => {
  return (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (req.authUser.role !== allowedRole) {
      res.status(403).json({
        success: false,
        message: `Access denied. ${allowedRole} role required.`,
      });
      return;
    }

    next();
  };
};

// 2. Student-only access.
export const verifyStudent = verifyRole("student");

// 3. Tutor-only access.
export const verifyTutor = verifyRole("tutor");

// 4. Admin-only access.
export const verifyAdmin = verifyRole("admin");
