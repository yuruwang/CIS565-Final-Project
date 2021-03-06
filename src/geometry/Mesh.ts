import {vec3, vec4} from 'gl-matrix';
import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';
import * as Loader from 'webgl-obj-loader';
import { Primitive, Material } from '../scene/scene';
import { Texture } from '../rendering/gl/Texture';

class Mesh extends Drawable {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  primitives: Array<Primitive>
  baseColor: vec4 // go to the first pixel
  material: Material  // go to the second pixel

  objString: string;

  constructor(objString: string, material: Material, baseColor: vec4) {
    super(); // Call the constructor of the super class. This is required.
    this.objString = objString;
    this.material = material;
    this.baseColor = baseColor;
  }

  create() {      
    let posTemp: Array<number> = [];
    let norTemp: Array<number> = [];
    let uvsTemp: Array<number> = [];
    let idxTemp: Array<number> = [];

    var loadedMesh = new Loader.Mesh(this.objString);

    //posTemp = loadedMesh.vertices;
    for (var i = 0; i < loadedMesh.vertices.length; i++) {
      posTemp.push(loadedMesh.vertices[i]);
      if (i % 3 == 2) posTemp.push(1.0);
    }

    for (var i = 0; i < loadedMesh.vertexNormals.length; i++) {
      norTemp.push(loadedMesh.vertexNormals[i]);
      if (i % 3 == 2) norTemp.push(0.0);
    }

    uvsTemp = loadedMesh.textures;
    idxTemp = loadedMesh.indices;

    // white vert color for now
    this.colors = new Float32Array(posTemp.length);
    for (var i = 0; i < posTemp.length; ++i){
      this.colors[i] = 1.0;
    }

    this.indices = new Uint32Array(idxTemp);
    this.normals = new Float32Array(norTemp);
    this.positions = new Float32Array(posTemp);
    this.uvs = new Float32Array(uvsTemp);

    this.generateIdx();
    this.generatePos();
    this.generateNor();
    this.generateUV();
    this.generateCol();

    this.count = this.indices.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUV);
    gl.bufferData(gl.ARRAY_BUFFER, this.uvs, gl.STATIC_DRAW);

    console.log(`Created Mesh from OBJ`);
    this.objString = ""; // hacky clear

    this.buildPrimitives();
  }

  buildPrimitives() {
    this.primitives = new Array<Primitive>();

    for (let primitiveID = 0; primitiveID * 3 < this.indices.length; ++primitiveID) {
      let idx0 = this.indices[primitiveID * 3 + 0];
      let idx1 = this.indices[primitiveID * 3 + 1];
      let idx2 = this.indices[primitiveID * 3 + 2];
      
      let point0 = vec4.fromValues(this.positions[idx0 * 4 + 0], 
                                    this.positions[idx0 * 4 + 1],
                                    this.positions[idx0 * 4 + 2],
                                    this.positions[idx0 * 4 + 3]);

      let point1 = vec4.fromValues(this.positions[idx1 * 4 + 0], 
                                    this.positions[idx1 * 4 + 1],
                                    this.positions[idx1 * 4 + 2],
                                    this.positions[idx1 * 4 + 3]);

      let point2 = vec4.fromValues(this.positions[idx2 * 4 + 0], 
                                    this.positions[idx2 * 4 + 1],
                                    this.positions[idx2 * 4 + 2],
                                    this.positions[idx2 * 4 + 3]);

      let primitive = new Primitive(point0, point1, point2, primitiveID);
      this.primitives.push(primitive);

    }

  }

};

export default Mesh;
