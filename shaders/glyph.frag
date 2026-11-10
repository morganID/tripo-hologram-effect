
  #define GLYPH_COUNT 36

  uniform sampler2D uGlyphMap;
  uniform sampler2D uMaskMap;
  uniform vec2 uResolution;
  uniform vec2 uMaskTexel;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOpacity;
  uniform float uReveal;
  uniform float uVisibility;

  varying vec2 vUv;
  varying vec2 vCharUv;
  varying vec4 vRands;
  varying float vOpacity;
  varying float vViewDepth;
  varying float vSideProgress;
  varying float vDissolve;
  varying float vEmerge;

  // 涌现与排空前沿的软化宽度（占列高比例）。
  const float COLUMN_SOFTNESS = 0.12;

  vec4 hash43(vec3 point) {
    vec4 point4 = fract(vec4(point.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    point4 += dot(point4, point4.wzxy + 33.33);
    return fract((point4.xxyz + point4.yzzw) * point4.zywx);
  }

  float sampleMask(vec2 uv) {
    return texture2D(uMaskMap, clamp(uv, vec2(0.0), vec2(1.0))).r;
  }

  float sampleGlyph(float glyphIndex, vec2 glyphUv) {
    vec2 atlasUv = vec2((glyphUv.x + glyphIndex) / GLYPH_COUNT, glyphUv.y);
    vec4 glyphSample = texture2D(uGlyphMap, atlasUv);
    return max(glyphSample.r, glyphSample.a);
  }

  void main() {
    float baseCharacter = floor(mod(vCharUv.y, GLYPH_COUNT));
    float characterTime = uTime * uSpeed * 0.55 * mix(
      1.0,
      2.0,
      vRands.y + hash43(vec3(baseCharacter, -100.0, vRands.z)).x
    );
    vec4 characterRands = hash43(vec3(baseCharacter, vRands.w, floor(characterTime * -2.0)));
    float glyphIndex = mod(baseCharacter + floor(characterRands.x * GLYPH_COUNT), GLYPH_COUNT);
    vec2 glyphUv = vec2(vCharUv.x, fract(vCharUv.y));
    float glyph = sampleGlyph(glyphIndex, glyphUv);
    if (glyph < 0.02) discard;

    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float mask = sampleMask(screenUv);
    float maskLeft = sampleMask(screenUv - vec2(uMaskTexel.x, 0.0));
    float maskRight = sampleMask(screenUv + vec2(uMaskTexel.x, 0.0));
    float maskDown = sampleMask(screenUv - vec2(0.0, uMaskTexel.y));
    float maskUp = sampleMask(screenUv + vec2(0.0, uMaskTexel.y));
    float body = smoothstep(0.08, 0.72, mask);
    float edge = clamp(
      max(
        max(abs(mask - maskLeft), abs(mask - maskRight)),
        max(abs(mask - maskDown), abs(mask - maskUp))
      ) * 4.5,
      0.0,
      1.0
    );

    float revealActive = 1.0 - step(0.999, uReveal);
    float revealCut = 1.0 - smoothstep(uReveal - 0.055, uReveal + 0.02, screenUv.y);
    float revealedBody = body * mix(1.0, revealCut, revealActive);
    float scanLine = exp(-abs(screenUv.y - uReveal) * 105.0) * body * revealActive;
    edge *= revealedBody;

    float columnFade = 1.0 - smoothstep(0.35, 0.5, abs(vUv.y - 0.5));
    float movingWindow = smoothstep(100.0, 150.0, mod(vCharUv.y - 200.0 * vRands.y, 200.0));
    float characterBrightness = characterRands.w * characterRands.y;
    float depthFade = exp(-0.014 * vViewDepth * vViewDepth);
    float field = 0.22 + revealedBody * 0.88 + edge * 0.42 + scanLine * 1.25;
    float proximityFade = mix(0.12, 1.0, smoothstep(0.04, 0.62, vSideProgress));
    float columnStrength = vOpacity * (0.3 + vRands.z * 1.25);
    float energy = glyph * characterBrightness * columnStrength;
    // 逐列一次性涌现与消散：两道前沿都自列顶向下推进，与字符下落方向一致。
    // 涌现保留前沿之上（字符自顶部注入），消散保留前沿之下（顶部停止补充，余下字符流尽）。
    float emergeCut = mix(1.0 + COLUMN_SOFTNESS, -COLUMN_SOFTNESS, vEmerge);
    float appear = smoothstep(emergeCut, emergeCut + COLUMN_SOFTNESS, vUv.y);
    float drainCut = mix(1.0 + COLUMN_SOFTNESS, 0.0, vDissolve);
    float drain = 1.0 - smoothstep(drainCut - COLUMN_SOFTNESS, drainCut, vUv.y);
    energy *= columnFade * movingWindow * depthFade * field * proximityFade * appear * drain;
    energy *= uOpacity * max(uVisibility, 0.0);

    float accentEnergy = energy * clamp(edge * 0.85 + scanLine, 0.0, 1.0) * 3.0;
    gl_FragColor = vec4(energy, accentEnergy, 0.0, 1.0);
  }
