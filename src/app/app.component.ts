import { Component, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MediaItem } from './media-item.model';
import { environment } from './environment';
import { DatabaseService } from './database.service';
import { Subscription } from 'rxjs';
import axios from 'axios';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DragDropModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements AfterViewInit {
  ngOnInit() {
    if (this.userName) {
      this.loadMedia();
    }
  }
  @ViewChild('paintCanvas') paintCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('textOverlay') textOverlayRef!: ElementRef<HTMLDivElement>;
  
  mediaItems: MediaItem[] = [];
  idCounter = 0;
  userName = localStorage.getItem('mediaBuilderUser') || '';
  showNameInput = localStorage.getItem('mediaBuilderUser') ? false : true;
  isLoading = false;
  
  // Modal states
  showImagePopup = false;
  showPdfViewer = false;
  showVideoPopup = false;
  showPaintPopup = false;
  currentModalItem: MediaItem | null = null;
  
  // Paint properties
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  currentTool = 'draw';
  brushSize = 5;
  brushColor = '#000000';
  isDrawing = false;
  lastX = 0;
  lastY = 0;
  shapeStartX?: number;
  shapeStartY?: number;
  dragOver = false;
  private mediaSubscription?: Subscription;

  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
dbService = inject(DatabaseService);

  safeUrl(url?: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url || '');
  }

