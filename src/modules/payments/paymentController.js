import Transaction from './paymentModel.js';
import { bookingModel } from '../../../db/models/booking.model.js';
import { seatModel } from '../../../db/models/seat.model.js';
import { issueTicketForBooking } from '../tickets/ticket.controller.js';
import { createPaymobPayment, verifyPaymobHMAC } from '../../service/paymob.service.js';

/**
 * Shared helper: marks transaction succeeded, confirms booking, books seat, and issues ticket.
 */
export const finalizeSuccessfulPayment = async (transaction, providerRef) => {
  if (providerRef) {
    transaction.providerRef = String(providerRef);
  }
  transaction.status = 'succeeded';
  await transaction.save();

  let booking = null;
  let ticket = null;

  try {
    booking = await bookingModel.findById(transaction.booking);

    if (booking && booking.status === 'pending_payment') {
      booking.status = 'confirmed';
      booking.expiresAt = null;
      await booking.save();
    }

    if (booking && booking.seat) {
      await seatModel.updateOne(
        { _id: booking.seat },
        { status: 'booked', heldBy: null, holdExpiresAt: null }
      );
    }

    if (booking && booking.status === 'confirmed') {
      ticket = await issueTicketForBooking(booking._id);
    }
  } catch (postPaymentError) {
    console.error('Post-payment processing failed:', postPaymentError.message);
  }

  return { transaction, booking, ticket };
};

