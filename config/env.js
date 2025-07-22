import dotenv from "dotenv";
import Joi from "joi";
import winston from "winston";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/env.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Load .env file
dotenv.config();

// Define validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").required(),
  PORT: Joi.number().integer().min(1).max(65535).required(),
  FRONTEND_URL: Joi.string().uri().required(),
  MONGODB_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().required(),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().required(),
  REQUIRE_EMAIL_VERIFICATION: Joi.boolean().required(),
  EMAIL_HOST: Joi.string().hostname().required(),
  EMAIL_PORT: Joi.number().integer().min(1).max(65535).required(),
  EMAIL_SECURE: Joi.boolean().required(),
  EMAIL_USER: Joi.string().email().required(),
  EMAIL_PASS: Joi.string().required(),
  EMAIL_FROM: Joi.string().email().required(),
  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).required(),
  REDIS_PASSWORD: Joi.string().optional(),
  MAMMOGRAM_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
}).unknown(true); // Allow unknown variables

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env, {
  abortEarly: false, // Collect all errors
});

if (error) {
  const errorDetails = error.details.map((err) => ({
    variable: err.context.key,
    message: err.message,
  }));
  logger.error("Environment variable validation failed", {
    errors: errorDetails,
  });
  throw new Error(
    `Environment variable validation failed: ${JSON.stringify(errorDetails, null, 2)}`
  );
}

logger.info("Environment variables validated successfully");

// Export validated environment variables
export default envVars;
