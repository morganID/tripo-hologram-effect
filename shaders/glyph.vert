
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
