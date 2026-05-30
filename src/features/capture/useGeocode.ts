import * as Location from 'expo-location';

/**
 * Best-effort one-shot geocode. Per /docs/02-product-design.md §4 and §7 and
 * CLAUDE.md non-negotiable #6: **location never blocks a capture**. This
 * function:
 *
 *  1. Reads the current foreground-location permission status. If undetermined,
 *     prompts once. If already denied, returns null without re-prompting.
 *  2. Races `getCurrentPositionAsync` against a `timeoutMs` deadline (default 3s).
 *  3. Resolves null on denial, on timeout, on any thrown error.
 *
 * The caller can safely `await` this and feed the result into the confirm
 * payload — null fields are simply omitted by the typed client.
 */
export type GeocodeResult = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export async function geocodeOnce(timeoutMs = 3000): Promise<GeocodeResult | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined') {
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    const position = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const winner = await Promise.race<Location.LocationObject | null>([position, timeout]);
    if (!winner) return null;
    return {
      latitude: winner.coords.latitude,
      longitude: winner.coords.longitude,
      accuracy: winner.coords.accuracy ?? null,
    };
  } catch {
    // Never throw — fall back to "no coordinates".
    return null;
  }
}
