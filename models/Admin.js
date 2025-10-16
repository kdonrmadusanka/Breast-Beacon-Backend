import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminId: String,
});

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
