import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { userRoutes } from './src/modules/users/users.routes.js';
import { organizerApplicationRoutes } from './src/modules/organizerApplication/organizerApplication.routes.js';
import adminRoutes from './src/modules/admin/admin.routes.js';
import { supportTicketRoutes } from './src/modules/support/support.routes.js';
import eventRoutes from './src/modules/event/eventRoutes.js';
import bookingRoutes from './src/modules/booking/booking.routes.js';
import paymentRoutes from './src/modules/payments/paymentRoutes.js';
import { notificationRoutes } from './src/modules/notification/notification.routes.js';
import {
  eventTicketRoutes,
  bookingTicketRoutes,
} from './src/modules/tickets/ticket.routes.js';
import { errorHandler } from './src/middleware/auth.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);
app.use(cors());

// On Vercel the runtime may already have parsed the request body. Tell the
// Express JSON parser to skip it in that case so it does not try to read an
// already-consumed stream.
app.use((req, res, next) => {
    if (req.body !== undefined) req._body = true;
    next();
});
app.use(express.json({ limit: "1mb" }));

// Routes
app.use(userRoutes);
app.use(organizerApplicationRoutes);
app.use(adminRoutes);
app.use(supportTicketRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/events', eventTicketRoutes);
app.use('/api/bookings', bookingTicketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api', bookingRoutes);
app.use(notificationRoutes);

// Home route
app.get('/', (req, res) => {
    res.send('EventOps Backend is running!');
});

// Serve the frontend (Front/) locally so fixed links like /login.html work.
// On Vercel the same folder is uploaded as static output instead.
app.use(express.static(path.join(__dirname, 'Front')));

// Handle routes that do not exist
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Handle other errors
app.use(errorHandler);

export default app;
