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

// Example of how to seasonality metrics using harmonic regression with Landsat data
// Acquires harmonic regression-based seasonality metrics
////////////////////////////////////////////////////////////////////////////////////////////////////

// Module imports
var gil = require('users/rcr-training/geeViz-js:getImagesLib.js');


////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Define user parameters:

// Specify study area: Study area
// Can be a featureCollection, feature, or geometry
var studyArea = gil.testAreas.CA;

// Update the startJulian and endJulian variables to indicate your seasonal
// constraints. This supports wrapping for tropics and southern hemisphere.
// If using wrapping and the majority of the days occur in the second year, the system:time_start will default
// to June 1 of that year.Otherwise, all system:time_starts will default to June 1 of the given year
// startJulian: Starting Julian date
// endJulian: Ending Julian date
var startJulian = 1;
var endJulian = 365;

// Specify start and end years for all analyses
// More than a 3 year span should be provided for time series methods to work
// well. If using Fmask as the cloud/cloud shadow masking method, or providing
// pre-computed stats for cloudScore and TDOM, this does not
// matter
var startYear = 2022;
var endYear = 2024;

// Specify an annual buffer to include imagery from the same season
// timeframe from the prior and following year. timeBuffer = 1 will result
// in a 3 year moving window. If you want single-year composites, set to 0
var timebuffer = 1;


// Export params
// Whether to export coefficients
var exportCoefficients = false;

// Set up Names for the export
var outputName = "Harmonic_Coefficients_";

// Provide location composites will be exported to
// This should be an asset folder, or more ideally, an asset imageCollection
var exportPathRoot = "users/username/someCollection";

// CRS- must be provided.
// Common crs codes: Web mercator is EPSG:4326, USGS Albers is EPSG:5070,
// WGS84 UTM N hemisphere is EPSG:326+ zone number (zone 12 N would be EPSG:32612) and S hemisphere is EPSG:327+ zone number
var crs = "EPSG:5070";

// Specify transform if scale is null and snapping to known grid is needed
var transform = [30, 0, -2361915.0, 0, -30, 3177735.0];

// Specify scale if transform is null
var scale = null;


////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Harmonic regression parameters

// Which harmonics to include
// Is a list of numbers of the n PI per year
// Typical assumption of 1 cycle/yr would be [2] (2*pi)
// If trying to overfit, or expected bimodal phenology try adding a higher frequency as well
// ex. [2,4]
var whichHarmonics = [2, 4, 6];

// Which bands/indices to run harmonic regression across
var indexNames = ["swir2", "nir", "red", "NDVI"];
// ,'NBR','NDMI','nir','swir1','swir2','tcAngleBG'];//['nir','swir1','swir2','NDMI','NDVI','NBR','tcAngleBG'];//['blue','green','red','nir','swir1','swir2','NDMI','NDVI','NBR','tcAngleBG'];

// Choose which band/index to use for visualizing seasonality in hue, saturation, value color space (generally NDVI works best)
var seasonalityVizIndexName = "NDVI";


// Whether to apply a linear detrending of data.  Can be useful if long-term change is not of interest
var detrend = true;
////////////////////////////////////////////////////////////////////////////////////////////////////
// Ensure seasonalityVizIndexName is included in the indexNames
if (indexNames.indexOf(seasonalityVizIndexName) === -1){
  indexNames.push(seasonalityVizIndexName);
}
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Function Calls
// Get all images
var allScenes = gil.getProcessedLandsatScenes(studyArea, startYear, endYear, startJulian, endJulian).select(indexNames);

