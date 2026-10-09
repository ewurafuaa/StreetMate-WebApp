/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect, react-hooks/immutability, @typescript-eslint/no-require-imports -- Leaflet is imperative: this file bridges it into React on purpose. */
// Web stand-in for react-native-maps, built on Leaflet + OpenStreetMap tiles (no API key needed).
// Implements only what StreetMate uses: MapView (+ ref methods), Marker, Polyline, PROVIDER_GOOGLE.
import 'leaflet/dist/leaflet.css';
import type * as LeafletNS from 'leaflet';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type EdgePadding = { top: number; right: number; bottom: number; left: number };

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

type Ctx = { L: typeof LeafletNS; map: LeafletNS.Map } | null;
const MapContext = createContext<Ctx>(null);

export type MapViewHandle = {
  fitToCoordinates: (coords: LatLng[], opts?: { edgePadding?: Partial<EdgePadding>; animated?: boolean }) => void;
  animateToRegion: (region: Region, duration?: number) => void;
  animateCamera: (camera: { center?: LatLng; zoom?: number }, opts?: { duration?: number }) => void;
};

type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: () => void;
  onPanDrag?: () => void;
  showsUserLocation?: boolean;
  children?: ReactNode;
  // Accepted for API compatibility, ignored on web:
  provider?: unknown;
  customMapStyle?: unknown;
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  toolbarEnabled?: boolean;
};

const toLatLng = (c: LatLng): [number, number] => [c.latitude, c.longitude];

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { style, initialRegion, showsUserLocation, children } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ctx, setCtx] = useState<Ctx>(null);

  // Always call the latest callbacks without re-creating the map.
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Leaflet touches `window`, so it is only loaded in the browser, after mount.
    const L = require('leaflet') as typeof LeafletNS;

    const map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Leaflet finishes a zoom animation from a timer / CSS transitionend. If the screen closes
    // (map.remove()) while one is running, that callback fires on a map with no panes and throws
    // "Cannot read properties of undefined (reading '_leaflet_pos')". Ignore it once the map is gone.
    let removed = false;
    const leafletMap = map as unknown as { _onZoomTransitionEnd?: () => void };
    const originalZoomEnd = leafletMap._onZoomTransitionEnd;
    if (originalZoomEnd) {
      leafletMap._onZoomTransitionEnd = function (this: unknown) {
        if (removed) return;
        originalZoomEnd.call(this);
      };
    }

    const r = initialRegion;
    if (r) {
      map.fitBounds(
        [
          [r.latitude - r.latitudeDelta / 2, r.longitude - r.longitudeDelta / 2],
          [r.latitude + r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2],
        ],
        { animate: false }
      );
    } else {
      map.setView([5.6037, -0.187], 12);
    }

    const currentRegion = (): Region => {
      const c = map.getCenter();
      const b = map.getBounds();
      return {
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: b.getNorth() - b.getSouth(),
        longitudeDelta: b.getEast() - b.getWest(),
      };
    };

    map.on('moveend', () => propsRef.current.onRegionChangeComplete?.(currentRegion()));
    map.on('click', () => propsRef.current.onPress?.());
    map.on('dragstart', () => propsRef.current.onPanDrag?.());

    // The container can be sized after first paint (flex layout, sheets), so keep Leaflet in sync.
    const ro = new ResizeObserver(() => {
      if (!removed) map.invalidateSize();
    });
    ro.observe(el);

    // Native maps report the starting region once; do the same so screens can resolve it.
    const first = setTimeout(() => propsRef.current.onRegionChangeComplete?.(currentRegion()), 0);

    setCtx({ L, map });
    return () => {
      clearTimeout(first);
      ro.disconnect();
      removed = true;
      map.stop(); // cancel any fly / pan animation still running
      map.off();
      map.remove();
      setCtx(null);
    };
    // The map is created once; initialRegion is by definition only the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blue "you are here" dot.
  useEffect(() => {
    if (!ctx || !showsUserLocation || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const { L, map } = ctx;
    const dot = L.circleMarker([0, 0], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#2f80ed',
      fillOpacity: 1,
      interactive: false,
    });
    let added = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        dot.setLatLng([pos.coords.latitude, pos.coords.longitude]);
        if (!added) {
          dot.addTo(map);
          added = true;
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      dot.remove();
    };
  }, [ctx, showsUserLocation]);

  useImperativeHandle(
    ref,
    () => ({
      fitToCoordinates(coords, opts) {
        if (!ctx || coords.length === 0) return;
        const pad = opts?.edgePadding ?? {};
        ctx.map.fitBounds(ctx.L.latLngBounds(coords.map(toLatLng)), {
          paddingTopLeft: [pad.left ?? 0, pad.top ?? 0],
          paddingBottomRight: [pad.right ?? 0, pad.bottom ?? 0],
          animate: opts?.animated ?? true,
          maxZoom: 17,
        });
      },
      animateToRegion(region, duration = 500) {
        if (!ctx) return;
        ctx.map.flyToBounds(
          [
            [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
            [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
          ],
          { duration: duration / 1000 }
        );
      },
      animateCamera(camera, opts) {
        if (!ctx || !camera.center) return;
        ctx.map.flyTo(toLatLng(camera.center), camera.zoom ?? ctx.map.getZoom(), {
          duration: (opts?.duration ?? 500) / 1000,
        });
      },
    }),
    [ctx]
  );

  return (
    <View style={style}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {ctx ? <MapContext.Provider value={ctx}>{children}</MapContext.Provider> : null}
    </View>
  );
});

