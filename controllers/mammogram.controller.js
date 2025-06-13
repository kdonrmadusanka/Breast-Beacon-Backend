const Mammogram = require("../models/mammogram.model");
const { PythonShell } = require("python-shell");
const path = require("path");

// Upload and analyze mammogram
exports.uploadMammogram = async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const options = { args: [req.file.path] };
    PythonShell.run(
      path.join(__dirname, "../../model/analyze_mammogram.py"),
      options,
      async (err, results) => {
        if (err) {
          return res
            .status(500)
            .json({ error: "Analysis failed", details: err.message });
        }

        const analysis = JSON.parse(results[0]);
        const treatmentRecommendation = suggestTreatment(analysis);
        const previousMammogram = await Mammogram.findOne({ patientId }).sort({
          timestamp: -1,
        });
        const differences = await compareMammograms(
          analysis,
          previousMammogram
        );

        const mammogram = new Mammogram({
          patientId,
          imageUrl: req.file.path,
          analysisResult: analysis,
          treatmentRecommendation,
          differences,
        });

        await mammogram.save();
        res
          .status(201)
          .json({ mammogram, analysis, treatmentRecommendation, differences });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get mammogram by ID
exports.getMammogramById = async (req, res) => {
  try {
    const mammogram = await Mammogram.findById(req.params.id).populate(
      "patientId"
    );
    if (!mammogram) {
      return res.status(404).json({ error: "Mammogram not found" });
    }
    res.status(200).json(mammogram);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get all mammograms for a patient
exports.getMammogramsByPatientId = async (req, res) => {
  try {
    const mammograms = await Mammogram.find({ patientId: req.params.patientId })
      .populate("patientId")
      .sort({ timestamp: 1 });
    res.status(200).json(mammograms);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Delete mammogram
exports.deleteMammogram = async (req, res) => {
  try {
    const mammogram = await Mammogram.findByIdAndDelete(req.params.id);
    if (!mammogram) {
      return res.status(404).json({ error: "Mammogram not found" });
    }
    res.status(200).json({ message: "Mammogram deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Helper functions (simplified from previous responses)
function suggestTreatment(analysis) {
  const { prediction, confidence, suspiciousRegions } = analysis;
  const suggestions = [];

  if (prediction === "Malignant" && confidence > 0.8) {
    suggestions.push("Urgent biopsy recommended.");
    suggestions.push("Consult an oncologist.");
    if (suspiciousRegions.length > 1) {
      suggestions.push("Consider MRI for further evaluation.");
    }
  } else if (prediction === "Malignant" && confidence <= 0.8) {
    suggestions.push("Biopsy recommended.");
    suggestions.push("Follow-up in 3 months.");
  } else {
    suggestions.push("Continue routine screening.");
  }

  return { type: prediction, suggestions };
}

async function compareMammograms(currentAnalysis, previousMammogram) {
  if (!previousMammogram) return null;

  const prevRegions = previousMammogram.analysisResult.suspiciousRegions;
  const currRegions = currentAnalysis.suspiciousRegions;

  const differences = {
    previousImageId: previousMammogram._id,
    changeInRegions: [],
    overallProgression: "Stable",
  };

  currRegions.forEach((currRegion, index) => {
    const prevRegion = prevRegions[index] || {};
    const areaChange =
      ((currRegion.width * currRegion.height -
        (prevRegion.width || 0) * (prevRegion.height || 0)) /
        ((prevRegion.width || 1) * (prevRegion.height || 1))) *
      100;
    const positionShift = {
      x: currRegion.x - (prevRegion.x || 0),
      y: currRegion.y - (prevRegion.y || 0),
    };

    differences.changeInRegions.push({
      regionId: index,
      areaChange,
      positionShift,
    });

    if (
      Math.abs(areaChange) > 20 ||
      Math.abs(positionShift.x) > 10 ||
      Math.abs(positionShift.y) > 10
    ) {
      differences.overallProgression =
        areaChange > 0 ? "Worsening" : "Improving";
    }
  });

  return differences;
}
