// ========================================
// IMAGE COMPRESSION & WEBP CONVERSION
// ========================================

class ImageUploadManager {
  constructor(supabaseClient = null) {
    this.supabase = supabaseClient;
    this.maxWidth = 800;
    this.maxHeight = 800;
    this.quality = 0.6;
    this.maxSizeMB = 0.1;
  }

  async compressImage(file, callback) {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = this.resizeImage(img);
          canvas.toBlob(
            (blob) => {
              const sizeKB = (blob.size / 1024).toFixed(1);
              const dataUrl = URL.createObjectURL(blob);

              if (callback) {
                callback({
                  blob,
                  dataUrl,
                  sizeKB,
                  originalSize: (file.size / 1024).toFixed(1),
                  compression: ((1 - blob.size / file.size) * 100).toFixed(1)
                });
              }
            },
            'image/webp',
            this.quality
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  }

  resizeImage(img) {
    const canvas = document.createElement('canvas');
    let { width, height } = img;

    if (width > height) {
      if (width > this.maxWidth) {
        height = Math.round((height * this.maxWidth) / width);
        width = this.maxWidth;
      }
    } else {
      if (height > this.maxHeight) {
        width = Math.round((width * this.maxHeight) / height);
        height = this.maxHeight;
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas;
  }
}

window.ImageUploadManager = ImageUploadManager;