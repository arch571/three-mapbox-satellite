import SphericalMercator from "@mapbox/sphericalmercator";
import { TextureLoader } from "three";

const degree2Radian = v=>v*Math.PI/180;
const radian2Degree = v=>v*180/Math.PI;

// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_.28JavaScript.2FActionScript.2C_etc..29
const lon2TileX = (lon,zoom) => Math.floor((lon+180)/360*Math.pow(2,zoom));
const lat2TileY = (lat,zoom) => Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 
                                  1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom));


//https://movable-type.co.uk/scripts/latlong.html - bearing section
//turf-destination library   
const getGeoDestination = (lat, lon, d, bearing) => {
  const lt1 = degree2Radian(lat);
  const ln1 = degree2Radian(lon);
  const rbearing = degree2Radian(bearing);
  const R = 6373; //in km

  const lt2 = Math.asin( Math.sin(lt1)*Math.cos(d/R) +
                                  Math.cos(lt1)*Math.sin(d/R)*Math.cos(rbearing) );
  const ln2 = ln1 + Math.atan2(Math.sin(rbearing)*Math.sin(d/R)*Math.cos(lt1),
                                       Math.cos(d/R)-Math.sin(lt1)*Math.sin(lt2));
  return [radian2Degree(lt2), radian2Degree(ln2)];
}

const getBBoxFromOrigin = (olat, olon, radius_in_km) => {
  const nw = getGeoDestination(olat, olon, radius_in_km, -45);
  const se = getGeoDestination(olat, olon, radius_in_km, 135);
  return { nw, se }
}

const getBBoxTilePos = (bbox, zoom) => {
  const x1 = lon2TileX(bbox.nw[1], zoom);
  const y1 = lat2TileY(bbox.nw[0], zoom);

  const x2 = lon2TileX(bbox.se[1], zoom);
  const y2 = lat2TileY(bbox.se[0], zoom);

  let m = [];

  for(let y=y1, row=0; y <= y2; y++, row++) {
    for(let x=x1, col=0; x <= x2; x++, col++) {
      m.push(`${zoom}/${x}/${y}`);
    }
  }
  return m;
}

const getPixels = async function(url) {
  return new Promise ((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src =  url;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.width;

      context.drawImage(img, 0, 0, img.width, img.width);

      const imgData = context.getImageData(0, 0, img.width, img.height);
      resolve(imgData.data);
    };
    img.onerror = (e) =>{
      console.log(`Error loading mapbox ${url}`)
      console.log(e);
    }
    //TBD catch error
  });
} //end getPixels
     

const createTexture = async (zoom, x, y, api_token) => {
  // const url = `https://api.mapbox.com/v4/mapbox.satellite/${zoom}/${x}/${y}@2x.png?access_token=${this.api_token}`;
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/${zoom}/${x}/${y}?access_token=${api_token}`;

  const texture_loader = new TextureLoader();
  const texture = await texture_loader.loadAsync(url);
  return texture;
}

const getElevationsFromTile = async (zoom, x, y, api_token) => {
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${x}/${y}@2x.pngraw?access_token=${api_token}`;
  const pixels = await getPixels(url);
  return getElevationsFromPixels(pixels)
}

const getElevationsFromPixels = (pixels)=>{
  //https://docs.mapbox.com/help/troubleshooting/access-elevation-data/
  const _rgbToElevation = (r, g, b)=>-10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
  
  const elevations = [];
  for(let i=0;i<pixels.length; i+=4) {
    const r = pixels[i + 0];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    elevations.push(_rgbToElevation(r, g, b));
  }
  return elevations;
}

const convertToXYZ = (tile_pos_str, tile_elevations, { elevation_dim, units_per_meter, lonLat2XY }) => {
  const mercator = new SphericalMercator({ size: elevation_dim })
  let [tile_zoom, tile_x, tile_y] = tile_pos_str.split('/').map(i=>parseInt(i));
  const tile_data = [];
  for(let row=0;row<elevation_dim;row++) {
    for(let col=0;col<elevation_dim;col++) {
      const pixel_lonlat = mercator.ll([
        tile_x*elevation_dim+col,
        tile_y*elevation_dim+row
      ], tile_zoom)
      tile_data.push(...lonLat2XY(pixel_lonlat), tile_elevations[row*elevation_dim+col]*units_per_meter)
    }
  }
  return tile_data;
}

const getSouthTileIndex = function(tile_pos_str, tile_pos_a) {
  let [zoom, x, y] = tile_pos_str.split('/').map(i=>parseInt(i));
  const south_tile_str = `${zoom}/${x}/${y+1}`;
  return tile_pos_a.indexOf(south_tile_str); 
}

const getEastTileIndex = function(tile_pos_str, tile_pos_a) {
  let [zoom, x, y] = tile_pos_str.split('/').map(i=>parseInt(i));
  const east_tile_str = `${zoom}/${x+1}/${y}`;
  return tile_pos_a.indexOf(east_tile_str); 
}

const getSouthEastTileIndex = function(tile_pos_str, tile_pos_a) {
  let [zoom, x, y] = tile_pos_str.split('/').map(i=>parseInt(i));
  const south_east_tile_str = `${zoom}/${x+1}/${y+1}`;
  return tile_pos_a.indexOf(south_east_tile_str); 
}

const addSouthRow = function(base_tile, south_tile, elevation_dim) {
  base_tile.push(...south_tile.slice(0, elevation_dim*3))
}

const addEastColumn = function(base_tile, east_tile, elevation_dim) {
  for(let i=0;i<elevation_dim;i++) {
    const si = i * elevation_dim * 3; //source index
    //add extra vertex of prev rows
    const ti = i * ((elevation_dim + 1) * 3) + elevation_dim * 3;
    base_tile.splice(ti, 0, east_tile[si], east_tile[si+1], east_tile[si+2])
  }
}

const addSouthEastPixel = function(base_tile, south_east_tile) {
  base_tile.push(...south_east_tile.slice(0,3));
}

const addSeams = tile_a => {
  const tile_pos_a = tile_a.map(t=>t.tile_pos_str);
  for( let tile_obj of tile_a) {
    let pos_index = getSouthTileIndex(tile_obj.tile_pos_str, tile_pos_a);
    if(pos_index >= 0) {
      addSouthRow(tile_obj.tile_data, tile_a[pos_index].tile_data, tile_obj.elevation_dim);
      tile_obj.y_segments++;
    }
    pos_index = getEastTileIndex(tile_obj.tile_pos_str, tile_pos_a);
    if(pos_index >= 0) {
      addEastColumn(tile_obj.tile_data, tile_a[pos_index].tile_data, tile_obj.elevation_dim);
      tile_obj.x_segments++;
    }
    pos_index = getSouthEastTileIndex(tile_obj.tile_pos_str, tile_pos_a);
    if(pos_index >= 0) {
      addSouthEastPixel(tile_obj.tile_data, tile_a[pos_index].tile_data);
    }
  }
}

export {
  lon2TileX,
  lat2TileY,
  getPixels,
  getBBoxFromOrigin,
  getBBoxTilePos,
  getElevationsFromTile,
  convertToXYZ,
  createTexture,
  addSeams
}
