import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    provider: {
      type: String,
      enum: ['mock', 'paymob', 'stripe'],
      required: true,
      default: 'mock',
    },
    // Reference ID from the payment provider (unique when present)
    providerRef: {
      type: String,
      unique: true,
      sparse: true, // allows multiple null values (no providerRef for mock)
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    fee: {
      type: Number,
      default: 0,
    },
    net: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded', 'refund_pending'],
      default: 'pending',
    },
    checkoutUrl: {
      type: String,
      default: null,
    },
    paymobOrderId: {
      type: String,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundAccount: {
      type: String,
      default: "",
    },
    refundScheduledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;