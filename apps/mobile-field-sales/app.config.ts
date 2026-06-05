import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Orbit",
  slug: "orbit-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "orbit",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#00aaff"
  },
  web: {
    favicon: "./assets/favicon.png"
  },
  ios: {
    bundleIdentifier: "com.orbit.mobile",
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Orbit records your location during an active work session so your manager can see route progress and verify outlet check-ins. Tracking only runs after you grant consent and start a session.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Background tracking lets Orbit record your route between visits when the app is in the background. Tracking only runs during an active work session and you can stop it at any time.",
      NSCameraUsageDescription:
        "Orbit uses the camera to capture a visit proof photo after you meet a lead or outlet contact.",
      NSPhotoLibraryUsageDescription:
        "Orbit lets you choose a visit proof photo when the camera capture needs to be attached from your library.",
      UIBackgroundModes: ["location"]
    }
  },
  android: {
    package: "com.orbit.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#00aaff"
    },
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.CAMERA",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_LOCATION"
    ]
  },
  plugins: [
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to record location during work sessions for route tracking and check-in verification.",
        locationAlwaysPermission:
          "Allow $(PRODUCT_NAME) to record location in the background during active work sessions.",
        locationWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to record location while you use the app to verify outlet check-ins.",
        isAndroidBackgroundLocationEnabled: true,
        isIosBackgroundLocationEnabled: true
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to attach visit proof photos.",
        cameraPermission: "Allow $(PRODUCT_NAME) to capture visit proof photos."
      }
    ]
  ]
};

export default config;