// Map.addLayer(allScenes,vizParamsFalse,'median')
// ////////////////////////////////////////////////////////////
// Iterate across each time window and fit harmonic regression model
var coeffCollection = [];
var yrList = ee.List.sequence(startYear + timebuffer, endYear - timebuffer, 1).getInfo();
yrList.map(function(yr){
  yr = parseInt(yr);
  // Set up dates
  var startYearT = yr - timebuffer;
  var endYearT = yr + timebuffer;
  var nameStart = startYearT + "_" + endYearT;

  // Get scenes for those dates
  var allScenesT = allScenes.filter(ee.Filter.calendarRange(startYearT, endYearT, "year"));
  print(allScenesT.size());
  var composite = allScenesT.median();
  Map.addLayer(composite, {min: 0.1, max: 0.4}, nameStart + "_median_composite", false);

  var seasonalityMedian = composite.select([seasonalityVizIndexName]);

  // Fit harmonic model
  var coeffsPredicted = gil.getHarmonicCoefficientsAndFit(allScenesT, indexNames, whichHarmonics, detrend);

  // Set some properties
  var coeffs = coeffsPredicted[0]
    .set({
      'system:time_start': ee.Date.fromYMD(yr, 6, 1).millis(),
      'timebuffer': timebuffer,
      'startYearT': startYearT,
      'endYearT': endYearT
    })
    .float();
  Map.addLayer(coeffs, {}, nameStart + "_coeffs", false);

  // Get predicted values for visualization
  var predicted = coeffsPredicted[1];
  Map.addLayer(predicted, {}, nameStart + "_predicted", false);

  // Optionally simplify coeffs to phase, amplitude, and date of peak
  if (whichHarmonics.indexOf(2) !== -1){
    var pap = ee.Image(gil.getPhaseAmplitudePeak(coeffs));

    var vals = coeffs.select([".*_intercept"]);
    var amplitudes = pap.select([".*_amplitude"]);
    var phases = pap.select([".*_phase"]);
    var peakJulians = pap.select([".*peakJulianDay"]);
    var AUCs = pap.select([".*AUC"]);

    Map.addLayer(phases, {}, nameStart + "_phases", false);
    Map.addLayer(amplitudes, {min: 0, max: 0.6}, nameStart + "_amplitudes", false);
    Map.addLayer(AUCs, {min: 0, max: 0.3}, nameStart + "_AUCs", false);
    Map.addLayer(peakJulians, {min: 0, max: 365}, nameStart + "_peakJulians", false);

    // Create synthetic image for peak julian day according the the seasonalityVizIndexName band
    var dateImage = ee.Image(yr).add(peakJulians.select([seasonalityVizIndexName + "_peakJulianDay"]).divide(365));
    var synth = gil.synthImage(coeffs, dateImage, indexNames, whichHarmonics, detrend);
    Map.addLayer(synth, {min: 0.1, max: 0.4}, nameStart + "_Date_of_Max_" + seasonalityVizIndexName + "_Synth_Image", false);

    // Turn the HSV data into an RGB image and add it to the map.
    var seasonality = ee.Image.cat(
      phases.select([seasonalityVizIndexName + ".*"]).clamp(0, 1),
      amplitudes.select([seasonalityVizIndexName + ".*"]).unitScale(0, 0.5).clamp(0, 1),
      seasonalityMedian.unitScale(0, 0.8).clamp(0, 1)
    ).hsvToRgb();

    Map.addLayer(seasonality, {min: 0, max: 1}, nameStart + "_" + seasonalityVizIndexName + "_Seasonality", true);
  }

  // Export image
  if (exportCoefficients){
    var coeffsOut;
    if (!detrend){
      coeffsOut = coeffs.multiply(1000).int16();
    }else{
      coeffsOut = coeffs.float();
    }

    coeffsOut = coeffsOut.copyProperties(coeffs).copyProperties(coeffs, ["system:time_start"]);

    var outName = outputName + startYearT + "_" + endYearT;
    var outPath = exportPathRoot + "/" + outName;

    Export.image.toAsset({
      image: coeffsOut,
      description: outName,
      assetId: outPath,
      pyramidingPolicy: {'.default': 'mean'},
      dimensions: null,
      region: studyArea,
      scale: scale,
      crs: crs,
      crsTransform: transform,
      maxPixels: 1e13
    });
  }
  coeffCollection.push(coeffs);
});
////////////////////////////////////////////////////////////////////////////////////////////////////
// Load the study region
Map.addLayer(studyArea, {color: '0000FF'}, "Study Area", false);
Map.centerObject(studyArea);
////////////////////////////////////////////////////////////////////////////////////////////////////
