const dicomParser = require("dicom-parser");

const parseDicom = async (buffer) => {
  try {
    console.log("Parsing DICOM buffer, size:", buffer.length);
    const dataSet = dicomParser.parseDicom(buffer);

    // Extract key metadata fields
    const metadata = {
      PatientID: dataSet.string("x00100020") || "Unknown",
      PatientName: dataSet.string("x00100010") || "Unknown",
      StudyInstanceUID: dataSet.string("x0020000d") || "Unknown",
      StudyDate: dataSet.string("x00080020") || "N/A",
      SeriesInstanceUID: dataSet.string("x0020000e") || "Unknown",
      Modality: dataSet.string("x00080060") || "Unknown",
      WindowCenter: dataSet.string("x00281050") || "N/A",
      WindowWidth: dataSet.string("x00281051") || "N/A",
    };

    // Extract pixel data (optional, for visualization or processing)
    const pixelDataElement = dataSet.elements.x7fe00010;
    const pixelData = pixelDataElement
      ? new Uint16Array(
          dataSet.byteArray.buffer,
          pixelDataElement.dataOffset,
          pixelDataElement.length / 2
        )
      : null;

    return { metadata, pixelData };
  } catch (error) {
    console.error("DICOM parsing error in parseDicom:", error.message);
    throw new Error("Failed to parse DICOM file");
  }
};

module.exports = { parseDicom };
