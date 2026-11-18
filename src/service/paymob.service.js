import crypto from 'crypto';

/**
 * Paymob Payment Gateway Service
 * Supports:
 * 1. Paymob Modern Intention API (Unified Checkout)
 * 2. Paymob Classic 3-Step API (Auth -> Order -> Payment Key -> Iframe)
 * 3. Paymob Simulator (for local/testing before live keys are added)
 */

export const isPaymobConfigured = () => {
  const secret = process.env.PAYMOB_SECRET_KEY;
  const apiKey = process.env.PAYMOB_API_KEY;
  return Boolean(secret || apiKey);
};

export const createPaymobPayment = async ({ booking, amount, user, baseUrl }) => {
  const amountCents = Math.round(Number(amount) * 100);
  const eventTitle = booking.event?.title || 'Event Ticket';
  const bookingId = String(booking._id);
  const appBaseUrl =
    baseUrl ||
    process.env.BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://eventops-main.vercel.app');

  const fullName = (user?.name || booking.user?.name || 'Customer').trim();
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || 'User';
  const email = (user?.email || booking.user?.email || 'customer@example.com').trim();
  const phone = (user?.phone || booking.user?.phone || '+201000000000').trim();

  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  const apiKey = process.env.PAYMOB_API_KEY;
  const integrationId = process.env.PAYMOB_INTEGRATION_ID;
  const iframeId = process.env.PAYMOB_IFRAME_ID;

  // 1. Modern Paymob Intention API (Unified Checkout)
  if (secretKey && publicKey) {
    try {
      const payload = {
        amount: amountCents,
        currency: 'EGP',
        payment_methods: integrationId ? [Number(integrationId)] : [],
        items: [
          {
            name: eventTitle.slice(0, 50),
            amount: amountCents,
            description: `Ticket booking for ${eventTitle}`,
            quantity: 1,
          },
        ],
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          email,
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phone,
        },
        extras: {
          bookingId,
        },
        special_reference: `${bookingId}_${Date.now()}`,
        notification_url: `${appBaseUrl}/api/payments/webhook/paymob`,
        redirection_url: `${appBaseUrl}/api/payments/paymob/callback?bookingId=${bookingId}`,
      };

      const res = await fetch('https://accept.paymob.com/v1/intention/', {
        method: 'POST',
        headers: {
          Authorization: `Token ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.client_secret) {
        const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${data.client_secret}`;
        return {
          providerRef: String(data.id || data.intention_order_id || bookingId),
          orderId: String(data.intention_order_id || data.id || ''),
          checkoutUrl,
          clientSecret: data.client_secret,
        };
      } else {
        console.warn('Paymob Intention API error, falling back:', data);
      }
    } catch (err) {
      console.error('Paymob Intention API request failed:', err.message);
    }
  }

  // 2. Classic Paymob 3-step API (Token -> Order -> Payment Key -> Iframe)
  if (apiKey && integrationId) {
    try {
      // Step A: Auth Token
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const authData = await authRes.json();
      const authToken = authData.token;

      if (!authToken) throw new Error('Failed to obtain Paymob auth token');

      // Step B: Register Order
      const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          delivery_needed: 'false',
          amount_cents: amountCents,
          currency: 'EGP',
          merchant_order_id: `${bookingId}_${Date.now()}`,
          items: [],
        }),
      });
      const orderData = await orderRes.json();
      const orderId = orderData.id;

      if (!orderId) throw new Error('Failed to create Paymob order');

      // Step C: Payment Key
      const keyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          amount_cents: amountCents,
          expiration: 3600,
          order_id: orderId,
          billing_data: {
            apartment: 'NA',
            email,
            floor: 'NA',
            first_name: firstName,
            street: 'NA',
            building: 'NA',
            phone_number: phone,
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'Cairo',
            country: 'EG',
            last_name: lastName,
            state: 'Cairo',
          },
          currency: 'EGP',
          integration_id: Number(integrationId),
        }),
      });
      const keyData = await keyRes.json();
      const paymentToken = keyData.token;

      if (!paymentToken) throw new Error('Failed to obtain Paymob payment key');

      const targetIframe = iframeId || '856984';
      const checkoutUrl = `https://accept.paymob.com/api/acceptance/iframes/${targetIframe}?payment_token=${paymentToken}`;

      return {
        providerRef: String(orderId),
        orderId: String(orderId),
        checkoutUrl,
      };
    } catch (err) {
      console.error('Paymob Classic API failed:', err.message);
    }
  }

  // 3. Sandbox Simulator (When keys are not yet configured in environment)
  const simulatorUrl = `${appBaseUrl}/api/payments/paymob/simulator?bookingId=${bookingId}&amount=${amount}&title=${encodeURIComponent(eventTitle)}`;
  return {
    providerRef: `paymob_sim_${bookingId}_${Date.now()}`,
    orderId: `order_sim_${bookingId}`,
    checkoutUrl: simulatorUrl,
    isSimulator: true,
  };
};

/**
 * Verify Paymob HMAC SHA512 Signature
 */
export const verifyPaymobHMAC = (data) => {
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  if (!hmacSecret) return true; // If no HMAC secret is set in env, allow callback

  const receivedHmac = data.hmac || data.secure_hash;
  if (!receivedHmac) return false;

  const obj = data.obj || data;

  const concatenatedString = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id || obj.order,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success,
  ]
    .map((val) => (val === undefined || val === null ? '' : String(val)))
    .join('');

  const calculatedHmac = crypto
    .createHmac('sha512', hmacSecret)
    .update(concatenatedString)
    .digest('hex');

  return calculatedHmac.toLowerCase() === String(receivedHmac).toLowerCase();
};
