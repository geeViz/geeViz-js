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

// Example of how to get Landsat data using the getImagesLib and view outputs using the JavaScript modules
// Acquires Landsat data and then adds them to the viewer
////////////////////////////////////////////////////////////////////////////////////////////////////

// Module imports
var gil = require('users/rcr-training/geeViz-js:getImagesLib.js');

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
// well. If providing pre-computed stats for cloudScore and TDOM, this does not
// matter
var startYear = 2015;
var endYear = 2023;

// Specify an annual buffer to include imagery from the same season
// timeframe from the prior and following year. timeBuffer = 1 will result
// in a 3 year moving window. If you want single-year composites, set to 0
var timebuffer = 0;

// Specify the weights to be used for the moving window created by timeBuffer
// For example- if timeBuffer is 1, that is a 3 year moving window
// If the center year is 2000, then the years are 1999,2000, and 2001
// In order to overweight the center year, you could specify the weights as
// [1,5,1] which would duplicate the center year 5 times and increase its weight for
// the compositing method. If timeBuffer = 0, set to [1]
var weights = [1];

// Choose medoid or median compositing method.
// Median tends to be smoother, while medoid retains
// single date of observation across all bands
// The date of each pixel is stored if medoid is used. This is not done for median
// If not exporting indices with composites to save space, medoid should be used
var compositingMethod = "medoid";

// Choose Top of Atmospheric (TOA) or Surface Reflectance (SR)
var toaOrSR = "SR";

// Choose which Landsat USGS Collection version to use
// Choices are 'C1' for Collection 1 and 'C2' for Collection 2
// Only choose 'C1' if working with other Collection 1 data and using
// data from before 1/1/2022. Otherwise, choose 'C2'
// See: https://www.usgs.gov/landsat-missions/landsat-collection-2 for more information
var landsatCollectionVersion = "C2";

// Choose whether to include Landat 7
// Generally only included when data are limited
var includeSLCOffL7 = false;

// Whether to defringe L4 and L5
// Landsat 4 and 5 data have fringes on the edges that can introduce anomalies into
// the analysis.  This method removes them, but is somewhat computationally expensive
var defringeL5 = true;

// Choose cloud/cloud shadow masking method
// Choices are a series of booleans for cloudScore, TDOM, and elements of Fmask
// Fmask masking options will run fastest since they're precomputed
// Fmask cloud mask is generally very good, while the fMask cloud shadow
// mask isn't great. TDOM tends to perform better than the Fmask cloud shadow mask. cloudScore
// is usually about as good as the Fmask cloud mask overall, but each fails in different instances.
// CloudScore runs pretty quickly, but does look at the time series to find areas that
// always have a high cloudScore to reduce commission errors- this takes some time
// and needs a longer time series (>5 years or so)
// TDOM also looks at the time series and will need a longer time series
// If pre-computed cloudScore offsets and/or TDOM stats are provided below, cloudScore
// and TDOM will run quite quickly
var applyCloudScore = true;
var applyFmaskCloudMask = true;

var applyTDOM = true;
var applyFmaskCloudShadowMask = true;

var applyFmaskSnowMask = false;

// If applyCloudScore is set to true
// cloudScoreThresh: lower number masks more clouds.  Between 10 and 30 generally
// works best
var cloudScoreThresh = 20;

// Whether to find if an area typically has a high cloudScore
// If an area is always cloudy, this will result in cloud masking omission
// For bright areas that may always have a high cloudScore
// but not actually be cloudy, this will result in a reduction of commission errors
// This procedure needs at least 5 years of data to work well
// Precomputed offsets can be provided below
var performCloudScoreOffset = true;

// If performCloudScoreOffset = true:
// Percentile of cloud score to pull from time series to represent a minimum for
// the cloud score over time for a given pixel. Reduces comission errors over
// cool bright surfaces. Generally between 5 and 10 works well. 0 generally is a
// bit noisy but may be necessary in persistently cloudy areas
var cloudScorePctl = 10;

// zScoreThresh: If applyTDOM is true, this is the threshold for cloud shadow masking-
// lower number masks out less. Between -0.8 and -1.2 generally works well
var zScoreThresh = -1;