// POST /api/payments/initiate
// Initiate a payment (mock or paymob) linked to a booking
export const initiatePayment = async (req, res) => {
  try {
    const { bookingId, amount, provider = 'mock' } = req.body;

    const booking = await bookingModel
      .findById(bookingId)
      .populate('event')
      .populate('user');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.status === 'confirmed') {
      return res.status(409).json({
        success: false,
        message: 'Booking is already confirmed',
      });
    }

    const finalAmount = Number(amount ?? booking.event?.price ?? 0);
    const fee = 0;
    const net = finalAmount - fee;

    // Reuse or create pending transaction
    let transaction = await Transaction.findOne({
      booking: bookingId,
      status: 'pending',
    });

    if (transaction) {
      transaction.provider = provider;
      transaction.amount = finalAmount;
      transaction.net = net;
    } else {
      transaction = new Transaction({
        booking: bookingId,
        provider,
        amount: finalAmount,
        fee,
        net,
        status: 'pending',
      });
    }

    // 1. Paymob Provider
    if (provider === 'paymob') {
      const baseUrl =
        process.env.BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.get('host')}`);

      const paymobResult = await createPaymobPayment({
        booking,
        amount: finalAmount,
        user: req.user || booking.user,
        baseUrl,
      });

      transaction.providerRef = paymobResult.providerRef;
      transaction.paymobOrderId = paymobResult.orderId;
      transaction.checkoutUrl = paymobResult.checkoutUrl;
      await transaction.save();

      return res.status(200).json({
        success: true,
        message: 'Paymob payment initiated successfully',
        data: {
          ...transaction.toObject(),
          checkoutUrl: paymobResult.checkoutUrl,
          isSimulator: Boolean(paymobResult.isSimulator),
        },
      });
    }

    // 2. Mock Provider (default / test mode)
    transaction.provider = 'mock';
    await transaction.save();

    return res.status(201).json({
      success: true,
      message: 'Mock payment initiated successfully',
      data: transaction,
    });
  } catch (error) {
    console.error('initiatePayment error:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

// POST /api/payments/mock-confirm/:transactionId
// Simulate payment confirmation (mock only)
export const mockConfirmPayment = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.provider !== 'mock') {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for mock payments',
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `Transaction is already ${transaction.status}`,
      });
    }

    const { booking, ticket } = await finalizeSuccessfulPayment(transaction);

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully (mock)',
      data: { transaction, booking, ticket },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/payments/paymob/callback
// Handles customer redirection back from Paymob
export const handlePaymobCallback = async (req, res) => {
  try {
    const data = { ...req.query, ...req.body };

    const isSuccess =
      String(data.success).toLowerCase() === 'true' ||
      data.txn_response_code === 'APPROVED' ||
      String(data.data_message || data['data.message']).toLowerCase() === 'approved';

    const bookingId =
      data.bookingId ||
      data.merchant_order_id?.split('_')[0] ||
      data.special_reference?.split('_')[0] ||
      data.extra?.bookingId;

    const providerRef = String(data.id || data.order || '');

    let transaction = null;
    if (providerRef) {
      transaction = await Transaction.findOne({ providerRef });
    }
    if (!transaction && bookingId) {
      transaction = await Transaction.findOne({ booking: bookingId, provider: 'paymob' });
    }

    if (isSuccess) {
      if (transaction) {
        await finalizeSuccessfulPayment(transaction, providerRef || transaction.providerRef);
      }
      const targetId = bookingId || transaction?.booking;
      return res.redirect(`/payment-result.html?booking=${targetId}&status=success`);
    } else {
      if (transaction && transaction.status === 'pending') {
        transaction.status = 'failed';
        await transaction.save();
      }
      const targetId = bookingId || transaction?.booking || '';
      return res.redirect(`/payment-result.html?booking=${targetId}&status=failed`);
    }
  } catch (error) {
    console.error('Paymob callback error:', error);
    return res.redirect('/payment-result.html?status=failed');
  }
};

// GET /api/payments/paymob/simulator
// Renders an interactive Paymob test sandbox when live keys are not yet configured
export const handlePaymobSimulator = async (req, res) => {
  const { bookingId, amount, title } = req.query;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paymob Secure Checkout · Sandbox</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background: #0f1423; color: #fff; min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .card { background: #1a2035; border: 1px solid #2d3752; border-radius: 20px; max-width: 480px; width: 100%; padding: 32px; box-shadow: 0 24px 60px rgba(0,0,0,.4); }
    .logo-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 800; color: #0070ba; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px; }
    .logo span { color: #fff; }
    .badge { background: #0284c7; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .info { background: #131829; border: 1px solid #26314d; border-radius: 12px; padding: 18px; margin-bottom: 24px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #94a3b8; }
    .row:last-child { margin-bottom: 0; padding-top: 10px; border-top: 1px dashed #26314d; color: #fff; font-weight: 700; font-size: 16px; }
    .row strong { color: #38bdf8; }
    .desc { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; text-align: center; }
    .btn { display: block; width: 100%; text-align: center; padding: 14px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; cursor: pointer; border: 0; transition: .2s; margin-bottom: 12px; }
    .btn-pay { background: #0070ba; color: #fff; }
    .btn-pay:hover { background: #005ea6; }
    .btn-fail { background: transparent; color: #f43f5e; border: 1px solid #f43f5e; }
    .btn-fail:hover { background: rgba(244,63,94,.1); }
    .env-note { font-size: 11.5px; color: #64748b; line-height: 1.5; text-align: center; margin-top: 20px; border-top: 1px solid #26314d; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <div class="logo">pay<span>mob</span></div>
      <span class="badge">Sandbox Test Mode</span>
    </div>
    <div class="info">
      <div class="row"><span>Event</span><span>${title || 'Event Booking'}</span></div>
      <div class="row"><span>Booking ID</span><span style="font-family:monospace;font-size:12px;">${bookingId || '—'}</span></div>
      <div class="row"><span>Payment Method</span><span>Visa / Mastercard / Meeza</span></div>
      <div class="row"><span>Total Amount</span><strong>EGP ${Number(amount || 0).toLocaleString('en-US')}</strong></div>
    </div>
    <p class="desc">This is Paymob Sandbox simulation. Click below to simulate completing the payment through Paymob gateway.</p>
    <a class="btn btn-pay" href="/api/payments/paymob/callback?bookingId=${bookingId}&success=true&id=sim_paymob_${Date.now()}">✓ Simulate Successful Payment</a>
    <a class="btn btn-fail" href="/api/payments/paymob/callback?bookingId=${bookingId}&success=false">✕ Simulate Payment Failure</a>
    <p class="env-note">To connect your live Paymob account, add <code>PAYMOB_SECRET_KEY</code> & <code>PAYMOB_PUBLIC_KEY</code> (or <code>PAYMOB_API_KEY</code> & <code>PAYMOB_INTEGRATION_ID</code>) in your Vercel Environment Variables.</p>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
};

// GET /api/payments/:transactionId
// Get a single transaction by ID
export const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId).populate('booking');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    return res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/payments/booking/:bookingId
// Get transaction linked to a specific booking
export const getTransactionByBooking = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ booking: req.params.bookingId });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'No transaction found for this booking' });
    }
    return res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/payments/webhook/paymob (or /stripe)
// Webhook handler — verifies signature and updates transaction status
export const handleWebhook = async (req, res) => {
  try {
    const body = req.body || {};

    // 1. Paymob Raw Webhook Format: { type: "TRANSACTION", obj: { id, success, order: { merchant_order_id } } }
    const paymobObj = body.obj || (body.order ? body : null);
    if (paymobObj && paymobObj.id) {
      // Optional HMAC verification
      if (!verifyPaymobHMAC(body)) {
        console.warn('Paymob HMAC signature verification failed');
      }

      const isSuccess = Boolean(paymobObj.success);
      const providerRef = String(paymobObj.id);
      const bookingId =
        paymobObj.order?.merchant_order_id?.split('_')[0] ||
        paymobObj.special_reference?.split('_')[0] ||
        paymobObj.extra?.bookingId;

      let transaction = await Transaction.findOne({ providerRef });
      if (!transaction && bookingId) {
        transaction = await Transaction.findOne({ booking: bookingId, provider: 'paymob' });
      }

      if (transaction) {
        if (isSuccess) {
          await finalizeSuccessfulPayment(transaction, providerRef);
        } else if (transaction.status === 'pending') {
          transaction.status = 'failed';
          transaction.providerRef = providerRef;
          await transaction.save();
        }
      }

      return res.status(200).json({ success: true, message: 'Paymob webhook processed' });
    }

    // 2. Custom Webhook Format: { providerRef, status, provider }
    const { providerRef, status, provider } = body;
    if (!providerRef || !status || !provider) {
      return res.status(400).json({ success: false, message: 'Missing webhook fields' });
    }

    const transaction = await Transaction.findOne({ providerRef });
    if (transaction) {
      if (status === 'succeeded') {
        await finalizeSuccessfulPayment(transaction, providerRef);
      } else {
        transaction.status = status;
        if (status === 'refunded') transaction.refundedAt = new Date();
        await transaction.save();
      }
      return res.status(200).json({ success: true, message: 'Webhook processed', data: transaction });
    }

    return res.status(404).json({ success: false, message: 'Transaction not found for this providerRef' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
