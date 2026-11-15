// Pure GPU rendering of the nt model: instanced 3D boxes (directional lighting + fog) and textured sprites
// (glyphs and icons from a single RGBA atlas), in world space (billboards) or screen space. No vertex buffer.

struct Cam {
  vp: mat4x4f,
  eye: vec4f,       // xyz: camera position
  right: vec4f,     // xyz: camera right axis (billboards)
  up: vec4f,        // xyz: camera up axis
  screen: vec4f,    // largeur, hauteur (px), 1/largeur, 1/hauteur
};
@group(0) @binding(0) var<uniform> cam: Cam;

// --- Boxes ---------------------------------------------------------------------------------------------------------
struct Box { pos: vec4f, size: vec4f, color: vec4f };   // pos.xyz = base center; size.xyz; color rgba
@group(0) @binding(1) var<storage, read> boxes: array<Box>;

struct BoxOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) n: vec3f,
  @location(2) world: vec3f,
};

// 6 faces x 2 triangles; corners in [0,1]^3.
const FACE_N = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
const QUAD = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));

fn corner(face: u32, uv: vec2f) -> vec3f {
  switch face {
    case 0u: { return vec3f(1.0, uv.x, uv.y); }
    case 1u: { return vec3f(0.0, uv.y, uv.x); }
    case 2u: { return vec3f(uv.y, 1.0, uv.x); }
    case 3u: { return vec3f(uv.x, 0.0, uv.y); }
    case 4u: { return vec3f(uv.y, uv.x, 1.0); }
    default: { return vec3f(uv.x, uv.y, 0.0); }
  }
}

@vertex
fn vs_box(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> BoxOut {
  let b = boxes[i];
  let face = v / 6u;
  let c = corner(face, QUAD[v % 6u]);
  let p = b.pos.xyz + (c - vec3f(0.5, 0.0, 0.5)) * b.size.xyz;
  var o: BoxOut;
  o.pos = cam.vp * vec4f(p, 1.0);
  o.color = b.color;
  o.n = FACE_N[face];
  o.world = p;
  return o;
}

@fragment
fn fs_box(in: BoxOut) -> @location(0) vec4f {
  let l = normalize(vec3f(0.35, 1.0, 0.45));
  let diff = max(dot(in.n, l), 0.0);
  let sky = 0.5 + 0.5 * in.n.y;
  var rgb = in.color.rgb * (0.28 + 0.62 * diff + 0.22 * sky);
  // Edges: slight emission on the top faces, exponential fog with distance.
  let d = distance(cam.eye.xyz, in.world);
  let fog = 1.0 - exp(-d * 0.0022);
  rgb = mix(rgb, vec3f(0.02, 0.027, 0.043), clamp(fog, 0.0, 0.85));
  return vec4f(rgb, in.color.a);
}

// --- Sprites (glyphs, icons) -----------------------------------------------------------------------------------------
struct Sprite {
  pos: vec4f,     // xyz world (w = 0) or x, y screen pixels (w = 1)
  size: vec4f,    // width, height (px), x, y offset (px) from the anchor
  uv: vec4f,      // u0, v0, u1, v1 in the atlas
  color: vec4f,
};
@group(0) @binding(2) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(3) var atlas: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

struct SpriteOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};

@vertex
fn vs_sprite(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SpriteOut {
  let s = sprites[i];
  let q = QUAD[v];
  let px = s.size.zw + vec2f(q.x, 1.0 - q.y) * s.size.xy;   // pixels relative to the anchor, y downward
  var o: SpriteOut;
  if (s.pos.w > 0.5) {
    let p = s.pos.xy + px;
    o.pos = vec4f(p.x * 2.0 * cam.screen.z - 1.0, 1.0 - p.y * 2.0 * cam.screen.w, 0.0, 1.0);
  } else {
    let c = cam.vp * vec4f(s.pos.xyz, 1.0);
    o.pos = vec4f(c.xy + vec2f(px.x, -px.y) * 2.0 * cam.screen.zw * c.w, c.z, c.w);
  }
  o.uv = mix(s.uv.xy, s.uv.zw, vec2f(q.x, 1.0 - q.y));
  o.color = s.color;
  return o;
}

@fragment
fn fs_sprite(in: SpriteOut) -> @location(0) vec4f {
  let t = textureSample(atlas, samp, in.uv);
  let c = t * in.color;
  if (c.a < 0.02) { discard; }
  return vec4f(c.rgb * c.a, c.a);
}
