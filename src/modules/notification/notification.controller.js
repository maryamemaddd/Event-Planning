import { notificationModel } from "../../../db/models/notification.model.js";

export const getNotifications = async (req, res) => {
  try {
    const list = await notificationModel
      .find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const unread = list.filter((n) => !n.read).length;
    return res.status(200).json({
      success: true,
      data: list,
      unread,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to load notifications", error: err.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const n = await notificationModel.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true },
    );
    if (!n) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.status(200).json({ success: true, data: n });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to update notification", error: err.message });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await notificationModel.updateMany({ user: req.user._id, read: false }, { read: true });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to update notifications", error: err.message });
  }
};

// Helper used by other controllers to create a notification.
export const createNotification = async ({ userId, type = "system", title, message = "", link = "" }) => {
  try {
    await notificationModel.create({ user: userId, type, title, message, link });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
};