import dicomParser from "dicom-parser";
import fs from "fs";
import { StudyType } from "../enums/studyTypes.js";
import { Modality } from "../enums/modalities.js";
import { Laterality } from "../enums/laterality.js";
import { ViewPosition } from "../enums/viewPositions.js";

/**
 * @swagger
 * components:
 *   schemas:
 *     DicomMetadata:
 *       type: object
 *       properties:
 *         patientInfo:
 *           type: object
 *           properties:
 *             patientId:
 *               type: string
 *             patientName:
 *               type: string
 *             patientBirthDate:
 *               type: string
 *             patientSex:
 *               type: string
 *               enum: [M, F, O]
 *         studyInfo:
 *           type: object
 *           properties:
 *             studyInstanceUID:
 *               type: string
 *             studyDate:
 *               type: string
 *             studyTime:
 *               type: string
 *             studyDescription:
 *               type: string
 *             studyType:
 *               $ref: '#/components/schemas/StudyType'
 *         seriesInfo:
 *           type: object
 *           properties:
 *             seriesInstanceUID:
 *               type: string
 *             seriesNumber:
 *               type: number
 *             seriesDescription:
 *               type: string
 *             modality:
 *               $ref: '#/components/schemas/Modality'
 *         imageInfo:
 *           type: object
 *           properties:
 *             instanceNumber:
 *               type: number
 *             imageType:
 *               type: array
 *               items:
 *                 type: string
 *             acquisitionDate:
 *               type: string
 *             acquisitionTime:
 *               type: string
 *             contentDate:
 *               type: string
 *             contentTime:
 *               type: string
 *         mammogramInfo:
 *           type: object
 *           properties:
 *             laterality:
 *               $ref: '#/components/schemas/Laterality'
 *             viewPosition:
 *               $ref: '#/components/schemas/ViewPosition'
 *             targetAnatomy:
 *               type: string
 *             bodyPartExamined:
 *               type: string
 *             breastImplantPresent:
 *               type: string
 *               enum: [YES, NO]
 *         equipmentInfo:
 *           type: object
 *           properties:
 *             manufacturer:
 *               type: string
 *             institutionName:
 *               type: string
 *             stationName:
 *               type: string
 *             manufacturerModelName:
 *               type: string
 *             softwareVersions:
 *               type: array
 *               items:
 *                 type: string
 *         technicalInfo:
 *           type: object
 *           properties:
 *             kvp:
 *               type: number
 *             exposureTime:
 *               type: number
 *             xRayTubeCurrent:
 *               type: number
 *             exposure:
 *               type: number
 *             exposureInuAs:
 *               type: number
 *             focalSpotSize:
 *               type: array
 *               items:
 *                 type: number
 *             filterMaterial:
 *               type: string
 *             generatorPower:
 *               type: number
 */

// DICOM Tag Constants
const TAGS = {
  PATIENT_ID: "x00100020",
  PATIENT_NAME: "x00100010",
  PATIENT_BIRTH_DATE: "x00100030",
  PATIENT_SEX: "x00100040",
  STUDY_INSTANCE_UID: "x0020000D",
  STUDY_DATE: "x00080020",
  STUDY_TIME: "x00080030",
  STUDY_DESCRIPTION: "x00081030",
  SERIES_INSTANCE_UID: "x0020000E",
  SERIES_NUMBER: "x00200011",
  SERIES_DESCRIPTION: "x0008103E",
  MODALITY: "x00080060",
  INSTANCE_NUMBER: "x00200013",
  IMAGE_TYPE: "x00080008",
  ACQUISITION_DATE: "x00080022",
  ACQUISITION_TIME: "x00080032",
  CONTENT_DATE: "x00080023",
  CONTENT_TIME: "x00080033",
  LATERALITY: "x00200060",
  VIEW_POSITION: "x00185101",
  TARGET_ANATOMY: "x00100040",
  BODY_PART_EXAMINED: "x00180015",
  BREAST_IMPLANT_PRESENT: "x00189718",
  MANUFACTURER: "x00080070",
  INSTITUTION_NAME: "x00080080",
  STATION_NAME: "x00081010",
  MANUFACTURER_MODEL_NAME: "x00081090",
  SOFTWARE_VERSIONS: "x00181020",
  KVP: "x00180060",
  EXPOSURE_TIME: "x00180050",
  XRAY_TUBE_CURRENT: "x00180051",
  EXPOSURE: "x00180052",
  EXPOSURE_IN_UAS: "x00181153",
  FOCAL_SPOT_SIZE: "x00181100",
  FILTER_MATERIAL: "x00187060",
  GENERATOR_POWER: "x00181110",
};

