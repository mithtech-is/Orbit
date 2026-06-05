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

  export enum MediaType {
    Images = "images"
  }

  export function requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  export function requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  export function launchCameraAsync(options: {
    mediaTypes: MediaType[];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;
  export function launchImageLibraryAsync(options: {
    mediaTypes: MediaType[];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;
}
