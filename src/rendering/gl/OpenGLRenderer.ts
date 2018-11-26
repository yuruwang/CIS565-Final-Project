import {mat4, vec4, vec3, vec2} from 'gl-matrix';
import Drawable from './Drawable';
import Camera from '../../Camera';
import {gl} from '../../globals';
import ShaderProgram, {Shader} from './ShaderProgram';
import Square from '../../geometry/Square';
import Icosphere from '../../geometry/Icosphere';
import Texture, {TextureBuffer} from '../../rendering/gl/Texture';
import GBufferPass from './passes/GBufferPass';
import DeferredPass from './passes/DeferredPass';
import RaycastPass from './passes/RaycastPass';
import ShadowPass from './passes/ShadowPass';
import { debug } from 'util';
import { reverse } from 'dns';
import ReflectionPass from './passes/ReflectionPass';
import { Material } from '../../scene/scene';
import Mesh from '../../geometry/Mesh';

class OpenGLRenderer {

  lightPos: vec4 = vec4.fromValues(2.0, 10.0, 0.0, 1.0); // currently one light

  depthTexture: WebGLTexture; 

  // --------------------------------                          
  //original buffer render from g-buffer
  originalBufferFromGBuffer: WebGLFramebuffer;
  originalTargetFromGBuffer: WebGLTexture;

  // post-processing buffers post-tonemapping (8-bit color)
  // post8Buffers: WebGLFramebuffer[];
  // post8Targets: WebGLTexture[];
  // post8Passes: ShaderProgram[];

  currentTime: number; // timer number to apply to all drawing shaders

  // the shader that renders from the gbuffers into the postbuffers
  gBufferPass: GBufferPass;
  gBuffer: WebGLFramebuffer;
  gbTargets: WebGLTexture[]; 

  deferredPass: DeferredPass;

  // raytrace passes
  raycastPass: RaycastPass;
  raycastBuffer: WebGLFramebuffer;
  raycastTarget: WebGLTexture;

  // shadow pass
  shadowPass: ShadowPass;
  shadowBuffer: WebGLFramebuffer;
  shadowTarget: WebGLTexture;

  // shadow pass
  reflectionPass: ReflectionPass;
  reflectionBuffer: WebGLFramebuffer;
  reflectionTarget: WebGLTexture;

  constructor(public canvas: HTMLCanvasElement) {
    this.currentTime = 0.0;
    this.gbTargets = [undefined, undefined, undefined, undefined];  // 4 gbuffer texture for now

    // set up gBufferPass    
    this.gBufferPass = new GBufferPass(require('../../shaders/standard-vert.glsl'), 
                                      require('../../shaders/standard-frag.glsl'));

    // set up deferredPass
    this.deferredPass = new DeferredPass(require('../../shaders/screenspace-vert.glsl'), 
                                        require('../../shaders/deferred-render.glsl'));

    var gb0loc = gl.getUniformLocation(this.deferredPass.prog, "u_gb0");
    var gb1loc = gl.getUniformLocation(this.deferredPass.prog, "u_gb1");
    var gb2loc = gl.getUniformLocation(this.deferredPass.prog, "u_gb2");
    var gb3loc = gl.getUniformLocation(this.deferredPass.prog, "u_gb3");
    

    this.deferredPass.use();
    gl.uniform1i(gb0loc, 0);
    gl.uniform1i(gb1loc, 1);
    gl.uniform1i(gb2loc, 2);
    gl.uniform1i(gb3loc, 3);
    

    // set up raycast pass
    this.raycastPass = new RaycastPass(require('../../shaders/screenspace-vert.glsl'),
    require('../../shaders/raycast.frag.glsl'));

    // set up shadow pass
    this.shadowPass = new ShadowPass(require('../../shaders/screenspace-vert.glsl'),
    require('../../shaders/shadow.frag.glsl'));

    this.shadowPass.unifPos = gl.getUniformLocation(this.shadowPass.prog, "u_Pos");
    this.shadowPass.unifNor = gl.getUniformLocation(this.shadowPass.prog, "u_Nor");
    this.shadowPass.unifSceneInfo = gl.getUniformLocation(this.shadowPass.prog, "u_SceneInfo");
    this.shadowPass.unifAlbedo = gl.getUniformLocation(this.shadowPass.prog, "u_Albedo");

    this.shadowPass.use();
    gl.uniform1i(this.shadowPass.unifPos, 0);
    gl.uniform1i(this.shadowPass.unifNor, 1);
    gl.uniform1i(this.shadowPass.unifAlbedo, 2);
    gl.uniform1i(this.shadowPass.unifSceneInfo, 3);

    // set up reflection pass
    this.reflectionPass = new ReflectionPass(require('../../shaders/screenspace-vert.glsl'),
                                              require('../../shaders/reflection-frag.glsl'));

    this.reflectionPass.unifPos = gl.getUniformLocation(this.reflectionPass.prog, "u_Pos");
    this.reflectionPass.unifNor = gl.getUniformLocation(this.reflectionPass.prog, "u_Nor");
    this.reflectionPass.unifAlbedo = gl.getUniformLocation(this.reflectionPass.prog, "u_Albedo");  
    this.reflectionPass.unifMaterial = gl.getUniformLocation(this.reflectionPass.prog, "u_Material");          
    this.reflectionPass.unifSceneInfo = gl.getUniformLocation(this.reflectionPass.prog, "u_SceneInfo");

    this.reflectionPass.use();
    gl.uniform1i(this.reflectionPass.unifPos, 0);
    gl.uniform1i(this.reflectionPass.unifNor, 1);
    gl.uniform1i(this.reflectionPass.unifAlbedo, 2);
    gl.uniform1i(this.reflectionPass.unifMaterial, 3);    
    gl.uniform1i(this.reflectionPass.unifSceneInfo, 4);
    

    if (!gl.getExtension("OES_texture_float_linear")) {
      console.error("OES_texture_float_linear not available");
    }

    if (!gl.getExtension("EXT_color_buffer_float")) {
      console.error("FLOAT color buffer not available");
    }
  }


