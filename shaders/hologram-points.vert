
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
