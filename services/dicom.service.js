const dicomParser = require("dicom-parser");
const fs = require("fs");
const path = require("path");

const parseDicom = (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const dicomFile = fs.readFileSync(filePath);
      const byteArray = new Uint8Array(dicomFile);

      const dataSet = dicomParser.parseDicom(byteArray);

      // Extract common DICOM tags
      const metadata = {
        patientName: dataSet.string("x00100010") || "Unknown",
        patientId: dataSet.string("x00100020") || "",
        studyInstanceUID: dataSet.string("x0020000d") || "",
        studyDate: dataSet.string("x00080020") || "",
        studyDescription: dataSet.string("x00081030") || "",
        modality: dataSet.string("x00080060") || "",
        imageType: dataSet.string("x00080008") || "",
        rows: dataSet.uint16("x00280010") || 0,
        columns: dataSet.uint16("x00280011") || 0,
        // Add more tags as needed
      };

      resolve({
        success: true,
        metadata,
        rawDataSet: dataSet,
      });
    } catch (error) {
      console.error("DICOM parsing error:", error);
      reject(
        new Error(
          "Failed to parse DICOM file. The file may be corrupt or not a valid DICOM file."
        )
      );
    }
  });
};

module.exports = {
  parseDicom,
};
