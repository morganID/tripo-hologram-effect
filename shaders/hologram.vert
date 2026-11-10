
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
