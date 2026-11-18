import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
        lastSeenAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export const sessionModel = mongoose.model("Session", sessionSchema);
export default sessionModel;
