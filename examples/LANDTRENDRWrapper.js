/*
This script demonstrates how to run the LANDTRENDR temporal segmentation algorithm and visualize the outputs using JavaScript modules. The script acquires Landsat data, processes it, runs the LANDTRENDR algorithm, and optionally exports the results.

Modules:
    - geeViz.getImagesLib as gil
    - geeViz.changeDetectionLib as cdl

User Parameters:
    - studyArea: The area of interest, can be a featureCollection, feature, or geometry.
    - startJulian: Starting Julian date for seasonal constraints.
    - endJulian: Ending Julian date for seasonal constraints.
    - startYear: Starting year for analysis.
    - endYear: Ending year for analysis.
    - indexName: The band or index to use (e.g., NBR, NDMI, NDVI).
    - howManyToPull: Number of significant loss/gain segments to include.
    - lossMagThresh: Threshold for loss magnitude.
    - lossSlopeThresh: Threshold for loss slope.
    - gainMagThresh: Threshold for gain magnitude.
    - gainSlopeThresh: Threshold for gain slope.
    - slowLossDurationThresh: Threshold for slow loss duration.
    - chooseWhichLoss: Criteria for selecting loss segments.
    - chooseWhichGain: Criteria for selecting gain segments.
    - run_params: Parameters for the LANDTRENDR algorithm.
    - addToMap: Whether to add change outputs to the map.
    - exportLTLossGain: Whether to export LANDTRENDR loss/gain outputs.
    - exportLTVertexArray: Whether to export raw LANDTRENDR vertex array.
    - outputName: Name for the export.
    - exportPathRoot: Path for exporting composites.
    - crs: Coordinate reference system.
    - transform: Transform parameters if scale is null.
    - scale: Scale if transform is null.

Functions:
    - gil.getComposite: Gets the composite image for the specified parameters.
    - gil.getProcessedLandsatScenes: Gets processed Landsat scenes.
    - gil.fillEmptyCollections: Fills empty collections with a dummy image.
    - cdl.simpleLANDTRENDR: Runs the LANDTRENDR algorithm and performs change detection.
    - gil.exportToAssetWrapper: Exports images to an asset.

Workflow:
    1. Define user parameters.
    2. Acquire and process Landsat data.
    3. Run the LANDTRENDR algorithm.
    4. Optionally export the results.
    5. Visualize the study area and results on the map.

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

// Example of how to run the LANDTRENDR temporal segmentation algorithm and view outputs using the JavaScript modules
// LANDTRENDR original paper: https://www.sciencedirect.com/science/article/pii/S0034425710002245
// LANDTRENDR in GEE paper: https://www.mdpi.com/2072-4292/10/5/691
// Acquires Landsat data, runs LANDTRENDR, and then adds some outputs to the viewer
////////////////////////////////////////////////////////////////////////////////////////////////////

// Module imports
var gil = require('users/rcr-training/geeViz-js:getImagesLib.js');
var cdl = require('users/rcr-training/geeViz-js:changeDetectionLib.js');

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
var startJulian = 152;
var endJulian = 273;

// Specify start and end years for all analyses
// More than a 3 year span should be provided for time series methods to work
// well. If using Fmask as the cloud/cloud shadow masking method, or providing
// pre-computed stats for cloudScore and TDOM, this does not
// matter
var startYear = 1990;
var endYear = 2024;


// Choose band or index
// NBR, NDMI, and NDVI tend to work best
// Other good options are wetness and tcAngleBG
var indexName = "NBR";

// How many significant loss and/or gain segments to include
// Do not make less than 1
// If you only want the first loss and/or gain, choose 1
// Generally any past 2 are noise
var howManyToPull = 1;

// Parameters to identify suitable LANDTRENDR segments

// Thresholds to identify loss in vegetation
// Any segment that has a change magnitude or slope less than both of these thresholds is omitted
var lossMagThresh = -0.15;
var lossSlopeThresh = -0.05;


// Thresholds to identify gain in vegetation
// Any segment that has a change magnitude or slope greater than both of these thresholds is omitted
var gainMagThresh = 0.1;
var gainSlopeThresh = 0.05;

// Number of years of duration to separate between slow and fast loss (>= this number will be called slow loss)
var slowLossDurationThresh = 3;

// Which segment to show change from
// Choose from: 'newest','oldest','largest','smallest','steepest','mostGradual','shortest','longest'
var chooseWhichLoss = "largest";
var chooseWhichGain = "largest";

// LandTrendr Params
// run_params ={
//   'timeSeries': (ImageCollection) Yearly time-series from which to extract breakpoints. The first band is used to find breakpoints, and all subsequent bands are fitted using those breakpoints.
//   'maxSegments':            6,\ (Integer) Maximum number of segments to be fitted on the time series.
//   'spikeThreshold':         0.9,\ (Float, default: 0.9) Threshold for damping the spikes (1.0 means no damping).
//   'vertexCountOvershoot':   3,\(Integer, default: 3) The initial model can overshoot the maxSegments + 1 vertices by this amount. Later, it will be pruned down to maxSegments + 1.
//   'preventOneYearRecovery': false,\(Boolean, default: false): Prevent segments that represent one year recoveries.
//   'recoveryThreshold':      0.25,\(Float, default: 0.25) If a segment has a recovery rate faster than 1/recoveryThreshold (in years), then the segment is disallowed.
//   'pvalThreshold':          0.05,\(Float, default: 0.1) If the p-value of the fitted model exceeds this threshold, then the current model is discarded and another one is fitted using the Levenberg-Marquardt optimizer.
//   'bestModelProportion':    0.75,\(Float, default: 0.75) Allows models with more vertices to be chosen if their p-value is no more than (2 - bestModelProportion) times the p-value of the best model.
//   'minObservationsNeeded':  6\(Integer, default: 6) Min observations needed to perform output fitting.
// };
// Define landtrendr params
var run_params = {
  maxSegments: 9,
  spikeThreshold: 0.9,
  vertexCountOvershoot: 3,
  preventOneYearRecovery: false,
  recoveryThreshold: 0.25,
  pvalThreshold: 0.05,
  bestModelProportion: 0.75,
  minObservationsNeeded: 6
};

// Whether to add change outputs to map
var addToMap = true;

// Export params
// Whether to export LANDTRENDR change detection (loss and gain) outputs
var exportLTLossGain = false;

// Whether to export LandTrendr vertex array raw output
var exportLTVertexArray = false;

// Set up Names for the export
var outputName = "LT_Test";

// Provide location composites will be exported to
// This should be an asset imageCollection
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
// End user parameters
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Start function calls
////////////////////////////////////////////////////////////////////////////////////////////////////
var hansen = ee.Image("UMD/hansen/global_forest_change_2023_v1_11").select(["lossyear"]).add(2000).int16();
hansen = hansen.updateMask(hansen.neq(2000).and(hansen.gte(startYear)).and(hansen.lte(endYear)));
Map.addLayer(
  hansen,
  {min: startYear, max: endYear, palette: cdl.lossYearPalette},
  "Hansen Loss Year",
  false
);

////////////////////////////////////////////////////////////////////////////////////////////////////
// Call on master wrapper function to get Landat scenes and composites
// Important that the range of data values of the composites match the run_params spikeThreshold and recoveryThreshold
// e.g. Reflectance bands that have a scale of 0-1 should have a spikeThreshold around 0.9
// and a recoveryThreshold around 0.25
// If the reflectance values were scaled by 10000, the spikeThreshold would be around 9000
// and a recoveryThreshold around 2500

var allImages = gil.getProcessedLandsatScenes(studyArea, startYear, endYear, startJulian, endJulian).select([indexName]);
var dummyImage = allImages.first();
var composites = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(function(yr){
    return gil.fillEmptyCollections(
      allImages.filter(ee.Filter.calendarRange(yr, yr, "year")),
      dummyImage
    ).median().set('system:time_start', ee.Date.fromYMD(yr, 6, 1).millis());
  })
);

// Run LANDTRENDR
// This function handles a lot
// This function will ensure the band/index will be flipped so a decrease in veg/moisture goes up
// It will then flip it back and return only the image array of the vertex values and the rmse
// It will then run a simple change detection over the resulting LT output
var ltOutputs = cdl.simpleLANDTRENDR(
  composites,
  startYear,
  endYear,
  indexName,
  run_params,
  lossMagThresh,
  lossSlopeThresh,
  gainMagThresh,
  gainSlopeThresh,
  slowLossDurationThresh,
  chooseWhichLoss,
  chooseWhichGain,
  addToMap,
  howManyToPull,
  10000
);


if (exportLTLossGain){
  var lossGainStack = ltOutputs[1];
  // Export  stack
  var exportName = outputName + "_LT_LossGain_Stack_" + indexName + "_" + startYear + "_" + endYear + "_" + startJulian + "_" + endJulian;
  var exportPath = exportPathRoot + "/" + exportName;

  lossGainStack = lossGainStack.set({
    'startYear': startYear,
    'endYear': endYear,
    'startJulian': startJulian,
    'endJulian': endJulian,
    'band': indexName
  });
  lossGainStack = lossGainStack.set(run_params);

  // Set up proper resampling for each band
  // Be sure to change if the band names for the exported image change
  var pyrObj = {'_yr_': 'mode', '_dur_': 'mode', '_mag_': 'mean', '_slope_': 'mean'};
  var possible = ['loss', 'gain'];
  var how_many_list = ee.List.sequence(1, howManyToPull).getInfo();
  var outObj = {};
  possible.map(function(p){
    Object.keys(pyrObj).map(function(key){
      how_many_list.map(function(i){
        i = parseInt(i);
        var kt = indexName + "_LT_" + p + key + i;
        outObj[kt] = pyrObj[key];
      });
    });
  });

  // print(outObj)
  // Export output
  Export.image.toAsset({
    image: lossGainStack,
    description: exportName,
    assetId: exportPath,
    pyramidingPolicy: outObj,
    dimensions: null,
    region: studyArea,
    scale: scale,
    crs: crs,
    crsTransform: transform,
    maxPixels: 1e13
  });
}


// Export raw LandTrendr array image
if (exportLTVertexArray){
  var rawLTForExport = ltOutputs[0];
  // Map.addLayer(rawLTForExport,{},'Raw LT For Export {}'.format(indexName),false)

  rawLTForExport = rawLTForExport.set({
    'startYear': startYear,
    'endYear': endYear,
    'startJulian': startJulian,
    'endJulian': endJulian,
    'band': indexName
  });
  rawLTForExport = rawLTForExport.set(run_params);
  var exportName = outputName + "_LT_Raw_" + indexName + "_" + startYear + "_" + endYear + "_" + startJulian + "_" + endJulian;
  var exportPath = exportPathRoot + "/" + exportName;

  Export.image.toAsset({
    image: rawLTForExport,
    description: exportName,
    assetId: exportPath,
    pyramidingPolicy: {'.default': 'sample'},
    dimensions: null,
    region: studyArea,
    scale: scale,
    crs: crs,
    crsTransform: transform,
    maxPixels: 1e13
  });
  // Reverse for modeling
  // var decompressedC = cdl.simpleLTFit(rawLTForExport,startYear,endYear,indexName,true,run_params.maxSegments)
  // Map.addLayer(decompressedC,{},'Decompressed LT Output {}'.format(indexName),false)
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Load the study region
Map.addLayer(studyArea, {color: '0000FF'}, "Study Area", false);
Map.centerObject(studyArea);
////////////////////////////////////////////////////////////////////////////////////////////////////
