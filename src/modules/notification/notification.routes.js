import express from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notification.controller.js";

const router = express.Router();

router.get("/api/notifications", verifyToken, getNotifications);
router.patch("/api/notifications/:id/read", verifyToken, markNotificationRead);
router.patch("/api/notifications/read-all", verifyToken, markAllNotificationsRead);

export default router;
export const notificationRoutes = router;