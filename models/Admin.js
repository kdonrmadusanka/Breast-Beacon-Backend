import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminId: String,
});

const Patient = mongoose.model('Patient', patientSchema);

export default Patient;
