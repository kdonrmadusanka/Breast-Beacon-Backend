import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    institution: {
      type: String,
      trim: true,
      maxlength: [100, 'Institution name cannot exceed 100 characters'],
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: [
          'patient',
          'radiologist',
          'physician',
          'technician',
          'administrator',
          'other',
        ],
        message: 'Please select a valid role',
      },
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: ['new', 'in-progress', 'resolved', 'closed'],
      default: 'new',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Admin notes cannot exceed 500 characters'],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    responseSent: {
      type: Boolean,
      default: false,
    },
    responseDetails: {
      sentAt: Date,
      responseMessage: String,
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ email: 1 });
contactSchema.index({ assignedTo: 1 });

// Static method to get contact statistics
contactSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $facet: {
        statusCounts: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        roleCounts: [
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
            },
          },
        ],
        priorityCounts: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
            },
          },
        ],
        recentContacts: [
          {
            $match: {
              createdAt: {
                $gte: new Date(new Date().setDate(new Date().getDate() - 7)),
              },
            },
          },
          {
            $count: 'count',
          },
        ],
        responseStats: [
          {
            $group: {
              _id: '$responseSent',
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  return stats[0];
};

// Instance method to mark as responded
contactSchema.methods.markAsResponded = function (responseMessage, userId) {
  this.responseSent = true;
  this.status = 'resolved';
  this.responseDetails = {
    sentAt: new Date(),
    responseMessage,
    respondedBy: userId,
  };
  return this.save();
};

// Instance method to update status
contactSchema.methods.updateStatus = function (status, adminNotes = '') {
  this.status = status;
  if (adminNotes) {
    this.adminNotes = adminNotes;
  }
  return this.save();
};

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;