  setClearColor(r: number, g: number, b: number, a: number) {
    gl.clearColor(r, g, b, a);
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;

    this.deferredPass.setWidth(width);
    this.deferredPass.setHeight(height);
    this.deferredPass.setLightPos(this.lightPos);

    // --- GBUFFER CREATION START ---
    this.gBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);

    for (let i = 0; i < this.gbTargets.length; i ++) {
      this.gbTargets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // currently changed to 32-bit float
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, this.gbTargets[i], 0);
    }

    // depth attachment
    this.depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);

    var FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use FBO[0]\n");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // create the framebuffers for post processing
    // --------------------------------                          
    //origin buffer and texture from g-buffer
    this.originalBufferFromGBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.originalBufferFromGBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    this.originalTargetFromGBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.originalTargetFromGBuffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.originalTargetFromGBuffer, 0);

    FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
      console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //------------------------------------------------------------bind ray trace passes------------------------------------------------------------------
    // ray cast pass
    this.raycastBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.raycastBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    this.raycastTarget = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.raycastTarget);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.raycastTarget, 0);

    FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
      console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // direct shadow
    this.shadowBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    this.shadowTarget = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTarget);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTarget, 0);

    // reflection
    this.reflectionBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflectionBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    this.reflectionTarget = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.reflectionTarget);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.reflectionTarget, 0);


    FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
      console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }


  updateTime(deltaTime: number, currentTime: number) {
    this.currentTime = currentTime;
    this.shadowPass.setTime(this.currentTime);
    this.deferredPass.setTime(this.currentTime);
  }


  clear() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }


  clearGB() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }


  renderToGBuffer(camera: Camera, meshes: Array<Mesh>, textureSets: Array<Map<string, Texture>>) {    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);   

    for (let i = 0; i < meshes.length; ++i) {
      // setup textures 
      let textureSet = textureSets[i];
      if (textureSet) {
        let j = 0;
        for (let [name, tex] of textureSet) {
          this.gBufferPass.setupTexUnits([name]);
          this.gBufferPass.bindTexToUnit(name, tex, j);
          j++;
        }
        this.gBufferPass.setUseTexture(1);
      
      } else {
        this.gBufferPass.setGeometryColor(meshes[i].baseColor);
        this.gBufferPass.setUseTexture(0);
      }

      this.gBufferPass.setMaterial(meshes[i].material.specular, 
                                  meshes[i].material.diffuse, 
                                  meshes[i].material.refraction, 
                                  meshes[i].material.emittance);

      this.gBufferPass.drawElements(camera, [meshes[i]]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  renderFromGBuffer(camera: Camera) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.originalBufferFromGBuffer);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null); // output to screen
    this.deferredPass.drawElement(camera, this.gbTargets);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  rayCast(camera: Camera) {
    //gl.bindFramebuffer(gl.FRAMEBUFFER, this.raycastTarget);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.raycastPass.drawElement(camera, this.canvas);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  shadowStage(camera: Camera, sceneInfo: TextureBuffer[], triangleCount: number)
  {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let textures: WebGLTexture[] = [];
    textures.push(this.gbTargets[1]);
    textures.push(this.gbTargets[0]);
    textures.push(this.originalTargetFromGBuffer);
    for(let i = 0; i < sceneInfo.length; i++) {
      textures.push(sceneInfo[i].texture);
    }

    this.shadowPass.setViewMatrix(camera.viewMatrix);

    this.shadowPass.drawElement(camera, textures, triangleCount, this.lightPos, this.canvas, sceneInfo[0]._width, sceneInfo[0]._height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }

  reflectionStage(camera: Camera, sceneInfo: TextureBuffer[], triangleCount: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let textures: WebGLTexture[] = [];
    textures.push(this.gbTargets[1]);
    textures.push(this.gbTargets[0]);
    textures.push(this.originalTargetFromGBuffer);
    textures.push(this.gbTargets[3]);
    
    for(let i = 0; i < sceneInfo.length; i++) {
      textures.push(sceneInfo[i].texture);
    }

    this.reflectionPass.setViewMatrix(camera.viewMatrix);

    this.reflectionPass.drawElement(camera, textures, triangleCount, this.lightPos, this.canvas, sceneInfo[0]._width, sceneInfo[0]._height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }

};

export default OpenGLRenderer;
