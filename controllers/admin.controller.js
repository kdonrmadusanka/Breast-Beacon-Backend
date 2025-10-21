import User from '../models/User.js';
import Admin from '../models/Admin.js';
import asyncHandler from 'express-async-handler';

//Get all Admins
export const getAllAdmins = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = '',
    } = req.query;

    // Build filter object - only get users with admin role
    const filter = {
      role: 'admin',
    };

    // Add status filter if provided
    if (status) {
      filter.status = status;
    }

    // Search functionality
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { institution: { $regex: search, $options: 'i' } },
      ];
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination - populate admin details
    const users = await User.find(filter)
      .select('-password -tokens') // Exclude sensitive fields
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // Convert to plain JavaScript objects

    // Get admin details for each user
    const adminUsers = await Promise.all(
      users.map(async (user) => {
        // Find admin record for this user
        const adminRecord = await Admin.findOne({ user: user._id })
          .select('adminId')
          .lean();

        return {
          ...user,
          adminDetails: adminRecord || null,
          adminId: adminRecord?.adminId || null,
        };
      }),
    );

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Get additional statistics
    const activeAdmins = await User.countDocuments({
      ...filter,
      active: true,
    });
    const inactiveAdmins = await User.countDocuments({
      ...filter,
      active: false,
    });

    // Get admins with and without admin records
    const adminsWithRecords = await Admin.countDocuments();
    const adminsWithoutRecords = total - adminsWithRecords;

    res.status(200).json({
      success: true,
      count: adminUsers.length,
      data: adminUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalAdmins: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      statistics: {
        total: total,
        active: activeAdmins,
        inactive: inactiveAdmins,
        withAdminRecord: adminsWithRecords,
        withoutAdminRecord: adminsWithoutRecords,
      },
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching admins',
    });
  }
});
