import {  Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial, 
          Plane, PlaneGeometry, Vector3 } from 'three';
import {  addSeams, convertToXYZ, createTexture, getBBoxFromOrigin, getBBoxTilePos, 
          getElevationsFromTile,  
          } from './geo_helper';

const ELEVATION_DIM = 512;
const MAX_TILES = 32;

export default class ThreeMapboxSatellite {
  constructor(olat, olon, zoom, radius, { clip=false, render_box_size=1, api_token='***' }={}) {
    //stor input for debugging
    this.origin_lat = olat;
    this.origin_lon = olon
    this.radius = radius;
    this.zoom = zoom;
    this.options = { 
      clip,
      render_box_size,
      api_token
    }
    this.bbox = getBBoxFromOrigin(olat, olon, radius);
    console.log("bbox ll", this.bbox)
    this.units_per_meter = render_box_size / (radius * 1000 * Math.sqrt(2));
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
      units_per_meter: this.units_per_meter,
      bbox: this.bbox,
      lonLat2XY: this.lonLat2XY,
      xy2LonLat: this.xy2LonLat
    }
  }

  async renderSatellite() {
    const tile_pos_a = getBBoxTilePos(this.bbox, this.zoom)
    console.log('bbox tilepos ', tile_pos_a)
    if(tile_pos_a.length > MAX_TILES) throw new Error('Too many tiles requested. Try reducing radius!')
    if(tile_pos_a.length == 0) throw new Error('No tiles found!')
    let tile_a = await Promise.all(tile_pos_a.map(tile_pos_str=>this.getTileData(tile_pos_str)));
    return await this.renderAllTiles(tile_a)
  }

  async getTileData(tile_pos_str) {
    let [zoom, tile_x, tile_y] = tile_pos_str.split('/').map(i=>parseInt(i));
    const tile_elevations = await getElevationsFromTile(zoom, tile_x, tile_y, this.options.api_token)
    const tile_data = convertToXYZ(tile_pos_str, tile_elevations, { elevation_dim: ELEVATION_DIM, 
                                                                    units_per_meter: this.units_per_meter, 
                                                                    lonLat2XY: this.lonLat2XY 
                                                                  })
    return { tile_data, tile_pos_str, x_segments: ELEVATION_DIM-1, 
                  y_segments: ELEVATION_DIM-1, elevation_dim: ELEVATION_DIM 
                };
  }

  async renderAllTiles(tile_a) {
    const { clip, render_box_size, api_token } = this.options; 
    const clip_panes = clip ? [
      new Plane(new Vector3(1,0,0), 0.5 * render_box_size),
      new Plane(new Vector3(-1,0,0), 0.5 * render_box_size),
      new Plane(new Vector3(0,1,0), 0.5 * render_box_size),
      new Plane(new Vector3(0,-1,0), 0.5 * render_box_size),
    ] : [];
    
    tile_a.sort((t1, t2)=>t1.tile_pos_str.localeCompare(t2.tile_pos_str));
    if(tile_a.length > 1) addSeams(tile_a);   //if single tile no need to add seam
    const mesh_a = await Promise.all(tile_a.map(t=>this.renderTile({ ...t, clip_panes, api_token })));
    const group = new Group();
    group.name = 'mapbox-satellite-group'
    group.add(...mesh_a);
    return group;
  }
  
  async renderTile({ tile_pos_str, tile_data, x_segments, y_segments, clip_panes, api_token }) {
    const geometry = new PlaneGeometry(1, 1, x_segments, y_segments);
    geometry.setAttribute('position', new Float32BufferAttribute(tile_data, 3))
    let [zoom, x, y] = tile_pos_str.split('/').map(i=>parseInt(i));
    const texture = await createTexture(zoom, x, y, api_token)
    const material = new MeshBasicMaterial({
      side: FrontSide,
      map: texture,
      clippingPlanes: clip_panes
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'mapbox-satellite';
    Object.assign(mesh.userData, {
      tile_pos_str
    })
    return mesh;
  }
} //end class ThreeMapboxSatellite

