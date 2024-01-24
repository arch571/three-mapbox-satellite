import {  Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial, 
          Plane, PlaneGeometry, Vector3 } from 'three';
import {  addSeams, convertToXYZ, createTexture, getBBoxFromOrigin, getBBoxTilePos, 
          getElevationsFromTile,  
          } from './geo_helper';

import promisePool from './pool'

const ELEVATION_DIM = 512;
const MAX_TILES = 36;
const MAX_CONCURRENCY = 4;

export default class ThreeMapboxSatellite {
  constructor(olat, olon, zoom, radius, { clip=false, render_box_size=1, api_token='***' }={}) {
    //stor input for debugging
    this.originLat = olat;
    this.originLon = olon
    this.radius = radius;
    this.zoom = zoom;
    this.options = { 
      clip,
      renderBoxSize: render_box_size,
      apiToken: api_token
    }
    this.bbox = getBBoxFromOrigin(olat, olon, radius);
    console.log("bbox ll", this.bbox)
    this.unitsPerMeter = render_box_size / (radius * 1000 * Math.sqrt(2));
    this.lonLat2XY = (lonlat) => {
      const { nw, se } = this.bbox;
      return [
        render_box_size * ( -0.5 + (lonlat[0]-nw[1])/(se[1]-nw[1])),
        render_box_size * ( -0.5 - (lonlat[1]-se[0])/(se[0]-nw[0])),
      ];
    }
    this.xy2LonLat = (xy) => {
      //reverse of lonLat2XY
      const { nw, se } = this.bbox;
      return [
        ((xy[0]/render_box_size) + 0.5)*(se[1]-nw[1]) + nw[1],
        -(((xy[1]/render_box_size) + 0.5)*(se[0]-nw[0]) - se[0]),
      ];
    }
  }

  /*
   returns a Three.Group containing meshes 
   or false if no tile is found for the latlon
   */

  getProjection() {
    return {
      units_per_meter: this.unitsPerMeter,  //keep for legacy reasons
      unitsPerMeter: this.unitsPerMeter,
      bbox: this.bbox,
      lonLat2XY: this.lonLat2XY,
      xy2LonLat: this.xy2LonLat
    }
  }

  async renderSatellite(progressCallback=()=>{}) {
    const tilePosArray = getBBoxTilePos(this.bbox, this.zoom)
    console.log('bbox tilepos ', tilePosArray)
    if(tilePosArray.length > MAX_TILES) throw new Error('Too many tiles requested. Try reducing radius!')
    if(tilePosArray.length == 0) throw new Error('No tiles found!')
    const numTiles = tilePosArray.length;
    const getTileAndUpdateProgress = async (tilePosStr,index)=>{
      const tile = await this.getTileData(tilePosStr);
      progressCallback((index+1)/(numTiles*2));
      return tile;
    };
    const tileArray = await promisePool(tilePosArray, MAX_CONCURRENCY, getTileAndUpdateProgress);
    return await this.renderAllTiles(tileArray, progressCallback);
  }

  async getTileData(tilePosStr) {
    let [zoom, tileX, tileY] = tilePosStr.split('/').map(i=>parseInt(i));
    const tileElevations = await getElevationsFromTile(zoom, tileX, tileY, this.options.apiToken)
    const tileData = convertToXYZ(tilePosStr, tileElevations, { elevationDim: ELEVATION_DIM, 
                                                                    unitsPerMeter: this.unitsPerMeter, 
                                                                    lonLat2XY: this.lonLat2XY 
                                                                  })
    return { tileData, tilePosStr, xSegments: ELEVATION_DIM-1, 
                  ySegments: ELEVATION_DIM-1, elevationDim: ELEVATION_DIM 
                };
  }

  async renderAllTiles(tileArray, progressCallback) {
    const { clip, renderBoxSize, apiToken } = this.options; 
    const clipPanes = clip ? [
      new Plane(new Vector3(1,0,0), 0.5 * renderBoxSize),
      new Plane(new Vector3(-1,0,0), 0.5 * renderBoxSize),
      new Plane(new Vector3(0,1,0), 0.5 * renderBoxSize),
      new Plane(new Vector3(0,-1,0), 0.5 * renderBoxSize),
    ] : [];
    
    tileArray.sort((t1, t2)=>t1.tilePosStr.localeCompare(t2.tilePosStr));
    if(tileArray.length > 1) addSeams(tileArray);   //if single tile no need to add seam
    const numTiles = tileArray.length;
    const renderTileAndUpdateProgress = async (t, index)=>{
      const mesh = await this.renderTile({ ...t, clipPanes, apiToken });
      progressCallback((index+1+numTiles)/(numTiles*2));
      return mesh;
    }
    const meshArray = await promisePool(tileArray, MAX_CONCURRENCY, renderTileAndUpdateProgress)
    const group = new Group();
    group.name = 'mapbox-satellite-group'
    group.add(...meshArray);
    return group;
  }
  
  async renderTile({ tilePosStr, tileData, xSegments, ySegments, clipPanes, apiToken }) {
    const geometry = new PlaneGeometry(1, 1, xSegments, ySegments);
    geometry.setAttribute('position', new Float32BufferAttribute(tileData, 3))
    let [zoom, x, y] = tilePosStr.split('/').map(i=>parseInt(i));
    const texture = await createTexture(zoom, x, y, apiToken)
    const material = new MeshBasicMaterial({
      side: FrontSide,
      map: texture,
      clippingPlanes: clipPanes
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'mapbox-satellite';
    Object.assign(mesh.userData, {
      tilePosStr,
      xPoints: xSegments+1,
      yPoints: ySegments+1
    })
    return mesh;
  }
} //end class ThreeMapboxSatellite

