export type MediaType = 'image' | 'pdf' | 'youtube' | 'painting';


import { SafeResourceUrl } from '@angular/platform-browser';

export interface MediaItem {
  safeUrl?: SafeResourceUrl;

  id: number;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  cloudinaryUrl?: string;
  firebaseKey?: string | null;
  uploaded?: boolean;
}


