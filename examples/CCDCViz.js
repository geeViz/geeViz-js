/*
   Copyright 2025 Ian Housman

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

// Example of how to visualize CCDC outputs using the JavaScript modules
// Adds change products and fitted harmonics from CCDC output to the viewer
// The general workflow for CCDC is to run the CCDCWrapper.js script, and then either utilize the harmonic model for a given date
// or to use the breaks for change detection. All of this is demonstrated in this example
////////////////////////////////////////////////////////////////////////////////////////////////////

// Module imports
var gil = require('users/rcr-training/geeViz-js:getImagesLib.js');
var cdl = require('users/rcr-training/geeViz-js:changeDetectionLib.js');


////////////////////////////////////////////////////////////////////////////////////////////////////
// Bring in ccdc image asset
// This is assumed to be an image of arrays that is returned from the ee.Algorithms.TemporalSegmentation.Ccdc method
var ccdcBands = [
  "tStart",
  "tEnd",
  "tBreak",
  "changeProb",
  "red.*",
  "nir.*",
  "swir1.*",
  "swir2.*",
  "NDVI.*",
  "NBR.*"
];
var ccdcImg1 = ee.ImageCollection("projects/lcms-292214/assets/CONUS-LCMS/Base-Learners/CCDC-Collection-1984-2022").select(ccdcBands).mosaic();
var ccdcImg2 = ee.ImageCollection("projects/lcms-292214/assets/CONUS-LCMS/Base-Learners/CCDC-Feathered-Collection").select(ccdcBands).mosaic();


// Important parameters - when to feather the two together
// Has to fall within the overlapping period of the two runs
// In general, the longer the period, the better.
// Keeping it away from the very first and very last year of either of the runs is a good idea
var featheringStartYear = 2014;
var featheringEndYear = 2021;

// We will be visualizing both dense (multiple per year) and annual (one per year) outputs
// We will set up different date ranges for each of these
// Set a date range and date step (proportion of year - 1 = annual, 0.1 = 10 images per year)
// 245 is a good startJulian and endJulian if step = 1. Set startJulian to 1 and endJulian to 365 and step to 0.1 to see seasonality
var annualStartYear = 1984;
var annualEndYear = 2024;
var annualStartJulian = 245;
var annualEndJulian = 245;
var annualStep = 1;

var denseStartYear = 2012;
var denseEndYear = 2024;
var denseStartJulian = 1;
var denseEndJulian = 365;
var denseStep = 0.1;

// Specify which harmonics to use when predicting the CCDC model
// CCDC exports the first 3 harmonics (1 cycle/yr, 2 cycles/yr, and 3 cycles/yr)
// If you only want to see yearly patterns, specify [1]
// If you would like a tighter fit in the predicted value, include the second or third harmonic as well [1,2,3]
var whichHarmonics = [1, 2, 3];

// Whether to fill gaps between segments' end year and the subsequent start year to the break date
var fillGaps = false;

// Specify which band to use for loss and gain.
// This is most important for the loss and gain magnitude since the year of change will be the same for all years
var changeDetectionBandName = "NDVI";


// Choose whether to show the most recent ('mostRecent') or highest magnitude ('highestMag') CCDC break
var sortingMethod = "mostRecent";
////////////////////////////////////////////////////////////////////////////////////////////////////

// Add the raw array image
Map.addLayer(ccdcImg1, {opacity: 0}, "Raw CCDC Output 1984-2022", false);
Map.addLayer(ccdcImg2, {opacity: 0}, "Raw CCDC Output 2014-2024", false);

// Extract the change years and magnitude
var changeObj = cdl.ccdcChangeDetection(ccdcImg1, changeDetectionBandName);

Map.addLayer(
  changeObj[sortingMethod].loss.year,
  {min: annualStartYear, max: annualEndYear, palette: cdl.lossYearPalette},
  "Loss Year"
);
Map.addLayer(
  changeObj[sortingMethod].loss.mag,
  {min: -0.5, max: -0.1, palette: cdl.lossMagPalette},
  "Loss Mag",
  false
);
Map.addLayer(
  changeObj[sortingMethod].gain.year,
  {min: annualStartYear, max: annualEndYear, palette: cdl.gainYearPalette},
  "Gain Year"
);
Map.addLayer(
  changeObj[sortingMethod].gain.mag,
  {min: 0.05, max: 0.2, palette: cdl.gainMagPalette},
  "Gain Mag",
  false
);

// Apply the CCDC harmonic model across a time series
// First get a time series of time images
var timeImagesDense = cdl.simpleGetTimeImageCollection(denseStartYear, denseEndYear, denseStartJulian, denseEndJulian, denseStep);
var timeImagesAnnual = cdl.simpleGetTimeImageCollection(annualStartYear, annualEndYear, annualStartJulian, annualEndJulian, annualStep);


// Choose which band to show
var fitted_band = "NDVI_CCDC_fitted";


// Get fitted for early, late, and combined
var annualFittedFeathered = cdl.predictCCDC([ccdcImg1, ccdcImg2], timeImagesAnnual, fillGaps, whichHarmonics, featheringStartYear, featheringEndYear);
var annualFittedEarly = cdl.predictCCDC(ccdcImg1, timeImagesAnnual, fillGaps, whichHarmonics);
var annualFittedLate = cdl.predictCCDC(ccdcImg2, timeImagesAnnual, fillGaps, whichHarmonics);

var denseFittedFeathered = cdl.predictCCDC([ccdcImg1, ccdcImg2], timeImagesDense, fillGaps, whichHarmonics, featheringStartYear, featheringEndYear);
var denseFittedEarlyAllBands = cdl.predictCCDC(ccdcImg1, timeImagesDense, fillGaps, whichHarmonics);
var denseFittedLate = cdl.predictCCDC(ccdcImg2, timeImagesDense, fillGaps, whichHarmonics);


// Give each unique band names
annualFittedFeathered = annualFittedFeathered.select([fitted_band], [fitted_band + "_Combined"]);
annualFittedEarly = annualFittedEarly.select([fitted_band], [fitted_band + "_Early"]);
annualFittedLate = annualFittedLate.select([fitted_band], [fitted_band + "_Late"]);

denseFittedFeathered = denseFittedFeathered.select([fitted_band], [fitted_band + "_Combined"]);
denseFittedEarly = denseFittedEarlyAllBands.select([fitted_band], [fitted_band + "_Early"]);
denseFittedLate = denseFittedLate.select([fitted_band], [fitted_band + "_Late"]);


// Join all 3
var annualJoined = annualFittedEarly.linkCollection(annualFittedLate, [fitted_band + "_Late"], null, "system:time_start");
annualJoined = annualJoined.linkCollection(annualFittedFeathered, [fitted_band + "_Combined"], null, "system:time_start");

var denseJoined = denseFittedEarly.linkCollection(denseFittedLate, [fitted_band + "_Late"], null, "system:time_start");
denseJoined = denseJoined.linkCollection(denseFittedFeathered, [fitted_band + "_Combined"], null, "system:time_start");

// Show on map
Map.addLayer(annualJoined, {reducer: ee.Reducer.mean(), min: 0.3, max: 0.8}, "Combined CCDC Annual", true);
Map.addLayer(denseJoined, {reducer: ee.Reducer.mean(), min: 0.3, max: 0.8}, "Combined CCDC Dense", true);


// Synthetic composites visualizing
// Take common false color composite bands and visualize them for the next to the last year

// First get the bands of predicted bands and then split off the name
var fittedBns = denseFittedEarlyAllBands.select([".*_fitted.*"]).first().bandNames();
var bns = fittedBns.map(function(bn){return ee.String(bn).split("_").get(0)});

// Filter down to the next to the last year and a summer date range
var exampleYear = 2019;
var syntheticComposites = denseFittedEarlyAllBands.select(fittedBns, bns).filter(ee.Filter.calendarRange(exampleYear, exampleYear, "year"));
// .filter(ee.Filter.calendarRange(190,250)).first()

// Visualize output as you would a composite

Map.addLayer(
  syntheticComposites,
  gil.vizParamsFalse,
  "Synthetic Composite " + exampleYear
);

////////////////////////////////////////////////////////////////////////////////////////////////////
Map.setCenter(-86.6, 35, 10);
