import { userModel } from "../../../db/models/users.model.js";
import { sessionModel } from "../../../db/models/session.model.js";
import Event from "../../../db/models/eventModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import { sendEmail } from "../../utilities/email.js";

const JWT_SECRET = process.env.JWT_SECRET || "SecretKey123";

const notificationDefaults = () => ({
    booking: true,
    payment: true,
    eventUpdates: true,
    email: true,
});

const privacyDefaults = () => ({
    showEmail: true,
    showPhone: false,
});

export const toPublicUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    bio: user.bio || "",
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl || "",
    createdAt: user.createdAt || null,
    deactivatedAt: user.deactivatedAt || null,
    preferences: {
        notifications: {
            ...notificationDefaults(),
            ...(user.preferences?.notifications || {}),
        },
        privacy: {
            ...privacyDefaults(),
            ...(user.preferences?.privacy || {}),
        },
        theme: user.preferences?.theme === "dark" ? "dark" : "light",
    },
});

const deviceLabel = (ua = "") => {
    const s = String(ua).toLowerCase();
    let browser = "Browser";
    if (s.includes("edg/")) browser = "Edge";
    else if (s.includes("chrome/")) browser = "Chrome";
    else if (s.includes("firefox/")) browser = "Firefox";
    else if (s.includes("safari/") && !s.includes("chrome/")) browser = "Safari";

    let os = "Unknown device";
    if (s.includes("windows")) os = "Windows";
    else if (s.includes("mac os")) os = "Mac";
    else if (s.includes("android")) os = "Android";
    else if (s.includes("iphone") || s.includes("ipad")) os = "iOS";
    else if (s.includes("linux")) os = "Linux";

    return `${browser} on ${os}`;
};

const signToken = (user, sessionId) =>
    jwt.sign(
        {
            id: user._id,
            role: user.role,
            tv: user.tokenVersion || 0,
            sid: String(sessionId),
        },
        JWT_SECRET,
        { expiresIn: "1d" }
    );

const openSession = async (user, req) => {
    const session = await sessionModel.create({
        user: user._id,
        userAgent: req.get("user-agent") || "",
        ip: req.ip || "",
        lastSeenAt: new Date(),
    });
    return signToken(user, session._id);
};

const signup = async (req, res) => {
    try {
        let { name, email, password, role } = req.body;
        email = String(email || "").trim().toLowerCase();

        // Prevent direct admin registration
        if (role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Registration as admin is not allowed.",
            });
        }

        // Allow only participant/user and organizer roles
        if (!["user", "participant", "organizer"].includes(role)) {
            role = "user";
        }

        const existingUser = await userModel.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists with this email",
            });
        }

        const passwordHash = bcrypt.hashSync(password, 8);
        const verificationToken = crypto.randomBytes(32).toString("hex");

        const newUser = await userModel.create({
            name,
            email,
            passwordHash,
            role,
            status: "pending",
            verificationToken,
        });

        const verificationUrl =
            `${process.env.BASE_URL}/api/auth/verify-email?token=${verificationToken}`;

        await sendEmail({
            email: newUser.email,
            subject: "Email Verification - EventOps",
            html: `
                <h2>Welcome to EventOps, ${name}!</h2>
                <p>Please click the link below to verify your email and activate your account:</p>
                <a href="${verificationUrl}"
                   style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">
                   Verify Email
                </a>
            `,
        });

        return res.status(201).json({
            success: true,
            message:
                "User registered successfully. Please check your email to verify your account.",
            data: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status,
                avatarUrl: newUser.avatarUrl || "",
            },
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error in signup",
            error: err.message,
        });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.redirect("/verified.html?status=missing");
        }

        const user = await userModel.findOne({ verificationToken: token });

        if (!user) {
            return res.redirect("/verified.html?status=invalid");
        }

        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;

        // Keep organizers pending until the organizer approval process finishes
        if (user.role === "organizer") {
            user.status = "pending";
        } else {
            user.status = "approved";
        }

        await user.save();

        return res.redirect("/verified.html?status=success");
    } catch (err) {
        if (res.headersSent) return res.end();
        return res.redirect("/verified.html?status=error");
    }
};

const login = async (req, res) => {
    try {
        const { password } = req.body;
        // Emails are stored lowercased; normalize the input so "Admin@Site.com"
        // or a stray space does not produce a false "Invalid email or password".
        const email = String(req.body.email || "").trim().toLowerCase();

        const user = await userModel.findOne({ email }).select("+passwordHash");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const match = bcrypt.compareSync(password, user.passwordHash);

        if (!match) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (user.verificationToken) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email before logging in.",
            });
        }

        const verifiedOrganizerAwaitingApproval =
            user.role === "organizer" && user.status === "pending";

        if (user.status === "pending" && !verifiedOrganizerAwaitingApproval) {
            return res.status(403).json({
                success: false,
                message: "Your account is pending verification or approval.",
            });
        }

        if (user.status === "rejected") {
            return res.status(403).json({
                success: false,
                message: "Your account has been rejected.",
            });
        }

        if (user.status === "blocked") {
            return res.status(403).json({
                success: false,
                message: "Your account has been blocked. Contact support.",
            });
        }

        if (user.deletedAt) {
            return res.status(403).json({
                success: false,
                message: "This account has been deleted.",
            });
        }

        if (user.deactivatedAt) {
            return res.status(403).json({
                success: false,
                message: "This account is deactivated. Contact support to restore it.",
            });
        }

        const token = await openSession(user, req);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            data: toPublicUser(user),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error in login",
            error: err.message,
        });
    }
};

