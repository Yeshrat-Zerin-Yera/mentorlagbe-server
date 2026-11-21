
import type { RequestHandler } from "express";

export const uploadImage: RequestHandler = async (req, res) => {
    try {
        const image = (req as typeof req & {
            file?: { buffer: Buffer };
        }).file;
        const apiKey = process.env.IMGBB_API_KEY;

        if (!image) {
            res.status(400).json({
                success: false,
                message: "Please select an image",
            });
            return;
        }

        if (!apiKey) {
            res.status(500).json({
                success: false,
                message: "Image upload service is not configured",
            });
            return;
        }

        const formData = new FormData();

        formData.append(
            "image",
            image.buffer.toString("base64")
        );

        const response = await fetch(
            `https://api.imgbb.com/1/upload?key=${apiKey}`,
            {
                method: "POST",
                body: formData,
            }
        );

        const result = await response.json() as {
            success?: boolean;
            data?: {
                url?: string;
            };
            error?: {
                message?: string;
            };
        };

        if (!response.ok || !result.success || !result.data?.url) {
            res.status(502).json({
                success: false,
                message: result.error?.message || "Image upload failed",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Image uploaded successfully",
            data: {
                url: result.data.url,
            },
        });
    } catch (error) {
        console.error("Image upload error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to upload image",
        });
    }
};
