// Keep zoom motion blur continuous at native resolution. Two exposures can
// visibly duplicate the finish gantry during a fast fallback-lens recovery.
export function zoomBlurSamples(base, beforeFov, afterFov, width, height) {
  if (![beforeFov, afterFov, width, height].every(Number.isFinite) ||
      beforeFov <= 0 || afterFov <= 0 || beforeFov >= 179 || afterFov >= 179) return base;
  const a = Math.tan(beforeFov * Math.PI / 360);
  const b = Math.tan(afterFov * Math.PI / 360);
  const edgeTravel = Math.max(width, height) * 0.5 * Math.abs(a / b - 1);
  // At most two native pixels between exposures, bounded for render cost.
  return Math.max(base, Math.min(32, Math.ceil(edgeTravel / 2) + 1));
}