const getProfile = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            message: "Profile fetched successfully",
            data: toPublicUser(req.user),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error fetching profile",
            error: err.message,
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, avatarUrl, phone, bio } = req.body;

        if (name) {
            req.user.name = name;
        }

        if (avatarUrl !== undefined) {
            req.user.avatarUrl = avatarUrl || "";
        }

        if (phone !== undefined) {
            req.user.phone = String(phone || "").trim();
        }

        if (bio !== undefined) {
            req.user.bio = String(bio || "").trim();
        }

        await req.user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: toPublicUser(req.user),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error updating profile",
            error: err.message,
        });
    }
};

const updateSettings = async (req, res) => {
    try {
        const { notifications, privacy, theme } = req.body;
        req.user.preferences = {
            notifications: {
                booking: !!notifications.booking,
                payment: !!notifications.payment,
                eventUpdates: !!notifications.eventUpdates,
                email: !!notifications.email,
            },
            privacy: {
                showEmail: !!privacy.showEmail,
                showPhone: !!privacy.showPhone,
            },
            theme: theme === "dark" ? "dark" : "light",
        };
        req.user.markModified("preferences");
        await req.user.save();

        return res.status(200).json({
            success: true,
            message: "Settings updated successfully",
            data: toPublicUser(req.user),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error updating settings",
            error: err.message,
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await userModel.findById(req.user._id).select("+passwordHash");

        if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect",
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from the current password",
            });
        }

        user.passwordHash = bcrypt.hashSync(newPassword, 8);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        const currentId = req.auth?.sid;
        if (currentId) {
            await sessionModel.deleteMany({
                user: user._id,
                _id: { $ne: currentId },
            });
        } else {
            await sessionModel.deleteMany({ user: user._id });
        }

        let token;
        if (currentId) {
            const stillThere = await sessionModel.findOne({ _id: currentId, user: user._id });
            token = stillThere
                ? signToken(user, stillThere._id)
                : await openSession(user, req);
        } else {
            token = await openSession(user, req);
        }

        return res.status(200).json({
            success: true,
            message: "Password updated. Other devices have been signed out.",
            token,
            data: toPublicUser(user),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error changing password",
            error: err.message,
        });
    }
};

const listSessions = async (req, res) => {
    try {
        const sessions = await sessionModel
            .find({ user: req.user._id })
            .sort({ lastSeenAt: -1 });

        return res.status(200).json({
            success: true,
            data: sessions.map((session) => ({
                id: session._id,
                device: deviceLabel(session.userAgent),
                ip: session.ip || "",
                createdAt: session.createdAt,
                lastSeenAt: session.lastSeenAt,
                current: req.auth?.sid && String(session._id) === String(req.auth.sid),
            })),
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error loading sessions",
            error: err.message,
        });
    }
};

const revokeSession = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid session ID",
            });
        }

        const session = await sessionModel.findOne({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Session not found",
            });
        }

        const current = req.auth?.sid && String(session._id) === String(req.auth.sid);
        await session.deleteOne();

        return res.status(200).json({
            success: true,
            message: current ? "This device has been signed out" : "Session signed out",
            data: { current },
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error signing out the session",
            error: err.message,
        });
    }
};

const logoutCurrent = async (req, res) => {
    try {
        if (req.auth?.sid) {
            await sessionModel.deleteOne({ _id: req.auth.sid, user: req.user._id });
        }
        return res.status(200).json({ success: true, message: "Signed out" });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error signing out",
            error: err.message,
        });
    }
};

const logoutAll = async (req, res) => {
    try {
        req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
        await req.user.save();
        await sessionModel.deleteMany({ user: req.user._id });

        return res.status(200).json({
            success: true,
            message: "Signed out from all devices",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error signing out devices",
            error: err.message,
        });
    }
};

const deactivateAccount = async (req, res) => {
    try {
        if (req.user.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin accounts cannot be deactivated from settings",
            });
        }

        req.user.deactivatedAt = new Date();
        req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
        await req.user.save();
        await sessionModel.deleteMany({ user: req.user._id });

        return res.status(200).json({
            success: true,
            message: "Account deactivated. Contact support if you want it restored.",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error deactivating account",
            error: err.message,
        });
    }
};

const deleteAccount = async (req, res) => {
    try {
        if (req.user.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin accounts cannot be deleted",
            });
        }

        const user = await userModel.findById(req.user._id).select("+passwordHash");
        if (!user || !bcrypt.compareSync(req.body.password, user.passwordHash)) {
            return res.status(400).json({
                success: false,
                message: "Password is incorrect",
            });
        }

        if (user.role === "organizer") {
            const upcoming = await Event.countDocuments({
                organizer: user._id,
                status: "scheduled",
                endsAt: { $gt: new Date() },
            });
            if (upcoming > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Cancel your upcoming events before deleting this organizer account, or deactivate it instead.",
                });
            }
        }

        user.name = "Deleted user";
        user.email = `deleted_${user._id}@eventops.invalid`;
        user.phone = "";
        user.bio = "";
        user.avatarUrl = "";
        user.passwordHash = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 8);
        user.status = "blocked";
        user.deletedAt = new Date();
        user.deactivatedAt = null;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.preferences = {
            notifications: notificationDefaults(),
            privacy: privacyDefaults(),
            theme: "light",
        };
        await user.save();
        await sessionModel.deleteMany({ user: user._id });

        return res.status(200).json({
            success: true,
            message: "Account deleted",
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error deleting account",
            error: err.message,
        });
    }
};

export {
    signup,
    verifyEmail,
    login,
    getProfile,
    updateProfile,
    updateSettings,
    changePassword,
    listSessions,
    revokeSession,
    logoutCurrent,
    logoutAll,
    deactivateAccount,
    deleteAccount,
};
