import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: Number,
    required: true,
    default: 0,
  },
});

// Static method to get next sequence value
counterSchema.statics.getNextSequence = async function (name) {
  const result = await this.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  return result.value;
};

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
