/**
 * Utility functions for data protection and sensitive data handling
 */

// Fields that should be masked in logs
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "authorization",
  "creditCard",
  "cvv",
  "ssn",
  "socialSecurityNumber",
  "healthInsuranceNumber",
  "phoneNumber",
  "email",
  "address",
  "dateOfBirth",
  "medicalRecordNumber",
  "patientId",
  "ipAddress",
];

// Patterns for detecting sensitive data
const SENSITIVE_PATTERNS = {
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  email: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/g,
  phone: /\b(?:\+\d{1,2}\s?)?(?:\(\d{3}\)|\d{3})[-\s]?\d{3}[-\s]?\d{4}\b/g,
};

// Masking options
const MASK_OPTIONS = {
  partial: "partial", // Shows first and last characters (e.g., "abc...xyz")
  full: "full", // Completely masks the value
  hash: "hash", // Replaces with a hash of the value
};

/**
 * Masks sensitive data in an object or value
 * @param {*} data - The data to process
 * @param {string} [maskType=full] - Type of masking to apply
 * @param {Array} [additionalSensitiveFields=[]] - Additional fields to consider sensitive
 * @returns {*} The data with sensitive fields masked
 */
export const maskSensitiveData = (
  data,
  maskType = MASK_OPTIONS.full,
  additionalSensitiveFields = []
) => {
  if (!data) return data;

  const allSensitiveFields = [
    ...SENSITIVE_FIELDS,
    ...additionalSensitiveFields,
  ];

  // Handle objects
  if (typeof data === "object" && !Array.isArray(data) && data !== null) {
    return Object.keys(data).reduce((acc, key) => {
      const value = data[key];

      if (allSensitiveFields.includes(key.toLowerCase())) {
        acc[key] = applyMasking(value, maskType);
      } else if (typeof value === "object") {
        acc[key] = maskSensitiveData(
          value,
          maskType,
          additionalSensitiveFields
        );
      } else if (typeof value === "string") {
        acc[key] = maskSensitiveString(value, maskType);
      } else {
        acc[key] = value;
      }

      return acc;
    }, {});
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) =>
      maskSensitiveData(item, maskType, additionalSensitiveFields)
    );
  }

  // Handle strings
  if (typeof data === "string") {
    return maskSensitiveString(data, maskType);
  }

  return data;
};

/**
 * Applies masking to a single value
 * @param {*} value - The value to mask
 * @param {string} maskType - Type of masking to apply
 * @returns {*} Masked value
 */
const applyMasking = (value, maskType) => {
  if (value === null || value === undefined) return value;

  switch (maskType) {
    case MASK_OPTIONS.partial:
      return maskPartially(String(value));
    case MASK_OPTIONS.hash:
      return hashValue(String(value));
    case MASK_OPTIONS.full:
    default:
      return "********";
  }
};

/**
 * Masks a string while preserving some characters
 * @param {string} str - The string to mask
 * @returns {string} Partially masked string
 */
const maskPartially = (str) => {
  if (str.length <= 4) return "****";

  const firstVisible = str.substring(0, 2);
  const lastVisible = str.substring(str.length - 2);
  return `${firstVisible}****${lastVisible}`;
};

/**
 * Hashes a value (simple implementation - consider using crypto for production)
 * @param {string} value - The value to hash
 * @returns {string} Hashed value
 */
const hashValue = (value) => {
  // Simple hash for demonstration - in production use a proper cryptographic hash
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
};

/**
 * Masks sensitive patterns in a string
 * @param {string} str - The string to process
 * @param {string} maskType - Type of masking to apply
 * @returns {string} The string with sensitive patterns masked
 */
const maskSensitiveString = (str, maskType) => {
  if (typeof str !== "string") return str;

  let result = str;

  // Mask known patterns
  for (const [type, pattern] of Object.entries(SENSITIVE_PATTERNS)) {
    result = result.replace(pattern, (match) => {
      switch (type) {
        case "email":
          const [user, domain] = match.split("@");
          return `${maskPartially(user)}@${domain}`;
        case "phone":
          return maskPartially(match);
        default:
          return applyMasking(match, maskType);
      }
    });
  }

  return result;
};

// Export mask options for external use
export const MASK_TYPES = MASK_OPTIONS;
