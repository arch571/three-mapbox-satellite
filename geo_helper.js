import SphericalMercator from "@mapbox/sphericalmercator";
import { SRGBColorSpace, TextureLoader } from "three";

const degree2Radian = (v) => (v * Math.PI) / 180;
const radian2Degree = (v) => (v * 180) / Math.PI;

// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_.28JavaScript.2FActionScript.2C_etc..29
const lon2TileX = (lon, zoom) =>
  Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
const lat2TileY = (lat, zoom) =>
  Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );

//https://movable-type.co.uk/scripts/latlong.html - bearing section
//turf-destination library
const getGeoDestination = (lat, lon, d, bearing) => {
  const lt1 = degree2Radian(lat);
  const ln1 = degree2Radian(lon);
  const rbearing = degree2Radian(bearing);
  const R = 6373; //in km

  const lt2 = Math.asin(
    Math.sin(lt1) * Math.cos(d / R) +
      Math.cos(lt1) * Math.sin(d / R) * Math.cos(rbearing)
  );
  const ln2 =
    ln1 +
    Math.atan2(
      Math.sin(rbearing) * Math.sin(d / R) * Math.cos(lt1),
      Math.cos(d / R) - Math.sin(lt1) * Math.sin(lt2)
    );
  return [radian2Degree(lt2), radian2Degree(ln2)];
};

const getBBoxFromOrigin = (olat, olon, radiusInKm) => {
  const nw = getGeoDestination(olat, olon, radiusInKm, -45);
  const se = getGeoDestination(olat, olon, radiusInKm, 135);
  return { nw, se };
};

const getBBoxTilePos = (bbox, zoom) => {
  const x1 = lon2TileX(bbox.nw[1], zoom);
  const y1 = lat2TileY(bbox.nw[0], zoom);

  const x2 = lon2TileX(bbox.se[1], zoom);
  const y2 = lat2TileY(bbox.se[0], zoom);

  let m = [];

  for (let y = y1, row = 0; y <= y2; y++, row++) {
    for (let x = x1, col = 0; x <= x2; x++, col++) {
      m.push(`${zoom}/${x}/${y}`);
    }
  }
  return m;
};

const getPixels = async (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.width;

      context.drawImage(img, 0, 0, img.width, img.width);

      const imgData = context.getImageData(0, 0, img.width, img.height);
      return resolve(imgData.data);
    };
    img.onerror = (e) => {
      console.log(`Error loading mapbox ${url}`);
      return reject(e);
    };

    img.src = url;
  });
}; //end getPixels

const createTexture = async (zoom, x, y, apiToken) => {
  // const url = `https://api.mapbox.com/v4/mapbox.satellite/${zoom}/${x}/${y}@2x.png?access_token=${this.apiToken}`;
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/${zoom}/${x}/${y}?access_token=${apiToken}`;

  const textureLoader = new TextureLoader();
  const texture = await textureLoader.loadAsync(url);
  //set colorspace as it seems brighter without it
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const getElevationsFromTile = async (zoom, x, y, apiToken) => {
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${x}/${y}@2x.pngraw?access_token=${apiToken}`;
  const pixels = await getPixels(url);
  return getElevationsFromPixels(pixels);
};

const getElevationsFromPixels = (pixels) => {
  //https://docs.mapbox.com/help/troubleshooting/access-elevation-data/
  const _rgbToElevation = (r, g, b) =>
    -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;

  const elevations = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i + 0];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    elevations.push(_rgbToElevation(r, g, b));
  }
  return elevations;
};

const convertToXYZ = (
  tilePosStr,
  tileElevations,
  { elevationDim, unitsPerMeter, lonLat2XY }
) => {
  const mercator = new SphericalMercator({ size: elevationDim });
  let [tileZoom, tileX, tileY] = tilePosStr.split("/").map((i) => parseInt(i));
  const tileData = [];
  for (let row = 0; row < elevationDim; row++) {
    for (let col = 0; col < elevationDim; col++) {
      const pixelLonLat = mercator.ll(
        [tileX * elevationDim + col, tileY * elevationDim + row],
        tileZoom
      );
      tileData.push(
        ...lonLat2XY(pixelLonLat),
        tileElevations[row * elevationDim + col] * unitsPerMeter
      );
    }
  }
  return tileData;
};

const getSouthTileIndex = function (tilePosStr, tilePosArray) {
  let [zoom, x, y] = tilePosStr.split("/").map((i) => parseInt(i));
  const southTileStr = `${zoom}/${x}/${y + 1}`;
  return tilePosArray.indexOf(southTileStr);
};

const getEastTileIndex = function (tilePosStr, tilePosArray) {
  let [zoom, x, y] = tilePosStr.split("/").map((i) => parseInt(i));
  const eastTileStr = `${zoom}/${x + 1}/${y}`;
  return tilePosArray.indexOf(eastTileStr);
};

const getSouthEastTileIndex = function (tilePosStr, tilePosArray) {
  let [zoom, x, y] = tilePosStr.split("/").map((i) => parseInt(i));
  const southEastTileStr = `${zoom}/${x + 1}/${y + 1}`;
  return tilePosArray.indexOf(southEastTileStr);
};

const addSouthRow = function (baseTile, southTile, elevationDim) {
  baseTile.push(...southTile.slice(0, elevationDim * 3));
};

const addEastColumn = function (baseTile, eastTile, elevationDim) {
  for (let i = 0; i < elevationDim; i++) {
    const si = i * elevationDim * 3; //source index
    //add extra vertex of prev rows
    const ti = i * ((elevationDim + 1) * 3) + elevationDim * 3;
    baseTile.splice(ti, 0, eastTile[si], eastTile[si + 1], eastTile[si + 2]);
  }
};

const addSouthEastPixel = function (baseTile, southEastTile) {
  baseTile.push(...southEastTile.slice(0, 3));
};

const addSeams = (tileArray) => {
  const tilePosArray = tileArray.map((t) => t.tilePosStr);
  for (let tileObj of tileArray) {
    let posIndex = getSouthTileIndex(tileObj.tilePosStr, tilePosArray);
    if (posIndex >= 0) {
      addSouthRow(
        tileObj.tileData,
        tileArray[posIndex].tileData,
        tileObj.elevationDim
      );
      tileObj.ySegments++;
    }
    posIndex = getEastTileIndex(tileObj.tilePosStr, tilePosArray);
    if (posIndex >= 0) {
      addEastColumn(
        tileObj.tileData,
        tileArray[posIndex].tileData,
        tileObj.elevationDim
      );
      tileObj.xSegments++;
    }
    posIndex = getSouthEastTileIndex(tileObj.tilePosStr, tilePosArray);
    if (posIndex >= 0) {
      addSouthEastPixel(tileObj.tileData, tileArray[posIndex].tileData);
    }
  }
};

export {
  lon2TileX,
  lat2TileY,
  getPixels,
  getBBoxFromOrigin,
  getBBoxTilePos,
  getElevationsFromTile,
  convertToXYZ,
  createTexture,
  addSeams,
};
