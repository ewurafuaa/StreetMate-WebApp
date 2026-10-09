// Live journey. Follows the rider leg by leg — walk to the stop, board, ride, change trotro,
// walk the last stretch — using the phone's GPS.
//
// What "real-time tracking" means here: trotros have no GPS trackers and no operator publishes
// their positions, so the vehicle itself can't be tracked. What IS tracked, live, is the rider:
// their phone's position is matched to the ride's stops to show which stops have been passed,
// which is next, how many remain, and to warn them before the stop where they get off.
// "Demo ride" (in the ⋯ menu) replays a simulated trip so the flow can be shown without moving.

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, ScrollView, StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { StopDot } from '@/components/stop-dot';
import { Touchable } from '@/components/touchable';
import { Motion } from '@/constants/motion';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { JourneyMapLayers } from '@/components/journey-map-layers';
import { LastMilePanel, type LastMileMode } from '@/components/last-mile-panel';
import { LegTimeline } from '@/components/leg-timeline';
import { Icon, IconBadge, IconButton, PillButton, type IconName } from '@/components/ui';
import { confirmAction } from '@/utils/confirm';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { useLivePosition } from '@/hooks/use-live-position';
import { useWalkingRoute } from '@/hooks/use-walking-route';
import { buildDemoTrack } from '@/utils/demo-track';
import { bearingDegrees, compassLabel, formatMeters, formatMinutes, haversineMeters } from '@/utils/geo';
import { getActiveJourney } from '@/utils/journey-store';
import type { RideLeg } from '@/utils/journey-planner';
import { MAP_PROVIDER } from '@/utils/map-provider';
import {
  initialRideProgress,
  updateRideProgress,
  type RideProgress,
  type RideSnapshot,
} from '@/utils/ride-progress';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_COMPACT = SCREEN_HEIGHT * 0.4;
const SHEET_TALL = SCREEN_HEIGHT * 0.68;
const STOP_ROW_HEIGHT = 52;
const WALK_ARRIVED_M = 40;

type Step =
  | { kind: 'walk'; legIndex: number }
  | { kind: 'ride'; legIndex: number }
  | { kind: 'last-mile'; legIndex: number };

const stopWord = (n: number) => (n === 1 ? 'stop' : 'stops');

