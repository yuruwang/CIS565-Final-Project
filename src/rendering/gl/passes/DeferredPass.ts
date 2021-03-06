import {gl} from '../../../globals';
import ShaderProgram, {Shader} from '../ShaderProgram';
import Drawable from '../Drawable';
import Square from '../../../geometry/Square';
import {vec3, vec4, mat4} from 'gl-matrix';
import Camera from '../../../Camera';

class DeferredPass extends ShaderProgram {
  screenQuad: Square; // Quadrangle onto which we draw the frame texture of the last render pass
  

  unifLightPos: WebGLUniformLocation;
  unifCamera: WebGLUniformLocation;
  unifViewInv: WebGLUniformLocation;
  unifProjInv: WebGLUniformLocation;
  unifFar: WebGLUniformLocation;
  unifEnvMap: WebGLUniformLocation;

	constructor(vertShaderSource: string, fragShaderSource: string) {
		let vertShader: Shader = new Shader(gl.VERTEX_SHADER,  vertShaderSource);	
		let fragShader: Shader = new Shader(gl.FRAGMENT_SHADER, fragShaderSource);
		super([vertShader, fragShader]);
		this.use();

		if (this.screenQuad === undefined) {
			this.screenQuad = new Square(vec3.fromValues(0, 0, 0));
			this.screenQuad.create();
    }
    
    this.unifLightPos = gl.getUniformLocation(this.prog, "u_LightPos");
    this.unifCamera = gl.getUniformLocation(this.prog, "u_Camera");
    this.unifViewInv = gl.getUniformLocation(this.prog, "u_ViewInv");
    this.unifProjInv  = gl.getUniformLocation(this.prog, "u_ProjInv");
    this.unifFar = gl.getUniformLocation(this.prog, "u_Far");

	}

    drawElement(camera: Camera, gbTargets: WebGLTexture[]) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        let view = camera.viewMatrix;
        let proj = camera.projectionMatrix;
        this.setViewMatrix(view);
        this.setProjMatrix(proj);
        this.setCamera(camera.position);
        this.setFar(camera.far);
        this.setViewInv(mat4.invert(mat4.create(), camera.viewMatrix));
        this.setProjInv(mat4.invert(mat4.create(), camera.projectionMatrix));
    
        for (let i = 0; i < gbTargets.length; i ++) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, gbTargets[i]);
        }
    
  		super.draw(this.screenQuad);
    }
    
    setLightPos(pos: vec4) {
      this.use();
      if(this.unifLightPos != -1) {
        gl.uniform4fv(this.unifLightPos, pos);
      }
    }

    setCamera(pos: vec3)
    {
      this.use();
      if(this.unifCamera != -1) {
          gl.uniform3fv(this.unifCamera, pos);
      }
    }

    setViewInv(viewInv: mat4)
    {
      this.use();
      if(this.unifViewInv != -1) {
          gl.uniformMatrix4fv(this.unifViewInv, false, viewInv);
      }
    }

    setProjInv(projInv: mat4)
    {
      this.use();
      if(this.unifProjInv != -1) {
          gl.uniformMatrix4fv(this.unifProjInv, false, projInv);
      }
    }

    setFar(far: number)
    {
      this.use();
      if(this.unifFar !== -1){
          gl.uniform1f(this.unifFar, far);
      }
    }

}

export default DeferredPass;
