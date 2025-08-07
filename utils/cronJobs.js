import cron from "node-cron";
import { sendFollowUpReminder } from "../services/email_notification.service.js";

// Run every day at 9am
export function setupCronJobs() {
  cron.schedule("0 9 * * *", async () => {
    try {
      // Find appointments happening tomorrow
      // const tomorrow = new Date();
      // tomorrow.setDate(tomorrow.getDate() + 1);

      // const appointments = await Appointment.find({
      //   date: {
      //     $gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
      //     $lt: new Date(tomorrow.setHours(23, 59, 59, 999))
      //   }
      // });

      // for (const appointment of appointments) {
      //   await sendFollowUpReminder(appointment._id);
      // }

      // For now, we'll keep your test code but you should replace it
      const result = await sendFollowUpReminder("689082a5090cac7e5b89d657");
      console.log("Follow-up reminders sent:", result);
    } catch (error) {
      console.error("Scheduled reminder error:", error);
    }
  });
}