trackById(index: number, item: MediaItem): number {
  return item.id;
}


  setUserName(name: string) {
    this.userName = name.trim();
    if (this.userName) {
      localStorage.setItem('mediaBuilderUser', this.userName);
      this.loadMedia();
      this.showNameInput = false;
    }
  }

  private loadMedia() {
    this.isLoading = true;
this.mediaSubscription = this.dbService.getUserMedia(this.userName).subscribe((data: any) => {
  this.mediaItems = Object.entries(data || {}).map(([key, itemData]: [string, any]) => ({
    id: this.idCounter++,
    type: itemData.type,
    url: itemData.url || itemData.cloudinaryUrl || '',
    thumbnailUrl: itemData.thumbnailUrl,
    title: itemData.title || '',
    cloudinaryUrl: itemData.cloudinaryUrl,
    firebaseKey: key || null
  }));
  this.isLoading = false;
  this.cdr.detectChanges();
});
  }

  async uploadToCloudinary(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', environment.cloudinary.upload_preset);
    formData.append('cloud_name', environment.cloudinary.cloud_name);

    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloud_name}/upload`, 
      formData
    );
    return response.data.secure_url;
  }

  async addMediaWithUpload(file: File, type: 'image' | 'painting' | 'pdf', title: string) {
    this.isLoading = true;
    try {
      const cloudinaryUrl = await this.uploadToCloudinary(file);
      const thumbnailUrl = type === 'image' ? cloudinaryUrl : cloudinaryUrl;
      
      const mediaData = {
        type,
        url: cloudinaryUrl,
        thumbnailUrl,
        title,
        cloudinaryUrl,
        uploaded: true
      };

      const firebaseKey = this.dbService.saveMedia(this.userName, mediaData);
      
      const newItem: MediaItem = {
        id: this.idCounter++,
        type,
        url: cloudinaryUrl,
        thumbnailUrl,
        title,
        cloudinaryUrl,
        firebaseKey: firebaseKey || null,
        uploaded: true
      };
      this.mediaItems.push(newItem);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      this.isLoading = false;
    }
  }

  async savePainting() {
    this.canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'painting.png', { type: 'image/png' });
        await this.addMediaWithUpload(file, 'painting', 'My Painting');
        this.closePainting();
      }
    });
  }

  async handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    
    const files = e.dataTransfer!.files;
    const youtubeUrls: string[] = [];
    
    // Process YouTube URLs first (non-blocking callback)
    for (let i = 0; i < e.dataTransfer!.items.length; i++) {
      if (e.dataTransfer!.items[i].kind === 'string') {
        e.dataTransfer!.items[i].getAsString((url: string) => {
          if (this.isYoutubeUrl(url)) {
            youtubeUrls.push(url);
            this.addYoutube(url);
          }
        });
      }
    }
    
    // Process files sequentially for stability
    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith('image/')) {
          await this.addMediaWithUpload(file, 'image', file.name);
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          // Upload PDF directly to Cloudinary (no base64 conversion)
          await this.addMediaWithUpload(file, 'pdf', file.name);
        }
      } catch (error) {
        console.error('File processing failed:', error);
      }
    }
    
    this.cdr.detectChanges();
  }

  addYoutube(url: string) {
    const videoId = this.extractYoutubeId(url);
    if (!videoId) return;

    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    
    const mediaData = {
      type: 'youtube',
      url: embedUrl,
      thumbnailUrl,
      title: 'YouTube Video'
    };

    const firebaseKey = this.dbService.saveMedia(this.userName, mediaData);

    this.mediaItems.push({
      id: this.idCounter++,
      type: 'youtube',
      url: embedUrl,
      thumbnailUrl,
      title: 'YouTube Video',
      firebaseKey: firebaseKey || null
    });
    this.cdr.detectChanges();
  }

  deleteItem(id: number) {
    const item = this.mediaItems.find(i => i.id === id);
    if (item?.firebaseKey && this.userName) {
      this.dbService.deleteMedia(this.userName, item.firebaseKey);
    }
    this.mediaItems = this.mediaItems.filter(i => i.id !== id);
    this.cdr.detectChanges();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  }

  private base64ToBlob(base64: string, contentType: string) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  private extractYoutubeId(url: string): string | null {
    const regex = /(?:youtube\.com.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  private isYoutubeUrl(url: string): boolean {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube\.com\/embed).*/.test(url);
  }

  // Paint methods
  ngAfterViewInit() {
    // Ready
  }

  createPainting() {
    this.showPaintPopup = true;
    setTimeout(() => {
      this.canvas = this.paintCanvasRef.nativeElement;
      this.ctx = this.canvas.getContext('2d')!;
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }, 0);
  }

  closePainting() {
    this.showPaintPopup = false;
    this.isDrawing = false;
  }

  setTool(tool: string) {
    this.currentTool = tool;
    if (this.ctx) {
      if (tool === 'text') {
        this.ctx.font = `${this.brushSize}px Arial`;
        this.ctx.fillStyle = this.brushColor;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
      } else {
        this.ctx.strokeStyle = tool === 'erase' ? 'white' : this.brushColor;
        this.ctx.lineWidth = this.brushSize;
      }
    }
  }

  clearCanvas() {
    if (this.ctx) {
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  updateBrushSize() {
    if (this.ctx) {
      if (this.currentTool === 'text') {
        this.ctx.font = `${this.brushSize}px Arial`;
      } else {
        this.ctx.lineWidth = this.brushSize;
      }
    }
  }

  updateBrushColor() {
    if (this.ctx) {
      if (this.currentTool === 'text') {
        this.ctx.fillStyle = this.brushColor;
      } else {
        this.ctx.strokeStyle = this.brushColor;
      }
    }
  }

  startDrawing(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const canvasX = cssX * (this.canvas.width / rect.width);
    const canvasY = cssY * (this.canvas.height / rect.height);
    
    if (this.isShapeTool()) {
      this.shapeStartX = canvasX;
      this.shapeStartY = canvasY;
      return;
    }
    
    this.isDrawing = true;
    this.lastX = canvasX;
    this.lastY = canvasY;
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.currentTool === 'erase' ? 'white' : this.brushColor;
  }

  draw(e: MouseEvent) {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const currentX = cssX * (this.canvas.width / rect.width);
    const currentY = cssY * (this.canvas.height / rect.height);
    this.lastX = currentX;
    this.lastY = currentY;
    this.ctx.lineTo(currentX, currentY);
    this.ctx.stroke();
  }

  stopDrawing() {
    if (this.shapeStartX !== undefined && this.lastX !== undefined && this.lastY !== undefined) {
      this.drawShape(this.shapeStartX, this.shapeStartY!, this.lastX, this.lastY);
    }
    this.isDrawing = false;
    this.shapeStartX = undefined;
    this.shapeStartY = undefined;
  }

  private drawShape(sx: number, sy: number, ex: number, ey: number) {
    const mode = this.currentTool as 'rect' | 'circle' | 'line';
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    const left = Math.min(sx, ex);
    const top = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);
    switch (mode) {
      case 'rect':
        this.ctx.rect(left, top, w, h);
        break;
      case 'circle':
        const cx = (sx + ex) / 2;
        const cy = (sy + ey) / 2;
        const r = Math.hypot(w, h) / 2;
        this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      case 'line':
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(ex, ey);
        break;
    }
    this.ctx.stroke();
  }

  isShapeTool(): boolean {
    return ['rect', 'circle', 'line'].includes(this.currentTool);
  }

  handleGalleryClick(item: MediaItem) {
    console.log('Clicked item:', item);
    
    // Handle all types including 'painting' (treat as image)
    const modalItem = { ...item };
    if (item.url && (item.type === 'pdf' || item.type === 'youtube' || item.type === 'painting')) {
      (modalItem as any).safeUrl = this.safeUrl(item.url);
    }
    this.currentModalItem = modalItem;
    
    switch (item.type) {
      case 'image':
      case 'painting':
        this.showImagePopup = true;
        break;
      case 'pdf':
        this.showPdfViewer = true;
        break;
      case 'youtube':
        this.showVideoPopup = true;
        break;
    }
    
    this.cdr.detectChanges();
  }

  closeImagePopup() {
    this.showImagePopup = false;
    this.currentModalItem = null;
    this.cdr.detectChanges();
  }

  closePdfViewer() {
    this.showPdfViewer = false;
    this.currentModalItem = null;
    this.cdr.detectChanges();
  }

  closeVideoPopup() {
    this.showVideoPopup = false;
    this.currentModalItem = null;
    this.cdr.detectChanges();
  }

  onDragEnter(e: DragEvent) {
    e.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
  }

  allowDrop(e: DragEvent) {
    e.preventDefault();
  }
}