/**
 * Parse DICOM file and extract standardized metadata
 * @param {string} filePath - Path to DICOM file
 * @returns {Object} Standardized metadata
 */
export const parseDicomFile = (filePath) => {
  try {
    const dicomData = fs.readFileSync(filePath);
    const dataSet = dicomParser.parseDicom(dicomData);

    return {
      patientInfo: extractPatientInfo(dataSet),
      studyInfo: extractStudyInfo(dataSet),
      seriesInfo: extractSeriesInfo(dataSet),
      imageInfo: extractImageInfo(dataSet),
      mammogramInfo: extractMammogramInfo(dataSet),
      equipmentInfo: extractEquipmentInfo(dataSet),
      technicalInfo: extractTechnicalInfo(dataSet),
    };
  } catch (error) {
    console.error("DICOM parsing error:", error);
    throw new Error("Failed to parse DICOM file");
  }
};

/**
 * Extract patient information
 */
function extractPatientInfo(dataSet) {
  return {
    patientId: getTagValue(dataSet, TAGS.PATIENT_ID),
    patientName: formatPatientName(getTagValue(dataSet, TAGS.PATIENT_NAME)),
    patientBirthDate: formatDate(getTagValue(dataSet, TAGS.PATIENT_BIRTH_DATE)),
    patientSex: getTagValue(dataSet, TAGS.PATIENT_SEX),
  };
}

/**
 * Extract study information
 */
function extractStudyInfo(dataSet) {
  const studyDescription = getTagValue(dataSet, TAGS.STUDY_DESCRIPTION) || "";

  return {
    studyInstanceUID: getTagValue(dataSet, TAGS.STUDY_INSTANCE_UID),
    studyDate: formatDate(getTagValue(dataSet, TAGS.STUDY_DATE)),
    studyTime: formatTime(getTagValue(dataSet, TAGS.STUDY_TIME)),
    studyDescription,
    studyType: determineStudyType(studyDescription),
  };
}

/**
 * Extract series information
 */
function extractSeriesInfo(dataSet) {
  return {
    seriesInstanceUID: getTagValue(dataSet, TAGS.SERIES_INSTANCE_UID),
    seriesNumber: parseInt(getTagValue(dataSet, TAGS.SERIES_NUMBER)) || 0,
    seriesDescription: getTagValue(dataSet, TAGS.SERIES_DESCRIPTION),
    modality: getTagValue(dataSet, TAGS.MODALITY) || Modality.MG,
  };
}

/**
 * Extract image information
 */
function extractImageInfo(dataSet) {
  return {
    instanceNumber: parseInt(getTagValue(dataSet, TAGS.INSTANCE_NUMBER)) || 0,
    imageType: getTagValue(dataSet, TAGS.IMAGE_TYPE, true) || [],
    acquisitionDate: formatDate(getTagValue(dataSet, TAGS.ACQUISITION_DATE)),
    acquisitionTime: formatTime(getTagValue(dataSet, TAGS.ACQUISITION_TIME)),
    contentDate: formatDate(getTagValue(dataSet, TAGS.CONTENT_DATE)),
    contentTime: formatTime(getTagValue(dataSet, TAGS.CONTENT_TIME)),
  };
}

/**
 * Extract mammogram-specific information
 */
function extractMammogramInfo(dataSet) {
  const laterality = getTagValue(dataSet, TAGS.LATERALITY);
  const viewPosition = getTagValue(dataSet, TAGS.VIEW_POSITION);

  return {
    laterality: laterality ? laterality.toUpperCase() : null,
    viewPosition: viewPosition ? standardizeViewPosition(viewPosition) : null,
    targetAnatomy: getTagValue(dataSet, TAGS.TARGET_ANATOMY),
    bodyPartExamined: getTagValue(dataSet, TAGS.BODY_PART_EXAMINED),
    breastImplantPresent: getTagValue(dataSet, TAGS.BREAST_IMPLANT_PRESENT),
  };
}

/**
 * Extract equipment information
 */
function extractEquipmentInfo(dataSet) {
  return {
    manufacturer: getTagValue(dataSet, TAGS.MANUFACTURER),
    institutionName: getTagValue(dataSet, TAGS.INSTITUTION_NAME),
    stationName: getTagValue(dataSet, TAGS.STATION_NAME),
    manufacturerModelName: getTagValue(dataSet, TAGS.MANUFACTURER_MODEL_NAME),
    softwareVersions: getTagValue(dataSet, TAGS.SOFTWARE_VERSIONS, true) || [],
  };
}

