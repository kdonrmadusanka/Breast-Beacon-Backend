const nodemailer = require("nodemailer");

// In-memory store for OTPs (use Redis or database in production)
const otpStore = new Map();

// Configure NodeMailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "breastbeacon@gmail.com",
    pass: "gjon cybx xbhj eabf", // Replace with your app-specific password
  },
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to email
const sendOTP = async (email, otp) => {
  try {
    const mailOptions = {
      from: "breastbeacon@gmail.com",
      to: email,
      subject: "Your BreastBeacon OTP Code",
      text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    };
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`Error sending OTP: ${error.message}`);
    return false;
  }
};

// Store OTP with expiration (10 minutes)
const storeOTP = (email, otp) => {
  otpStore.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 });
};

// Verify OTP
const verifyOTP = (email, otp) => {
  const stored = otpStore.get(email);
  if (!stored) return false;
  if (Date.now() > stored.expires) {
    otpStore.delete(email);
    return false;
  }
  if (stored.otp !== otp) return false;
  otpStore.delete(email); // Clear OTP after verification
  return true;
};

module.exports = { generateOTP, sendOTP, storeOTP, verifyOTP };
