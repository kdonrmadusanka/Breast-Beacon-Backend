import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateOfBirth: Date,
  gender: String,
  phoneNumber: String,
  address: String,
});

const Patient = mongoose.model('Patient', patientSchema);

export default Patient;