export default MapView;

// ---------------------------------------------------------------------------------------------

type MarkerProps = {
  coordinate: LatLng;
  title?: string;
  onPress?: () => void;
  zIndex?: number;
  children?: ReactNode;
  // Accepted for API compatibility, ignored on web:
  anchor?: { x: number; y: number };
  tracksViewChanges?: boolean;
};

// Custom marker views (children) are rendered with a React portal into the Leaflet marker element.
export function Marker({ coordinate, title, onPress, zIndex = 0, children }: MarkerProps) {
  const ctx = useContext(MapContext);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const markerRef = useRef<LeafletNS.Marker | null>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  useEffect(() => {
    if (!ctx) return;
    const el = document.createElement('div');
    // iconSize [0, 0] puts the element's origin on the coordinate; centre the content on it.
    el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);';
    const marker = ctx.L.marker([coordinate.latitude, coordinate.longitude], {
      icon: ctx.L.divIcon({ html: el, className: '', iconSize: [0, 0] }),
      zIndexOffset: zIndex * 100,
      keyboard: false,
    });
    marker.on('click', () => onPressRef.current?.());
    marker.addTo(ctx.map);
    markerRef.current = marker;
    setHost(el);
    return () => {
      marker.remove();
      markerRef.current = null;
      setHost(null);
    };
    // Re-created only when the map changes; position/z are updated by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useEffect(() => {
    markerRef.current?.setLatLng([coordinate.latitude, coordinate.longitude]);
  }, [coordinate.latitude, coordinate.longitude]);

  useEffect(() => {
    markerRef.current?.setZIndexOffset(zIndex * 100);
  }, [zIndex]);

  useEffect(() => {
    if (host) host.title = title ?? '';
  }, [host, title]);

  return host && children ? createPortal(children, host) : null;
}

// ---------------------------------------------------------------------------------------------

type PolylineProps = {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
};

export function Polyline({
  coordinates,
  strokeColor = '#000000',
  strokeWidth = 3,
  lineDashPattern,
  lineCap = 'round',
  lineJoin = 'round',
}: PolylineProps) {
  const ctx = useContext(MapContext);
  const lineRef = useRef<LeafletNS.Polyline | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const line = ctx.L.polyline([], { interactive: false });
    line.addTo(ctx.map);
    lineRef.current = line;
    return () => {
      line.remove();
      lineRef.current = null;
    };
  }, [ctx]);

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    line.setLatLngs(coordinates.map(toLatLng));
    line.setStyle({
      color: strokeColor,
      weight: strokeWidth,
      opacity: 1,
      dashArray: lineDashPattern ? lineDashPattern.join(' ') : undefined,
      lineCap,
      lineJoin,
    });
  }, [ctx, coordinates, strokeColor, strokeWidth, lineDashPattern, lineCap, lineJoin]);

  return null;
}
