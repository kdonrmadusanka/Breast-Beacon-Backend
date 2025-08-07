// utils/seedNotificationTemplates.js
import NotificationTemplate from "../models/NotificationTemplate.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const DB_URI = process.env.MONGODB_URI;

const templates = [
  // ======================
  // RESULTS NOTIFICATIONS
  // ======================

  // BI-RADS 1-2 (Normal/Benign)
  {
    name: "normal-results-email-en",
    type: "results",
    category: "normal",
    language: "en",
    channels: ["email", "portal"],
    subject: "Your Mammogram Results - Normal Findings",
    body: `Dear {patientName},

We're pleased to inform you that your recent mammogram shows no signs of breast cancer (BI-RADS {biradsScore}).

Results Summary:
{resultsSummary}

Recommendations:
{recommendations}

Your next routine screening is recommended in {nextScreeningInterval}.

If you have any questions, please contact our office at {clinicPhone}.

Sincerely,
{radiologistName}
{clinicName}`,
    variables: [
      "patientName",
      "biradsScore",
      "resultsSummary",
      "recommendations",
      "nextScreeningInterval",
      "clinicPhone",
      "radiologistName",
      "clinicName",
    ],
    active: true,
  },

  // BI-RADS 3 (Probably Benign)
  {
    name: "benign-results-email-en",
    type: "results",
    category: "benign",
    language: "en",
    channels: ["email", "portal"],
    subject: "Your Mammogram Results - Probably Benign Findings",
    body: `Dear {patientName},

Your recent mammogram shows findings that are probably benign (BI-RADS {biradsScore}).

Findings:
- {findingsSummary}

Recommendations:
{recommendations}

A 6-month follow-up mammogram is recommended to monitor these findings.

Please contact our office at {clinicPhone} to schedule your follow-up.

Sincerely,
{radiologistName}
{clinicName}`,
    variables: [
      "patientName",
      "biradsScore",
      "findingsSummary",
      "recommendations",
      "clinicPhone",
      "radiologistName",
      "clinicName",
    ],
    active: true,
  },

  // BI-RADS 4 (Suspicious)
  {
    name: "suspicious-results-email-en",
    type: "results",
    category: "suspicious",
    language: "en",
    channels: ["email", "portal"],
    subject: "Important: Your Mammogram Requires Follow-Up",
    body: `Dear {patientName},

Your mammogram results require additional follow-up (BI-RADS {biradsScore}).

Findings:
- {findingsSummary}

Recommended Next Steps:
{recommendations}

Please contact our office within {followupTimeframe} to schedule your {nextSteps}.

You can schedule through the patient portal or call {clinicPhone}.

Sincerely,
{radiologistName}
{clinicName}`,
    variables: [
      "patientName",
      "biradsScore",
      "findingsSummary",
      "recommendations",
      "followupTimeframe",
      "nextSteps",
      "clinicPhone",
      "radiologistName",
      "clinicName",
    ],
    active: true,
  },

  // BI-RADS 5-6 (Highly Suspicious/Known Cancer)
  {
    name: "malignant-results-call-en",
    type: "results",
    category: "malignant",
    language: "en",
    channels: ["email", "portal"],
    subject: "Urgent: Please Contact Us About Your Mammogram Results",
    body: `Dear {patientName},

Your recent mammogram shows findings that require immediate follow-up (BI-RADS {biradsScore}).

Findings:
- {findingsSummary}

Recommended Next Steps:
{recommendations}

A member of our team will contact you within 24 hours to discuss these results. 
If you don't hear from us, please call {clinicPhone} immediately.

Sincerely,
{radiologistName}
{clinicName}`,
    variables: [
      "patientName",
      "biradsScore",
      "findingsSummary",
      "recommendations",
      "clinicPhone",
      "radiologistName",
      "clinicName",
    ],
    active: true,
  },

  // ======================
  // REMINDER NOTIFICATIONS
  // ======================

  // Follow-Up Appointment Reminder
  {
    name: "followup-reminder-email-en",
    type: "reminder",
    category: "followup",
    language: "en",
    channels: ["email"],
    subject: "Reminder: Your Follow-Up Mammogram Appointment",
    body: `Dear {patientName},

This is a reminder about your upcoming follow-up mammogram:

Date: {appointmentDate}
Time: {appointmentTime}
Location: {location}
Address: {address}

Preparation Instructions:
- Wear a two-piece outfit
- Avoid using deodorant, powders, or creams
- Bring your insurance card and photo ID

To reschedule: {rescheduleLink} or call {clinicPhone}.

Sincerely,
{clinicName}`,
    variables: [
      "patientName",
      "appointmentDate",
      "appointmentTime",
      "location",
      "address",
      "rescheduleLink",
      "clinicPhone",
      "clinicName",
    ],
    active: true,
  },

  // Annual Screening Reminder
  {
    name: "annual-reminder-email-en",
    type: "reminder",
    category: "annual",
    language: "en",
    channels: ["email"],
    subject: "Time for Your Annual Mammogram",
    body: `Dear {patientName},

It's time for your annual mammogram screening. Early detection saves lives!

You can schedule your appointment:
- Online: {scheduleLink}
- By phone: {clinicPhone}

Preferred Location:
{location}
{address}

Available appointment times are filling quickly. Please schedule within the next 2 weeks.

Sincerely,
{clinicName}`,
    variables: [
      "patientName",
      "scheduleLink",
      "clinicPhone",
      "location",
      "address",
      "clinicName",
    ],
    active: true,
  },

  // ======================
  // TECHNICAL NOTIFICATIONS
  // ======================

  // Image Quality Issue
  {
    name: "quality-issue-email-en",
    type: "system-alert",
    category: "technical",
    language: "en",
    channels: ["email"],
    subject: "Action Required: Your Mammogram Needs to Be Repeated",
    body: `Dear {patientName},

We need to repeat your recent mammogram due to technical issues with the images.

Reason: {qualityIssue}

Please schedule a repeat mammogram within {timeframe}:
- Online: {scheduleLink}
- By phone: {clinicPhone}

There will be no additional charge for this repeat exam.

We apologize for any inconvenience and appreciate your understanding.

Sincerely,
{technicianName}
{clinicName}`,
    variables: [
      "patientName",
      "qualityIssue",
      "timeframe",
      "scheduleLink",
      "clinicPhone",
      "technicianName",
      "clinicName",
    ],
    active: true,
  },
];

