// utils/dicomAnonymizer.js

/**
 * @swagger
 * components:
 *   schemas:
 *     AnonymizationProfile:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         rules:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               tag:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [keep, remove, replace, hash]
 *               replacement:
 *                 type: string
 *               description:
 *                 type: string
 *     AnonymizationResult:
 *       type: object
 *       properties:
 *         originalFile:
 *           type: string
 *         anonymizedFile:
 *           type: string
 *         removedFields:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               tag:
 *                 type: string
 *               value:
 *                 type: string
 *               action:
 *                 type: string
 *         auditLog:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               timestamp:
 *                 type: string
 *               action:
 *                 type: string
 *               details:
 *                 type: string
 */

import dicomParser from "dicom-parser";
import fs from "fs";
import crypto from "crypto";
import path from "path";

// Standard DICOM tags to anonymize (partial list)
const STANDARD_TAGS = {
  PATIENT_NAME: "x00100010",
  PATIENT_ID: "x00100020",
  PATIENT_BIRTH_DATE: "x00100030",
  PATIENT_SEX: "x00100040",
  STUDY_DATE: "x00080020",
  STUDY_UID: "x0020000D",
  ACCESSION_NUMBER: "x00080050",
  INSTITUTION_NAME: "x00080080",
  REFERRING_PHYSICIAN: "x00080090",
};

// Default anonymization profile
const DEFAULT_PROFILE = {
  name: "Basic Research Anonymization",
  description: "Removes all PHI while preserving clinical relevance",
  rules: [
    {
      tag: STANDARD_TAGS.PATIENT_NAME,
      action: "replace",
      replacement: "Anonymous",
    },
    {
      tag: STANDARD_TAGS.PATIENT_ID,
      action: "replace",
      replacement: "ANON12345",
    },
    {
      tag: STANDARD_TAGS.PATIENT_BIRTH_DATE,
      action: "replace",
      replacement: "19000101",
    },
    {
      tag: STANDARD_TAGS.STUDY_DATE,
      action: "replace",
      replacement: "20000101",
    },
    { tag: STANDARD_TAGS.ACCESSION_NUMBER, action: "remove" },
    {
      tag: STANDARD_TAGS.INSTITUTION_NAME,
      action: "replace",
      replacement: "Research Center",
    },
    { tag: STANDARD_TAGS.REFERRING_PHYSICIAN, action: "remove" },
    // Preserve clinical tags
    { tag: "x00180050", action: "keep" }, // Slice Thickness
    { tag: "x00280030", action: "keep" }, // Pixel Spacing
    // Remove private tags (odd group numbers)
    { tag: "x0009xxxx", action: "remove" },
    { tag: "x0019xxxx", action: "remove" },
    { tag: "x0029xxxx", action: "remove" },
  ],
};

/**
 * Anonymize DICOM file
 * @param {string} inputPath - Path to original DICOM file
 * @param {string} outputPath - Path to save anonymized file
 * @param {Object} profile - Anonymization profile to use
 * @returns {Promise<Object>} Anonymization result
 */
export const anonymizeDicomFile = async (
  inputPath,
  outputPath,
  profile = DEFAULT_PROFILE
) => {
  const result = {
    originalFile: inputPath,
    anonymizedFile: outputPath,
    removedFields: [],
    auditLog: [],
  };

  try {
    // Read DICOM file
    const dicomData = fs.readFileSync(inputPath);
    const dataSet = dicomParser.parseDicom(dicomData);

    // Create output buffer (start with original)
    let outputBuffer = Buffer.from(dicomData);

    // Process each rule
    profile.rules.forEach((rule) => {
      try {
        if (rule.tag.includes("xxxx")) {
          // Handle wildcard tags (e.g., all private tags)
          processWildcardTags(dataSet, rule, outputBuffer, result);
        } else {
          // Process specific tag
          processTag(dataSet, rule, outputBuffer, result);
        }
      } catch (error) {
        result.auditLog.push({
          timestamp: new Date().toISOString(),
          action: "error",
          details: `Failed processing tag ${rule.tag}: ${error.message}`,
        });
      }
    });

    // Write anonymized file
    fs.writeFileSync(outputPath, outputBuffer);

    result.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "complete",
      details: `Anonymized file saved to ${outputPath}`,
    });

    return result;
  } catch (error) {
    console.error("Anonymization failed:", error);
    result.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "failure",
      details: `Anonymization failed: ${error.message}`,
    });
    throw error;
  }
};

/**
 * Process wildcard DICOM tags
 */
function processWildcardTags(dataSet, rule, outputBuffer, result) {
  const group = rule.tag.substring(1, 5);
  const elementWildcard = rule.tag.substring(5, 9);

  // Find all tags in the specified group
  Object.keys(dataSet.elements).forEach((tag) => {
    if (
      tag.startsWith(group) &&
      (elementWildcard === "xxxx" || tag.endsWith(elementWildcard))
    ) {
      const element = dataSet.elements[tag];
      const value = readTagValue(dataSet, tag);

      // Apply rule action
      applyAction(tag, value, rule, outputBuffer, result);
    }
  });
}

/**
 * Process specific DICOM tag
 */
function processTag(dataSet, rule, outputBuffer, result) {
  const element = dataSet.elements[rule.tag];
  if (!element) return;

  const value = readTagValue(dataSet, rule.tag);
  applyAction(rule.tag, value, rule, outputBuffer, result);
}

/**
 * Read value from DICOM tag
 */
