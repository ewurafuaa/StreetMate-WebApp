# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


## Latest changes

**Multi-trotro trips.** `utils/journey-planner.ts` plans over the real stop and route data (`assets/data`). A trip can be several trotros with walks between them. Each ride lists every stop in between, and transfers are labelled "Get off and change" / "Change trotro here". Pick an option on the planner screen (`app/map.tsx`) and the whole route is drawn on the map.

**Last mile.** When the final stop is more than ~120 m from the destination, `components/last-mile-panel.tsx` offers *Walk* (turn-by-turn steps, the named stops you'll pass, route on the map) or *Ride* (links to Yango, Uber and Bolt with pickup and drop-off pre-filled where the app supports it; see `utils/ride-hailing.ts`).

**Live tracking.** `app/journey.tsx` follows the rider's phone GPS along the trip: every stop is listed and ticks off as it is passed, with "next stop" and "get ready to get off" prompts. Use *Demo ride* in the ⋯ menu to play a simulated trip without moving.

**Uber-style redesign.** Tokens live in `constants/theme.ts` (black/white/grey, pill buttons, one shadow style). Shared pieces are in `components/ui.tsx`. Font is Helvetica Now Display from `assets/fonts`.

Notes: Recent trips are kept in memory for the session (`contexts/trip-history.tsx`); swap in AsyncStorage to persist them. Walking directions need the Routes API enabled on your Google key; without it the app falls back to a straight line plus a compass heading.


## Running as a web app

```bash
npm install          # picks up leaflet (the web map)
npm run web          # dev server at http://localhost:8081
npm run build:web    # static build into ./dist, deployable to any static host
```

How it works: Expo already targets the browser through react-native-web, but `react-native-maps` is
native-only. `metro.config.js` swaps it for `web/react-native-maps.web.tsx` on web builds only. That file
is a Leaflet + OpenStreetMap drop-in that supports the parts StreetMate uses (MapView, Marker, Polyline,
and the fit/animate ref methods), so no screen code changed. Android and iOS still use Google Maps.

Web notes:
- Location needs `https://` or `localhost`, and the browser will ask for permission.
- The Google key in `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is called straight from the browser on web. If it is
  restricted to Android apps, search and directions will be refused; add an HTTP-referrer restriction for your
  web origin (or use a separate web key).
- `Alert.alert` does nothing on web, so confirmations go through `utils/confirm.ts`.
- Uber/Bolt app schemes cannot open from a browser, so web opens their https pages in a new tab.
- Map tiles come from tile.openstreetmap.org, fine for development. For production traffic use a tile
  provider (MapTiler, Stadia, Mapbox, etc.) and change the URL in `web/react-native-maps.web.tsx`.
