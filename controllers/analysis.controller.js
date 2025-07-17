const AnalysisModel = require("../models/Analysis.model");
const { queueAnalysis } = require("../services/ai.service");

const queueAnalysisRequest = async (req, res) => {
  try {
    const { studyId } = req.body;
    if (!studyId) {
      return res.status(400).json({ error: "Study ID is required" });
    }

    const analysis = new AnalysisModel({
      studyId,
      userId: req.user.id,
      status: "queued",
      results: null,
    });

    await analysis.save();

    // Queue analysis (mock for now)
    queueAnalysis(analysis._id, studyId);

    res.status(201).json({ id: analysis._id, status: "queued" });
  } catch (error) {
    console.error("Analysis queue error:", error);
    res.status(500).json({ error: "Failed to queue analysis" });
  }
};

const getAnalysisResults = async (req, res) => {
  try {
    const analysis = await AnalysisModel.findById(req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }
    res
      .status(200)
      .json({ status: analysis.status, results: analysis.results });
  } catch (error) {
    console.error("Results retrieval error:", error);
    res.status(500).json({ error: "Failed to retrieve results" });
  }
};

module.exports = {
  queueAnalysisRequest,
  getAnalysisResults,
};
