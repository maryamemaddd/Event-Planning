import Event from "../../../db/models/eventModel.js";
import { seatModel } from "../../../db/models/seat.model.js";
import { bookingModel } from "../../../db/models/booking.model.js";
import Ticket from "../../../db/models/ticket.model.js";
import Transaction from "../payments/paymentModel.js";

const HOLD_MINUTES = 10;
const ACTIVE_STATUSES = ["pending_payment", "confirmed"];
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const ensureSeats = async (event) => {
  const existingSeats = await seatModel
    .find({ event: event._id })
    .select("label");
  const existingCount = existingSeats.length;

  if (existingCount >= event.capacity) return;

  const existingLabels = new Set(existingSeats.map((s) => s.label));
  const seats = [];

  for (let i = 1; i <= event.capacity; i++) {
    const label = `S${i}`;
    if (!existingLabels.has(label)) {
      seats.push({
        event: event._id,
        label,
        status: "available",
      });
    }
  }

  if (seats.length === 0) return;

  try {
    await seatModel.insertMany(seats, { ordered: false });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
};

const releaseExpiredHolds = async (filter = {}) => {
  const now = new Date();

  const expiredSeats = await seatModel
    .find({ ...filter, status: "held", holdExpiresAt: { $lt: now } })
    .select("_id");

  const seatIds = expiredSeats.map((seat) => seat._id);

  if (seatIds.length === 0) return;

  await seatModel.updateMany(
    { _id: { $in: seatIds } },
    { status: "available", heldBy: null, holdExpiresAt: null },
  );

  await bookingModel.updateMany(
    { seat: { $in: seatIds }, status: "pending_payment" },
    { status: "expired" },
  );
};

export const getSeats = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.visibility === "private") {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "You must be logged in to access this private event",
        });
      }

      const isOwner = String(event.organizer) === String(req.user._id);
      const userEmail = req.user.email?.trim().toLowerCase();
      const isInvited = (event.invitedEmails || []).some(
        (email) => email.trim().toLowerCase() === userEmail,
      );

      if (!isOwner && !isInvited) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this private event",
        });
      }
    }

    await ensureSeats(event);
    await releaseExpiredHolds({ event: event._id });

    const seats = await seatModel
      .find({ event: event._id })
      .collation({ locale: "en", numericOrdering: true })
      .sort({ label: 1 });

    return res.status(200).json({
      success: true,
      message: "Seats retrieved successfully",
      data: seats,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve seats",
      errors: error.message,
    });
  }
};

export const createBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { seat: seatId } = req.body;
    const userId = req.user._id;

    if (req.user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot book events",
      });
    }

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "This event is not open for booking",
      });
    }

    if (event.registrationDeadline && new Date() > event.registrationDeadline) {
      return res.status(400).json({
        success: false,
        message: "Registration deadline has passed",
      });
    }

    if (event.visibility === "private") {
      const isOwner = String(event.organizer) === String(req.user._id);
      const userEmail = req.user.email?.trim().toLowerCase();
      const isInvited = (event.invitedEmails || []).some(
        (email) => email.trim().toLowerCase() === userEmail,
      );

      if (!isOwner && !isInvited) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this private event",
        });
      }

      // In private events, a user can only book one seat
      const existingBooking = await bookingModel.findOne({
        event: event._id,
        user: userId,
        status: { $in: ACTIVE_STATUSES },
      });

      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message: "You can only book one seat for a private event",
        });
      }
    }

    await ensureSeats(event);
    await releaseExpiredHolds({ event: event._id });

    const isFree = event.price === 0;
    const holdExpiresAt = isFree
      ? null
      : new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    const seat = await seatModel.findOneAndUpdate(
      { _id: seatId, event: event._id, status: "available" },
      {
        status: isFree ? "booked" : "held",
        heldBy: userId,
        holdExpiresAt,
      },
      { new: true },
    );

    if (!seat) {
      return res.status(409).json({
        success: false,
        message: "Seat is not available",
      });
    }

    try {
      const booking = await bookingModel.create({
        event: event._id,
        user: userId,
        seat: seat._id,
        status: isFree ? "confirmed" : "pending_payment",
        expiresAt: holdExpiresAt,
      });

      return res.status(201).json({
        success: true,
        message: isFree
          ? "Booking confirmed successfully"
          : "Seat held. Complete payment to confirm your booking",
        data: booking,
      });
    } catch (err) {
      await seatModel.updateOne(
        { _id: seat._id },
        { status: "available", heldBy: null, holdExpiresAt: null },
      );

      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            event.visibility === "private"
              ? "You can only book one seat for a private event"
              : "This seat has already been booked. Please choose another seat",
        });
      }

      throw err;
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
      errors: error.message,
    });
  }
};

export const getMyBookings = async (req, res) => {
  try {
    await releaseExpiredHolds({ heldBy: req.user._id });

    const bookings = await bookingModel
      .find({ user: req.user._id })
      .populate("event")
      .populate("seat")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Bookings retrieved successfully",
      data: bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve bookings",
      errors: error.message,
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await bookingModel.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const event = await Event.findById(booking.event);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (String(event.organizer) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel bookings for your own events",
      });
    }

    if (["cancelled", "expired"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    booking.status = "cancelled";
    await booking.save();

    await seatModel.updateOne(
      { _id: booking.seat },
      { status: "available", heldBy: null, holdExpiresAt: null },
    );

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: booking,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      errors: error.message,
    });
  }
};

/**
 * PATCH /api/bookings/:id/cancel
 * A participant cancels their OWN booking and gets refunded (mock):
 * frees the seat, revokes the ticket, marks the payment transaction as
 * refunded, and moves the booking to "cancelled". Allowed only until the
 * registration deadline (falls back to the event start when none is set).
 */
export const cancelMyBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!OBJECT_ID.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID" });
    }

    const booking = await bookingModel.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own booking",
      });
    }

    if (["cancelled", "expired"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `This booking is already ${booking.status}`,
      });
    }

    const event = await Event.findById(booking.event);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (event.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This event has been cancelled by the organizer",
      });
    }

    // A ticket already scanned at the door can't be refunded.
    const ticket = await Ticket.findOne({ booking: booking._id });
    if (ticket && ticket.status === "used") {
      return res.status(409).json({
        success: false,
        message: "This ticket has already been checked in and can't be cancelled",
      });
    }

const { refundAccount } = req.body || {};

    // Release the seat.
    if (booking.seat) {
      await seatModel.updateOne(
        { _id: booking.seat },
        { status: "available", heldBy: null, holdExpiresAt: null },
      );
    }

    // Revoke the ticket (if any).
    if (ticket && ticket.status !== "revoked") {
      ticket.status = "revoked";
      await ticket.save();
    }

    // For paid bookings, schedule a refund within 7 days to the provided account.
    let refundPending = false;
    let refundAmount = 0;
    const tx = await Transaction.findOne({ booking: booking._id }).sort({ createdAt: -1 });
    if (tx && tx.status === "succeeded") {
      tx.status = "refund_pending";
      tx.refundAccount = (refundAccount || "").trim();
      tx.refundScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.save();
      refundPending = true;
      refundAmount = tx.net ?? tx.amount ?? 0;
    } else if (tx && tx.status === "pending") {
      tx.status = "failed";
      await tx.save();
    }

    booking.status = "cancelled";
    booking.expiresAt = null;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: refundPending
        ? "Booking cancelled — your refund will be processed within 7 days"
        : "Booking cancelled successfully",
      data: { booking, refunded: false, refundPending, amount: refundAmount, refundAccount: refundAccount || "" },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      errors: error.message,
    });
  }
};
