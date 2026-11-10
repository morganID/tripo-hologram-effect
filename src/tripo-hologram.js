// Tripo3D hologram — faithful port of the original 5-layer effect.
// Big shaders (surface/points/glyph) are injected above by the build step.
import * as THREE from 'three';

const VERT = `
  float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  vec2 sampleGlitch(float sliceId, float timeBlock, float gateThreshold) {
    float sliceSeed = sliceId * 17.0 + timeBlock * 41.0;
    float gate = smoothstep(
      gateThreshold - 0.025,
      gateThreshold + 0.025,
      hash11(sliceSeed)
    );
    float offset = hash11(sliceSeed + 73.0) * 2.0 - 1.0;
    return vec2(gate, offset);
  }

  // 生成短促且平滑的故障脉冲。
  float glitchBurst(float time, float interval, float duration) {
    float safeInterval = max(interval, 0.0001);
    float span = max(duration, 0.0001);
    if (span >= safeInterval) {
      return 1.0;
    }
    float cycle = time / safeInterval;
    float startJitter = hash11(floor(cycle) * 7.31 + 3.7) * max(safeInterval - span, 0.0);
    float local = fract(cycle) * safeInterval - startJitter;
    float ramp = min(span * 0.4, 0.05);
    return smoothstep(0.0, ramp, local) * (1.0 - smoothstep(span - ramp, span, local));
  }


  uniform float uTime;
  uniform float uEffectMix;
  uniform float uGlitchBurstDuration;
  uniform float uGlitchFrequency;
  uniform float uGlitchIntensity;
  uniform float uGlitchInterval;
  uniform float uGlitchOffset;
  uniform float uGlitchSliceCount;
  uniform float uGlitchSpeed;
  uniform mat4 uWorldToModel;
  uniform vec3 uModelBoundsMin;
  uniform vec3 uModelBoundsMax;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vModelNormal;
  varying vec3 vWorldPosition;
  varying vec3 vModelPosition;
  varying vec2 vUv;
  varying float vGlitch;

  #include <common>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  

  void main() {
    vUv = uv;

    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>

    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vec3 modelPosition = (uWorldToModel * worldPosition).xyz;
    float modelHeight = max(uModelBoundsMax.y - uModelBoundsMin.y, 0.0001);
    float normalizedY = clamp((modelPosition.y - uModelBoundsMin.y) / modelHeight, 0.0, 1.0);

    float sliceCount = max(uGlitchSliceCount, 1.0);
    float slicePosition = normalizedY * sliceCount;
    float sliceId = floor(slicePosition);
    float slicePhase = fract(slicePosition);
    float sliceFeather = smoothstep(0.0, 0.14, slicePhase)
      * (1.0 - smoothstep(0.86, 1.0, slicePhase));
    float timeValue = uTime * max(uGlitchSpeed, 0.0);
    float timeBlock = floor(timeValue);
    float timeBlend = smoothstep(0.0, 1.0, fract(timeValue));
    float gateThreshold = 1.0 - clamp(uGlitchFrequency, 0.0, 1.0);
    vec2 currentGlitch = sampleGlitch(sliceId, timeBlock, gateThreshold);
    vec2 nextGlitch = sampleGlitch(sliceId, timeBlock + 1.0, gateThreshold);
    vec2 glitchState = mix(currentGlitch, nextGlitch, timeBlend);
    float offsetNoise = glitchState.y;
    float burst = glitchBurst(uTime, uGlitchInterval, uGlitchBurstDuration);
    float glitchGate = glitchState.x * sliceFeather * burst * uGlitchIntensity * uEffectMix;

    vec4 mvPosition = viewMatrix * worldPosition;
    float depthScale = clamp(-mvPosition.z * 0.018, 0.35, 1.25);
    mvPosition.x += offsetNoise * 0.5 * glitchGate * uGlitchOffset * depthScale;

    vNormal = transformedNormal;
    // 三平面网格的法线与坐标必须保持在模型空间。
    vModelNormal = mat3(uWorldToModel) * mat3(modelMatrix) * objectNormal;
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = worldPosition.xyz;
    vModelPosition = modelPosition;
    vGlitch = glitchGate;

    gl_Position = projectionMatrix * mvPosition;
  }
`;
const FRAG = `
  uniform vec3 uBaseColor;
  uniform vec3 uSourceColor;
  uniform sampler2D uBaseMap;
  uniform bool uHasMap;
  uniform sampler2D uMatcap;
  uniform bool uHasMatcap;
  uniform vec3 uGlowColor;
  uniform vec3 uAccentColor;
  uniform vec3 uScanlineColor;
  uniform float uTime;
  uniform float uScanlineSpeed;
  uniform float uScanlineWidth;
  uniform float uScanlineDensity;
  uniform float uScanlineIntensity;
  uniform float uGlowIntensity;
  uniform float uFresnelPower;
  uniform float uEdgeGridFalloff;
  uniform float uEdgeGridIntensity;
  uniform float uEdgeGridScale;
  uniform float uEdgeGridWidth;
  uniform float uHologramAlpha;
  uniform float uSourceOpacity;
  uniform float uEffectMix;
  uniform float uGlitchFrequency;
  uniform float uGlitchIntensity;
  uniform float uGlitchSpeed;
  uniform float uPulseIntensity;
  uniform float uRevealComplete;
  uniform float uRevealProgress;
  uniform float uRevealWidth;
  uniform float uRetainBrightness;
  uniform float uRetainMix;
  uniform vec3 uModelBoundsMin;
  uniform vec3 uModelBoundsMax;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vModelNormal;
  varying vec3 vWorldPosition;
  varying vec3 vModelPosition;
  varying vec2 vUv;
  varying float vGlitch;

  float hash21(vec2 value) {
    vec3 p3 = fract(vec3(value.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float fresnel(vec3 viewDirection, vec3 normal, float power) {
    float facing = clamp(dot(viewDirection, normal), 0.0, 1.0);
    return pow(max(1.0 - facing, 0.001), power);
  }

  // 计算抗锯齿网格轴。
  float gridAxis(float coordinate, float width) {
    float cell = abs(fract(coordinate - 0.5) - 0.5);
    float derivative = max(fwidth(coordinate), 0.00001);
    float halfWidth = width * 0.5;
    float band = max(halfWidth, derivative);
    float line = 1.0 - smoothstep(band - derivative, band + derivative, cell);
    return line * min(1.0, halfWidth / band);
  }

  float gridPlane(vec2 coordinate, float width) {
    return max(gridAxis(coordinate.x, width), gridAxis(coordinate.y, width));
  }

  // 按模型法线融合三平面网格。
  float modelGrid(vec3 modelPosition, vec3 modelNormal, float scale, float width) {
    vec3 coordinate = modelPosition * scale;
    vec3 weight = modelNormal * modelNormal;
    weight /= max(weight.x + weight.y + weight.z, 0.0001);
    return gridPlane(coordinate.yz, width) * weight.x
      + gridPlane(coordinate.xz, width) * weight.y
      + gridPlane(coordinate.xy, width) * weight.z;
  }

  vec3 compressHighlightEnergy(vec3 color) {
    vec3 positiveColor = max(color, vec3(0.0));
    float luminance = dot(positiveColor, vec3(0.2126, 0.7152, 0.0722));
    float knee = 0.72;
    float ceiling = 1.05;
    float shoulderRange = ceiling - knee;
    float compressedLuminance = luminance <= knee
      ? luminance
      : knee + shoulderRange * (1.0 - exp(-(luminance - knee) / shoulderRange));
    return positiveColor * (compressedLuminance / max(luminance, 0.0001));
  }

  void main() {
    vec3 viewDirection = normalize(vViewPosition);
    vec3 viewNormalDerivative = cross(dFdx(vViewPosition), dFdy(vViewPosition));
    float derivativeNormalLength = dot(viewNormalDerivative, viewNormalDerivative);
    vec3 fallbackNormal = viewNormalDerivative * inversesqrt(max(derivativeNormalLength, 0.00000001));
    float vertexNormalLength = dot(vNormal, vNormal);
    vec3 normal = vertexNormalLength > 0.00000001
      ? vNormal * inversesqrt(vertexNormalLength)
      : fallbackNormal;
    if (!gl_FrontFacing) {
      normal *= -1.0;
      fallbackNormal *= -1.0;
    }
    // 导数法线代表几何实际朝向；顶点法线翻转时，菲涅尔会恒亮并导致局部过曝。
    // 仅替换与几何法线相反的异常法线，正常平滑法线仍保留原有细节。
    if (vertexNormalLength > 0.00000001 && derivativeNormalLength > 0.00000001 && dot(normal, fallbackNormal) < 0.0) {
      normal = fallbackNormal;
    }

    vec3 boundsSize = max(uModelBoundsMax - uModelBoundsMin, vec3(0.0001));
    vec3 normalizedPosition = clamp((vModelPosition - uModelBoundsMin) / boundsSize, 0.0, 1.0);
    float yPercent = normalizedPosition.y;

    // 重建前沿使用低频噪声打散边界。
    float completionFade = smoothstep(
      1.0 - uRevealWidth * 0.8,
      1.0 + uRevealWidth,
      uRevealProgress
    );
    float revealNoise = (hash21(floor(normalizedPosition.xz * 26.0)) - 0.5)
      * (1.0 - completionFade);
    float revealFront = uRevealProgress + revealNoise * uRevealWidth * 0.55;
    float surfaceMask = smoothstep(revealFront, revealFront - uRevealWidth, yPercent);
    float effectMix = clamp(uEffectMix, 0.0, 1.0);
    if (surfaceMask <= 0.001) {
      discard;
    }
    float completionBand = 1.0 - smoothstep(
      1.0,
      1.0 + uRevealWidth,
      uRevealProgress
    );
    float revealEdge = (1.0 - smoothstep(0.0, uRevealWidth * 2.4, revealFront - yPercent))
      * completionBand;

    vec4 textureSample = vec4(1.0);
    if (uHasMap) {
      textureSample = texture2D(uBaseMap, vUv);
    }

    vec3 sourceColor = uSourceColor * textureSample.rgb;
    float sourceAlpha = uSourceOpacity * textureSample.a;
    vec3 baseColor = uBaseColor * textureSample.rgb;
    if (!uHasMap && uHasMatcap) {
      vec2 matcapUv = normal.xy * 0.5 + 0.5;
      baseColor *= texture2D(uMatcap, matcapUv).rgb;
    }

    vec3 lightDirection = normalize(vec3(-0.35, 0.72, 0.58));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float backLight = pow(max(dot(-normal, lightDirection), 0.0), 2.0);

    float rim = fresnel(viewDirection, normal, uFresnelPower);
    float sharpRim = fresnel(viewDirection, normal, uFresnelPower * 2.8 + 0.5);

    // 将技术网格限制在轮廓区域。
    float grazing = 1.0 - abs(dot(normal, viewDirection));
    float edgeMask = pow(smoothstep(0.0, 1.0, grazing), max(uEdgeGridFalloff, 0.05));
    float modelNormalLength = dot(vModelNormal, vModelNormal);
    vec3 modelNormal = modelNormalLength > 0.00000001
      ? vModelNormal * inversesqrt(modelNormalLength)
      : vec3(0.0, 1.0, 0.0);
    float grid = modelGrid(vModelPosition, modelNormal, uEdgeGridScale, uEdgeGridWidth)
      * edgeMask
      * uEdgeGridIntensity;

    float sweepPosition = fract(uTime * uScanlineSpeed * 0.12);
    float sweepDistance = abs(fract(yPercent - sweepPosition + 0.5) - 0.5);
    float scanBeam = exp(-sweepDistance * (75.0 / max(uScanlineWidth, 0.05)));
    float scanHalo = exp(-sweepDistance * 14.0);
    float scanTailDistance = fract(sweepPosition - yPercent + 1.0);
    float scanTail = (1.0 - smoothstep(0.0, 0.28, scanTailDistance)) * step(0.002, scanTailDistance);

    float microScan = 0.5 + 0.5 * sin((yPercent * uScanlineDensity - uTime * uScanlineSpeed * 2.0) * 6.2831853);
    microScan = pow(microScan, 15.0);
    // uRevealComplete 由材质侧平滑推满，直接作为周期扫描的淡入系数。
    float periodicScanEnabled = clamp(uRevealComplete, 0.0, 1.0);
    scanBeam *= periodicScanEnabled;
    scanHalo *= periodicScanEnabled;
    scanTail *= periodicScanEnabled;
    microScan *= periodicScanEnabled;

    float widthCompensation = inversesqrt(max(uScanlineWidth, 0.05));
    float scanGain = uScanlineIntensity * widthCompensation;

    float breathing = 0.72 + 0.28 * sin(uTime * 1.35 + normalizedPosition.x * 5.0 + normalizedPosition.z * 3.0);
    float pulse = mix(1.0, breathing, uPulseIntensity);

    vec3 shadedBase = baseColor * (0.055 + diffuse * 0.28 + backLight * 0.08);
    vec3 cyanEnergy = uGlowColor * (
      rim * uGlowIntensity * 1.25
      + sharpRim * uGlowIntensity * 0.95
      + microScan * 0.22 * scanGain
      + grid * 1.15
    );
    vec3 scanEnergy = uScanlineColor * (
      scanBeam * 2.05 * scanGain
      + scanHalo * 0.32 * scanGain
      + scanTail * 0.18 * scanGain
    );
    vec3 accentEnergy = uAccentColor * (
      scanBeam * 0.72 * scanGain
      + sharpRim * 0.14
      + vGlitch * 0.55
    );

    vec3 effectColor = shadedBase + (cyanEnergy + scanEnergy + accentEnergy) * pulse;
    effectColor += uGlowColor * (0.025 + scanTail * 0.06 * scanGain);
    effectColor += mix(uGlowColor, uAccentColor, 0.35) * revealEdge * 1.15;
    effectColor = compressHighlightEnergy(effectColor);

    float baseAlpha = uHologramAlpha * (0.28 + diffuse * 0.16 + rim * 0.42);
    float detailAlpha = microScan * 0.08 + grid * 0.3;
    float effectAlpha = clamp(baseAlpha + detailAlpha + scanBeam * 0.52 + vGlitch * 0.12, 0.04, 1.0);
    vec3 finalColor = mix(sourceColor, effectColor, effectMix);
    // 颜色保留层：模型自身颜色按 uRetainBrightness 提亮后，按 uRetainMix 保留到最终
    // 颜色，不走 effectMix 通道。有贴图时直接取贴图原色，不再经 uSourceColor 压暗，
    // 解决模型自身贴图偏暗、特效下与背景无法区分的问题。
    vec3 ownColor = uHasMap ? textureSample.rgb : sourceColor;
    finalColor = mix(finalColor, ownColor * uRetainBrightness, clamp(uRetainMix, 0.0, 1.0));
    float alpha = mix(sourceAlpha, effectAlpha, effectMix) * surfaceMask;
    float bloomFeature = clamp(
      scanBeam
      + revealEdge * 0.85
      + sharpRim * 0.35
      + grid * 0.5,
      0.0,
      1.0
    );
    float contributionCeiling = mix(0.24, 0.72, bloomFeature);
    float blendedLuminance = dot(finalColor, vec3(0.2126, 0.7152, 0.0722)) * alpha;
    float contributionScale = min(1.0, contributionCeiling / max(blendedLuminance, 0.0001));
    alpha *= mix(1.0, contributionScale, effectMix);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
const PVERT = `
  float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  vec2 sampleGlitch(float sliceId, float timeBlock, float gateThreshold) {
    float sliceSeed = sliceId * 17.0 + timeBlock * 41.0;
    float gate = smoothstep(
      gateThreshold - 0.025,
      gateThreshold + 0.025,
      hash11(sliceSeed)
    );
    float offset = hash11(sliceSeed + 73.0) * 2.0 - 1.0;
    return vec2(gate, offset);
  }

  // 生成短促且平滑的故障脉冲。
  float glitchBurst(float time, float interval, float duration) {
    float safeInterval = max(interval, 0.0001);
    float span = max(duration, 0.0001);
    if (span >= safeInterval) {
      return 1.0;
    }
    float cycle = time / safeInterval;
    float startJitter = hash11(floor(cycle) * 7.31 + 3.7) * max(safeInterval - span, 0.0);
    float local = fract(cycle) * safeInterval - startJitter;
    float ramp = min(span * 0.4, 0.05);
    return smoothstep(0.0, ramp, local) * (1.0 - smoothstep(span - ramp, span, local));
  }


  uniform float uTime;
  uniform float uEffectMix;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uScanlineSpeed;
  uniform float uScanlineIntensity;
  uniform float uGlitchBurstDuration;
  uniform float uGlitchFrequency;
  uniform float uGlitchIntensity;
  uniform float uGlitchInterval;
  uniform float uGlitchOffset;
  uniform float uGlitchSliceCount;
  uniform float uGlitchSpeed;
  uniform float uRevealProgress;
  uniform float uRevealWidth;
  uniform float uWaveAmplitude;
  uniform mat4 uWorldToModel;
  uniform vec3 uModelBoundsMin;
  uniform vec3 uModelBoundsMax;
  uniform vec3 uGlowColor;
  uniform vec3 uAccentColor;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;

  // 用于粒子面积补偿的参考值。
  const float REFERENCE_POINT_AREA = 9.0;

  

  void main() {
    vec3 basePosition = position;
    vec3 baseModel = (uWorldToModel * modelMatrix * vec4(basePosition, 1.0)).xyz;
    float modelHeight = max(uModelBoundsMax.y - uModelBoundsMin.y, 0.0001);
    float yPercent = clamp((baseModel.y - uModelBoundsMin.y) / modelHeight, 0.0, 1.0);

    float pointId = basePosition.x * 17.0 + basePosition.y * 43.0 + basePosition.z * 71.0;
    float seed = hash11(pointId);

    float frontOffset = (seed - 0.5) * uRevealWidth * 0.7;
    float distanceAhead = (yPercent + frontOffset) - uRevealProgress;

    float unbound = smoothstep(-uRevealWidth * 0.35, uRevealWidth * 1.5, distanceAhead);
    float wavePhase = uTime * (1.1 + seed * 1.7) + pointId * 0.35;
    vec3 drift = vec3(
      sin(wavePhase),
      cos(wavePhase * 0.77 + seed * 6.283) * 0.6,
      sin(wavePhase * 1.23 + seed * 3.14)
    );
    basePosition += drift * uWaveAmplitude * unbound * (0.45 + seed * 0.85);

    vec4 worldPosition = modelMatrix * vec4(basePosition, 1.0);

    float lead = 1.0 - smoothstep(0.0, uRevealWidth * 3.0, max(distanceAhead, 0.0));
    float trail = 1.0 - smoothstep(0.0, uRevealWidth * 1.65, max(-distanceAhead, 0.0));
    float band = min(lead, trail);
    band *= 1.0 - smoothstep(1.0, 1.0 + uRevealWidth, uRevealProgress);

    float flare = 1.0 - smoothstep(0.0, uRevealWidth * 0.55, abs(distanceAhead));
    float twinkle = hash11(pointId + floor(uTime * 3.0));
    float sliceCount = max(uGlitchSliceCount, 1.0);
    float slicePosition = yPercent * sliceCount;
    float slice = floor(slicePosition);
    float slicePhase = fract(slicePosition);
    float sliceFeather = smoothstep(0.0, 0.14, slicePhase)
      * (1.0 - smoothstep(0.86, 1.0, slicePhase));
    float timeValue = uTime * max(uGlitchSpeed, 0.0);
    float timeBlock = floor(timeValue);
    float timeBlend = smoothstep(0.0, 1.0, fract(timeValue));
    float gateThreshold = 1.0 - clamp(uGlitchFrequency, 0.0, 1.0);
    vec2 currentGlitch = sampleGlitch(slice, timeBlock, gateThreshold);
    vec2 nextGlitch = sampleGlitch(slice, timeBlock + 1.0, gateThreshold);
    vec2 glitchState = mix(currentGlitch, nextGlitch, timeBlend);
    float offsetNoise = glitchState.y;
    float burst = glitchBurst(uTime, uGlitchInterval, uGlitchBurstDuration);
    float glitch = glitchState.x * sliceFeather * burst * uGlitchIntensity;

    vec4 mvPosition = viewMatrix * worldPosition;
    mvPosition.x += offsetNoise * 0.5 * glitch * uEffectMix * uGlitchOffset * clamp(-mvPosition.z * 0.02, 0.3, 1.2);

    // 将粒子带稍微向相机偏移，避免与实体表面共面。
    float depthBias = clamp(-mvPosition.z * 0.0032, 0.008, 0.038);
    mvPosition.z += depthBias * smoothstep(0.0, 0.18, band);

    float perspectiveSize = 12.0 / max(-mvPosition.z, 0.5);
    float pointSize = max(1.15, uPointSize * uPixelRatio * perspectiveSize * (0.6 + flare * 0.9 + unbound * 0.35));
    gl_PointSize = band > 0.002 && uEffectMix > 0.001 ? pointSize : 0.0;
    gl_Position = projectionMatrix * mvPosition;

    // 根据屏幕覆盖面积补偿粒子能量。
    float coveredArea = pointSize * pointSize / max(uPixelRatio * uPixelRatio, 0.25);
    float areaCompensation = pow(
      clamp((1.0 + REFERENCE_POINT_AREA) / (1.0 + coveredArea), 0.05, 1.6),
      0.72
    );
    float energy = areaCompensation;

    vColor = mix(uGlowColor, uAccentColor, clamp(flare * 0.9 + glitch * 0.35, 0.0, 1.0));
    float scanResponse = 0.92 + clamp(uScanlineIntensity, 0.0, 1.5) * 0.28;
    float brightness = (0.62 + twinkle * 0.5 + flare * 1.35) * scanResponse + glitch * 0.32;
    vAlpha = clamp(brightness * band * energy, 0.0, 1.0) * uEffectMix;
    vCore = flare;
  }
