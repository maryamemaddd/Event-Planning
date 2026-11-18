import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.mailtrap.io",
  auth: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
  },
});

export const sendTicketEmail = async (userEmail, eventTitle, qrToken, qrCodeDataUrl) => {
  try {
    const qrImage = qrCodeDataUrl
      ? `<p><img src="${qrCodeDataUrl}" alt="Ticket QR" width="220" height="220" /></p>`
      : "";

    await transporter.sendMail({
      from: '"EventOps Platform" <support@eventops.com>',
      to: userEmail,
      subject: `تأكيد حجز لفعالية ${eventTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
          <h2>مرحباً بك!</h2>
          <p>تم تأكيد حجزك بنجاح لفعالية <strong>${eventTitle}</strong></p>
          <p>كود التذكرة (QR Token):</p>
          <div style="background: #f4f4f4; padding: 10px; font-family: monospace; font-size: 16px;">${qrToken}</div>
          ${qrImage}
          <p>يرجى إبراز هذا الكود عند الدخول للفعالية</p>
          <br>
          <p>شكراً لاستخدامك منصة EventOps</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};

export const sendInviteEmail = async (userEmail, event, eventLink) => {
  try {
    const title = event.title || "Event";
    const date = event.startsAt ? new Date(event.startsAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "";
    const venue = event.venue || "";
    const price = Number(event.price) === 0 ? "Free" : `EGP ${Number(event.price).toLocaleString("en-US")}`;

    await transporter.sendMail({
      from: '"EventOps Platform" <support@eventops.com>',
      to: userEmail,
      subject: `You're invited to: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f7f8fc; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #5b4de8; margin: 0;">EventOps</h1>
            <p style="color: #6b7180; margin: 4px 0 0;">You've been invited to a private event</p>
          </div>
          <div style="background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,.08);">
            <h2 style="margin: 0 0 12px; color: #1a1d2e;">${title}</h2>
            <p style="color: #565b6e; line-height: 1.6; margin: 0 0 16px;">${event.description || ""}</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 6px 0; color: #6b7180; font-size: 13px;">Date</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${date}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7180; font-size: 13px;">Venue</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${venue}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7180; font-size: 13px;">Price</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${price}</td></tr>
            </table>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${eventLink}" style="display: inline-block; background: #5b4de8; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 8px 20px rgba(91,77,232,.3);">View Event &amp; Book a Seat</a>
            </div>
            <p style="font-size: 12px; color: #8a8fa3; text-align: center; margin: 16px 0 0;">
              You must be signed in with this email address to access the event.<br/>
              If you don't have an account, create one first using this email.
            </p>
          </div>
          <p style="font-size: 11px; color: #a2a5b1; text-align: center; margin-top: 16px;">EventOps Platform</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error("Error sending invite email:", error.message);
    return false;
  }
};