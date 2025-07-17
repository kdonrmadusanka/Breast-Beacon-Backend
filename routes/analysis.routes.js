const { Router } = require("express");
const router = Router();
const {
  queueAnalysisRequest,
  getAnalysisResults,
} = require("../controllers/analysis.controller");

// POST /api/analysis/queue - Submit study for AI analysis
router.post("/queue", queueAnalysisRequest);

// GET /api/analysis/:id/results - Retrieve analysis results
router.get("/:id/results", getAnalysisResults);

module.exports = router;
