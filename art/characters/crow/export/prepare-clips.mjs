/** Add only the closing interpolation interval, never an extra held frame.
 * Input is GLTFLoader's animations and model-info.json's animated_export.
 * Returns cloned clips; safe to call again on the prepared result.
 */
export function prepareCrowClips(animations, metadata) {
  return animations.map((source) => {
    const spec = metadata.clips[source.name];
    if (!spec) throw new Error(`Missing timing for ${source.name}`);
    const clip = source.clone();
    if (spec.loop_seconds == null) return clip;
    const duration = spec.loop_seconds;
    for (const track of clip.tracks) {
      // Optimized glTF exports store a constant channel as one key.
      if (track.times.length === 1) continue;
      const last = track.times[track.times.length - 1];
      if (Math.abs(last - duration) < 1e-6) continue;
      if (Math.abs(last - spec.last_key_seconds) > 1e-6 || Math.abs(track.times[0]) > 1e-6) {
        throw new Error(`Unexpected exported timing: ${source.name}/${track.name}`);
      }
      const stride = track.getValueSize();
      const times = new Float32Array(track.times.length + 1);
      times.set(track.times);
      times[times.length - 1] = duration;
      const values = new Float32Array(track.values.length + stride);
      values.set(track.values);
      values.set(track.values.subarray(0, stride), track.values.length);
      track.times = times;
      track.values = values;
    }
    clip.duration = duration;
    return clip;
  });
}
