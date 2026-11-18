import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'participant', 'organizer', 'admin'],
        default: 'participant'
    },
    status: {
        type: String,
        enum: ['active', 'pending', 'approved', 'rejected', 'blocked'],
        default: 'active'
    },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    avatarUrl: { type: String, default: "" },
    phone: { type: String, default: "", trim: true },
    bio: { type: String, default: "", maxlength: 280 },
    tokenVersion: { type: Number, default: 0 },
    deactivatedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    preferences: {
        notifications: {
            booking: { type: Boolean, default: true },
            payment: { type: Boolean, default: true },
            eventUpdates: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
        },
        privacy: {
            showEmail: { type: Boolean, default: true },
            showPhone: { type: Boolean, default: false },
        },
        theme: { type: String, enum: ["light", "dark"], default: "light" },
    },
}, { timestamps: true });

export const userModel = mongoose.model("User", userSchema);