async function seedTemplates() {
  try {
    // 4. Verify connection URI
    if (!DB_URI) {
      throw new Error("MONGODB_URI is not defined in .env file");
    }

    console.log(`🔌 Connecting to MongoDB at ${DB_URI}...`);

    // 5. Connect with timeout settings
    await mongoose.connect(DB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds for initial connection
      socketTimeoutMS: 30000, // 30 seconds for operations
    });

    console.log("✅ Database connected successfully!");

    // 6. Clear existing templates
    console.log("🧹 Clearing existing templates...");
    const deleteResult = await NotificationTemplate.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} templates`);

    // 7. Insert new templates
    console.log("🌱 Seeding new templates...");
    const inserted = await NotificationTemplate.insertMany(templates);
    console.log(`✅ Successfully seeded ${inserted.length} templates!`);
  } catch (err) {
    console.error("❌ SEEDING FAILED:", err.message);

    // 8. Specific error handling
    if (err.name === "MongooseServerSelectionError") {
      console.error("Connection error. Please check:");
      console.error('- Is MongoDB running? (try "mongod --version")');
      console.error("- Is the connection string correct?");
      console.error("- If using Docker, is the container running?");
    }
  } finally {
    // 9. Close connection
    await mongoose.disconnect();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
}

// 10. Run the seeder
seedTemplates();
