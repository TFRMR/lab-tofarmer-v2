// ========================================
// IMAGE COMPRESSION & WEBP CONVERSION
// ========================================
// Features:
// 1. Auto compress to super small size
// 2. Convert to WebP format
// 3. Upload to Supabase storage
// 4. Base64 fallback for offline
// ========================================

class ImageUploadManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.maxWidth = 800;      // Max width untuk compressed
    this.maxHeight = 800;     // Max height
    this.quality = 0.6;       // WebP quality (0-1, lower = smaller)
    this.maxSizeMB = 0.1;     // Target: max 100KB
  }

  /**
   * Compress image using Canvas
   * @param {File} file - Input image file
   * @param {Function} callback - Callback with {blob, dataUrl, sizeKB}
   */
  async compressImage(file, callback) {
    console.log('🖼️ Compressing image:', file.name, `(${(file.size/1024).toFixed(1)}KB)`);

    try {
      // Step 1: Read file as data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          console.log(`✓ Image loaded: ${img.width}x${img.height}px`);

          // Step 2: Resize using canvas
          const canvas = this.resizeImage(img);
          
          // Step 3: Convert to WebP blob
          canvas.toBlob(
            (blob) => {
              const sizeKB = (blob.size / 1024).toFixed(1);
              console.log(`✓ Compressed: ${sizeKB}KB (WebP)`);

              // Convert to data URL for preview
              const dataUrl = URL.createObjectURL(blob);

              if (callback) {
                callback({
                  blob,           // Blob for upload
                  dataUrl,        // Data URL for preview
                  sizeKB,         // File size in KB
                  originalSize: (file.size / 1024).toFixed(1),
                  compression: ((1 - blob.size / file.size) * 100).toFixed(1)
                });
              }
            },
            'image/webp',
            this.quality  // WebP quality
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('❌ Compression error:', error);
      if (callback) callback({ error: error.message });
    }
  }

  /**
   * Resize image on canvas
   */
  resizeImage(img) {
    const canvas = document.createElement('canvas');
    let { width, height } = img;

    // Calculate new dimensions (maintain aspect ratio)
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

    console.log(`  Resized to: ${width}x${height}px`);
    return canvas;
  }

  /**
   * Upload to Supabase storage + save metadata to DB
   * @param {Blob} blob - Compressed image blob
   * @param {String} bucket - Supabase bucket name ('avatars', 'chat-images', 'room-covers')
   * @param {String} filePath - File path in bucket
   * @param {Object} metadata - Additional metadata {category, uploadedBy, username, width, height, originalSize}
   */
  async uploadToSupabaseWithDB(blob, bucket, filePath, metadata = {}) {
    if (!this.supabase) {
      console.warn('⚠️  Supabase not initialized');
      return null;
    }

    try {
      console.log(`📤 Uploading to Supabase: ${bucket}/${filePath}`);

      // Step 1: Upload file to storage
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, blob, {
          contentType: 'image/webp',
          upsert: true
        });

      if (error) {
        console.error('❌ Storage upload error:', error);
        return null;
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
      console.log(`✓ File uploaded: ${publicUrl}`);

      // Step 2: Save metadata to database
      const imageRecord = {
        image_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: filePath.split('/').pop(),
        storage_path: filePath,
        storage_url: publicUrl,
        original_size_kb: metadata.originalSize || 0,
        compressed_size_kb: Math.round(blob.size / 1024),
        compression_ratio: metadata.originalSize ? 
          (100 * (1 - blob.size / (metadata.originalSize * 1024))).toFixed(1) : 0,
        format: metadata.format || 'jpg',
        compressed_format: 'webp',
        uploaded_by: metadata.uploadedBy,
        uploaded_by_username: metadata.username,
        category: metadata.category || 'general',
        related_id: metadata.relatedId,
        width: metadata.width,
        height: metadata.height,
        dimensions: metadata.width && metadata.height ? 
          `${metadata.width}x${metadata.height}` : null,
        mime_type: 'image/webp'
      };

      console.log('💾 Saving metadata to database:', imageRecord);

      // Insert to images table
      const { data: insertData, error: insertError } = await this.supabase
        .from('images')
        .insert([imageRecord])
        .select('id');  // Get the auto-generated ID

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        // Still return URL even if DB save fails
        return { url: publicUrl, dbError: insertError };
      }

      console.log('✓ Metadata saved:', insertData);
      
      // Get the actual image ID from database
      const imageDbId = insertData?.[0]?.id;
      if (!imageDbId) {
        console.error('❌ No image ID returned from insert');
        return { url: publicUrl, dbError: 'No ID returned' };
      }

      // Step 3: Handle specific category updates (use database ID)
      if (metadata.category === 'avatar' && metadata.uploadedBy) {
        await this.updateUserAvatarRecord(metadata.uploadedBy, metadata.username, imageDbId, imageRecord);
      } else if (metadata.category === 'room_cover' && metadata.relatedId) {
        await this.updateRoomCoverRecord(metadata.relatedId, imageDbId, imageRecord);
      }

      return {
        success: true,
        url: publicUrl,
        imageId: imageDbId,  // Return database ID, not generated ID
        sizeKB: Math.round(blob.size / 1024),
        metadata: imageRecord
      };
    } catch (error) {
      console.error('❌ Upload exception:', error);
      return null;
    }
  }

  /**
   * Update user_avatars table
   */
  async updateUserAvatarRecord(userId, username, imageDbId, imageRecord) {
    try {
      // First, deactivate old avatars
      await this.supabase
        .from('user_avatars')
        .update({ is_active: false })
        .eq('user_id', userId);

      // Insert new avatar (use imageDbId, not imageRecord.image_id)
      const { error } = await this.supabase
        .from('user_avatars')
        .insert([{
          user_id: userId,
          username: username,
          image_id: imageDbId,  // BIGINT from database
          storage_url: imageRecord.storage_url,
          original_size_kb: imageRecord.original_size_kb,
          compressed_size_kb: imageRecord.compressed_size_kb,
          is_active: true
        }]);

      if (error) {
        console.error('⚠️  user_avatars update error:', error);
      } else {
        console.log('✓ user_avatars updated');
      }
    } catch (error) {
      console.error('⚠️  user_avatars update failed:', error);
    }
  }

  /**
   * Update room_covers table
   */
  async updateRoomCoverRecord(roomSlug, imageDbId, imageRecord) {
    try {
      // Deactivate old covers
      await this.supabase
        .from('room_covers')
        .update({ is_active: false })
        .eq('room_slug', roomSlug);

      // Insert new cover (use imageDbId, not imageRecord.image_id)
      const { error } = await this.supabase
        .from('room_covers')
        .insert([{
          room_slug: roomSlug,
          image_id: imageDbId,  // BIGINT from database
          storage_url: imageRecord.storage_url,
          uploaded_by: imageRecord.uploaded_by,
          original_size_kb: imageRecord.original_size_kb,
          compressed_size_kb: imageRecord.compressed_size_kb,
          is_active: true
        }]);

      if (error) {
        console.error('⚠️  room_covers update error:', error);
      } else {
        console.log('✓ room_covers updated');
      }
    } catch (error) {
      console.error('⚠️  room_covers update failed:', error);
    }
  }

  /**
   * Convert blob to base64 (for localStorage/offline)
   */
  blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
}