// shadowSumThresh:  If applyTDOM is true, sum of IR bands to include as shadows within TDOM and the
//    shadow shift method (lower number masks out less)
var shadowSumThresh = 0.35;

// contractPixels: The radius of the number of pixels to contract (negative
//    buffer) clouds and cloud shadows by. Intended to eliminate smaller cloud
//    patches that are likely errors
// (1.5 results in a -1 pixel buffer)(0.5 results in a -0 pixel buffer)
// (1.5 or 2.5 generally is sufficient)
var contractPixels = 1.5;

// dilatePixels: The radius of the number of pixels to dilate (buffer) clouds
//    and cloud shadows by. Intended to include edges of clouds/cloud shadows
//    that are often missed
// (1.5 results in a 1 pixel buffer)(0.5 results in a 0 pixel buffer)
// (2.5 or 3.5 generally is sufficient)
var dilatePixels = 2.5;

// Choose the resampling method: 'near', 'bilinear', or 'bicubic'
// Defaults to 'near'
// If method other than 'near' is chosen, any map drawn on the fly that is not
// reprojected, will appear blurred
// Use .reproject to view the actual resulting image (this will slow it down)
var resampleMethod = "near";

// If available, bring in preComputed cloudScore offsets and TDOM stats
// Set to null if computing on-the-fly is wanted
// These have been pre-computed for all CONUS for Landsat and Setinel 2 (separately)
// and are appropriate to use for any time period within the growing season
// The cloudScore offset is generally some lower percentile of cloudScores on a pixel-wise basis
var preComputedCloudScoreOffset = gil.getPrecomputedCloudScoreOffsets(cloudScorePctl).landsat;

// The TDOM stats are the mean and standard deviations of the two IR bands used in TDOM
// By default, TDOM uses the nir and swir1 bands
var preComputedTDOMStats = gil.getPrecomputedTDOMStats();
var preComputedTDOMIRMean = preComputedTDOMStats.landsat.mean;
var preComputedTDOMIRStdDev = preComputedTDOMStats.landsat.stdDev;


// correctIllumination: Choose if you want to correct the illumination using
// Sun-Canopy-Sensor+C correction. Additionally, choose the scale at which the
// correction is calculated in meters.
var correctIllumination = false;
var correctScale = 250;  // Choose a scale to reduce on- 250 generally works well

// Export params
// Whether to export composites
var exportComposites = false;

// Set up Names for the export
var outputName = "Landsat";

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
// End user parameters
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Start function calls
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// Call on master wrapper function to get Landat scenes and composites
var lsAndTs = gil.getLandsatWrapper(
  studyArea,
  startYear,
  endYear,
  startJulian,
  endJulian,
  timebuffer,
  weights,
  compositingMethod,
  toaOrSR,
  includeSLCOffL7,
  defringeL5,
  applyCloudScore,
  applyFmaskCloudMask,
  applyTDOM,
  applyFmaskCloudShadowMask,
  applyFmaskSnowMask,
  cloudScoreThresh,
  performCloudScoreOffset,
  cloudScorePctl,
  zScoreThresh,
  shadowSumThresh,
  contractPixels,
  dilatePixels,
  correctIllumination,
  correctScale,
  exportComposites,
  outputName,
  exportPathRoot,
  crs,
  transform,
  scale,
  resampleMethod,
  preComputedCloudScoreOffset,
  preComputedTDOMIRMean,
  preComputedTDOMIRStdDev,
  landsatCollectionVersion
);


// Separate into scenes and composites for subsequent analysis
var processedScenes = lsAndTs.processedScenes;
var processedComposites = lsAndTs.processedComposites;


years = ee.List.sequence(startYear, endYear).getInfo();
years.map(function(year) {
  Map.addLayer(processedComposites.filter(ee.Filter.calendarRange(year, year, "year")), gil.vizParamsFalse, "Composite " + year.toString(), false);
});
////////////////////////////////////////////////////////////////////////////////////////////////////
// Load the study region
Map.addLayer(studyArea, {color: '0000FF'}, "Study Area", true);
Map.centerObject(studyArea);
////////////////////////////////////////////////////////////////////////////////////////////////////