`;
const PFRAG = `
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
`;
const GVERT = `
  attribute vec3 aAnchor;
  attribute vec4 aRands;
  attribute float aDensity;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uGlyphScale;
  uniform float uGlyphSize;
  uniform vec3 uFieldCenter;
  uniform vec2 uSideRange;
  uniform float uDepthHalf;
  uniform float uScatter;
  uniform vec2 uVerticalRange;
  uniform float uVerticalSpread;
  uniform float uDissolve;
  uniform float uEmerge;

  varying vec2 vUv;
  varying vec2 vCharUv;
  varying vec4 vRands;
  varying float vOpacity;
  varying float vViewDepth;
  varying float vSideProgress;
  varying float vDissolve;
  varying float vEmerge;

  // 单列动画占对应时间轴的比例：越小则各列触发时刻错开越明显。
  const float EMERGE_SPAN = 0.2;
  const float DISSOLVE_SPAN = 0.15;

  // 推导某一阶段的逐列进度：各列按随机种子在时间轴上错开，进度到 1 后不再变化。
  float columnStage(float progress, float seed, float span) {
    float start = seed * (1.0 - span);
    return clamp((progress - start) / span, 0.0, 1.0);
  }

  void main() {
    // 涌现与消散使用彼此独立的随机顺序；aRands 四个分量已被滚动速度、亮度等占用，故另行派生种子。
    float emergeSeed = fract(sin(dot(aRands, vec4(39.3468, 11.135, 83.155, 27.619))) * 24634.6345);
    float dissolveSeed = fract(sin(dot(aRands, vec4(12.9898, 78.233, 45.164, 94.673))) * 43758.5453);
    vEmerge = columnStage(uEmerge, emergeSeed, EMERGE_SPAN);
    vDissolve = columnStage(uDissolve, dissolveSeed, DISSOLVE_SPAN);
    // 尚未涌现或已排空的列直接丢到裁剪空间外，省下光栅化与片元开销。
    if (vEmerge <= 0.0 || vDissolve >= 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float verticalSpan = max(uVerticalRange.y - uVerticalRange.x, 0.0001);
    // uGlyphSize 通过等比缩减每列字符数放大字形：条带长度与布局不变，
    // 字形宽（经 glyphHeight 推导）高同步放大，长宽比不失真。
    // 注意字符变大后同样的行滚动速率在世界单位下会显得更快。
    // 字符数随纵向扩展倍率同步增加，条带拉长时字形尺寸保持不变。
    float charCount = mix(50.0, 100.0, aRands.y) * uVerticalSpread / max(uGlyphSize, 0.0001);
    float columnHeight = verticalSpan * mix(0.68, 0.96, aRands.w);
    float verticalRoom = max(verticalSpan - columnHeight, 0.0);
    float centerY = uVerticalRange.x + columnHeight * 0.5 + verticalRoom * aAnchor.y;
    float side = aAnchor.x < 0.0 ? -1.0 : 1.0;
    float x = uFieldCenter.x + side * mix(uSideRange.x, uSideRange.y, abs(aAnchor.x));
    float scatterWeight = smoothstep(0.22, 0.72, abs(aAnchor.x));
    x += side * abs(aAnchor.z) * uScatter * scatterWeight;
    float z = uFieldCenter.z + aAnchor.z * uDepthHalf;
    vec3 center = vec3(x, centerY, z);

    float glyphHeight = columnHeight / charCount;
    float glyphWidth = glyphHeight * (5.0 / 6.0) * uGlyphScale;
    vec4 viewPosition = modelViewMatrix * vec4(center, 1.0);
    viewPosition.xy += position.xy * vec2(glyphWidth, columnHeight);

    gl_Position = projectionMatrix * viewPosition;
    vUv = uv;
    vCharUv = vec2(1.0 - uv.x, uv.y * charCount);
    vCharUv.y -= uTime * uSpeed * 0.55 * mix(2.0, 10.0, aRands.x);
    vRands = aRands;
    vOpacity = mix(0.5, 1.0, aDensity);
    vViewDepth = -viewPosition.z;
    vSideProgress = clamp(abs(aAnchor.x), 0.0, 1.0);
  }
`;
const GFRAG = `
#define GLYPH_COUNT 36.0
uniform sampler2D uGlyphMap;
uniform sampler2D uMaskMap;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uOpacity;
uniform float uVisibility;
varying vec2 vUv;
varying vec2 vCharUv;
varying vec4 vRands;
varying float vOpacity;
varying float vViewDepth;
varying float vSideProgress;

vec4 hash43(vec3 p){ vec4 p4=fract(vec4(p.xyzx)*vec4(0.1031,0.1030,0.0973,0.1099)); p4+=dot(p4,p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }

void main(){
  float baseCharacter = floor(mod(vCharUv.y, GLYPH_COUNT));
  float ct = uTime*uSpeed*0.55*mix(1.0,2.0, vRands.y + hash43(vec3(baseCharacter,-100.0,vRands.z)).x);
  vec4 cr = hash43(vec3(baseCharacter, vRands.w, floor(ct*-2.0)));
  float gi = mod(baseCharacter + floor(cr.x*GLYPH_COUNT), GLYPH_COUNT);
  vec2 guv = vec2(vCharUv.x, fract(vCharUv.y));
  vec2 auv = vec2((guv.x+gi)/GLYPH_COUNT, guv.y);
  float g = max(texture2D(uGlyphMap, auv).r, texture2D(uGlyphMap, auv).a);
  if (g < 0.03) discard;

  vec2 sUv = gl_FragCoord.xy / uResolution;
  float m = texture2D(uMaskMap, sUv).r;
  float body = smoothstep(0.05, 0.5, m);
  float depthFade = exp(-0.02 * vViewDepth * vViewDepth);
  float colFade = 1.0 - smoothstep(0.4, 0.5, abs(vUv.y - 0.5));
  float e = g * vOpacity * (0.28 + body * 1.15) * depthFade * colFade * uOpacity * max(uVisibility, 1.0) * 0.09;
  gl_FragColor = vec4(e, e * 0.25, 0.0, 1.0);
}
`;
const MTV = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const HTF = `
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform vec3 uAccentColor;
uniform float uBrightness;
uniform float uCutoff;
varying vec2 vUv;
const float energyCeiling = 1.3;
float compressEnergy(float energy) {
  const float knee = 0.5;
  if (energy <= knee) return energy;
  float headroom = energyCeiling - knee;
  return knee + headroom * (1.0 - exp(-(energy - knee) / headroom));
}
void main() {
  vec2 rain = texture2D(uTexture, vUv).rg;
  float rawEnergy = rain.r * uBrightness;
  if (rawEnergy < 0.001) discard;
  float energy = compressEnergy(rawEnergy);
  float highlight = smoothstep(0.55, 1.2, energy);
  energy = max(energy - uCutoff, 0.0) * (energyCeiling / max(energyCeiling - uCutoff, 0.0001));
  if (energy <= 0.0) discard;
  float accentMix = clamp(rain.g / max(rain.r, 0.0001), 0.0, 1.0) * 0.16;
  vec3 hotColor = mix(uColor, vec3(1.0), 0.35);
  vec3 color = mix(uColor * 0.58, hotColor, highlight * 0.7);
  color = mix(color, uAccentColor, accentMix);
  gl_FragColor = vec4(color * energy, energy);
}
`;
const RV = `
attribute vec3 src;
attribute vec3 target;
attribute float progress;
attribute float randomOffset;
attribute float baseOpacity;
varying float vT;
varying float vBaseOpacity;
varying float vRandomOffset;
void main() {
  float t = clamp(progress, 0.0, 1.0);
  vT = position.x * t;
  vec3 worldPosition = mix(src, target, vT);
  vBaseOpacity = baseOpacity;
  vRandomOffset = randomOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
}
`;
const RF = `
uniform sampler2D uNoise;
uniform vec3 uColor;
uniform float uOpacity;
varying float vT;
varying float vBaseOpacity;
varying float vRandomOffset;
void main() {
  float noise = texture2D(uNoise, vec2(fract(vT + vRandomOffset), 0.5)).r;
  float alpha = vBaseOpacity * noise * vT * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;


const CFG = {
  bloom: { strength: 0.55, radius: 0.7, threshold: 0.2, tint: 5699035 },
  points: { accentColor: 7907071, brightness: 1.6, budget: 5000, glowColor: 8900331, waveAmplitude: 0.1 },
  glyph: { columns: 160, glyphSize: 2, intensity: 0.8, speed: -0.8, spread: 0.9, verticalSpread: 1.6, visibility: 10, brightness: 1.6, clearance: 0.05, depthSpacing: 1, energyCutoff: 0.1, resolutionScale: 0.85 },
  surface: { edgeGridCells: 65, hologramAlpha: 1, retainBrightness: 1.2, retainMix: 0.15, scanlineDensity: 10, scanlineSpeed: 0.4 },
  growth: { growthDuration: 0.05, holdDuration: 0.4, opacity: 1.2, maxTargets: 500,
    emitters: [ {height:1,x:-0.92,z:0.12},{height:0.9,x:0.84,z:-0.46},{height:0.84,x:0.28,z:0.96},{height:0.88,x:-0.46,z:-0.84} ] },
};

const ATLAS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 36
const GLYPH_COUNT = 36;

// ---------- procedural assets ----------
function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = 10 * ATLAS_CHARS.length; c.height = 12;
  const t = c.getContext('2d');
  t.imageSmoothingEnabled = false;
  t.clearRect(0, 0, c.width, c.height);
  t.fillStyle = '#ffffff';
  t.font = '700 12px "Courier New", monospace';
  t.textAlign = 'center'; t.textBaseline = 'middle';
  Array.from(ATLAS_CHARS).forEach((ch, i) => t.fillText(ch, i * 10 + 5, 12 * 0.55));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
}

function makeNoise(size = 256) {
  const data = new Uint8Array(size);
  for (let n = 0; n < size; n++) {
    const r = (n / size) * Math.PI * 2;
    const i = Math.sin(r * 3) * 0.5 + Math.sin(r * 7 + 1.7) * 0.32 + Math.sin(r * 13 + 4.1) * 0.18;
    data[n] = Math.round(Math.pow(Math.max(0, i * 0.5 + 0.5), 1.6) * 255);
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  return tex;
}

// structured columns (port of bt())
function buildColumns(count) {
  const list = [];
  const n = Math.max(1, Math.ceil(count / 2));
  for (let r = 0; r < count; r++) {
    const side = r % 2 === 0 ? -1 : 1;
    const i = Math.floor(r / 2);
    const a = ((i + THREE.MathUtils.randFloat(0.08, 0.92)) / n) * 2 - 1;
    const o = i % 4 === 0 ? THREE.MathUtils.randFloat(0.01, 0.16) : THREE.MathUtils.randFloat(0.18, 1);
    list.push({
      anchor: [side * o, Math.random(), a],
      density: +(Math.random() < 0.2),
      rands: [Math.random(), Math.random(), Math.random(), Math.random()],
    });
  }
  // instanced geometry (port of yt())
  const plane = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  for (const [k, v] of Object.entries(plane.attributes)) geo.setAttribute(k, v.clone());
  geo.setIndex(plane.index ? plane.index.clone() : null);
  const aA = new Float32Array(list.length * 3), aR = new Float32Array(list.length * 4), aD = new Float32Array(list.length);
  list.forEach((e, i) => { aA.set(e.anchor, i * 3); aR.set(e.rands, i * 4); aD[i] = e.density; });
  geo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(aA, 3));
  geo.setAttribute('aRands', new THREE.InstancedBufferAttribute(aR, 4));
  geo.setAttribute('aDensity', new THREE.InstancedBufferAttribute(aD, 1));
  geo.instanceCount = list.length;
  plane.dispose();
  return geo;
}

// ---------- main factory ----------
export function createHologram({ scene, renderer, camera, container, modelRoot }) {
  // container holds the model; worldToModel = inverse(container.matrixWorld)
  container.updateWorldMatrix(true, false);
  const worldToModel = container.matrixWorld.clone().invert();

  // ---- bounds (posed, precise) ----
  const refreshSkel = () => {
    modelRoot.updateMatrixWorld(true);
    modelRoot.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.update(); });
  };
  refreshSkel();
  const box = new THREE.Box3().setFromObject(modelRoot, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
  const edgeGridScale = CFG.surface.edgeGridCells / maxDim;

  // ---- 1) SURFACE material ----
  const surf = {
    uAccentColor: { value: new THREE.Color(4700671) },
    uBaseColor: { value: new THREE.Color(10270916) },
    uBaseMap: { value: null },
    uEdgeGridFalloff: { value: 2.5 },
    uEdgeGridIntensity: { value: 1.9 },
    uEdgeGridScale: { value: edgeGridScale },
    uEdgeGridWidth: { value: 0.07 },
    uEffectMix: { value: 0.95 },
    uFresnelPower: { value: 1.7 },
    uGlitchBurstDuration: { value: 0.42 }, uGlitchFrequency: { value: 0.17 }, uGlitchIntensity: { value: 0.14 },
    uGlitchInterval: { value: 3.4 }, uGlitchOffset: { value: 1.52 }, uGlitchSliceCount: { value: 38 }, uGlitchSpeed: { value: 6.4 },
    uGlowColor: { value: new THREE.Color(5699035) },
    uGlowIntensity: { value: 0.25 },
    uHasMap: { value: false }, uHasMatcap: { value: false },
    uHologramAlpha: { value: CFG.surface.hologramAlpha },
    uMatcap: { value: null },
    uModelBoundsMax: { value: box.max.clone() }, uModelBoundsMin: { value: box.min.clone() },
    uPulseIntensity: { value: 0.22 },
    uRetainBrightness: { value: CFG.surface.retainBrightness },
    uRetainMix: { value: CFG.surface.retainMix },
    uRevealComplete: { value: 1 }, uRevealProgress: { value: 1.13 }, uRevealWidth: { value: 0.13 },
    uScanlineColor: { value: new THREE.Color(12450047) },
    uScanlineDensity: { value: CFG.surface.scanlineDensity }, uScanlineIntensity: { value: 0.22 },
    uScanlineSpeed: { value: CFG.surface.scanlineSpeed }, uScanlineWidth: { value: 0.82 },
    uSourceColor: { value: new THREE.Color(10270916) }, uSourceOpacity: { value: 1 },
    uTime: { value: 0 }, uWorldToModel: { value: worldToModel },
  };
  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: surf, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
  });
  const MASK_LAYER = 1;
  modelRoot.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.material = surfaceMat; o.frustumCulled = false; o.layers.enable(MASK_LAYER); } });

  // ---- 2) POINTS ----
  const pts = { value: null };
  {
    const positions = [];
    const v = new THREE.Vector3();
    modelRoot.traverse(o => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry) return;
      const pos = o.geometry.attributes.position; if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        if (o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
        v.applyMatrix4(o.matrixWorld); positions.push(v.x, v.y, v.z);
      }
    });
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const pUniforms = {
      uAccentColor: { value: new THREE.Color(CFG.points.accentColor) },
      uBrightness: { value: CFG.points.brightness },
      uEffectMix: { value: 0.95 },
      uGlitchBurstDuration: { value: 0.42 }, uGlitchFrequency: { value: 0.17 }, uGlitchIntensity: { value: 0.14 },
      uGlitchInterval: { value: 3.4 }, uGlitchOffset: { value: 1.52 }, uGlitchSliceCount: { value: 38 }, uGlitchSpeed: { value: 6.4 },
      uGlowColor: { value: new THREE.Color(CFG.points.glowColor) },
      uModelBoundsMax: { value: box.max.clone() }, uModelBoundsMin: { value: box.min.clone() },
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      uPointSize: { value: 1.3 }, uRevealProgress: { value: 1.13 }, uRevealWidth: { value: 0.13 },
      uScanlineIntensity: { value: 0.22 }, uScanlineSpeed: { value: CFG.surface.scanlineSpeed },
      uTime: { value: 0 }, uWaveAmplitude: { value: CFG.points.waveAmplitude }, uWorldToModel: { value: worldToModel },
    };
    const pMat = new THREE.ShaderMaterial({ uniforms: pUniforms, vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pMesh = new THREE.Points(pgeo, pMat); pMesh.frustumCulled = false;
    scene.add(pMesh);
    pts.value = { mesh: pMesh, uniforms: pUniforms };
  }

  // ---- 3) GLYPH digital-rain (2-pass) ----
  const glyph = (() => {
    const atlas = makeAtlas();
    const maskTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, stencilBuffer: false });
    maskTarget.texture.colorSpace = THREE.NoColorSpace;
    const rainTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, format: THREE.RGFormat, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, stencilBuffer: false, type: THREE.HalfFloatType });
    rainTarget.texture.colorSpace = THREE.NoColorSpace; rainTarget.texture.generateMipmaps = false;

    const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });

    const letterUniforms = {
      uDepthHalf: { value: 0.18 }, uDissolve: { value: 0 }, uEmerge: { value: 1 },
      uFieldCenter: { value: center.clone() }, uGlyphMap: { value: atlas }, uGlyphScale: { value: 1 },
      uGlyphSize: { value: CFG.glyph.glyphSize }, uMaskMap: { value: maskTarget.texture }, uMaskTexel: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: CFG.glyph.intensity }, uResolution: { value: new THREE.Vector2(1, 1) }, uReveal: { value: 1 },
      uScatter: { value: 0 }, uSideRange: { value: new THREE.Vector2(1, 2) }, uSpeed: { value: CFG.glyph.speed },
      uTime: { value: 0 }, uVerticalRange: { value: new THREE.Vector2(-1, 1) }, uVerticalSpread: { value: CFG.glyph.verticalSpread },
      uVisibility: { value: CFG.glyph.visibility },
    };
    const letterMat = new THREE.ShaderMaterial({ uniforms: letterUniforms, vertexShader: GVERT, fragmentShader: GFRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

    const letterMesh = new THREE.Mesh(buildColumns(CFG.glyph.columns), letterMat);
    letterMesh.frustumCulled = false; letterMesh.visible = false;
    const letterRoot = new THREE.Object3D(); letterRoot.add(letterMesh);
    const letterScene = new THREE.Scene(); letterScene.add(letterRoot);

    const compositeUniforms = {
      uAccentColor: { value: new THREE.Color(4700671) }, uBrightness: { value: CFG.glyph.brightness },
      uColor: { value: new THREE.Color(5699035) }, uCutoff: { value: CFG.glyph.energyCutoff },
      uTexture: { value: rainTarget.texture },
    };
    const compositeMat = new THREE.ShaderMaterial({ uniforms: compositeUniforms, vertexShader: MTV, fragmentShader: HTF,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const compositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat);
    compositeMesh.frustumCulled = false; compositeMesh.renderOrder = 4;
    scene.add(compositeMesh);

    // subject bounds (port of setSubjectBounds)
    const field = center.clone();
    const halfW = size.x * 0.5, halfD = size.z * 0.5;
    const a = halfW + CFG.glyph.clearance;
    const spreadO = THREE.MathUtils.clamp(Math.max(halfW, halfD) * 0.9, 0.75, 1.4) * CFG.glyph.spread;
    letterUniforms.uFieldCenter.value.copy(field);
    letterUniforms.uSideRange.value.set(a, a + spreadO);
    const sPad = Math.min(0.08, size.y * 0.035);
    const cH = Math.max(size.y * 0.5 - sPad, 1e-4) * CFG.glyph.verticalSpread;
    letterUniforms.uVerticalRange.value.set(center.y - cH, center.y + cH);

    function resize(w, h, pr) {
      const rw = Math.max(1, Math.floor(w * pr)), rh = Math.max(1, Math.floor(h * pr));
      const mr = Math.max(1, Math.floor(rw * 0.5)), mh = Math.max(1, Math.floor(rh * 0.5));
      maskTarget.setSize(mr, mh);
      letterUniforms.uMaskTexel.value.set(1 / mr, 1 / mh);
      const e = Math.max(1, Math.round(rw * CFG.glyph.resolutionScale));
      const t = Math.max(1, Math.round(rh * CFG.glyph.resolutionScale));
      rainTarget.setSize(e, t);
      letterUniforms.uResolution.value.set(e, t);
    }
    resize(renderer.domElement.width / Math.min(devicePixelRatio,2), renderer.domElement.height / Math.min(devicePixelRatio,2), Math.min(devicePixelRatio,2));

    function renderMask(cam) {
      const prevRT = renderer.getRenderTarget();
      const prevOverride = scene.overrideMaterial, prevBg = scene.background, prevAuto = renderer.autoClear;
      const prevAlpha = renderer.getClearAlpha(); const savedColor = new THREE.Color(); renderer.getClearColor(savedColor);
      const prevLayers = cam.layers.mask;
      try {
        cam.layers.set(1);
        renderer.autoClear = true; renderer.setRenderTarget(maskTarget); renderer.setClearColor(0x000000, 1);
        scene.background = null; scene.overrideMaterial = maskMaterial;
        renderer.clear(true, true, true); renderer.render(scene, cam);
      } finally {
        cam.layers.mask = prevLayers;
        scene.overrideMaterial = prevOverride; scene.background = prevBg; renderer.setRenderTarget(prevRT);
        renderer.setClearColor(savedColor, prevAlpha); renderer.autoClear = prevAuto;
      }
      // render letters -> rainTarget
      const prevRT2 = renderer.getRenderTarget(); const prevAuto2 = renderer.autoClear; const prevAlpha2 = renderer.getClearAlpha();
      const savedColor2 = new THREE.Color(); renderer.getClearColor(savedColor2);
      try {
        renderer.autoClear = false; renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(rainTarget);
        renderer.clear(true, false, false); letterMesh.visible = true; renderer.render(letterScene, cam);
      } finally {
        letterMesh.visible = false; renderer.setRenderTarget(prevRT2); renderer.setClearColor(savedColor2, prevAlpha2); renderer.autoClear = prevAuto2;
      }
    }

    function update(dt, cam) {
      letterUniforms.uTime.value += dt;
      letterRoot.position.copy(field);
      letterRoot.rotation.y = Math.atan2(cam.position.x - field.x, cam.position.z - field.z);
    }
    return { update, renderMask, resize, compositeMesh, letterMat, letterUniforms, maskTarget, rainTarget,
      setEmerge: (e) => { letterUniforms.uEmerge.value = e; },
      setReveal: (e) => { letterUniforms.uReveal.value = e; },
      setDissolve: (e) => { letterUniforms.uDissolve.value = e; } };
  })();

  // ---- 4) LaserRayField (growth) ----
  const rays = (() => {
    const MAX = 900;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0], 3));
    const src = new Float32Array(MAX * 3), tgt = new Float32Array(MAX * 3);
    const prog = new Float32Array(MAX), baseOp = new Float32Array(MAX), rnd = new Float32Array(MAX);
    geo.setAttribute('src', new THREE.InstancedBufferAttribute(src, 3));
    geo.setAttribute('target', new THREE.InstancedBufferAttribute(tgt, 3));
    geo.setAttribute('progress', new THREE.InstancedBufferAttribute(prog, 1));
    geo.setAttribute('baseOpacity', new THREE.InstancedBufferAttribute(baseOp, 1));
    geo.setAttribute('randomOffset', new THREE.InstancedBufferAttribute(rnd, 1));
    geo.instanceCount = MAX;
    const uniforms = { uColor: { value: new THREE.Color(5699035) }, uNoise: { value: makeNoise() }, uOpacity: { value: CFG.growth.opacity } };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: RV, fragmentShader: RF,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.LineSegments(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
    scene.add(mesh);

    // emitters (port of at()) — positioned around model from Y.emitterLayout
    const emitters = CFG.growth.emitters.map(e => new THREE.Vector3(
      center.x + e.x * size.x, box.min.y + e.height * size.y, center.z + e.z * size.z));

    // targets sampled on surface (port of et())
    const targets = [];
    const v = new THREE.Vector3();
    modelRoot.traverse(o => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry) return;
      const pos = o.geometry.attributes.position; if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / Math.max(1, Math.floor(CFG.growth.maxTargets / 4))));
      for (let i = 0; i < pos.count && targets.length < CFG.growth.maxTargets; i += step) {
        if (o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
        v.applyMatrix4(o.matrixWorld); targets.push(v.clone());
      }
    });

    targets.sort((a, b) => a.y - b.y);   // sort by height (port of $e) for band selection
    const inst = Array.from({ length: MAX }, () => ({ active: false, dur: 1, el: 0, life: 0, op: 0 }));
    const attrProg = geo.attributes.progress, attrSrc = geo.attributes.src, attrTgt = geo.attributes.target, attrOp = geo.attributes.baseOpacity, attrRnd = geo.attributes.randomOffset;
    let cursor = 0;

    // port of rt(): spawn only on targets inside a band around the reveal front (bottom -> top)
    function spawnBand(progress, bandLead, density) {
      if (!targets.length || !emitters.length) return;
      const spanY = box.max.y - box.min.y;
      const front = box.min.y + Math.max(0, Math.min(1, progress)) * spanY;
      const half = spanY * bandLead;
      const lo = front - half, hi = front + half;
      const cand = targets.filter(t => t.y >= lo && t.y <= hi);
      if (!cand.length) return;
      const n = Math.max(1, Math.round(14 * density));
      let done = 0;
      for (let i = 0; i < MAX && done < n; i++) {
        const idx = (cursor + i) % MAX; const s = inst[idx];
        if (s.active) continue;
        const t = cand[Math.floor(Math.random() * cand.length)];
        const e = emitters[Math.floor(Math.random() * emitters.length)];
        s.active = true; s.el = 0;
        s.dur = CFG.growth.growthDuration * (0.64 + Math.random() * 0.72);
        s.life = CFG.growth.holdDuration * (0.62 + Math.random() * 0.76);
        s.op = 0.35 + Math.random() * 0.5;
        attrSrc.setXYZ(idx, e.x, e.y, e.z); attrTgt.setXYZ(idx, t.x, t.y, t.z);
        attrOp.setX(idx, s.op); attrRnd.setX(idx, Math.random());
        done++;
      }
      cursor = (cursor + n) % MAX;
      attrSrc.needsUpdate = true; attrTgt.needsUpdate = true; attrOp.needsUpdate = true; attrRnd.needsUpdate = true;
    }
    function update(dt, progress, animating) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        const s = inst[i]; if (!s.active) { if (attrProg.getX(i) !== 0) { attrProg.setX(i, 0); any = true; } continue; }
        s.el += dt;
        let p = s.el / s.dur; if (p >= 1) { p = 1; if (s.el > s.dur + s.life) { s.active = false; p = 0; } }
        attrProg.setX(i, p); any = true;
      }
      if (any) attrProg.needsUpdate = true;
      if (animating) {
        spawnBand(progress, 0.05, 1.2);                            // main band at the reveal front
        spawnBand(Math.max(0, progress - 0.12), 0.04, 1.2 * 0.4);  // trail band just below
      }
    }
    return { update, uniforms };
  })();

  // ---- loading assembly: reveal 0 -> 1 over ~5.2s (ease-out), then glyph dissolve ----
  const LOAD_DUR = 5.2, DISSOLVE_LEAD = 1.5, DISSOLVE_DUR = 6;
  let startMs = performance.now(), loadEndMs = null, animating = true;
  function setReveal(e) {
    const w = surf.uRevealWidth.value;
    surf.uRevealProgress.value = -w + e * (1 + w * 2);
    surf.uRevealComplete.value = e >= 1 ? 1 : e;
    pts.value.uniforms.uRevealProgress.value = -w + e * (1 + w * 2);
  }
  setReveal(0);

  function update(dt) {
    surf.uTime.value += dt;
    pts.value.uniforms.uTime.value += dt;
    // wall-clock load timing so it completes in ~5.2s real time even at low FPS
    const el = (performance.now() - startMs) / 1000;
    animating = el < LOAD_DUR;
    const i = 1 - Math.pow(1 - Math.min(1, el / LOAD_DUR), 2.1);   // ease-out (matches source)
    setReveal(i);
    pts.value.mesh.visible = animating;                            // points only during loading
    glyph.setEmerge(animating ? i : 1);                            // columns emerge with the front
    glyph.setReveal(i);
    if (!animating) {                                              // dissolve glyphs after loading
      if (loadEndMs === null) loadEndMs = performance.now();
      const dv = (performance.now() - loadEndMs) / 1000;
      glyph.setDissolve(Math.min(1, (dv + DISSOLVE_LEAD) / DISSOLVE_DUR));
    } else { glyph.setDissolve(0); }
    rays.update(dt, i, animating);                                 // rays follow the reveal front
    glyph.update(dt, camera);
  }

  return {
    update,
    renderMask: () => glyph.renderMask(camera),
    resize: (w, h, pr) => glyph.resize(w, h, pr),
    replay: () => { startMs = performance.now(); loadEndMs = null; setReveal(0); },
    surfaceMat, points: pts.value, glyph, rays,
  };
}
