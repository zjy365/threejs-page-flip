import * as THREE from 'three';

// A cylindrical curl in a rotated fold coordinate system. The paper keeps
// its arc length; rigid rotation around the spine happens after the curl.
const deformation = /* glsl */ `
uniform float uProgress;
uniform float uBend;
uniform float uDirection;
uniform float uLift;
uniform vec2 uFold;
uniform vec2 uCurl;
uniform vec2 uRotation;
varying vec2 vPaperUv;

float paperRipple(vec2 p) {
  return (sin(p.x * 7.2 + p.y * 2.7 + 0.8) * 0.4
        + sin(p.x * 3.1 - p.y * 4.9) * 0.35
        + cos(p.x * 13.4 + p.y * 8.1) * 0.12) * 0.012;
}
vec3 paperPosition(vec2 p) {
  float x = p.x;
  float y = (p.y - 0.5) * 1.377;
  float along = x * uFold.x + y * uFold.y;
  float across = -x * uFold.y + y * uFold.x;
  float distance = max(0.0, along - uCurl.x);
  float angle = distance / max(uCurl.y, 0.001) * uBend;
  // Stable near zero, including a perfectly flat page.
  float sinc = abs(angle) < 0.0001 ? 1.0 : sin(angle) / angle;
  float versine = abs(angle) < 0.0001 ? 0.0 : (1.0 - cos(angle)) / angle;
  float curved = along - distance + distance * sinc;
  vec3 shape = vec3(curved * uFold.x - across * uFold.y,
                    curved * uFold.y + across * uFold.x,
                    -uDirection * distance * versine);
  vec3 result = vec3(shape.x * uRotation.x - shape.z * uRotation.y,
                     shape.y,
                     shape.x * uRotation.y + shape.z * uRotation.x);
  float lift = 0.039 * sin(min(x / 0.145, 1.0) * 1.5707963);
  lift -= 0.006 * smoothstep(0.145, 0.56, x);
  lift += 0.006 * smoothstep(0.56, 0.73, x);
  lift -= 0.012 * smoothstep(0.73, 1.0, x);
  result.z += (lift + paperRipple(vec2(x,y)) * smoothstep(0.0,0.35,x)
              * -cos(uProgress * 3.14159265)) * uLift;
  return result;
}
`;

export function createPaperMaterial(front, back) {
  const uniforms = {
    uProgress: { value: 0 }, uBend: { value: 0 },
    uDirection: { value: 1 }, uLift: { value: 1 },
    uFold: { value: new THREE.Vector2(1, 0) },
    uCurl: { value: new THREE.Vector2(0, 1) },
    uRotation: { value: new THREE.Vector2(1, 0) },
    uReverse: { value: back },
  };
  const material = new THREE.MeshStandardMaterial({
    map: front, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.08,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = deformation + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      vec3 center = paperPosition(uv);
      vec3 dx = paperPosition(uv + vec2(0.012,0.0)) - center;
      vec3 dy = paperPosition(uv + vec2(0.0,0.012)) - center;
      vec3 objectNormal = normalize(cross(dx,dy));
    `).replace('#include <begin_vertex>', `
      vec3 transformed = paperPosition(uv);
      vPaperUv = uv;
    `);
    shader.fragmentShader = 'uniform sampler2D uReverse;\nvarying vec2 vPaperUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 frontInk = texture2D(map, vMapUv);
      vec4 backInk = texture2D(uReverse, vec2(1.0-vPaperUv.x,vPaperUv.y));
      vec4 ink = gl_FrontFacing ? frontInk : backInk;
      vec3 throughInk = gl_FrontFacing ? backInk.rgb : frontInk.rgb;
      diffuseColor *= ink;
      diffuseColor.rgb *= mix(vec3(1.0),throughInk,0.035);
      float fiber = fract(sin(dot(vPaperUv * 1500.0,vec2(12.9898,78.233))) * 43758.5453);
      diffuseColor.rgb *= 0.98 + fiber * 0.02;
    `);
  };
  // Shadow-map vertices must use exactly the same paper surface.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = deformation + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = paperPosition(uv);');
  };
  return { material, depth, uniforms };
}
