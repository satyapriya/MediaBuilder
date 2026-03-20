import { Injectable, inject } from '@angular/core';
import { Database, ref, onValue, set, push, remove } from '@angular/fire/database';
import { Observable, BehaviorSubject } from 'rxjs';
import { MediaItem } from './media-item.model';
import { environment } from './environment';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private db = inject(Database);
  private mediaSubject = new BehaviorSubject<{[key: string]: any}>({});

  getUserMedia(userName: string): Observable<{[key: string]: any}> {
    const userRef = ref(this.db, `users/${userName}/media`);
    
    // Unsubscribe from previous listener if exists
    const existingListener = (this as any).__mediaListener;
    if (existingListener) {
      existingListener();
    }
    
    // Set new listener
    const listener = onValue(userRef, (snapshot) => {
      const data = snapshot.val() || {};
      this.mediaSubject.next(data);
    });
    
    // Store listener for cleanup
    (this as any).__mediaListener = listener;
    
    return this.mediaSubject.asObservable();
  }

  saveMedia(userName: string, mediaData: any): string | null {
    const userListRef = ref(this.db, `users/${userName}/media`);
    const newRef = push(userListRef);
    set(newRef, mediaData).catch(console.error);
    return newRef.key || null;
  }

  deleteMedia(userName: string, key: string): Promise<void> {
    const userMediaRef = ref(this.db, `users/${userName}/media/${key}`);
    return remove(userMediaRef);
  }
}