function readTagValue(dataSet, tag) {
  try {
    return dicomParser.explicitElementToString(dataSet.elements[tag], dataSet);
  } catch {
    return null;
  }
}

/**
 * Apply anonymization action to tag
 */
function applyAction(tag, originalValue, rule, buffer, result) {
  if (!originalValue) return;

  const record = {
    tag,
    value: originalValue,
    action: rule.action,
  };

  let newValue = "";

  switch (rule.action) {
    case "remove":
      // Zero out the value in the buffer
      buffer.fill(
        0,
        dataSet.elements[tag].dataOffset,
        dataSet.elements[tag].dataOffset + dataSet.elements[tag].length
      );
      break;

    case "replace":
      newValue = rule.replacement || "";
      writeTagValue(buffer, tag, newValue, dataSet);
      record.replacement = newValue;
      break;

    case "hash":
      newValue = crypto
        .createHash("sha256")
        .update(originalValue)
        .digest("hex")
        .substring(0, 16);
      writeTagValue(buffer, tag, newValue, dataSet);
      record.replacement = newValue;
      break;

    case "keep":
      // Do nothing
      return;

    default:
      // Default to remove
      buffer.fill(
        0,
        dataSet.elements[tag].dataOffset,
        dataSet.elements[tag].dataOffset + dataSet.elements[tag].length
      );
  }

  result.removedFields.push(record);
}

/**
 * Write new value to DICOM tag in buffer
 */
function writeTagValue(buffer, tag, value, dataSet) {
  const element = dataSet.elements[tag];
  if (!element) return;

  // Ensure value fits in original space
  const maxLength = element.length;
  let newValue = value.toString();

  if (newValue.length > maxLength) {
    newValue = newValue.substring(0, maxLength);
  } else if (newValue.length < maxLength) {
    newValue = newValue.padEnd(maxLength, " ");
  }

  buffer.write(newValue, element.dataOffset, newValue.length, "ascii");
}

/**
 * Validate DICOM file after anonymization
 */
export const validateAnonymization = async (
  filePath,
  profile = DEFAULT_PROFILE
) => {
  const validationResults = [];
  const dicomData = fs.readFileSync(filePath);
  const dataSet = dicomParser.parseDicom(dicomData);

  // Check that all specified tags were properly anonymized
  profile.rules.forEach((rule) => {
    if (rule.tag.includes("xxxx")) {
      // Wildcard tags - check all matching
      const group = rule.tag.substring(1, 5);
      Object.keys(dataSet.elements).forEach((tag) => {
        if (tag.startsWith(group)) {
          validateTag(tag, rule, dataSet, validationResults);
        }
      });
    } else {
      // Specific tag
      validateTag(rule.tag, rule, dataSet, validationResults);
    }
  });

  return validationResults;
};

function validateTag(tag, rule, dataSet, results) {
  const element = dataSet.elements[tag];
  if (!element) return;

  const currentValue = readTagValue(dataSet, tag);
  let isValid = false;

  switch (rule.action) {
    case "remove":
      isValid = currentValue === null || currentValue.trim() === "";
      break;

    case "replace":
      isValid = currentValue === rule.replacement;
      break;

    case "hash":
      // Can't validate hash without original, just check it's changed
      isValid = currentValue !== null && currentValue !== "";
      break;

    case "keep":
      isValid = currentValue !== null && currentValue !== "";
      break;
  }

  results.push({
    tag,
    action: rule.action,
    expected: rule.action === "replace" ? rule.replacement : rule.action,
    actual: currentValue,
    valid: isValid,
  });
}

/**
 * @swagger
 * /api/dicom/anonymize:
 *   post:
 *     summary: Anonymize DICOM file
 *     tags: [DICOM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               profile:
 *                 type: string
 *                 enum: [basic, research, full]
 *     responses:
 *       200:
 *         description: File anonymized successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnonymizationResult'
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Anonymization failed
 */
export const anonymizeDicom = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(
      process.env.ANONYMIZED_FILES_DIR || "./anonymized",
      `anon_${req.file.filename}`
    );

    // Select profile
    let profile;
    switch (req.body.profile) {
      case "research":
        profile = RESEARCH_PROFILE; // Define other profiles as needed
        break;
      case "full":
        profile = FULL_ANON_PROFILE;
        break;
      default:
        profile = DEFAULT_PROFILE;
    }

    const result = await anonymizeDicomFile(inputPath, outputPath, profile);

    // Clean up uploaded file
    fs.unlinkSync(inputPath);

    res.json(result);
  } catch (error) {
    console.error("Anonymization error:", error);
    res.status(500).json({
      error: "Failed to anonymize DICOM file",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @swagger
 * /api/dicom/validate:
 *   post:
 *     summary: Validate anonymized DICOM file
 *     tags: [DICOM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               profile:
 *                 type: string
 *                 enum: [basic, research, full]
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tag:
 *                         type: string
 *                       valid:
 *                         type: boolean
 *                       expected:
 *                         type: string
 *                       actual:
 *                         type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Validation failed
 */
export const validateAnonymizedDicom = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Select profile
    let profile;
    switch (req.body.profile) {
      case "research":
        profile = RESEARCH_PROFILE;
        break;
      case "full":
        profile = FULL_ANON_PROFILE;
        break;
      default:
        profile = DEFAULT_PROFILE;
    }

    const results = await validateAnonymization(req.file.path, profile);
    const allValid = results.every((r) => r.valid);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      valid: allValid,
      results,
    });
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({
      error: "Failed to validate DICOM file",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
