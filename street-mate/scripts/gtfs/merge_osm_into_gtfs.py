# Merges the old OSM-snapped dataset (ghana_bus_stops.json /
# ghana_bus_routes.json) into the new GTFS-derived one (bus_stops.json /
# bus_trips.json), for maximum stop/route coverage rather than a straight
# replacement.
#
# Why not a flat union: checked directly — 543 of the old dataset's 567
# routes are the SAME real-world route as one already in the new 554
# (independently captured, so the relation IDs never overlap, but the
# from/to endpoints match). Dumping all 567 in would flood "All Routes"
# with near-duplicate cards for the same trip. Only the 24 routes with no
# matching from/to pair in the new data are genuinely new coverage, so
# only those get added, as "legacy" routes.
#
# Stops are more independent (OSM and the GTFS export only share ~2,481 of
# 3,377 old named stops by underlying OSM node id), so after dropping
# name+location near-duplicates, the rest of the old stops get merged in.
#
# Run from this folder:  python3 merge_osm_into_gtfs.py
# Reads bus_stops.json / bus_trips.json already in assets/data (must be
# built first by build_gtfs_data.py) plus the old ghana_bus_*.json passed
# as arguments. Writes:
#   bus_stops.json     — overwritten in place with the merged stop list
#   legacy_routes.json — new file, the OSM-only routes with no GTFS
#                        headsign, stop ids remapped onto the merged list

import json
import math
import sys
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "data")

BUS_STOPS = os.path.join(OUT_DIR, "bus_stops.json")
BUS_TRIPS = os.path.join(OUT_DIR, "bus_trips.json")
LEGACY_ROUTES_OUT = os.path.join(OUT_DIR, "legacy_routes.json")

DEDUPE_RADIUS_KM = 0.15
EARTH_RADIUS_KM = 6371


def distance_km(a, b):
    lat1, lng1 = math.radians(a["lat"]), math.radians(a["lng"])
    lat2, lng2 = math.radians(b["lat"]), math.radians(b["lng"])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.sin(dlng / 2) ** 2 * math.cos(lat1) * math.cos(lat2)
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def norm(s):
    return (s or "").strip().lower()


def main(old_stops_path, old_routes_path):
    with open(BUS_STOPS) as f:
        new_stops = json.load(f)
    with open(BUS_TRIPS) as f:
        new_trips = json.load(f)
    with open(old_stops_path) as f:
        old_stops_raw = json.load(f)
    with open(old_routes_path) as f:
        old_routes_raw = json.load(f)

    new_stop_ids = {s["id"] for s in new_stops}
    new_stops_by_name = {}
    for s in new_stops:
        new_stops_by_name.setdefault(norm(s["name"]), []).append(s)

    # --- Build a canonical-id remap for every old stop --------------------
    # bare numeric id if it exists in the new set (same physical OSM node,
    # just without the "OSM-N-" prefix the old pipeline added); else a
    # name+proximity match onto an existing new stop; else keep it as new
    # coverage under its own OSM id.
    remap = {}
    additions = []
    for s in old_stops_raw:
        name = (s.get("Stop names") or "").strip()
        if not name:
            continue
        old_id = s["ID"]
        bare_id = old_id.replace("OSM-N-", "")
        old_point = {"lat": s["latitude"], "lng": s["longitude"]}

        if bare_id in new_stop_ids:
            remap[old_id] = bare_id
            continue

        candidates = new_stops_by_name.get(norm(name), [])
        matched = next((c for c in candidates if distance_km(c, old_point) < DEDUPE_RADIUS_KM), None)
        if matched:
            remap[old_id] = matched["id"]
            continue

        # Genuinely new coverage.
        remap[old_id] = old_id
        additions.append({"id": old_id, "name": name, "lat": s["latitude"], "lng": s["longitude"]})

    merged_stops = new_stops + additions
    with open(BUS_STOPS, "w") as f:
        json.dump(merged_stops, f)

    print(f"Stops: {len(new_stops)} (GTFS) + {len(additions)} (OSM-only, new coverage) = {len(merged_stops)}")
    print(f"  ({len(old_stops_raw) - len(additions)} old stops were duplicates of an existing GTFS stop)")

    # --- Keep only OSM routes with no from/to counterpart in the new data -
    usable_old_routes = [r for r in old_routes_raw if isinstance(r.get("stops"), list) and len(r["stops"]) >= 2]

    new_pairs = set()
    for t in new_trips:
        if t.get("from") and t.get("to"):
            new_pairs.add(norm(t["from"]) + "|" + norm(t["to"]))
            new_pairs.add(norm(t["to"]) + "|" + norm(t["from"]))

    legacy_routes = []
    for r in usable_old_routes:
        key = norm(r.get("from")) + "|" + norm(r.get("to"))
        if key in new_pairs:
            continue  # same real route already covered by the GTFS data

        stop_ids = r["stops"]
        stop_names = r.get("stop_names") or []
        remapped_stops = [
            {"id": remap.get(sid, sid), "name": (stop_names[i] or "").strip() if i < len(stop_names) else ""}
            for i, sid in enumerate(stop_ids)
        ]

        legacy_routes.append({
            "id": f"legacy_{r['route_id'].replace('/', '_')}",
            "routeId": r["route_id"],
            "ref": r.get("ref"),
            "name": r.get("name") or f"{r.get('from') or '?'} ↔ {r.get('to') or '?'}",
            "from": r.get("from"),
            "to": r.get("to"),
            "stops": remapped_stops,
        })

    with open(LEGACY_ROUTES_OUT, "w") as f:
        json.dump(legacy_routes, f)

    print(f"Legacy routes (OSM-only, no GTFS counterpart): {len(legacy_routes)} / {len(usable_old_routes)} usable old routes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 merge_osm_into_gtfs.py <old_ghana_bus_stops.json> <old_ghana_bus_routes.json>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])