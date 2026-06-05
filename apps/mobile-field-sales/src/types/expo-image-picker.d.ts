declare module "expo-image-picker" {
  export interface ImagePickerAsset {
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
  }

  export interface ImagePickerResult {
    canceled: boolean;
    assets?: ImagePickerAsset[] | null;
  }

  // expo-image-picker v16+ takes plain string media types, e.g. ["images"].
  // (The old `MediaTypeOptions` / `MediaType` enums no longer exist at runtime —
  // referencing them threw "Cannot read property 'Images' of undefined".)
  export type MediaTypeString = "images" | "videos" | "livePhotos";

  export function requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  export function requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  export function launchCameraAsync(options: {
    mediaTypes: MediaTypeString[];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;
  export function launchImageLibraryAsync(options: {
    mediaTypes: MediaTypeString[];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;
}
