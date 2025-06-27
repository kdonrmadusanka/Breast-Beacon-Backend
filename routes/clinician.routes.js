const express = require("express");
const router = express.Router();
const clinicianController = require("../controllers/clinician.controller");

router.post("/", clinicianController.createClinician);
