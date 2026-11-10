
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
