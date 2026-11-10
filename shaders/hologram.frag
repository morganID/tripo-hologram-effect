
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
