# three-mapbox-satellite


**three-mapbox-satellite** is a complete refactor and simplified version of [three-geo](https://github.com/w3reality/three-geo). It renders the satellite image of a lat-lon as a threejs Mesh. Currently it exports a single class and it is the responsibility of the consumer to import and build it using their own builders (webpack, rollup etc). 

## Why

Wanting to contribute to open source, and a need to use a simplified version in a product, ended up reading the three-geo code and realized an opportunity to simplify a few things. async await is now a given on all browsers. The code is just two files and feel free to fork and modify for your needs. Also, in three-geo the elevation data is based on a zoom-level which two levels lower. This version gets the elevation data at the user specified zoom level.

## Setup

```
$ yarn add three-mapbox-satellite
```

## Usage

The API is predominently similar to [three-geo](https://github.com/w3reality/three-geo), with some small changes. 
The terrain/satellite image is returned as a threejs group with the terrain meshes as children. 


Here is an example of how to build a geographic terrain located at GPS coordinates (46.5763, 7.9904) in a 5 km radius circle. The terrain's satellite zoom resolution is set to 12. (The highest zoom value supported is 17.)

```js
import ThreeMapboxSatellite from 'three-mapbox-satellite';

// setup your threejs scene and camera prior to this
 
const sat_tiles = new ThreeMapboxSatellite(46.5763, 
                                          7.9904, 
                                          12, 
                                          5.0, 
                                          { clip: false, 
                                            render_box_size: THREE_BOX_SIZE,
                                            api_token: MAPBOX_TOKEN 
                                          })

const group = await sat_tiles.renderSatellite();
if(group) scene.add(group)
const projection = sat_tiles.getProjection();   //for geo to xy and vice-versa . see below for explanation
```

## API

`ThreeMapboxSatellite`

- `constructor(lat, lon, zoom, radius, opts={})`

  Create a ThreeMapboxSatellite instance with parameters.

  - `latitude` **number** Latitude of the center of the terrain.

  - `longitude` **number** Longitude of the center of the terrain.

  - `zoom` **number (integer)** Satellite zoom resolution of the tiles in the terrain. Select from {11, 12, 13, 14, 15, 16, 17}, where 17 is the highest value supported. For a fixed radius, higher zoom resolution results in more tileset API calls.

  - `radius` **number** Radius of the circle that fits the terrain in kilometers.

  - `opts.api_token` **string** Mapbox API token. This must be provided.

  - `opts.render_box_size`= 1.0 **number** The side length of the square that fits the terrain in WebGL space. (same as unitsSide in three-geo)

  - `opts.clip`= false **boolean** By default it renders all the mapbox tiles within the radius, which extends beyond the render box size. Set clip to true to add clippingPanes. For it to work, the WebGLRenderer needs to have localClipping set to true
  
- `async renderSatellite()` 

  Return a **THREE.Group** object that represents a 3D surface of the terrain.


  The group object contains an **Array\<THREE.Mesh\>** as `.children`. Each mesh corresponds to a partial geometry of the terrain textured with satellite images.

- `getProjection()`

  Return an object `{ lonLat2XY, xy2LonLat, bbox, units_per_meter }` that includes transformation-related functions and parameters, where

  - `lonLat2XY(lonlat)` is a function that maps geo coordinates `lonlat` (an array `[lon, lat]`) to WebGL coordinates `[x, y]`.

  - `xy2LonLat(xy)` is a function that maps WebGL coordinates `[x, y]` to geo coordinates `[lon, lat]`.

  - `bbox` is an object `{ nw, se }` that represents the computed bounding box of the terrain. `nw` is an array with first element is the north latitude and second is the west longitude value. `se` is an array with first element is the south latitude value and second is the east longitude value. 

  - `units_per_meter` is the length in WebGL-space per meter.

## Change Log
 * Version 0.2.1 - Refactored and removed Promise.all to avoid simultaneous queries to mapbox 
 * Version 0.2.2 - Added promise pool for queries to mapbox rather than Promise.all

## Credits
* [three-geo](https://github.com/w3reality/three-geo)
* [Mapbox API](https://docs.mapbox.com/api/overview/)
* This [gist](https://gist.github.com/ChaseIngebritson/22803b340664becdc08b03683e9f935d) from ChaseIngebritson

