
  uniform float uBrightness;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);
    if (distanceToCenter > 0.5) {
      discard;
    }

    float core = 1.0 - smoothstep(0.0, 0.16, distanceToCenter);
    float feather = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);
    float ring = smoothstep(0.28, 0.2, abs(distanceToCenter - 0.27));
    vec3 color = vColor
      * (0.42 + core * 0.85 + ring * vCore * 0.3)
      * max(uBrightness, 0.0);
    float alpha = vAlpha * feather * (0.72 + core * 0.28);
    gl_FragColor = vec4(color, alpha);
  }
