
import Event from "../../../db/models/eventModel.js";
import { seatModel } from "../../../db/models/seat.model.js";
import { sendInviteEmail } from "../../service/email.service.js";
import { createNotification } from "../notification/notification.controller.js";
import { userModel as User } from "../../../db/models/users.model.js";

const normalizeEmail = (email) => email.trim().toLowerCase();

export const createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      venue,
      startsAt,
      endsAt,
      registrationDeadline,
      capacity,
      price,
      visibility,
      invitedEmails,
    } = req.body;

    const event = await Event.create({
      organizer: req.user._id,
      title,
      description,
      venue,
      startsAt,
      endsAt,
      registrationDeadline,
      capacity,
      price,
      visibility,
      invitedEmails,
    });

    // If private with invitees, notify them (email + in-app)
    if (visibility === "private" && Array.isArray(invitedEmails) && invitedEmails.length) {
      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      const eventLink = `${baseUrl}/event-details.html?id=${event._id}`;
      for (const email of invitedEmails) {
        const norm = normalizeEmail(email);
        sendInviteEmail(norm, event, eventLink).catch(() => {});
        const user = await User.findOne({ email: norm }).select("_id");
        if (user) {
          createNotification({
            userId: user._id,
            type: "invite",
            title: `You're invited to: ${event.title}`,
            message: `${req.user.name || "An organizer"} invited you to a private event.`,
            link: `/event-details.html?id=${event._id}`,
          }).catch(() => {});
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to create event",
      errors: error.message,
    });
  }
};

export const getInvitedEvents = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const userEmail = req.user.email?.trim().toLowerCase();
    const events = await Event.find({
      visibility: "private",
      invitedEmails: userEmail,
      status: "scheduled",
      endsAt: { $gt: new Date() },
    }).sort({ startsAt: 1 });
    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load invited events", errors: error.message });
  }
};
export const getAllEvents = async (req, res) => {
  try {
    const {
      search,
      venue,
      minPrice,
      maxPrice,
      startsAfter,
      startsBefore,
      sort,
      organizer,
    } = req.validatedQuery;

    const filter = {};

    const isOwnEventsRequest = organizer === "me";

    if (isOwnEventsRequest) {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "You must be logged in to view your events",
        });
      }

      filter.organizer = req.user._id;
    } else {
      filter.status = "scheduled";
      filter.endsAt = { $gt: new Date() };

      if (organizer) {
        filter.organizer = organizer;
      }

      const userEmail = req.user?.email?.trim().toLowerCase();
      if (userEmail) {
        filter.$or = [
          { visibility: "public" },
          { visibility: "private", invitedEmails: userEmail },
        ];
      } else {
        filter.visibility = "public";
      }
    }

    if (search) {
      filter.title = {
        $regex: search,
        $options: "i",
      };
    }

    if (venue) {
      filter.venue = {
        $regex: venue,
        $options: "i",
      };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        filter.price.$gte = minPrice;
      }

      if (maxPrice !== undefined) {
        filter.price.$lte = maxPrice;
      }
    }

    if (startsAfter || startsBefore) {
      filter.startsAt = {};

      if (startsAfter) {
        filter.startsAt.$gte = startsAfter;
      }

      if (startsBefore) {
        filter.startsAt.$lte = startsBefore;
      }
    }

    let sortOption = { startsAt: 1 };

    if (sort === "price") {
      sortOption = { price: 1 };
    } else if (sort === "-price") {
      sortOption = { price: -1 };
    } else if (sort === "-startsAt") {
      sortOption = { startsAt: -1 };
    }

    const events = await Event.find(filter).sort(sortOption);

    return res.status(200).json({
      success: true,
      message: "Events retrieved successfully",
      data: events,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve events",
      errors: error.message,
    });
  }
};