export default function JourneyScreen() {
  const insets = useSafeAreaInsets();
  const journey = getActiveJourney();

  const mapRef = useRef<MapView>(null);
  const scrollRef = useRef<ScrollView>(null);

  const steps = useMemo<Step[]>(() => {
    if (!journey) return [];
    const list: Step[] = journey.legs.map((leg, i) => ({ kind: leg.kind, legIndex: i }));
    if (journey.lastMile) list.push({ kind: 'last-mile', legIndex: journey.legs.length });
    return list;
  }, [journey]);

  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [snapshot, setSnapshot] = useState<RideSnapshot | null>(null);
  const progressRef = useRef<RideProgress>(initialRideProgress());
  const lastPhaseRef = useRef<string>('');

  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [lastMileMode, setLastMileMode] = useState<LastMileMode>('walk');
  const [demoTrack, setDemoTrack] = useState<ReturnType<typeof buildDemoTrack> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sheetHeight] = useState(() => new Animated.Value(SHEET_COMPACT));
  const [pulse] = useState(() => new Animated.Value(1));

  const { position, status } = useLivePosition({ enabled: !!journey && !finished, demoTrack });

  const step = steps[stepIdx] ?? null;
  const leg = journey && step && step.kind !== 'last-mile' ? journey.legs[step.legIndex] : null;
  const rideLeg: RideLeg | null = leg && leg.kind === 'ride' ? leg : null;
  const rideCoords = useMemo(() => rideLeg?.stops.map((s) => ({ lat: s.lat, lng: s.lng })) ?? [], [rideLeg]);

  // --- Clock + pulse animation -------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // --- Moving between steps ------------------------------------------------------
  const advance = () => {
    progressRef.current = initialRideProgress();
    lastPhaseRef.current = '';
    setSnapshot(null);
    if (stepIdx >= steps.length - 1) {
      setFinished(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setStepIdx(stepIdx + 1);
    }
  };

  // --- React to every GPS fix ------------------------------------------------------
  useEffect(() => {
    if (!position || !journey || !step || finished) return;

    if (step.kind === 'walk' && leg && leg.kind === 'walk') {
      if (haversineMeters(position, leg.to) <= WALK_ARRIVED_M) advance();
    } else if (step.kind === 'ride' && rideCoords.length > 1) {
      const snap = updateRideProgress(rideCoords, progressRef.current, position);
      progressRef.current = snap.progress;
      setSnapshot(snap);

      if (snap.phase !== lastPhaseRef.current) {
        lastPhaseRef.current = snap.phase;
        if (snap.phase === 'get-ready') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        if (snap.phase === 'missed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      if (snap.phase === 'arrived') advance();
    } else if (step.kind === 'last-mile' && journey.lastMile) {
      if (haversineMeters(position, journey.lastMile.to) <= WALK_ARRIVED_M) advance();
    }
    // `advance` closes over stepIdx, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, stepIdx]);

  // --- Camera follows the rider -----------------------------------------------------
  useEffect(() => {
    if (!position || !follow) return;
    mapRef.current?.animateCamera({ center: { latitude: position.lat, longitude: position.lng }, zoom: 16 }, { duration: 600 });
  }, [position, follow]);

  // Frame the whole active leg when it starts (and there's no GPS yet).
  useEffect(() => {
    if (!journey || !step || position) return;
    const coords =
      rideLeg?.stops.map((s) => ({ latitude: s.lat, longitude: s.lng })) ??
      (leg && leg.kind === 'walk'
        ? [
            { latitude: leg.from.lat, longitude: leg.from.lng },
            { latitude: leg.to.lat, longitude: leg.to.lng },
          ]
        : []);
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 180, right: 50, bottom: SHEET_COMPACT + 40, left: 50 },
        animated: true,
      });
    }
  }, [stepIdx, journey, step, position, rideLeg, leg]);

  // --- Last-mile walking route --------------------------------------------------------
  const { route: walkRoute, loading: walkLoading } = useWalkingRoute(
    step?.kind === 'last-mile' || finished ? journey?.lastMile?.from ?? null : null,
    step?.kind === 'last-mile' || finished ? journey?.lastMile?.to ?? null : null
  );
  const walkPaths = useMemo(
    () => (walkRoute && !walkRoute.approximate ? { 'last-mile': walkRoute.path } : {}),
    [walkRoute]
  );

  // --- Sheet height ------------------------------------------------------------------
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(sheetHeight, { toValue: next ? SHEET_TALL : SHEET_COMPACT, useNativeDriver: false, friction: 9, tension: 70 }).start();
  };

  // Keep the next stop in view in the stop list.
  const passedIdx = snapshot?.progress.passedIdx ?? -1;
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (passedIdx - 1) * STOP_ROW_HEIGHT), animated: true });
  }, [passedIdx, stepIdx]);

  // --- Nothing to follow ----------------------------------------------------------------
  if (!journey || steps.length === 0) {
    return (
      <View style={[styles.emptyScreen, { paddingTop: insets.top + 24 }]}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <View style={styles.emptyBody}>
          <Text weight="bold" style={styles.emptyTitle}>No journey to follow</Text>
          <Text style={styles.emptyText}>Pick a trip first, then tap Start journey.</Text>
          <PillButton label="Plan a trip" onPress={() => router.replace('/search')} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  const endJourney = () => {
    confirmAction('End this journey?', 'Tracking will stop.', 'End journey', 'Keep going', () => router.replace('/'));
  };

  // --- What to tell the rider right now -------------------------------------------------
  const banner = describeStep({ journey, step, leg, rideLeg, snapshot, position, finished });

  // ETA for the whole journey
  const etaMinutes = remainingMinutes({ journey, stepIdx, rideLeg, snapshot, position, finished });
  const arrivalClock = new Date(now + etaMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const isRide = step?.kind === 'ride' && !!rideLeg;
  const primaryLabel =
    finished ? 'Done' : step?.kind === 'ride' ? "I've got off" : step?.kind === 'last-mile' ? "I've arrived" : "I'm at the stop";

  const statusLabel =
    status === 'demo' ? 'Demo ride' : status === 'live' ? 'Live GPS' : status === 'denied' ? 'Location off' : status === 'unavailable' ? 'GPS unavailable' : 'Finding GPS…';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        customMapStyle={STREETMATE_MAP_STYLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: journey.origin.lat, longitude: journey.origin.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsUserLocation={status !== 'demo'}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => setFollow(false)}>
        <JourneyMapLayers
          journey={journey}
          activeLegIndex={finished ? null : step?.legIndex ?? null}
          passedIdx={passedIdx}
          nextIdx={snapshot ? snapshot.nextIdx : 0}
          walkPaths={walkPaths}
        />
        {status === 'demo' && position && (
          <Marker coordinate={{ latitude: position.lat, longitude: position.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
            <View style={styles.demoMarkerOuter}>
              <View style={styles.demoMarkerInner} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top: close + instruction banner */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <IconButton name="close" floating onPress={endJourney} accessibilityLabel="End journey" />
          <View style={styles.statusPill}>
            <Animated.View style={[styles.statusDot, { opacity: status === 'live' || status === 'demo' ? pulse : 1 }]} />
            <Text weight="medium" style={styles.statusText}>{statusLabel}</Text>
          </View>
          <IconButton name="ellipsis-horizontal" floating onPress={() => setMenuOpen(true)} accessibilityLabel="More" />
        </View>

        <View style={[styles.banner, banner.urgent && styles.bannerUrgent]}>
          <View style={styles.bannerIcon}>
            <Icon name={banner.icon} size={26} color={banner.urgent ? Palette.Black : Palette.White} />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="bold" style={[styles.bannerTitle, banner.urgent && { color: Palette.Black }]} numberOfLines={2}>
              {banner.title}
            </Text>
            {banner.sub ? (
              <Text style={[styles.bannerSub, banner.urgent && { color: Palette.Elevated }]} numberOfLines={2}>
                {banner.sub}
              </Text>
            ) : null}
          </View>
        </View>

        {status === 'denied' && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Location is off, so we can&apos;t follow you automatically. Use the button below to move to the next step.
            </Text>
          </View>
        )}
      </View>

      {!follow && position && (
        <View style={[styles.recenter, { bottom: (expanded ? SHEET_TALL : SHEET_COMPACT) + 16 }]}>
          <IconButton name="locate" floating onPress={() => setFollow(true)} accessibilityLabel="Recentre map" />
        </View>
      )}

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        <Touchable activeOpacity={0.7} onPress={toggleExpanded} style={styles.handleZone}>
          <View style={styles.handle} />
        </Touchable>

        {finished ? (
          <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.arrivedRow}>
              <IconBadge name="checkmark" size={48} dark />
              <View style={{ flex: 1 }}>
                <Text weight="bold" style={styles.arrivedTitle}>You&apos;ve arrived</Text>
                <Text style={styles.sub}>{journey.destination.name}</Text>
              </View>
            </View>
          </ScrollView>
        ) : step?.kind === 'last-mile' && journey.lastMile ? (
          <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <LastMilePanel
              lastMile={journey.lastMile}
              mode={lastMileMode}
              onModeChange={setLastMileMode}
              route={walkRoute}
              loading={walkLoading}
            />
          </ScrollView>
        ) : (
          <>
            {/* Summary row */}
            <View style={styles.summary}>
              <View style={{ flex: 1 }}>
                {isRide && rideLeg ? (
                  <>
                    <Text weight="bold" style={styles.summaryBig}>
                      {snapshot ? snapshot.stopsRemaining : rideLeg.stops.length - 1} {stopWord(snapshot ? snapshot.stopsRemaining : rideLeg.stops.length - 1)} to go
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      “{rideLeg.trotroName}” trotro · get off at {rideLeg.stops[rideLeg.stops.length - 1].name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text weight="bold" style={styles.summaryBig}>
                      {leg && leg.kind === 'walk' && position
                        ? formatMeters(haversineMeters(position, leg.to))
                        : leg && leg.kind === 'walk'
                          ? formatMeters(leg.meters)
                          : ''}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {leg && leg.kind === 'walk' ? `to ${leg.to.name}` : ''}
                    </Text>
                  </>
                )}
              </View>
              <View style={styles.etaBox}>
                <Text weight="bold" style={styles.etaTime}>{arrivalClock}</Text>
                <Text style={styles.etaLabel}>~{formatMinutes(etaMinutes)} left</Text>
              </View>
            </View>

            {/* All stops on this ride, or what's coming up after a walk */}
            {isRide && rideLeg ? (
              <ScrollView ref={scrollRef} style={styles.stopScroll} showsVerticalScrollIndicator={false}>
                {rideLeg.stops.map((stop, i) => (
                  <StopRow
                    key={`${stop.id}-${i}`}
                    name={stop.name}
                    state={
                      i === rideLeg.stops.length - 1
                        ? 'alight'
                        : i === 0 && passedIdx < 0
                          ? 'board'
                          : i <= passedIdx
                            ? i === passedIdx
                              ? 'current'
                              : 'passed'
                            : i === (snapshot ? snapshot.nextIdx : 0)
                              ? 'next'
                              : 'upcoming'
                    }
                    first={i === 0}
                    last={i === rideLeg.stops.length - 1}
                    pulse={pulse}
                  />
                ))}
              </ScrollView>
            ) : (
              <UpNext journey={journey} stepIdx={stepIdx} steps={steps} />
            )}
          </>
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <PillButton
            label={primaryLabel}
            onPress={() => (finished ? router.replace('/') : advance())}
            variant={finished ? 'primary' : 'primary'}
          />
        </View>
      </Animated.View>

      {/* ⋯ menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Touchable style={styles.backdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <MenuItem
              icon="list"
              label="Trip overview"
              onPress={() => {
                setMenuOpen(false);
                setOverviewOpen(true);
              }}
            />
            <MenuItem
              icon={demoTrack ? 'stop-circle' : 'play-circle'}
              label={demoTrack ? 'Stop demo ride' : 'Demo ride (simulate the trip)'}
              onPress={() => {
                setMenuOpen(false);
                if (demoTrack) {
                  setDemoTrack(null);
                } else {
                  setStepIdx(0);
                  setFinished(false);
                  setSnapshot(null);
                  progressRef.current = initialRideProgress();
                  setFollow(true);
                  setDemoTrack(buildDemoTrack(journey));
                }
              }}
            />
            <MenuItem icon="close-circle" label="End journey" onPress={() => { setMenuOpen(false); endJourney(); }} />
          </View>
        </Touchable>
      </Modal>

      {/* Trip overview */}
      <Modal visible={overviewOpen} transparent animationType="slide" onRequestClose={() => setOverviewOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.overview, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.overviewHeader}>
              <Text weight="bold" style={styles.overviewTitle}>Trip overview</Text>
              <IconButton name="close" size={40} onPress={() => setOverviewOpen(false)} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <LegTimeline journey={journey} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------------------

type StopState = 'passed' | 'current' | 'next' | 'upcoming' | 'board' | 'alight';

function StopRow({
  name,
  state,
  first,
  last,
  pulse,
}: {
  name: string;
  state: StopState;
  first: boolean;
  last: boolean;
  pulse: Animated.Value;
}) {
  const passed = state === 'passed';
  const strong = state === 'current' || state === 'next' || state === 'alight' || state === 'board';
  const label =
    state === 'current' ? "You're here" : state === 'next' ? 'Next stop' : state === 'alight' ? 'Get off here' : state === 'board' ? 'Board here' : '';

  return (
    <View style={[styles.stopRow, { height: STOP_ROW_HEIGHT }]}>
      <View style={styles.stopRail}>
        {!first && <View style={[styles.railPart, passed || state === 'current' ? styles.railDone : styles.railTodo, { top: 0, bottom: '50%' }]} />}
        {!last && <View style={[styles.railPart, passed ? styles.railDone : styles.railTodo, { top: '50%', bottom: 0 }]} />}
        {/* The dot morphs between states; while it is the next stop it also pulses. */}
        <Animated.View style={{ opacity: state === 'next' ? pulse : 1 }}>
          <StopDot state={state} />
        </Animated.View>
      </View>
      <View style={styles.stopText}>
        <Text weight={strong ? 'bold' : 'regular'} numberOfLines={1} style={[styles.stopName, passed && { color: Palette.Placeholder }]}>
          {name}
        </Text>
        {label ? (
          <Reanimated.View key={label} entering={FadeIn.duration(Motion.duration.base)}>
            <Text style={styles.stopLabel}>{label}</Text>
          </Reanimated.View>
        ) : null}
      </View>
    </View>
  );
}

function UpNext({ journey, stepIdx, steps }: { journey: NonNullable<ReturnType<typeof getActiveJourney>>; stepIdx: number; steps: Step[] }) {
  const nextRide = steps
    .slice(stepIdx)
    .map((s) => (s.kind === 'ride' ? (journey.legs[s.legIndex] as RideLeg) : null))
    .find((l) => l !== null);
  if (!nextRide) return null;
  return (
    <View style={styles.upNext}>
      <IconBadge name="bus" dark />
      <View style={{ flex: 1 }}>
        <Text style={styles.stopLabel}>Up next</Text>
        <Text weight="bold" style={styles.upNextTitle}>Take the “{nextRide.trotroName}” trotro</Text>
        <Text style={styles.sub}>
          Board at {nextRide.stops[0].name} · {nextRide.stops.length - 1} {stopWord(nextRide.stops.length - 1)}
        </Text>
      </View>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      <IconBadge name={icon} />
      <Text weight="medium" style={styles.menuLabel}>{label}</Text>
    </Touchable>
  );
}

// ---------------------------------------------------------------------------------------

type Banner = { icon: IconName; title: string; sub: string; urgent?: boolean };

function describeStep({
  journey,
  step,
  leg,
  rideLeg,
  snapshot,
  position,
  finished,
}: {
  journey: NonNullable<ReturnType<typeof getActiveJourney>>;
  step: Step | null;
  leg: ReturnType<typeof legOf> | null;
  rideLeg: RideLeg | null;
  snapshot: RideSnapshot | null;
  position: { lat: number; lng: number } | null;
  finished: boolean;
}): Banner {
  if (finished) return { icon: 'checkmark-circle', title: `You've arrived at ${journey.destination.name}`, sub: '' };
  if (!step) return { icon: 'navigate', title: '', sub: '' };

  if (step.kind === 'last-mile' && journey.lastMile) {
    const heading = compassLabel(bearingDegrees(position ?? journey.lastMile.from, journey.lastMile.to));
    const dist = position ? haversineMeters(position, journey.lastMile.to) : journey.lastMile.meters;
    return {
      icon: 'walk',
      title: `Last stretch to ${journey.lastMile.to.name}`,
      sub: `${formatMeters(dist)} · head ${heading}. Walk or take a ride below.`,
    };
  }

  if (leg && leg.kind === 'walk') {
    const dist = position ? haversineMeters(position, leg.to) : leg.meters;
    const heading = compassLabel(bearingDegrees(position ?? leg.from, leg.to));
    return {
      icon: 'walk',
      title: leg.role === 'transfer' ? `Walk to the ${leg.to.name} stop` : `Walk to ${leg.to.name}`,
      sub: `${formatMeters(dist)} · head ${heading}${leg.role === 'transfer' ? ' to change trotro' : ''}`,
    };
  }

  if (rideLeg) {
    const alight = rideLeg.stops[rideLeg.stops.length - 1].name;
    const board = rideLeg.stops[0].name;
    const phase = snapshot?.phase ?? 'at-board';
    if (phase === 'to-board') {
      return { icon: 'walk', title: `Head to ${board}`, sub: `${formatMeters(position ? haversineMeters(position, rideLeg.stops[0]) : 0)} to the stop` };
    }
    if (phase === 'at-board') {
      return {
        icon: 'bus',
        title: `Board a “${rideLeg.trotroName}” trotro`,
        sub: `Wait for the mate calling “${rideLeg.trotroName}”. You get off at ${alight}.`,
      };
    }
    if (phase === 'missed') {
      return {
        icon: 'warning',
        title: `You may have passed ${alight}`,
        sub: 'Ask the mate to stop, then walk back or get directions.',
        urgent: true,
      };
    }
    if (phase === 'get-ready') {
      const n = snapshot?.stopsRemaining ?? 1;
      return {
        icon: 'notifications',
        title: n <= 1 ? `Get off at the next stop: ${alight}` : `Get ready — ${alight} is ${n} stops away`,
        sub: 'Tell the mate “Mate, stop!” a little early.',
        urgent: true,
      };
    }
    const next = rideLeg.stops[snapshot?.nextIdx ?? 1];
    return {
      icon: 'bus',
      title: `Next stop: ${next?.name ?? alight}`,
      sub: `${formatMeters(snapshot?.metersToNext ?? 0)} · ${snapshot?.stopsRemaining ?? 0} ${stopWord(snapshot?.stopsRemaining ?? 0)} until ${alight}`,
    };
  }
  return { icon: 'navigate', title: '', sub: '' };
}

// Only used to name a type.
const legOf = (j: NonNullable<ReturnType<typeof getActiveJourney>>, i: number) => j.legs[i];

function remainingMinutes({
  journey,
  stepIdx,
  rideLeg,
  snapshot,
  position,
  finished,
}: {
  journey: NonNullable<ReturnType<typeof getActiveJourney>>;
  stepIdx: number;
  rideLeg: RideLeg | null;
  snapshot: RideSnapshot | null;
  position: { lat: number; lng: number } | null;
  finished: boolean;
}): number {
  if (finished) return 0;
  const legs = journey.legs;
  let total = 0;
  for (let i = stepIdx; i < legs.length; i++) {
    const l = legs[i];
    if (i === stepIdx) {
      if (l.kind === 'walk') {
        total += position ? (haversineMeters(position, l.to) * 1.25) / 75 : l.minutes;
      } else if (rideLeg) {
        const hops = rideLeg.stops.length - 1;
        const remaining = snapshot ? snapshot.stopsRemaining : hops;
        total += rideLeg.minutes * (remaining / hops) + (snapshot && snapshot.progress.passedIdx >= 1 ? 0 : rideLeg.waitMinutes);
      }
    } else {
      total += l.kind === 'ride' ? l.minutes + l.waitMinutes : l.minutes;
    }
  }
  if (journey.lastMile) total += journey.lastMile.walkMinutes;
  return Math.max(1, total);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },
  emptyScreen: { flex: 1, backgroundColor: Palette.White, paddingHorizontal: 16 },
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 24, color: Palette.Black },
  emptyText: { fontSize: 15, color: Palette.DarkGray, marginTop: 6 },

  top: { position: 'absolute', top: 0, left: 16, right: 16, gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.White,
    ...Shadow.float,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.Black },
  statusText: { fontSize: 13, color: Palette.Black },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Palette.Black,
    borderRadius: Radius.xl,
    padding: 16,
    ...Shadow.card,
  },
  bannerUrgent: { backgroundColor: Palette.White, borderWidth: 3, borderColor: Palette.Black },
  bannerIcon: { width: 40, alignItems: 'center' },
  bannerTitle: { fontSize: 18, lineHeight: 24, color: Palette.White },
  bannerSub: { fontSize: 14, lineHeight: 20, color: Palette.LightGray, marginTop: 2 },
  notice: { backgroundColor: Palette.White, borderRadius: Radius.lg, padding: 12, ...Shadow.float },
  noticeText: { fontSize: 13, lineHeight: 18, color: Palette.Black },

  recenter: { position: 'absolute', right: 16 },
  demoMarkerOuter: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  demoMarkerInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: Palette.Black, borderWidth: 3, borderColor: Palette.White },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.White,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    ...Shadow.card,
  },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.LightGray },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 110 },
  sub: { fontSize: 14, color: Palette.DarkGray, marginTop: 2 },

  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  summaryBig: { fontSize: 24, lineHeight: 30, color: Palette.Black },
  etaBox: { alignItems: 'flex-end' },
  etaTime: { fontSize: 18, color: Palette.Black },
  etaLabel: { fontSize: 13, color: Palette.DarkGray },

  stopScroll: { flex: 1, paddingHorizontal: 20, marginBottom: 96 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stopRail: { width: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  railPart: { position: 'absolute', width: 2 },
  railDone: { backgroundColor: Palette.Placeholder },
  railTodo: { backgroundColor: Palette.Black },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Palette.Black, backgroundColor: Palette.White },
  dotFilled: { backgroundColor: Palette.Black },
  dotNext: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: Palette.Black, backgroundColor: Palette.White },
  dotAlight: { width: 16, height: 16, backgroundColor: Palette.Black },
  stopText: { flex: 1 },
  stopName: { fontSize: 16, color: Palette.Black },
  stopLabel: { fontSize: 12, color: Palette.DarkGray, marginTop: 1 },

  upNext: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 8, padding: 16, backgroundColor: Palette.Soft, borderRadius: Radius.xl },
  upNextTitle: { fontSize: 16, color: Palette.Black, marginTop: 2 },

  arrivedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  arrivedTitle: { fontSize: 24, color: Palette.Black },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Palette.White,
    borderTopWidth: 1,
    borderTopColor: Palette.Soft,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menu: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, padding: 16, gap: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  menuLabel: { fontSize: 16, color: Palette.Black },
  overview: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, padding: 20, maxHeight: '85%' },
  overviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  overviewTitle: { fontSize: 22, color: Palette.Black },
});
