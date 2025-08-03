import dicomParser from 'dicom-parser';
import fs from 'fs';

export default async (filePath) => {
  try {
    const fileData = fs.readFileSync(filePath);
    const dataSet = dicomParser.parseDicom(fileData);
    
    const extractTag = (tag) => {
      try {
        return dataSet.string(tag)?.trim() || null;
      } catch {
        return null;
      }
    };

    return {
      patientName: extractTag('x00100010'),
      patientId: extractTag('x00100020'),
      studyDate: extractTag('x00080020'),
      modality: extractTag('x00080060'),
      studyDescription: extractTag('x00081030'),
      seriesDescription: extractTag('x0008103e'),
      laterality: extractTag('x00200060'),
      viewPosition: extractTag('x00185101'),
      bodyPartExamined: extractTag('x00180015'),
      acquisitionDate: extractTag('x0008002a'),
      manufacturer: extractTag('x00080070'),
      institutionName: extractTag('x00080080')
    };
  } catch (err) {
    console.error('DICOM parsing error:', err);
    return {};
  }
};