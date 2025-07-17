const Analysis = require("../models/Analysis.model");
const { broadcastProgress } = require("./websocket.service");

const queueAnalysis = async (studyId, filePath) => {
  try {
    const analysis = new Analysis({
      studyId,
      status: "queued",
      results: {},
    });
    await analysis.save();

    // Simulate AI processing
    setTimeout(async () => {
      await Analysis.findByIdAndUpdate(analysis._id, {
        status: "completed",
        results: {
          birads: "BI-RADS 4",
          confidence: 0.87,
          regions: [
            { x: 100, y: 150, width: 50, height: 30, confidence: 0.92 },
            { x: 200, y: 300, width: 40, height: 40, confidence: 0.87 },
          ],
          recommendation: "Biopsy recommended within 2 weeks",
        },
      });
      broadcastProgress({
        event: "ANALYSIS_UPDATE",
        data: { studyId, status: "completed", progress: 100 },
      });
    }, 5000);

    return analysis._id;
  } catch (error) {
    console.error("Error in queueAnalysis:", error);
    throw error;
  }
};

module.exports = { queueAnalysis };
