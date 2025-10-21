// models/DashboardStatistics.js
import mongoose from 'mongoose';

const dashboardStatisticsSchema = new mongoose.Schema({
  totalCases: {
    type: Number,
    default: 0,
  },
  pendingCases: {
    type: Number,
    default: 0,
  },
  inProgressCases: {
    type: Number,
    default: 0,
  },
  completedCases: {
    type: Number,
    default: 0,
  },
  highPriorityCases: {
    type: Number,
    default: 0,
  },
  averageTurnaroundTime: {
    type: String,
    default: '0 days',
  },
  radiologistWorkload: [
    {
      radiologistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      pendingCases: Number,
      completedToday: Number,
    },
  ],
  generatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Export using ESM syntax
export const DashboardStatistics = mongoose.model(
  'DashboardStatistics',
  dashboardStatisticsSchema,
);

export default DashboardStatistics;