// ========================================
// UI HELPER - Image Upload Input
// ========================================

function setupImageUploadInput(elementId, onUploadComplete) {
  const input = document.getElementById(elementId);
  if (!input) {
    console.error(`❌ Element ${elementId} not found`);
    return;
  }

  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('❌ Hanya file gambar yang diterima!');
      return;
    }

    // Validate file size (original)
    if (file.size > 10 * 1024 * 1024) {  // 10MB max
      alert('❌ File terlalu besar (max 10MB)');
      return;
    }

    // Show loading
    const btn = input.previousElementSibling;
    if (btn) {
      btn.innerHTML = '⏳ Mengompresi...';
      btn.disabled = true;
    }

    // Compress
    const imgManager = new ImageUploadManager(window.supabaseClient);
    imgManager.compressImage(file, async (result) => {
      if (btn) {
        btn.innerHTML = '📤 Upload...';
      }

      if (result.error) {
        alert(`❌ Error: ${result.error}`);
        if (btn) btn.innerHTML = '📸 Pilih Gambar';
        return;
      }

      // Show stats
      console.log(`
        Original: ${result.originalSize}KB
        Compressed: ${result.sizeKB}KB
        Ratio: ${result.compression}% smaller
      `);

      // Callback
      if (onUploadComplete) {
        onUploadComplete(result);
      }

      // Reset
      input.value = '';
      if (btn) btn.innerHTML = '📸 Pilih Gambar';
    });
  });
}

// ========================================
// EXAMPLE USAGE
// ========================================

/*
// HTML:
<button onclick="document.getElementById('avatar-upload').click()">📸 Pilih Gambar</button>
<input type="file" id="avatar-upload" class="hidden" accept="image/*" />
<img id="preview" src="" alt="Preview" />

// JavaScript:
setupImageUploadInput('avatar-upload', async (result) => {
  // Show preview
  document.getElementById('preview').src = result.dataUrl;

  // Save to localStorage (offline)
  localStorage.setItem('user_avatar_webp', result.dataUrl);

  // Or upload to Supabase
  const url = await new ImageUploadManager(window.supabaseClient)
    .uploadToSupabase(
      result.blob,
      'avatars',
      `${userWallet}.webp`
    );

  if (url) {
    localStorage.setItem('user_avatar_url', url);
  }

  alert(`✓ Gambar berhasil: ${result.sizeKB}KB`);
});
*/

// ========================================
// EXPORT
// ========================================
window.ImageUploadManager = ImageUploadManager;
window.setupImageUploadInput = setupImageUploadInput;