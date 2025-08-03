// config/swagger.js
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Mammogram API",
      version: "1.0.0",
      description: "API for managing mammogram images and user accounts",
      contact: {
        name: "API Support",
        email: "support@mammogramapi.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:5000/api/v1",
        description: "Development server",
      },
      {
        url: "https://api.mammogram-analysis.com/api/v1",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT authorization token obtained after login",
        },
      },
      schemas: {
        User: {
          type: "object",
          required: ["firstName", "lastName", "email", "password"],
          properties: {
            firstName: {
              type: "string",
              example: "John",
              description: "User first name",
            },
            lastName: {
              type: "string",
              example: "Doe",
              description: "User last name",
            },
            email: {
              type: "string",
              format: "email",
              example: "john.doe@example.com",
              description: "User email address",
            },
            password: {
              type: "string",
              format: "password",
              example: "SecurePassword123!",
              minLength: 8,
              description: "User password (min 8 characters)",
            },
            role: {
              type: "string",
              enum: [
                "patient",
                "radiologist",
                "technician",
                "admin",
                "physician",
              ],
              default: "patient",
              description: "User role in the system",
            },
            specialization: {
              type: "string",
              enum: [
                "breast-imaging",
                "general-radiology",
                "oncology",
                "gynecology",
              ],
              description: "Required for medical professionals",
            },
            licenseNumber: {
              type: "string",
              example: "MD123456",
              description:
                "Medical license number (required for medical professionals)",
            },
            institution: {
              type: "string",
              format: "uuid",
              description: "ID of the healthcare institution",
            },
          },
        },
        UserResponse: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "User ID",
            },
            firstName: {
              type: "string",
            },
            lastName: {
              type: "string",
            },
            email: {
              type: "string",
            },
            role: {
              type: "string",
            },
            isVerified: {
              type: "boolean",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            specialization: {
              type: "string",
              nullable: true,
            },
            institution: {
              type: "string",
              nullable: true,
            },
          },
        },
        Mammogram: {
          type: "object",
          properties: {
            patientId: {
              type: "string",
              description: "ID of the patient",
            },
            originalFilename: {
              type: "string",
              description: "Original filename of the uploaded file",
            },
            storagePath: {
              type: "string",
              description: "Path where the file is stored",
            },
            fileSize: {
              type: "integer",
              description: "Size of the file in bytes",
            },
            fileType: {
              type: "string",
              description: "MIME type of the file",
            },
            metadata: {
              $ref: "#/components/schemas/MammogramMetadata",
            },
          },
        },
        MammogramMetadata: {
          type: "object",
          properties: {
            laterality: {
              type: "string",
              enum: ["L", "R", "B"],
              description: "Which breast the image shows",
            },
            viewPosition: {
              type: "string",
              enum: ["CC", "MLO", "ML", "LM", "AT"],
              description: "Imaging view position",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Error message describing what went wrong",
            },
            error: {
              type: "string",
              nullable: true,
              description: "Detailed error (only in development)",
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Invalid or missing authentication token",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
              example: {
                success: false,
                message: "Not authorized to access this route",
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "User registration and authentication endpoints",
      },
      {
        name: "Mammograms",
        description: "Mammogram image management endpoints",
      },
      {
        name: "Users",
        description: "User management endpoints",
      },
    ],
  },
  apis: ["./routes/*.js", "./controllers/*.js", "./models/*.js"],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      explorer: true,
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Mammogram API Documentation",
    })
  );
  console.log(`Swagger docs available at http://localhost:5000/api-docs`);
};