export const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const event = await Event.findById(id).populate("organizer", "name email");

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

      const userId = String(req.user._id);
      const organizerId = event.organizer?._id
        ? String(event.organizer._id)
        : String(event.organizer);
      const userEmail = req.user?.email?.trim().toLowerCase();
      const isOwner = userId === organizerId;
      const isInvited =
        userEmail &&
        (event.invitedEmails || []).some(
          (email) => email.trim().toLowerCase() === userEmail,
        );

      if (!isOwner && !isInvited) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this private event",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Event retrieved successfully",
      data: event,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve event",
      errors: error.message,
    });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to update an event",
      });
    }

    const eventFilter =
      req.user.role === "admin"
        ? { _id: id }
        : { _id: id, organizer: req.user._id };

    const event = await Event.findOne(eventFilter);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const startsAt = new Date(req.body.startsAt ?? event.startsAt);
    const endsAt = new Date(req.body.endsAt ?? event.endsAt);
    const registrationDeadline = new Date(
      req.body.registrationDeadline ?? event.registrationDeadline,
    );

    if (endsAt <= startsAt) {
      return res.status(400).json({
        success: false,
        message: "Event end time must be after start time",
      });
    }

    if (registrationDeadline > startsAt) {
      return res.status(400).json({
        success: false,
        message:
          "Registration deadline must be before or at the event start time",
      });
    }

    // Capacity validation & seatModel sync
    if (
      req.body.capacity !== undefined &&
      Number(req.body.capacity) !== Number(event.capacity)
    ) {
      const newCap = Number(req.body.capacity);
      const bookedCount = await seatModel.countDocuments({
        event: event._id,
        status: { $in: ["booked", "held"] },
      });

      if (newCap < bookedCount) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce capacity to ${newCap} because ${bookedCount} seats are already booked or held.`,
        });
      }

      const existingSeats = await seatModel.find({ event: event._id });
      const existingLabels = new Set(existingSeats.map((s) => s.label));

      if (newCap > existingSeats.length) {
        const newSeats = [];
        for (let i = 1; i <= newCap; i++) {
          const label = `S${i}`;
          if (!existingLabels.has(label)) {
            newSeats.push({ event: event._id, label, status: "available" });
          }
        }
        if (newSeats.length > 0) {
          try {
            await seatModel.insertMany(newSeats, { ordered: false });
          } catch (err) {
            if (err.code !== 11000) throw err;
          }
        }
      } else if (newCap < existingSeats.length) {
        const candidateSeats = existingSeats.filter(
          (s) => s.status === "available",
        );
        const toDeleteIds = candidateSeats
          .map((s) => {
            const num = parseInt(String(s.label).replace(/^S/i, ""), 10);
            return { _id: s._id, num };
          })
          .filter((item) => !isNaN(item.num) && item.num > newCap)
          .map((item) => item._id);

        if (toDeleteIds.length > 0) {
          await seatModel.deleteMany({ _id: { $in: toDeleteIds } });
        }
      }
    }

    const resultingVisibility = req.body.visibility ?? event.visibility;
    const hasInvitationChanges =
      (req.body.invitedEmails?.length ?? 0) > 0 ||
      (req.body.removeInvitedEmails?.length ?? 0) > 0;

    if (hasInvitationChanges && resultingVisibility !== "private") {
      return res.status(400).json({
        success: false,
        message: "Invitations can only be changed for private events",
      });
    }

    if (req.body.visibility === "public") {
      event.invitedEmails = [];
    } else if (hasInvitationChanges) {
      const invitedEmails = new Set(
        (event.invitedEmails || []).map(normalizeEmail),
      );

      for (const email of req.body.invitedEmails || []) {
        invitedEmails.add(normalizeEmail(email));
      }

      for (const email of req.body.removeInvitedEmails || []) {
        invitedEmails.delete(normalizeEmail(email));
      }

      event.invitedEmails = [...invitedEmails];
    }

    const allowedFields = [
      "title",
      "description",
      "venue",
      "startsAt",
      "endsAt",
      "registrationDeadline",
      "capacity",
      "price",
      "visibility",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    });

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: event,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to update event",
      errors: error.message,
    });
  }
};

export const cancelEvent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to cancel an event",
      });
    }

    const event = await Event.findOne({
      _id: id,
      organizer: req.user._id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Event is already cancelled",
      });
    }

    event.status = "cancelled";

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: event,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to cancel event",
      errors: error.message,
    });
  }
};

// Added: Invite users to a private event
export const inviteUsersToEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { invitedEmails } = req.body;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const event = await Event.findOne({
      _id: id,
      organizer: req.user._id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.visibility !== "private") {
      return res.status(400).json({
        success: false,
        message: "Invitations are only allowed for private events",
      });
    }

    const emails = new Set(
      (event.invitedEmails || []).map(normalizeEmail),
    );

    const newlyAdded = [];
    for (const email of invitedEmails) {
      const norm = normalizeEmail(email);
      if (!emails.has(norm)) newlyAdded.push(norm);
      emails.add(norm);
    }

    event.invitedEmails = [...emails];
    await event.save();

    // Notify newly invited users (email + in-app notification)
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const eventLink = `${baseUrl}/event-details.html?id=${event._id}`;
    for (const email of newlyAdded) {
      // Send email (fire-and-forget)
      sendInviteEmail(email, event, eventLink).catch(() => {});

      // In-app notification for existing accounts
      const user = await User.findOne({ email }).select("_id");
      if (user) {
        createNotification({
          userId: user._id,
          type: "invite",
          title: `You're invited to: ${event.title}`,
          message: `${req.user.name || "An organizer"} invited you to a private event.`,
          link: `/event-details.html?id=${event._id}`,
        }).catch(() => {});
      }
    }

    return res.status(200).json({
      success: true,
      message: "Users invited successfully",
      data: event,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to invite users",
      errors: error.message,
    });
  }
};
