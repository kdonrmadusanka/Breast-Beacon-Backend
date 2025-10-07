import Counter from '../models/Counter.js';

/**
 * Generate a unique user ID based on role
 * @param {string} role - User role
 * @returns {string} Generated user ID
 */
export const generateUserId = async (role) => {
  const rolePrefixes = {
    patient: 'P',
    radiologist: 'R',
    technician: 'T',
    admin: 'A',
    physician: 'DR', // Using DR for physician to distinguish from radiologist
  };

  const prefix = rolePrefixes[role];
  if (!prefix) {
    throw new Error(`Invalid role: ${role}`);
  }

  // Get the next sequence number for this role
  const sequenceName = `${role}_counter`;
  const sequenceValue = await Counter.getNextSequence(sequenceName);

  // Format the sequence value with leading zeros (e.g., 001, 002, ..., 999)
  const formattedSequence = sequenceValue.toString().padStart(3, '0');

  return `${prefix}-${formattedSequence}`;
};

/**
 * Get the next available user ID for a role without incrementing the counter
 * @param {string} role - User role
 * @returns {string} Next available user ID
 */
export const getNextUserId = async (role) => {
  const rolePrefixes = {
    patient: 'P',
    radiologist: 'R',
    technician: 'T',
    admin: 'A',
    physician: 'DR',
  };

  const prefix = rolePrefixes[role];
  if (!prefix) {
    throw new Error(`Invalid role: ${role}`);
  }

  const sequenceName = `${role}_counter`;
  const counter = await Counter.findOne({ name: sequenceName });
  const nextValue = counter ? counter.value + 1 : 1;

  const formattedSequence = nextValue.toString().padStart(3, '0');
  return `${prefix}-${formattedSequence}`;
};