/**
 * Extract technical parameters
 */
function extractTechnicalInfo(dataSet) {
  return {
    kvp: parseFloat(getTagValue(dataSet, TAGS.KVP)) || 0,
    exposureTime: parseInt(getTagValue(dataSet, TAGS.EXPOSURE_TIME)) || 0,
    xRayTubeCurrent:
      parseInt(getTagValue(dataSet, TAGS.XRAY_TUBE_CURRENT)) || 0,
    exposure: parseInt(getTagValue(dataSet, TAGS.EXPOSURE)) || 0,
    exposureInuAs: parseInt(getTagValue(dataSet, TAGS.EXPOSURE_IN_UAS)) || 0,
    focalSpotSize: getTagValue(dataSet, TAGS.FOCAL_SPOT_SIZE, true) || [],
    filterMaterial: getTagValue(dataSet, TAGS.FILTER_MATERIAL),
    generatorPower: parseInt(getTagValue(dataSet, TAGS.GENERATOR_POWER)) || 0,
  };
}

/**
 * Helper to get DICOM tag value
 */
function getTagValue(dataSet, tag, isMultiValue = false) {
  if (!dataSet.elements[tag]) return null;

  try {
    if (isMultiValue) {
      return dicomParser
        .explicitElementToString(dataSet.elements[tag], dataSet)
        .split("\\");
    }
    return dicomParser.explicitElementToString(dataSet.elements[tag], dataSet);
  } catch {
    return null;
  }
}

/**
 * Standardize patient name format
 */
function formatPatientName(dicomName) {
  if (!dicomName) return null;

  // Convert 'LAST^FIRST^MIDDLE' to 'First Last'
  const parts = dicomName.split("^").filter(Boolean);
  if (parts.length === 0) return null;

  const lastName = parts[0];
  const firstName = parts.length > 1 ? parts[1] : "";

  return `${firstName} ${lastName}`.trim();
}

/**
 * Standardize date format
 */
function formatDate(dicomDate) {
  if (!dicomDate || dicomDate.length < 8) return null;

  // Convert 'YYYYMMDD' to 'YYYY-MM-DD'
  return `${dicomDate.substring(0, 4)}-${dicomDate.substring(
    4,
    6
  )}-${dicomDate.substring(6, 8)}`;
}

/**
 * Standardize time format
 */
function formatTime(dicomTime) {
  if (!dicomTime) return null;

  // Convert 'HHMMSS' to 'HH:MM:SS'
  const hour = dicomTime.substring(0, 2) || "00";
  const minute = dicomTime.substring(2, 4) || "00";
  const second = dicomTime.length > 4 ? dicomTime.substring(4, 6) : "00";

  return `${hour}:${minute}:${second}`;
}

/**
 * Determine study type from description
 */
function determineStudyType(description) {
  if (!description) return StudyType.SCREENING;

  const desc = description.toLowerCase();

  if (desc.includes("diagnostic")) return StudyType.DIAGNOSTIC;
  if (desc.includes("screening")) return StudyType.SCREENING;
  if (desc.includes("followup")) return StudyType.FOLLOWUP;
  if (desc.includes("biopsy")) return StudyType.BIOPSY;

  return StudyType.SCREENING;
}

/**
 * Standardize view position
 */
function standardizeViewPosition(position) {
  if (!position) return null;

  const pos = position.toUpperCase();

  // Handle common variations
  if (pos.includes("MLO")) return ViewPosition.MLO;
  if (pos.includes("CC")) return ViewPosition.CC;
  if (pos.includes("LM")) return ViewPosition.LM;
  if (pos.includes("AT")) return ViewPosition.AT;

  return position;
}

/**
 * @swagger
 * /api/mammograms/{id}/metadata:
 *   get:
 *     summary: Get DICOM metadata for mammogram
 *     tags: [DICOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mammogram ID
 *     responses:
 *       200:
 *         description: DICOM metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DicomMetadata'
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Error reading DICOM metadata
 */
export const getDicomMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const mammogram = await Mammogram.findById(id);

    if (!mammogram) {
      return res.status(404).json({ error: "Mammogram not found" });
    }

    const filePath = await getLocalDicomPath(mammogram);
    const metadata = parseDicomFile(filePath);

    res.json(metadata);
  } catch (error) {
    console.error("Metadata extraction error:", error);
    res.status(500).json({ error: "Failed to extract DICOM metadata" });
  }
};
